/**
 * The Snow Media - AI Chat Backend Server
 * Handles AI-powered responses using Claude API
 * With RAG-based context retrieval and few-shot learning
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
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

const app = express();
const PORT = process.env.PORT || 3000;

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
            // Pass false instead of error — browser enforces CORS, server stays stable
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
app.use(express.json({ limit: '10kb' })); // Limit payload size

// Serve static files - use different paths for dev vs production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'public')));
} else {
    app.use(express.static(path.join(__dirname, '..')));
}

// Initialize Anthropic client
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
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

// Chat endpoint with rate limiting
app.post('/api/chat', chatLimiter, async (req, res) => {
    try {
        const { sessionId, message, leadData, pageContext, utmParams, visitorId } = req.body;

        if (!message || !sessionId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Input validation
        if (typeof message !== 'string' || message.length > 2000) {
            return res.status(400).json({ error: 'Message too long or invalid' });
        }

        if (typeof sessionId !== 'string' || sessionId.length > 100) {
            return res.status(400).json({ error: 'Invalid session ID' });
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
                    visitorId: visitorId || null,
                    promptVariant,
                    lastActivity: Date.now()
                };

                // Check for returning visitor
                if (visitorId) {
                    previousVisitorData = db.findPreviousVisitorData(visitorId);
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
        if (visitorId) session.visitorId = visitorId;

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
        }

        // Add user message to history
        session.messages.push({
            role: 'user',
            content: message
        });

        // Persist user message (fire and forget)
        try {
            db.addMessage(sessionId, 'user', message);
        } catch (err) {
            console.error('Error persisting user message:', err.message);
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

        // Add returning visitor context if applicable
        if (isReturningVisitor && previousVisitorData) {
            contextMessage += promptBuilder.buildReturningVisitorContext(previousVisitorData);
        }

        // Add A/B variant context
        contextMessage += promptBuilder.buildVariantContext(session.promptVariant);

        // Add conversation stage guidance
        contextMessage += promptBuilder.getStageGuidance(session);

        // Get relevant patterns and inject as few-shot examples
        let enrichedPrompt = SYSTEM_PROMPT;
        try {
            const ragContext = await ragService.getRelevantContext(session, message);
            enrichedPrompt = promptBuilder.build(SYSTEM_PROMPT, ragContext);
        } catch (err) {
            console.error('Error getting RAG context:', err.message);
        }

        // Prepare messages for Claude
        const messagesForClaude = session.messages.map((msg, index) => {
            if (index === session.messages.length - 1 && msg.role === 'user') {
                return {
                    role: msg.role,
                    content: msg.content + contextMessage
                };
            }
            return msg;
        });

        // Call Claude API with enriched prompt
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 500,
            system: enrichedPrompt,
            messages: messagesForClaude
        });

        // Extract response text
        let assistantMessage = response.content[0].text;

        // Output validation - flag potentially hallucinated content
        const suspiciousPatterns = [
            { pattern: /\b[5-9]\d{2,}%|\b[1-9]\d{3,}%/, reason: 'Unrealistic percentage' },
            { pattern: /\bguarantee\b/i, reason: 'Guarantee language' },
            { pattern: /\b100%\s+(success|guaranteed|certain)/i, reason: 'Absolute promise' },
            { pattern: /\$\d{1,3}(?:,\d{3})*\s+(?:per|a)\s+month/i, reason: 'Specific pricing mentioned' }
        ];

        for (const { pattern, reason } of suspiciousPatterns) {
            if (pattern.test(assistantMessage)) {
                console.warn(`[FLAGGED RESPONSE] ${reason}:`, assistantMessage.substring(0, 200));
                // In production, you might want to send this to a monitoring service
            }
        }

        // Parse quick replies if present
        let quickReplies = [];
        const quickReplyMatch = assistantMessage.match(/\[QUICK_REPLIES:\s*"([^"]+)"(?:,\s*"([^"]+)")?(?:,\s*"([^"]+)")?\]/);
        if (quickReplyMatch) {
            quickReplies = quickReplyMatch.slice(1).filter(Boolean);
            assistantMessage = assistantMessage.replace(/\[QUICK_REPLIES:.*?\]/g, '').trim();
        }

        // Detect if asking for contact info
        const extractedData = extractLeadData(message, session.leadData);
        if (Object.keys(extractedData).length > 0) {
            session.leadData = { ...session.leadData, ...extractedData };
            // Update lead data in database
            try {
                db.updateConversationLeadData(sessionId, session.leadData);
            } catch (err) {
                console.error('Error updating lead data:', err.message);
            }
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
        }

        // Check for auto-tagging after enough messages (background)
        if (session.messages.length >= config.autoTag.minMessageCount) {
            autoTagger.checkForPatterns(sessionId, session).catch(err => {
                console.error('Auto-tagging error:', err.message);
            });
        }

        // Human handoff detection
        detectHandoffTriggers(message, session, sessionId);

        // Keep conversation history manageable (last 20 messages)
        if (session.messages.length > config.session.maxMessages) {
            session.messages = session.messages.slice(-config.session.maxMessages);
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
        }

        res.json({
            message: assistantMessage,
            quickReplies,
            leadData: session.leadData,
            sessionId
        });

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

// Extract lead data from messages
function extractLeadData(message, existingData) {
    const extracted = {};
    const lowerMessage = message.toLowerCase();

    // Email detection
    const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch && !existingData.email) {
        extracted.email = emailMatch[0];
    }

    // Phone detection
    const phoneMatch = message.match(/(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/);
    if (phoneMatch && !existingData.phone) {
        extracted.phone = phoneMatch[0];
    }

    // Name detection - only when explicitly introduced
    if (!existingData.name && message.length < 100 && !emailMatch && !phoneMatch) {
        // Require an introduction phrase - don't just grab any capitalized word
        const namePatterns = [
            /(?:i'?m|i am|my name is|my name's|this is|it's|call me|the name is|name's)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
            /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+here\b/i,  // "John here"
            /^(?:hey,?\s+)?([A-Z][a-z]+)\s+(?:speaking|from)/i  // "John speaking" or "John from XYZ"
        ];

        for (const pattern of namePatterns) {
            const nameMatch = message.match(pattern);
            if (nameMatch) {
                const potentialName = nameMatch[1].trim();
                // Verify it's not a common word
                const commonWords = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'yes', 'now', 'help', 'need', 'want', 'like', 'just', 'know', 'take', 'come', 'made', 'find', 'here', 'interested', 'looking', 'thanks', 'thank', 'hey', 'hello', 'hi', 'sure', 'okay', 'yeah', 'yep', 'nope', 'great', 'good', 'nice', 'cool', 'awesome', 'perfect', 'sounds', 'that', 'what', 'how', 'why', 'when', 'where', 'who'];
                if (!commonWords.includes(potentialName.toLowerCase()) && potentialName.length >= 2) {
                    extracted.name = potentialName;
                    break;
                }
            }
        }
    }

    return extracted;
}

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
        } else {
            console.log('Warning: VOYAGE_API_KEY not set, RAG features disabled');
        }

        // Start listening
        app.listen(PORT, () => {
            console.log(`The Snow Media AI Chat Server running on port ${PORT}`);
            console.log(`Open http://localhost:${PORT} to test the chat`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    db.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down gracefully...');
    db.close();
    process.exit(0);
});

startServer();

module.exports = app;
