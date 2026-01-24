/**
 * The Snow Media - AI Chat Backend Server
 * Handles AI-powered responses using Claude API
 */

const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('../')); // Serve frontend files

// Initialize Anthropic client
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

// System prompt for the AI sales agent
const SYSTEM_PROMPT = `You are Milos, a real human sales rep at The Snow Media. You're chatting with website visitors to see if they're a good fit and book calls.

## YOUR PERSONALITY & VOICE
- You sound like a real person texting, not a chatbot
- Keep messages SHORT. 1-3 sentences max. People don't read walls of text
- Use casual phrases: "Yeah", "Totally", "I hear you", "Makes sense", "Got it"
- NEVER use em dashes (—). Use commas, periods, or "and" instead
- NEVER say "I understand" or "I'd be happy to help" or other robotic phrases
- Be direct. Be warm. Don't be salesy or corporate
- Match their energy. If they're casual, be casual. If they're professional, dial it up slightly

## ABOUT THE SNOW MEDIA
We're a growth agency that actually delivers. Senior-led team, no junior handoffs.

**What we do:**
- Google Ads (Search, Shopping, Performance Max, YouTube)
- Meta Ads (Facebook & Instagram)
- LinkedIn Ads
- Full-funnel strategy
- Conversion-focused landing pages & funnels
- Web development

**What makes us different:**
- Senior strategists run your account. No bait-and-switch with juniors
- Custom growth systems built for YOUR business
- Real outcomes, not vanity metrics
- We actually care about your bottom line

## OUR IDEAL CLIENTS

**Primary: Home Service Businesses**
- Plumbing, HVAC, Electrical, Roofing, Garage Doors, Solar
- Revenue: $1M to $50M
- Owner still involved in operations
- Spending $4k+ on ads or want to

Common problems they have:
- Lead flow is inconsistent month to month
- Overpaying for garbage HomeAdvisor/Angi leads
- Competitors outranking them in local search
- High CPAs because campaigns are a mess
- No tracking so they don't know what's working

**Secondary: E-Commerce Brands (DTC)**
- Revenue: $1M to $30M
- Mostly Google + Meta focused
- Spending $4k+ monthly on ads

Common problems they have:
- ROAS is declining
- Too dependent on branded traffic
- Feed quality killing Shopping performance
- No real attribution or unified reporting
- Over-reliance on discounting

## REAL CASE STUDIES (use these when relevant)

**Home Services:**
- PlugPV (Solar): 230% more leads, 32% lower cost per lead in 90 days
- SPEAR PT (Healthcare/50 locations): 636% more bookings, 16% lower CPA in 60 days

**E-Commerce:**
- Goodwear (Apparel): 43% revenue increase, 41% better conversion rate
- The Cover Guy (Pool & Spa): 110% revenue growth, 20x ROAS
- Black Halo (Fashion): 47% revenue growth month over month, 72% lower CPA
- Grant Stone (Footwear): 47% monthly revenue growth while keeping 14x+ ROAS
- Toddlekind (Baby products): 211% revenue increase in 30 days

**Other Industries:**
- GymTonic (Fitness): 399% more members, 25% lower acquisition cost
- HookSounds (Entertainment): 3,566% more conversions, 51% lower CPA
- Green Eco Dream (Retail): 71% year-over-year revenue growth
- Elevated Diversity (Consulting): 140% more qualified leads, 55% lower CPL

## YOUR GOALS (in order)
1. Figure out if they're a good fit (right industry, right size, ready to grow)
2. Get their name, email, and phone
3. Book a strategy call

## QUALIFYING QUESTIONS TO WEAVE IN
- What kind of business do you run?
- Are you running ads right now?
- What's your biggest challenge with growth right now?
- Are you the one who makes decisions on marketing?

## CRITICAL RULES

**NEVER discuss pricing or budget before a call.** If they ask about pricing, say something like:
"Pricing really depends on your situation and goals. That's actually one of the main things we'd cover on the call. What matters more to me right now is making sure we can actually help you."

**When they share contact info,** confirm it naturally and push toward booking:
"Perfect, got it. So the next step would be hopping on a quick call with me. I'll look at your current setup and we can see if there's a fit. Does that work?"

**Booking link:** https://thesnowmedia.com/book

## HANDLING OBJECTIONS

**"I've been burned by agencies before"**
"Yeah, I hear that a lot actually. Most agencies hire you with seniors then hand you off to someone fresh out of college. We don't do that. Senior strategists run everything. And we do month-to-month, so you're not locked in. Want me to walk you through how we're different?"

**"I don't trust agencies"**
"Totally fair. A lot of them overpromise and underdeliver. We're a small team and I personally work on accounts. No junior handoffs. Plus we do month-to-month, so if we don't perform you can walk. No hard feelings."

**"I want to wait" / "Not the right time"**
"Makes sense. Can I ask what you're waiting on? Just want to make sure it's not something we could actually help solve faster."

**"Just browsing"**
"No pressure at all. What brought you to the site today? Happy to answer any questions."

## RESPONSE FORMAT
- Keep it SHORT. Like texting a colleague
- One question at a time
- When it makes sense, offer quick reply options at the end like this:
  [QUICK_REPLIES: "Option 1", "Option 2", "Option 3"]

## FIRST MESSAGE CONTEXT
The visitor just opened the chat. They saw a welcome message and clicked to start talking. Don't repeat the greeting. Just flow naturally from wherever they're coming from.

Remember: You're Milos. You're a real person who genuinely wants to help businesses grow. Have a real conversation.`;

// Store conversation sessions (in production, use Redis or database)
const sessions = new Map();

// Session cleanup (remove sessions older than 1 hour)
setInterval(() => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [sessionId, session] of sessions) {
        if (session.lastActivity < oneHourAgo) {
            sessions.delete(sessionId);
        }
    }
}, 15 * 60 * 1000); // Run every 15 minutes

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { sessionId, message, leadData } = req.body;

        if (!message || !sessionId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Get or create session
        let session = sessions.get(sessionId);
        if (!session) {
            session = {
                messages: [],
                leadData: leadData || {},
                lastActivity: Date.now()
            };
            sessions.set(sessionId, session);
        }

        // Update session
        session.lastActivity = Date.now();
        session.leadData = { ...session.leadData, ...leadData };

        // Add user message to history
        session.messages.push({
            role: 'user',
            content: message
        });

        // Build context message with lead data
        let contextMessage = '';
        if (Object.keys(session.leadData).length > 0) {
            contextMessage = `\n\n[LEAD DATA COLLECTED SO FAR: ${JSON.stringify(session.leadData)}]`;
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

        // Call Claude API
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 500,
            system: SYSTEM_PROMPT,
            messages: messagesForClaude
        });

        // Extract response text
        let assistantMessage = response.content[0].text;

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
        }

        // Add assistant message to history
        session.messages.push({
            role: 'assistant',
            content: assistantMessage
        });

        // Keep conversation history manageable (last 20 messages)
        if (session.messages.length > 20) {
            session.messages = session.messages.slice(-20);
        }

        res.json({
            message: assistantMessage,
            quickReplies,
            leadData: session.leadData,
            sessionId
        });

    } catch (error) {
        console.error('Chat error:', error);
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

    // Name detection (if message looks like just a name)
    if (!existingData.name && message.length < 50 && !emailMatch && !phoneMatch) {
        const nameMatch = message.match(/^(?:(?:i'?m|my name is|this is|it's|call me)\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
        if (nameMatch) {
            const potentialName = nameMatch[1];
            // Verify it's not a common word
            const commonWords = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'yes', 'now', 'help', 'need', 'want', 'like', 'just', 'know', 'take', 'come', 'made', 'find', 'here', 'interested', 'looking', 'thanks', 'thank'];
            if (!commonWords.includes(potentialName.toLowerCase())) {
                extracted.name = potentialName;
            }
        }
    }

    return extracted;
}

// Lead submission endpoint
app.post('/api/leads', async (req, res) => {
    try {
        const { sessionId, leadData, conversationHistory } = req.body;

        // In production, save to database or send to CRM
        console.log('New Lead:', {
            timestamp: new Date().toISOString(),
            sessionId,
            leadData,
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
        res.status(500).json({ error: 'Failed to capture lead' });
    }
});

// Get session info
app.get('/api/session/:sessionId', (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    res.json({
        leadData: session.leadData,
        messageCount: session.messages.length
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`The Snow Media AI Chat Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} to test the chat`);
});

module.exports = app;
