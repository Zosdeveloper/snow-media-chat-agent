/**
 * Centralized configuration for the Snow Media Chat Agent
 */

require('dotenv').config();

const config = {
    // Server
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',

    // Database
    databasePath: process.env.DATABASE_PATH || './data/chat.db',

    // API Keys
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    voyageApiKey: process.env.VOYAGE_API_KEY,
    adminApiKey: process.env.ADMIN_API_KEY,

    // Embedding settings
    embedding: {
        model: 'voyage-3-lite',
        dimensions: 512, // voyage-3-lite outputs 512 dimensions
        batchSize: 128,  // Max texts per API call
    },

    // RAG settings
    // Two-lane retrieval: conversation patterns (style) and knowledge facts (grounding).
    // Different thresholds because facts are short snippets and score lower on cosine
    // than multi-turn dialogue patterns.
    rag: {
        maxPatterns: 2,           // Conversation examples to retrieve
        maxFacts: 2,              // Knowledge facts (case studies, services, FAQs)
        similarityThreshold: 0.6, // Pattern minimum similarity
        factsSimilarityThreshold: 0.5, // Facts minimum similarity (more permissive)
        maxExampleMessages: 6,    // Max messages per conversation example
    },

    // Auto-tagging thresholds
    autoTag: {
        minConfidence: 0.7,
        weights: {
            bookCall: 0.3,
            positiveResponse: 0.2,
            emailCaptured: 0.2,
            nameCaptured: 0.1,
            minMessages: 0.1,
        },
        minMessageCount: 6,
    },

    // Session settings
    session: {
        maxAge: 60 * 60 * 1000,        // 1 hour
        cleanupInterval: 15 * 60 * 1000, // 15 minutes
        maxMessages: 20,                 // Keep last 20 messages
    },

    // Email follow-up settings
    followUp: {
        enabled: !!process.env.SENDGRID_API_KEY,
        sendgridApiKey: process.env.SENDGRID_API_KEY,
        fromEmail: process.env.SENDGRID_FROM_EMAIL || 'milos@thesnowmedia.com',
        fromName: 'Milos | The Snow Media',
        checkIntervalMs: 30 * 60 * 1000,    // Check every 30 minutes
        dailyLimit: 95,                       // Stay under SendGrid free tier 100/day
        calendlyUrl: 'https://calendly.com/milos-thesnowmedia/strategy-call',
        sequence: [
            { delayMinutes: 45, type: 'recap' },       // Email 1: 45 min after last message
            { delayMinutes: 24 * 60, type: 'case_study' },  // Email 2: 24 hours
            { delayMinutes: 72 * 60, type: 'final' },       // Email 3: 72 hours
        ],
    },

    // Calendly webhook (P3-3): receives invitee.created events to confirm bookings.
    // If CALENDLY_WEBHOOK_SECRET is unset, signature verification is skipped (dev mode).
    calendly: {
        webhookSecret: process.env.CALENDLY_WEBHOOK_SECRET || null,
        signatureToleranceSec: 300, // reject webhook requests older than 5 minutes
    },

    // Pattern quarantine (P2-3): new auto-tagged patterns land as 'quarantined' and
    // only promote to 'active' after the source conversation's booking is confirmed.
    // Anything still quarantined after this many days is archived to keep the pool honest.
    patterns: {
        quarantineMaxDays: 7,
        maintenanceIntervalMs: 30 * 60 * 1000, // 30 minutes
    },

    // Rate limiting
    rateLimit: {
        windowMs: 60 * 1000,  // 1 minute
        maxRequests: 20,
    },

    // CORS
    allowedOrigins: [
        'https://thesnowmedia.com',
        'https://www.thesnowmedia.com',
        'https://snow-media-chat-agent-production.up.railway.app',
    ],
};

// Add localhost in development
if (config.nodeEnv === 'development') {
    config.allowedOrigins.push(
        'http://localhost:3000',
        'http://127.0.0.1:3000'
    );
}

module.exports = config;
