/**
 * The Snow Media - AI Chat Backend Server
 * Handles AI-powered responses using Claude API
 * With RAG-based context retrieval and few-shot learning
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

// Import database and services
const db = require('./database/db');
const ragService = require('./services/ragService');
const embeddingService = require('./services/embeddingService');
const autoTagger = require('./services/autoTagger');
const promptBuilder = require('./services/promptBuilder');
const adminRoutes = require('./routes/admin');
const config = require('./config');
const alerts = require('./services/alertService');
const SYSTEM_PROMPT = require('./prompts/systemPrompt');
const knowledgeBase = require('./services/knowledgeBase');
const followUpService = require('./services/followUpService');
const spamFilter = require('./services/spamFilter');
const intentClassifier = require('./services/intentClassifier');
const qualificationService = require('./services/qualificationService');
const modelHealth = require('./services/modelHealth');
const guardrails = require('./services/guardrails');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust the Railway proxy (1 hop) so req.ip reflects the real client via
// X-Forwarded-For. Without this, express-rate-limit keys every visitor on the
// proxy IP, collapsing the 20/min limit into a single global bucket.
app.set('trust proxy', 1);

// CORS configuration - use centralized config
const corsOptions = {
    origin: function (origin, callback) {
        // Requests with no origin: server-to-server, health checks, same-origin navigation
        if (!origin) {
            return callback(null, true);
        }
        if (config.allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            // Pass false instead of error; browser enforces CORS, server stays stable
            callback(null, false);
        }
    },
    credentials: true
};

// Rate limiting - prevent API abuse (uses centralized config)
const chatLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: { error: 'Too many messages. Please wait a moment before sending more.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Middleware
app.use(cors(corsOptions));
// Capture raw body on webhook paths so we can verify Calendly's signature.
// Other routes just get parsed JSON.
app.use(express.json({
    limit: '10kb',
    verify: (req, _res, buf) => {
        if (req.originalUrl && req.originalUrl.startsWith('/api/webhooks/')) {
            req.rawBody = buf;
        }
    }
}));

// Serve static files - use different paths for dev vs production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'public')));
} else {
    app.use(express.static(path.join(__dirname, '..')));
}

// Initialize Anthropic client.
// timeout is in ms (JS SDK default is 10 min). A hung chat call should fail fast
// to the canned fallback rather than block the request. maxRetries (default 2)
// retries 429/5xx/connection errors with exponential backoff.
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: 20000,
    maxRetries: 2
});

// Store conversation sessions (in production, use Redis or database)
const sessions = new Map();

// Session cleanup (remove sessions older than 1 hour)
setInterval(() => {
    const oneHourAgo = Date.now() - config.session.maxAge;
    for (const [sessionId, session] of sessions) {
        if (session.lastActivity < oneHourAgo) {
            // Mark abandoned sessions in database before deleting
            try {
                db.markAbandoned(sessionId);
            } catch (err) {
                console.error('Error marking session abandoned:', err.message);
            }
            sessions.delete(sessionId);
        }
    }
}, config.session.cleanupInterval); // Run every 15 minutes

// Client-supplied identifiers are treated as bearer capabilities: sessionId
// resumes a conversation, visitorId pulls a returning visitor's saved contact
// info. Accept only high-entropy, injection-safe ids. UUIDs and the legacy
// `prefix_<ts>_<rand>` format both satisfy this; anything with quotes, angle
// brackets, or whitespace (XSS / probing) is rejected.
const ID_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
function isValidId(v) {
    return typeof v === 'string' && ID_PATTERN.test(v);
}

// Chat endpoint with rate limiting
app.post('/api/chat', chatLimiter, async (req, res) => {
    try {
        const { sessionId, message, leadData, pageContext, utmParams, visitorId, behaviorSignals } = req.body;

        if (!message || !sessionId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Input validation
        if (typeof message !== 'string' || message.length > 2000) {
            return res.status(400).json({ error: 'Message too long or invalid' });
        }

        if (!isValidId(sessionId)) {
            return res.status(400).json({ error: 'Invalid session ID' });
        }

        // visitorId is optional and drives returning-visitor PII prefill, so a
        // forgeable value is a data-disclosure vector. Drop anything malformed
        // rather than 400 (a visitor can still chat without it).
        const safeVisitorId = isValidId(visitorId) ? visitorId : null;

        // Honeypot: bots fill hidden fields, real users never see them.
        // Return a generic response so the bot thinks it worked. Don't save anything.
        if (spamFilter.checkHoneypot(req.body)) {
            console.warn('[HONEYPOT] Tripped on session', sessionId);
            return res.json({
                message: "Thanks, I'll take a look and get back to you.",
                quickReplies: [],
                leadData: {},
                sessionId,
            });
        }

        // Get or create session (check in-memory first, then DB, then create new)
        let session = sessions.get(sessionId);
        let isReturningVisitor = false;
        let previousVisitorData = null;

        if (!session) {
            // Try to restore from database (survives restarts)
            const savedState = db.loadSessionState(sessionId);
            if (savedState) {
                session = {
                    ...savedState,
                    lastActivity: Date.now()
                };
                // Restore messages from DB
                const dbMessages = db.getMessages(sessionId);
                session.messages = dbMessages.map(m => ({ role: m.role, content: m.content }));
                console.log(`Restored session ${sessionId} from DB (${session.messages.length} messages)`);
            } else {
                // Brand new session
                // Assign A/B variant (50/50 split)
                const promptVariant = Math.random() < 0.5 ? 'A' : 'B';

                session = {
                    messages: [],
                    leadData: leadData || {},
                    pageContext: pageContext || {},
                    utmParams: utmParams || null,
                    visitorId: safeVisitorId,
                    promptVariant,
                    lastActivity: Date.now()
                };

                // Check for returning visitor
                if (safeVisitorId) {
                    previousVisitorData = db.findPreviousVisitorData(safeVisitorId);
                    if (previousVisitorData) {
                        isReturningVisitor = true;
                        // Pre-fill lead data from previous visit
                        if (previousVisitorData.lead_name) session.leadData.name = previousVisitorData.lead_name;
                        if (previousVisitorData.lead_email) session.leadData.email = previousVisitorData.lead_email;
                        if (previousVisitorData.lead_phone) session.leadData.phone = previousVisitorData.lead_phone;
                        if (previousVisitorData.lead_business_type) session.leadData.businessType = previousVisitorData.lead_business_type;
                        console.log(`Returning visitor detected: ${visitorId} (previous: ${previousVisitorData.id})`);
                    }
                }
            }
            sessions.set(sessionId, session);
        }

        // Update session
        session.lastActivity = Date.now();
        session.leadData = { ...session.leadData, ...leadData };
        if (pageContext) session.pageContext = pageContext;
        if (utmParams) session.utmParams = utmParams;
        if (safeVisitorId) session.visitorId = safeVisitorId;
        if (behaviorSignals) session.behaviorSignals = behaviorSignals;

        // Persist to database (fire and forget)
        try {
            db.upsertConversation(sessionId, {
                source_url: req.headers.referer,
                lead_name: session.leadData.name,
                lead_email: session.leadData.email,
                lead_phone: session.leadData.phone,
                lead_business_type: session.leadData.businessType || session.leadData.business
            });
            // Save visitor_id and prompt_variant
            if (session.visitorId || session.promptVariant) {
                db.setConversationMeta(sessionId, session.visitorId, session.promptVariant);
            }
        } catch (err) {
            console.error('Error persisting conversation:', err.message);
            alerts.databaseError(err, { sessionId, op: 'upsertConversation' });
        }

        // Prompt injection detection
        const sanitizedMessage = guardrails.detectPromptInjection(message);

        // Add user message to history
        session.messages.push({
            role: 'user',
            content: sanitizedMessage
        });

        // Persist user message (fire and forget)
        try {
            db.addMessage(sessionId, 'user', message);
        } catch (err) {
            console.error('Error persisting user message:', err.message);
            alerts.databaseError(err, { sessionId, op: 'addMessage:user' });
        }

        // Keyword pre-filter: only runs on the first user message.
        // If matched, we respond with a canned deflection and skip Claude entirely.
        // Partnership matches fall through (response: null) but tag the conversation
        // so downstream gates know to skip RAG learning.
        const userMessageCount = session.messages.filter(m => m.role === 'user').length;
        if (userMessageCount === 1) {
            const match = spamFilter.keywordFilter(message);
            if (match) {
                try {
                    db.setConversationIntent(sessionId, match.intent, match.confidence, 'keyword');
                    session.intent = match.intent;
                } catch (err) {
                    console.error('Error persisting intent:', err.message);
                }

                if (match.response) {
                    console.log(`[KEYWORD FILTER] ${match.intent} match on session ${sessionId}`);
                    session.messages.push({ role: 'assistant', content: match.response });
                    try {
                        db.addMessage(sessionId, 'assistant', match.response);
                    } catch (err) {
                        console.error('Error persisting deflection:', err.message);
                    }
                    return res.json({
                        message: match.response,
                        quickReplies: [],
                        leadData: session.leadData,
                        sessionId,
                    });
                }
            }
        }

        // Load stored intent into session for tool-gating (carries across requests).
        if (!session.intent) {
            try {
                const stored = db.getConversationIntent(sessionId);
                if (stored?.intent) session.intent = stored.intent;
            } catch (err) {
                // non-fatal
            }
        }

        // Build context message with lead data
        let contextMessage = '';
        if (Object.keys(session.leadData).length > 0) {
            contextMessage = promptBuilder.buildLeadContext(session.leadData);
        }

        // Add page context, UTM context, and time-of-day context
        contextMessage += promptBuilder.buildPageContext(session.pageContext);
        contextMessage += promptBuilder.buildUtmContext(session.utmParams);
        contextMessage += promptBuilder.buildTimeContext();

        // Add behavior signals context
        contextMessage += promptBuilder.buildBehaviorContext(session.behaviorSignals);

        // Add returning visitor context if applicable
        if (isReturningVisitor && previousVisitorData) {
            contextMessage += promptBuilder.buildReturningVisitorContext(previousVisitorData);
        }

        // Add A/B variant context
        contextMessage += promptBuilder.buildVariantContext(session.promptVariant);

        // Add qualification signal score (soft tiebreaker, NOT a booking gate).
        // Replaces the old message-count-driven stage guidance. The model uses
        // this to decide whether a fit-check question is worth asking, but
        // never to block booking.
        try {
            const qualification = qualificationService.detectSignals(session, message);
            contextMessage += '\n' + qualification.description;
            session.qualificationScore = qualification.score;
        } catch (err) {
            console.error('Qualification signal error:', err.message);
        }

        // Two-lane retrieval for the dynamic system block:
        //   Lane A (patterns) = conversation style few-shot
        //   Lane B (facts)    = grounded citations (case studies, services, FAQs)
        let ragAddendum = '';
        let factsAddendum = '';
        try {
            const ragContext = await ragService.getRelevantContext(session, message);
            ragAddendum = promptBuilder.buildRagAddendum(ragContext);
            factsAddendum = promptBuilder.buildFactsAddendum(ragContext);
        } catch (err) {
            console.error('Error getting RAG context:', err.message);
        }

        // Prepend conversation summary if available (from trimmed history)
        if (session.conversationSummary) {
            contextMessage = `\n[CONVERSATION HISTORY SUMMARY: ${session.conversationSummary}]` + contextMessage;
        }

        // Assemble the dynamic (non-cached) system block. Static SYSTEM_PROMPT
        // stays in block 1 for caching; this is block 2.
        // Order within the dynamic block: session signals, then approved facts
        // (grounding), then conversation examples (style). Facts come first so
        // the model sees verified claims before any mimicry material.
        const dynamicSystemBlock = [
            '<session_context>' + contextMessage + '\n</session_context>',
            factsAddendum,
            ragAddendum
        ].filter(Boolean).join('\n\n');

        // Messages array is unchanged from session history (context now lives in system block 2)
        const messagesForClaude = session.messages;

        // Claude tool definitions
        const tools = [
            {
                name: 'show_booking_calendar',
                description: 'Show the Calendly booking widget to the visitor. Call ONLY after explicit consent to book (e.g. "yeah let\'s do it", "how do I book?", "I\'m in") or when a clearly warm visitor has named spend, a specific KPI, or said they\'re evaluating options. DO NOT call speculatively, to nudge, while they\'re still deciding, or during discovery/objection stages. Your text message is still required and should cue the action (e.g. "Let\'s do it. Grab a time below."). trigger_reason is required so we can attribute booking quality later: pick the most honest label.',
                input_schema: {
                    type: 'object',
                    properties: {
                        trigger_reason: {
                            type: 'string',
                            enum: ['explicit_request', 'qualification_complete', 'warm_visitor_shortcut'],
                            description: 'explicit_request = visitor asked to book or agreed after you offered. qualification_complete = you confirmed need + timing + authority-like signals before offering. warm_visitor_shortcut = first 1-2 messages showed clear buying intent (named spend, named KPI, evaluating options) and you skipped discovery.'
                        }
                    },
                    required: ['trigger_reason']
                }
            },
            {
                name: 'offer_quick_replies',
                description: 'Show 2-3 clickable reply buttons below your message. Use SPARINGLY, only at genuine decision forks where the choices are distinct paths forward (e.g. "Running ads now" vs "Starting fresh" vs "Just exploring"). DO NOT call when the visitor is mid-explanation, when your question is naturally open-ended, when you just used it on the previous message, or when there are more than 3 meaningful options. Maximum one call per response. Never two quick-reply messages in a row. If in doubt, skip it and let them type.',
                input_schema: {
                    type: 'object',
                    properties: {
                        options: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Array of 2-3 short reply options (under 6 words each)',
                            minItems: 2,
                            maxItems: 3
                        }
                    },
                    required: ['options']
                }
            },
            {
                name: 'capture_lead_field',
                description: 'Record a piece of lead info the visitor shared in their CURRENT message. Call once per field per turn. DO NOT call retroactively for info shared in a prior message, and DO NOT call twice for the same field already captured. For business_type, only call when the visitor explicitly names their business (valid: "I run an HVAC company"; NOT valid: "we need more leads"). Multiple parallel calls are fine if they shared multiple fields in one message.',
                input_schema: {
                    type: 'object',
                    properties: {
                        field: {
                            type: 'string',
                            enum: ['name', 'email', 'phone', 'business_type']
                        },
                        value: { type: 'string' }
                    },
                    required: ['field', 'value']
                }
            }
        ];

        // Gate tools based on stored intent. Blocked intents never get the booking
        // tool so spam and job seekers can't waste Milos's calendar.
        let gatedTools = tools;
        if (spamFilter.isBlockedIntent(session.intent)) {
            gatedTools = tools.filter(t => t.name !== 'show_booking_calendar');
        }

        // Call Claude API with tools. System is split into two blocks so the
        // static base prompt can be cached (ephemeral, 5-min TTL) while per-turn
        // context stays dynamic. Cuts input token cost ~60-70% on multi-turn sessions.
        const chatStartTime = Date.now();
        let response;
        try {
            response = await anthropic.messages.create({
                model: config.models.chat,
                max_tokens: 500,
                system: [
                    { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
                    { type: 'text', text: dynamicSystemBlock }
                ],
                messages: messagesForClaude,
                tools: gatedTools,
                tool_choice: { type: 'auto' }
            });
        } catch (apiErr) {
            // Model call failed after retries (timeout, 5xx, overload). Don't
            // dead-end the visitor with a 500: return a graceful canned reply so
            // they can retry. The user message is already persisted, so the next
            // turn continues the conversation. The filler is NOT pushed to history,
            // so the model never sees it.
            console.error('[ANTHROPIC] chat completion failed:', apiErr.message);
            alerts.apiError(apiErr, { sessionId, endpoint: '/api/chat', model: config.models.chat });
            return res.json({
                message: "Sorry, I lagged for a second there. Mind sending that again?",
                quickReplies: [],
                leadData: session.leadData,
                sessionId,
            });
        }

        // Record token usage + latency for cost observability (fire-and-forget).
        try {
            const u = response.usage || {};
            db.logChatMetric({
                conversationId: sessionId,
                model: config.models.chat,
                inputTokens: u.input_tokens || 0,
                outputTokens: u.output_tokens || 0,
                cacheReadTokens: u.cache_read_input_tokens || 0,
                cacheCreationTokens: u.cache_creation_input_tokens || 0,
                latencyMs: Date.now() - chatStartTime
            });
        } catch (err) {
            console.error('Error logging chat metric:', err.message);
        }

        // Process response: extract text and tool calls
        let assistantMessage = '';
        let quickReplies = [];
        let showBookingCalendar = false;

        const userMsgIndex = session.messages.filter(m => m.role === 'user').length;
        for (const block of response.content) {
            if (block.type === 'text') {
                // Append rather than overwrite: a response may carry more than one
                // text block (e.g. text interleaved with tool_use).
                assistantMessage += (assistantMessage ? '\n' : '') + block.text;
            } else if (block.type === 'tool_use') {
                // Log every tool call for attribution analytics (P3-1)
                db.logToolEvent({
                    conversationId: sessionId,
                    toolName: block.name,
                    triggerReason: block.input?.trigger_reason || null,
                    userMessageIndex: userMsgIndex,
                    input: block.input
                });

                switch (block.name) {
                    case 'show_booking_calendar':
                        showBookingCalendar = true;
                        session.bookingTrigger = block.input?.trigger_reason || 'unspecified';
                        console.log(`[BOOKING TRIGGERED] session=${sessionId} reason=${session.bookingTrigger}`);
                        try {
                            db.setBookingTriggerReason(sessionId, session.bookingTrigger);
                        } catch (err) {
                            console.error('Error saving booking trigger reason:', err.message);
                        }
                        break;
                    case 'offer_quick_replies':
                        if (block.input.options) {
                            // Suppress two quick-reply prompts in a row (the prompt rule,
                            // enforced here so we don't rely on the model to follow it).
                            if (session.lastHadQuickReplies) {
                                console.warn('[QR SUPPRESSED] Consecutive quick-reply call dropped', { sessionId });
                            } else {
                                quickReplies = block.input.options.slice(0, 3);
                            }
                        }
                        break;
                    case 'capture_lead_field':
                        if (block.input.field && block.input.value) {
                            const fieldMap = {
                                name: 'name',
                                email: 'email',
                                phone: 'phone',
                                business_type: 'businessType'
                            };
                            const key = fieldMap[block.input.field];
                            const newValue = String(block.input.value).trim();
                            if (key && newValue) {
                                const existing = session.leadData[key];
                                if (!existing) {
                                    session.leadData[key] = newValue;
                                } else if (existing.toLowerCase() === newValue.toLowerCase()) {
                                    // Same value, skip (model is re-firing)
                                } else {
                                    // Different value captured for an already-filled field.
                                    // Prefer the longer / more structured value (full name > first name,
                                    // full phone > partial). For email, keep original unless the new one
                                    // is clearly different (user correcting themselves).
                                    const preferNew = key === 'email'
                                        ? newValue.includes('@') && newValue !== existing
                                        : newValue.length > existing.length;
                                    console.warn('[FIELD CONFLICT]', {
                                        sessionId, field: key, existing, newValue, kept: preferNew ? 'new' : 'existing'
                                    });
                                    if (preferNew) session.leadData[key] = newValue;
                                }
                            }
                        }
                        break;
                }
            }
        }

        // Record whether this turn emitted quick replies so the next turn can suppress consecutive calls
        session.lastHadQuickReplies = quickReplies.length > 0;

        // Inject booking calendar marker for widget (if tool was called)
        if (showBookingCalendar && !assistantMessage.includes('[BOOK_CALL]')) {
            assistantMessage = assistantMessage.trim() + ' [BOOK_CALL]';
        }

        // Fallback: also parse legacy tokens in case model still uses them.
        // The system prompt teaches the model to emit [BOOK_CALL] rather than call
        // show_booking_calendar, so this is actually the common path. Instrument it
        // the same as the tool path (trigger reason + tool event), otherwise booking
        // attribution and the admin funnel/tool dashboards read empty.
        if (!showBookingCalendar && assistantMessage.includes('[BOOK_CALL]')) {
            showBookingCalendar = true;
            session.bookingTrigger = 'token_emitted';
            console.log(`[BOOKING TRIGGERED] session=${sessionId} reason=token_emitted`);
            try {
                db.setBookingTriggerReason(sessionId, 'token_emitted');
                db.logToolEvent({
                    conversationId: sessionId,
                    toolName: 'show_booking_calendar',
                    triggerReason: 'token_emitted',
                    userMessageIndex: userMsgIndex,
                    input: null
                });
            } catch (err) {
                console.error('Error recording token booking:', err.message);
            }
        }
        if (quickReplies.length === 0) {
            const legacyMatch = assistantMessage.match(/\[QUICK_REPLIES:\s*"([^"]+)"(?:,\s*"([^"]+)")?(?:,\s*"([^"]+)")?\]/);
            if (legacyMatch) {
                quickReplies = legacyMatch.slice(1).filter(Boolean);
                assistantMessage = assistantMessage.replace(/\[QUICK_REPLIES:.*?\]/g, '').trim();
            }
        }

        // Guard against empty messages when Claude returns only tool calls or
        // only stripped legacy tokens. Provide a minimal fallback so the
        // widget doesn't render an empty bubble.
        if (!assistantMessage || !assistantMessage.trim()) {
            console.warn('[EMPTY RESPONSE] Claude returned no text. Falling back.', {
                hadBooking: showBookingCalendar,
                quickReplyCount: quickReplies.length
            });
            if (showBookingCalendar) {
                assistantMessage = "Grab a time that works and I'll take a look at your setup before we talk. [BOOK_CALL]";
            } else if (quickReplies.length > 0) {
                assistantMessage = "Which of these sounds closest?";
            } else {
                assistantMessage = "Tell me a bit more about what you're working on.";
            }
        }

        // Output guardrail filter (P3-2). Log-only for now; persist every trip
        // to guardrail_events so we can audit patterns weekly before turning on
        // automated replacement. Patterns live in services/guardrails.js.
        for (const trip of guardrails.checkOutput(assistantMessage)) {
            console.warn(`[GUARDRAIL] ${trip.reason}:`, assistantMessage.substring(0, 200));
            db.logGuardrailEvent({
                conversationId: sessionId,
                patternName: trip.name,
                matchedText: trip.matchedText,
                fullMessage: assistantMessage
            });
        }

        // Also run regex-based lead extraction as backup
        const extractedData = guardrails.extractLeadData(message, session.leadData);
        if (Object.keys(extractedData).length > 0) {
            session.leadData = { ...session.leadData, ...extractedData };
        }

        // Persist any lead data updates
        try {
            db.updateConversationLeadData(sessionId, session.leadData);
        } catch (err) {
            console.error('Error updating lead data:', err.message);
        }

        // Add assistant message to history
        session.messages.push({
            role: 'assistant',
            content: assistantMessage
        });

        // Persist assistant message (fire and forget)
        try {
            db.addMessage(sessionId, 'assistant', assistantMessage, null, quickReplies.length > 0 ? quickReplies : null);
        } catch (err) {
            console.error('Error persisting assistant message:', err.message);
            alerts.databaseError(err, { sessionId, op: 'addMessage:assistant' });
        }

        // Check for auto-tagging after enough messages (background).
        // Only real_lead conversations feed the RAG knowledge base so partnership /
        // spam chats don't drift the model's voice or examples.
        if (
            session.messages.length >= config.autoTag.minMessageCount &&
            (!session.intent || session.intent === 'real_lead')
        ) {
            autoTagger.checkForPatterns(sessionId, session).catch(err => {
                console.error('Auto-tagging error:', err.message);
            });
        }

        // Background intent classification on first user message when the
        // keyword filter didn't already tag it. Non-blocking so no added latency.
        if (userMessageCount === 1 && !session.intent) {
            intentClassifier.classify(message, process.env.ANTHROPIC_API_KEY)
                .then(result => {
                    if (!result) return;
                    session.intent = result.intent;
                    try {
                        db.setConversationIntent(sessionId, result.intent, result.confidence, 'classifier');
                    } catch (err) {
                        console.error('Error saving classifier intent:', err.message);
                    }
                    console.log(`[CLASSIFIER] session ${sessionId} -> ${result.intent} (${result.confidence})`);
                })
                .catch(err => console.error('Classifier error:', err.message));
        }

        // Human handoff detection
        detectHandoffTriggers(message, session, sessionId);

        // Keep conversation history manageable (last 20 messages)
        // When trimming, summarize dropped messages to preserve context
        if (session.messages.length > config.session.maxMessages) {
            const overflow = session.messages.slice(0, session.messages.length - config.session.maxMessages);
            session.messages = session.messages.slice(-config.session.maxMessages);

            // Summarize overflow in background (don't block response). Runs on
            // every trim, merging the prior summary so messages dropped after the
            // first trim aren't lost from context.
            if (overflow.length > 0) {
                summarizeMessages(overflow, anthropic, session.conversationSummary || null).then(summary => {
                    if (summary) session.conversationSummary = summary;
                }).catch(err => {
                    console.error('Summarization error:', err.message);
                });
            }
        }

        // Persist session state to DB (survives restarts)
        try {
            db.saveSessionState(sessionId, {
                leadData: session.leadData,
                pageContext: session.pageContext,
                utmParams: session.utmParams,
                visitorId: session.visitorId,
                promptVariant: session.promptVariant
            });
        } catch (err) {
            console.error('Error saving session state:', err.message);
            alerts.databaseError(err, { sessionId, op: 'saveSessionState' });
        }

        const responsePayload = {
            message: assistantMessage,
            quickReplies,
            leadData: session.leadData,
            sessionId
        };

        res.json(responsePayload);

    } catch (error) {
        console.error('Chat error:', error);

        // Send alert for critical chat failures
        alerts.chatError(error, {
            sessionId: req.body?.sessionId,
            userMessage: req.body?.message?.substring(0, 100),
            endpoint: '/api/chat'
        });

        res.status(500).json({
            error: 'Sorry, I encountered an issue. Please try again.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// detectPromptInjection and extractLeadData now live in services/guardrails.js
// (shared with the eval harness). Imported as `guardrails` above.

// Human handoff detection
function detectHandoffTriggers(message, session, sessionId) {
    const lower = message.toLowerCase();
    const leadData = session.leadData || {};

    // Build conversation summary for the alert
    function getConversationSummary() {
        const recent = (session.messages || []).slice(-6);
        return recent.map(m => `${m.role}: ${m.content.substring(0, 120)}`).join('\n');
    }

    const alertContext = {
        sessionId,
        leadName: leadData.name || 'Unknown',
        leadEmail: leadData.email || 'Not captured',
        leadBusiness: leadData.businessType || leadData.business || 'Unknown',
        conversationSummary: getConversationSummary()
    };

    // Trigger 1: Explicit request for human
    const humanPhrases = [
        'talk to a human', 'talk to a person', 'real person', 'speak to someone',
        'talk to someone', 'human agent', 'real agent', 'can i call', 'phone number',
        'speak with milos', 'talk to milos', 'connect me'
    ];
    if (humanPhrases.some(p => lower.includes(p))) {
        alerts.humanHandoff({ ...alertContext, reason: 'Explicit request for human' });
        return;
    }

    // Trigger 2: Frustration detection (short negative messages)
    const userMessages = (session.messages || []).filter(m => m.role === 'user');
    const recentUserMsgs = userMessages.slice(-3);
    if (recentUserMsgs.length >= 3) {
        const frustrationSignals = recentUserMsgs.filter(m => {
            const msg = m.content.toLowerCase();
            return (
                m.content.length < 30 &&
                (msg.includes('no') || msg.includes('stop') || msg.includes('not helpful') ||
                 msg.includes('useless') || msg.includes('waste') || msg.includes('annoying') ||
                 msg.includes("doesn't help") || msg.includes("don't understand") ||
                 m.content === m.content.toUpperCase() && m.content.length > 3) // ALL CAPS
            );
        });
        if (frustrationSignals.length >= 2) {
            alerts.humanHandoff({ ...alertContext, reason: 'Frustration detected (2+ negative signals)' });
            return;
        }
    }

    // Trigger 3: High-value signals
    const highValuePatterns = [
        /\b(?:50|100|200|500)\+?\s*(?:employees|staff|people|team)/i,
        /\b(?:\$?\d{2,3}k|\$\d{5,})\s*(?:per|a|\/)\s*month/i,
        /\b(?:10|15|20|25|30|50|100)\s*(?:locations?|stores?|branches)/i
    ];
    if (highValuePatterns.some(p => p.test(message))) {
        alerts.hotLead({ ...alertContext, reason: 'High-value signal detected in message' });
    }
}

// Summarize trimmed conversation messages to preserve context
async function summarizeMessages(messages, anthropicClient, priorSummary = null) {
    try {
        const transcript = messages.map(m =>
            `${m.role === 'user' ? 'Visitor' : 'Milos'}: ${m.content}`
        ).join('\n');

        const userContent = priorSummary
            ? `Earlier summary:\n${priorSummary}\n\nNewer messages:\n${transcript}`
            : transcript;

        const response = await anthropicClient.messages.create({
            model: config.models.summarizer,
            max_tokens: 150,
            system: 'Summarize this chat transcript in 2-3 sentences. Note: visitor business type, pain points, contact info shared, and interest level. If an earlier summary is provided, merge it with the newer messages into one concise summary. Be concise.',
            messages: [{ role: 'user', content: userContent }]
        });

        return response.content[0].text;
    } catch (err) {
        console.error('Summarization failed:', err.message);
        return null;
    }
}

// Lead submission endpoint
app.post('/api/leads', chatLimiter, async (req, res) => {
    try {
        const { sessionId, leadData, conversationHistory } = req.body;

        // Log lead event without PII
        console.log('New Lead:', {
            timestamp: new Date().toISOString(),
            sessionId,
            hasName: !!leadData?.name,
            hasEmail: !!leadData?.email,
            hasPhone: !!leadData?.phone,
            messageCount: conversationHistory?.length || 0
        });

        // Here you would typically:
        // 1. Save to database
        // 2. Send to CRM (HubSpot, Salesforce, etc.)
        // 3. Send notification email
        // 4. Trigger webhook

        res.json({ success: true, message: 'Lead captured successfully' });

    } catch (error) {
        console.error('Lead capture error:', error);

        // Alert on lead capture failures - these are high value
        alerts.leadCaptureError(error, {
            sessionId: req.body?.sessionId,
            leadData: req.body?.leadData,
            endpoint: '/api/leads'
        });

        res.status(500).json({ error: 'Failed to capture lead' });
    }
});

// Get session info (only returns non-PII data)
app.get('/api/session/:sessionId', (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    res.json({
        messageCount: session.messages.length,
        hasLeadData: !!(session.leadData.name || session.leadData.email || session.leadData.phone)
    });
});

// Health check
app.get('/api/health', (req, res) => {
    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        vectorSearch: db.isVectorSearchEnabled()
    };

    try {
        const stats = db.getStats();
        health.conversations = stats.conversations.total;
        health.patterns = stats.patterns.total;
    } catch (err) {
        health.database = 'error';
    }

    res.json(health);
});

// Deep health check: verifies each configured Claude model is still live.
// A retired model id returns 404 (the exact failure that silently broke chat).
// Point an external uptime monitor (UptimeRobot / BetterStack / Railway healthcheck)
// at this so a model that retires while the server is already running pages someone.
// Results are cached ~5 min in modelHealth so frequent polling doesn't hammer the API.
app.get('/api/health/model', async (req, res) => {
    try {
        const health = await modelHealth.checkModels({ force: req.query.force === '1' });
        res.status(health.ok ? 200 : 503).json({
            status: health.ok ? 'ok' : 'degraded',
            ...health,
        });
    } catch (err) {
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// Verify Calendly webhook signature.
// Calendly sends "Calendly-Webhook-Signature: t=<unix>,v1=<hex-hmac>".
// Signature is HMAC-SHA256 over "<timestamp>.<raw-body>" using the signing key.
// Returns { valid, reason }.
function verifyCalendlySignature(req) {
    const secret = config.calendly.webhookSecret;
    if (!secret) {
        // Fail closed in production. An unset secret means any caller could forge an
        // invitee.created event, which promotes RAG patterns, flips outcomes to
        // converted, and cancels follow-ups. Only skip verification in development.
        if (config.nodeEnv === 'production') {
            return { valid: false, reason: 'no_secret_configured' };
        }
        return { valid: true, reason: 'no_secret_configured_dev' };
    }

    const header = req.get('Calendly-Webhook-Signature') || '';
    if (!header) return { valid: false, reason: 'missing_signature_header' };

    const parts = Object.fromEntries(
        header.split(',').map(p => p.split('=', 2))
    );
    const timestamp = parts.t;
    const signature = parts.v1;
    if (!timestamp || !signature) return { valid: false, reason: 'malformed_signature' };

    const ageSec = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (!Number.isFinite(ageSec) || ageSec > config.calendly.signatureToleranceSec) {
        return { valid: false, reason: 'stale_signature' };
    }

    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';
    const expected = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex');

    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signature, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return { valid: false, reason: 'signature_mismatch' };
    }

    return { valid: true, reason: null };
}

// Calendly webhook endpoint. Handles invitee.created (booking confirmed).
// Matches to a conversation by email and promotes any quarantined RAG patterns.
app.post('/api/webhooks/calendly', async (req, res) => {
    const verification = verifyCalendlySignature(req);
    if (!verification.valid) {
        console.warn('[CALENDLY WEBHOOK] rejected:', verification.reason);
        return res.status(401).json({ error: 'invalid_signature', reason: verification.reason });
    }

    const event = req.body?.event;
    const payload = req.body?.payload || {};

    if (event !== 'invitee.created') {
        // Acknowledge but ignore other event types for now
        return res.status(200).json({ ok: true, ignored: event });
    }

    const email = (payload.email || '').trim();
    const eventId = payload.scheduled_event?.uri || payload.uri || null;
    const inviteeName = payload.name || null;

    try {
        const result = db.confirmBooking({ email, eventId });
        if (!result.matched) {
            console.warn('[CALENDLY WEBHOOK] no conversation matched email', { email });
            return res.status(200).json({ ok: true, matched: false });
        }
        if (result.alreadyConfirmed) {
            return res.status(200).json({ ok: true, matched: true, alreadyConfirmed: true });
        }

        // Booking confirmed: promote any quarantined pattern for this conversation
        const promoted = db.promoteQuarantinedPatterns();
        // Stop further follow-up emails since they booked
        try { db.skipFollowUps(result.conversationId); } catch (_e) {}

        console.log('[CALENDLY WEBHOOK] booking confirmed', {
            conversationId: result.conversationId, promoted, inviteeName
        });

        res.status(200).json({ ok: true, matched: true, promoted });
    } catch (err) {
        console.error('[CALENDLY WEBHOOK] processing error:', err.message);
        res.status(500).json({ error: 'webhook_processing_failed' });
    }
});

// Pattern maintenance tick: runs every 30 minutes.
// Promotes any quarantined patterns whose source conversation got booking_confirmed
// (catches cases where the per-webhook promote missed something), and archives
// stale quarantined patterns that never got confirmed.
setInterval(() => {
    try {
        const promoted = db.promoteQuarantinedPatterns();
        const archived = db.archiveStaleQuarantinedPatterns(config.patterns.quarantineMaxDays);
        if (promoted > 0 || archived > 0) {
            console.log(`[PATTERN MAINT] promoted=${promoted} archived=${archived}`);
        }
    } catch (err) {
        console.error('[PATTERN MAINT] error:', err.message);
    }
}, config.patterns.maintenanceIntervalMs);

// Data retention tick (P5): prune high-volume message/instrumentation rows daily.
// Disabled unless RETENTION_ENABLED=true. conversations and patterns are never pruned.
if (config.retention.enabled) {
    console.log(`[RETENTION] enabled: messages>${config.retention.messageDays}d, instrumentation>${config.retention.instrumentationDays}d`);
    setInterval(() => {
        try {
            const counts = db.pruneOldData({
                messageDays: config.retention.messageDays,
                instrumentationDays: config.retention.instrumentationDays,
            });
            const total = Object.values(counts).reduce((a, b) => a + b, 0);
            if (total > 0) console.log('[RETENTION] pruned', counts);
        } catch (err) {
            console.error('[RETENTION] error:', err.message);
        }
    }, config.retention.intervalMs);
}

// Admin routes
app.use('/api/admin', adminRoutes);

// Start server with database initialization
async function startServer() {
    try {
        // Initialize database
        await db.initialize();
        console.log('Database initialized successfully');

        // Check if embedding service is available
        if (embeddingService.isAvailable()) {
            console.log('Voyage AI embedding service configured');
            // Seed knowledge base with structured content on first boot
            knowledgeBase.seedIfEmpty().catch(err => {
                console.error('Knowledge base seeding error:', err.message);
            });
        } else {
            console.log('Warning: VOYAGE_API_KEY not set, RAG features disabled');
        }

        // Start email follow-up scheduler
        followUpService.start();

        // Start listening
        app.listen(PORT, () => {
            console.log(`The Snow Media AI Chat Server running on port ${PORT}`);
            console.log(`Open http://localhost:${PORT} to test the chat`);
        });

        // Model preflight: verify configured models are live at boot. A retired
        // model id 404s here, catching the exact failure that broke chat silently.
        // Non-fatal: alert loudly but keep serving so /api/health/model still reports.
        modelHealth.checkModels({ force: true })
            .then(result => {
                if (result.ok) {
                    console.log('[MODEL PREFLIGHT] OK:', result.roles.map(r => `${r.role}=${r.model}`).join(', '));
                } else {
                    console.error('[MODEL PREFLIGHT] DEAD MODEL(S):', result.deadModels.join(', '));
                    alerts.custom(
                        'Model Unavailable',
                        `Configured Claude model(s) returning 404: ${result.deadModels.join(', ')}. Chat is likely down. Update the model id (config.models or the CHAT_MODEL/etc. env var).`,
                        { reason: `dead: ${result.deadModels.join(', ')}` }
                    );
                }
            })
            .catch(err => console.error('[MODEL PREFLIGHT] check failed:', err.message));
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    followUpService.stop();
    db.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down gracefully...');
    followUpService.stop();
    db.close();
    process.exit(0);
});

startServer();

module.exports = app;
