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
    rag: {
        maxPatterns: 3,           // Number of similar patterns to retrieve
        similarityThreshold: 0.6, // Minimum similarity score
        maxExampleMessages: 6,    // Max messages per example
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
