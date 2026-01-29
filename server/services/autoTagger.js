/**
 * Auto-Tagger Service
 * Automatically detects and tags successful conversation patterns
 */

const db = require('../database/db');
const ragService = require('./ragService');
const config = require('../config');

/**
 * Check if a conversation should be auto-tagged as a successful pattern
 * @param {string} sessionId - Session ID
 * @param {Object} session - Session data with messages and leadData
 */
async function checkForPatterns(sessionId, session) {
    try {
        // Skip if already tagged
        if (db.patternExistsForConversation(sessionId)) {
            return;
        }

        // Calculate confidence score
        const score = calculateConfidenceScore(session);

        // If meets threshold, create pattern
        if (score >= config.autoTag.minConfidence) {
            await createPatternFromSession(sessionId, session, score);
        }
    } catch (error) {
        console.error('Auto-tagging error:', error.message);
    }
}

/**
 * Calculate confidence score for a conversation
 * @param {Object} session - Session data
 * @returns {number} - Confidence score (0-1)
 */
function calculateConfidenceScore(session) {
    const weights = config.autoTag.weights;
    let score = 0;

    const messages = session.messages || [];
    const leadData = session.leadData || {};

    // Check for [BOOK_CALL] in assistant messages
    const hasBookCall = messages.some(m =>
        m.role === 'assistant' && m.content.includes('[BOOK_CALL]')
    );
    if (hasBookCall) {
        score += weights.bookCall;
    }

    // Check for positive response after booking offer
    if (hasBookCall) {
        const bookCallIndex = messages.findIndex(m =>
            m.role === 'assistant' && m.content.includes('[BOOK_CALL]')
        );

        if (bookCallIndex >= 0 && messages[bookCallIndex + 1]) {
            const nextMessage = messages[bookCallIndex + 1];
            if (nextMessage.role === 'user' && isPositiveResponse(nextMessage.content)) {
                score += weights.positiveResponse;
            }
        }
    }

    // Check for captured email
    if (leadData.email) {
        score += weights.emailCaptured;
    }

    // Check for captured name
    if (leadData.name) {
        score += weights.nameCaptured;
    }

    // Check message count
    if (messages.length >= config.autoTag.minMessageCount) {
        score += weights.minMessages;
    }

    return Math.min(score, 1); // Cap at 1
}

/**
 * Check if a user message indicates positive response
 * @param {string} content - Message content
 * @returns {boolean}
 */
function isPositiveResponse(content) {
    const lowerContent = content.toLowerCase();

    const positiveIndicators = [
        'yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'sounds good',
        'let\'s do it', "let's do it", 'i\'m in', "i'm in",
        'book', 'schedule', 'call', 'meeting', 'talk',
        'interested', 'ready', 'definitely', 'absolutely',
        'when can', 'what time', 'available'
    ];

    return positiveIndicators.some(indicator => lowerContent.includes(indicator));
}

/**
 * Create a pattern from a successful session
 * @param {string} sessionId - Session ID
 * @param {Object} session - Session data
 * @param {number} confidenceScore - Calculated confidence
 */
async function createPatternFromSession(sessionId, session, confidenceScore) {
    const messages = session.messages || [];
    const leadData = session.leadData || {};

    // Determine pattern type
    const patternType = determinePatternType(messages, leadData);

    // Generate title
    const title = generatePatternTitle(patternType, leadData);

    // Select relevant messages (skip initial greeting, focus on key exchanges)
    const relevantMessages = selectRelevantMessages(messages);

    // Create pattern
    const patternData = {
        conversation_id: sessionId,
        pattern_type: patternType,
        title: title,
        description: generateDescription(patternType, leadData, confidenceScore),
        messages: relevantMessages,
        booking_achieved: false, // Will be updated if conversion confirmed
        tagged_by: 'auto',
        confidence_score: confidenceScore
    };

    const patternId = await ragService.indexPattern(patternData);

    if (patternId) {
        console.log(`Auto-tagged pattern ${patternId} for session ${sessionId} (confidence: ${confidenceScore.toFixed(2)})`);
    }
}

/**
 * Determine the type of pattern based on conversation content
 * @param {Array} messages - Conversation messages
 * @param {Object} leadData - Lead information
 * @returns {string} - Pattern type
 */
function determinePatternType(messages, leadData) {
    const allContent = messages.map(m => m.content.toLowerCase()).join(' ');

    // Check for objection handling
    const objectionKeywords = [
        'burned', 'agencies', 'trust', 'skeptical', 'expensive',
        'not sure', 'maybe later', 'think about it', 'already tried'
    ];
    if (objectionKeywords.some(kw => allContent.includes(kw))) {
        return 'objection_handling';
    }

    // Check for value proposition
    const valueKeywords = ['roi', 'results', 'case study', 'example', 'worked with'];
    if (valueKeywords.some(kw => allContent.includes(kw))) {
        return 'value_proposition';
    }

    // Check for booking close
    if (messages.some(m => m.role === 'assistant' && m.content.includes('[BOOK_CALL]'))) {
        return 'booking_close';
    }

    // Check for qualification
    if (leadData.businessType || leadData.business || leadData.monthlyBudget) {
        return 'qualification';
    }

    // Check for rapport building
    if (messages.length >= 4 && leadData.name) {
        return 'rapport_building';
    }

    return 'general';
}

/**
 * Generate a descriptive title for the pattern
 * @param {string} patternType - Type of pattern
 * @param {Object} leadData - Lead information
 * @returns {string} - Generated title
 */
function generatePatternTitle(patternType, leadData) {
    const business = leadData.businessType || leadData.business || '';

    const titles = {
        objection_handling: `${business || 'Lead'} Objection Handling`,
        value_proposition: `${business || 'Business'} Value Demo`,
        booking_close: `${business || 'Successful'} Booking Close`,
        qualification: `${business || 'Lead'} Qualification`,
        rapport_building: `${business || 'Warm'} Rapport Building`,
        general: `${business || 'Engaged'} Conversation`
    };

    return titles[patternType] || titles.general;
}

/**
 * Generate a description for the pattern
 * @param {string} patternType - Type of pattern
 * @param {Object} leadData - Lead information
 * @param {number} confidence - Confidence score
 * @returns {string} - Generated description
 */
function generateDescription(patternType, leadData, confidence) {
    const business = leadData.businessType || leadData.business;
    const captured = [];

    if (leadData.name) captured.push('name');
    if (leadData.email) captured.push('email');
    if (leadData.phone) captured.push('phone');

    let description = `Auto-tagged with ${(confidence * 100).toFixed(0)}% confidence. `;

    if (business) {
        description += `Business type: ${business}. `;
    }

    if (captured.length > 0) {
        description += `Captured: ${captured.join(', ')}. `;
    }

    const typeDescriptions = {
        objection_handling: 'Successfully handled visitor objections.',
        value_proposition: 'Effectively communicated value proposition.',
        booking_close: 'Led to booking offer.',
        qualification: 'Good qualification of lead.',
        rapport_building: 'Built strong rapport with visitor.',
        general: 'Engaged conversation with positive signals.'
    };

    description += typeDescriptions[patternType] || '';

    return description.trim();
}

/**
 * Select the most relevant messages from a conversation
 * @param {Array} messages - All messages
 * @returns {Array} - Selected relevant messages
 */
function selectRelevantMessages(messages) {
    // Skip first message if it's a greeting
    const startIndex = messages.length > 4 ? 1 : 0;

    // Take messages from the middle to end (where the action happens)
    const selected = messages.slice(startIndex);

    // Limit to max configured messages
    const maxMessages = config.rag.maxExampleMessages || 6;

    if (selected.length <= maxMessages) {
        return selected;
    }

    // If too many, take last N messages (where conversion likely happened)
    return selected.slice(-maxMessages);
}

/**
 * Manually mark a conversation as converted and create/update pattern
 * @param {string} sessionId - Session ID
 * @param {Object} session - Session data (optional, will load from DB if not provided)
 */
async function markAsConverted(sessionId, session = null) {
    // Mark conversation as converted
    db.markConverted(sessionId);

    // If pattern exists, update booking_achieved
    const existingPatterns = db.getPatternsByConversation(sessionId);

    if (existingPatterns.length > 0) {
        // Update existing pattern - this would need a db update function
        console.log(`Pattern for session ${sessionId} marked as converted`);
    } else if (session) {
        // Create new pattern with high confidence
        await createPatternFromSession(sessionId, session, 1.0);
    }
}

/**
 * Get auto-tagging statistics
 * @returns {Object} - Statistics about auto-tagged patterns
 */
function getTaggingStats() {
    const dbInstance = db.getDb();

    const summary = dbInstance.prepare(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN confidence_score >= 0.8 THEN 1 ELSE 0 END) as high,
            SUM(CASE WHEN confidence_score >= 0.6 AND confidence_score < 0.8 THEN 1 ELSE 0 END) as medium,
            SUM(CASE WHEN confidence_score < 0.6 THEN 1 ELSE 0 END) as low,
            SUM(CASE WHEN tagged_by = 'auto' THEN 1 ELSE 0 END) as auto,
            SUM(CASE WHEN tagged_by != 'auto' THEN 1 ELSE 0 END) as manual
        FROM successful_patterns
    `).get();

    const typeRows = dbInstance.prepare(`
        SELECT pattern_type, COUNT(*) as count
        FROM successful_patterns
        GROUP BY pattern_type
    `).all();

    const byType = {};
    for (const row of typeRows) {
        byType[row.pattern_type] = row.count;
    }

    return {
        total: summary.total || 0,
        byType,
        byConfidence: {
            high: summary.high || 0,
            medium: summary.medium || 0,
            low: summary.low || 0
        },
        auto: summary.auto || 0,
        manual: summary.manual || 0
    };
}

module.exports = {
    checkForPatterns,
    calculateConfidenceScore,
    markAsConverted,
    getTaggingStats
};
