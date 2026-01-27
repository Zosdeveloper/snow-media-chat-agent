/**
 * RAG Service - Retrieval Augmented Generation
 * Handles vector search and context retrieval for few-shot learning
 */

const db = require('../database/db');
const embeddingService = require('./embeddingService');
const config = require('../config');

/**
 * Get relevant context for the current conversation
 * @param {Object} session - Current session with messages and leadData
 * @param {string} currentMessage - The current user message
 * @returns {Promise<Object>} - Relevant patterns and context
 */
async function getRelevantContext(session, currentMessage) {
    const result = {
        patterns: [],
        hasContext: false
    };

    // Skip if embedding service not available
    if (!embeddingService.isAvailable()) {
        return result;
    }

    try {
        // Build context from recent conversation + current message
        const contextText = buildContextText(session, currentMessage);

        // Generate query embedding
        const queryEmbedding = await embeddingService.generateQueryEmbedding(contextText);
        if (!queryEmbedding) {
            return result;
        }

        // Search for similar patterns
        const patterns = db.searchSimilarPatterns(
            queryEmbedding,
            config.rag.maxPatterns,
            config.rag.similarityThreshold
        );

        if (patterns && patterns.length > 0) {
            result.patterns = patterns.map(formatPatternForContext);
            result.hasContext = true;
        }
    } catch (error) {
        console.error('Error getting RAG context:', error.message);
    }

    return result;
}

/**
 * Build context text from session for similarity search
 * @param {Object} session - Current session
 * @param {string} currentMessage - Current user message
 * @returns {string} - Concatenated context text
 */
function buildContextText(session, currentMessage) {
    const parts = [];

    // Add business type if known
    if (session.leadData?.businessType || session.leadData?.business) {
        parts.push(`Business type: ${session.leadData.businessType || session.leadData.business}`);
    }

    // Add last few messages for context
    const recentMessages = (session.messages || []).slice(-4);
    for (const msg of recentMessages) {
        const role = msg.role === 'user' ? 'Visitor' : 'Milos';
        parts.push(`${role}: ${msg.content}`);
    }

    // Add current message
    parts.push(`Visitor: ${currentMessage}`);

    return parts.join('\n');
}

/**
 * Format a pattern for injection into the prompt
 * @param {Object} pattern - Pattern from database
 * @returns {Object} - Formatted pattern
 */
function formatPatternForContext(pattern) {
    // Limit messages to configured max
    const messages = (pattern.messages || []).slice(0, config.rag.maxExampleMessages);

    return {
        title: pattern.title,
        type: pattern.pattern_type,
        description: pattern.description,
        similarity: pattern.similarity || 0,
        messages: messages.map(m => ({
            role: m.role === 'user' ? 'Visitor' : 'Milos',
            content: m.content
        }))
    };
}

/**
 * Index a new pattern for future retrieval
 * @param {Object} patternData - Pattern data to index
 * @returns {Promise<number|null>} - Pattern ID or null on failure
 */
async function indexPattern(patternData) {
    try {
        // Generate embedding for the pattern
        const embedding = await embeddingService.generateConversationEmbedding(patternData.messages);

        // Create pattern with embedding
        const patternId = db.createPattern({
            ...patternData,
            embedding
        });

        return patternId;
    } catch (error) {
        console.error('Error indexing pattern:', error.message);
        return null;
    }
}

/**
 * Reindex all patterns (useful after model changes)
 * @returns {Promise<{success: number, failed: number}>}
 */
async function reindexAllPatterns() {
    const patterns = db.listPatterns({ limit: 1000 });
    let success = 0;
    let failed = 0;

    for (const pattern of patterns) {
        try {
            const embedding = await embeddingService.generateConversationEmbedding(pattern.messages);
            if (embedding) {
                // Delete and recreate to update vector index
                const data = {
                    conversation_id: pattern.conversation_id,
                    pattern_type: pattern.pattern_type,
                    title: pattern.title,
                    description: pattern.description,
                    messages: pattern.messages,
                    booking_achieved: pattern.booking_achieved,
                    tagged_by: pattern.tagged_by,
                    confidence_score: pattern.confidence_score,
                    embedding
                };

                db.deletePattern(pattern.id);
                db.createPattern(data);
                success++;
            } else {
                failed++;
            }
        } catch (error) {
            console.error(`Error reindexing pattern ${pattern.id}:`, error.message);
            failed++;
        }
    }

    return { success, failed };
}

/**
 * Get patterns by type
 * @param {string} patternType - Type of pattern
 * @param {number} limit - Max patterns to return
 * @returns {Array} - Patterns of the specified type
 */
function getPatternsByType(patternType, limit = 5) {
    return db.listPatterns({
        pattern_type: patternType,
        limit,
        minConfidence: 0.5
    });
}

/**
 * Search patterns by text query
 * @param {string} query - Search query
 * @param {number} limit - Max results
 * @returns {Promise<Array>} - Matching patterns
 */
async function searchPatterns(query, limit = 5) {
    if (!embeddingService.isAvailable()) {
        // Fallback to keyword search
        return db.listPatterns({ limit, minConfidence: 0.5 });
    }

    const queryEmbedding = await embeddingService.generateQueryEmbedding(query);
    if (!queryEmbedding) {
        return db.listPatterns({ limit, minConfidence: 0.5 });
    }

    return db.searchSimilarPatterns(queryEmbedding, limit, 0.4);
}

module.exports = {
    getRelevantContext,
    indexPattern,
    reindexAllPatterns,
    getPatternsByType,
    searchPatterns
};
