/**
 * RAG Service - Retrieval Augmented Generation
 * Handles vector search and context retrieval for few-shot learning
 */

const db = require('../database/db');
const embeddingService = require('./embeddingService');
const config = require('../config');

/**
 * Get relevant context for the current conversation.
 * Two-lane retrieval: conversation patterns (style few-shot) and knowledge facts
 * (case studies, services, FAQs). Each lane has its own similarity threshold.
 * @param {Object} session - Current session with messages and leadData
 * @param {string} currentMessage - The current user message
 * @returns {Promise<Object>} - { patterns, facts, hasContext }
 */
async function getRelevantContext(session, currentMessage) {
    const result = {
        patterns: [],
        facts: [],
        hasContext: false
    };

    if (!embeddingService.isAvailable()) {
        return result;
    }

    try {
        const contextText = buildContextText(session, currentMessage);
        const queryEmbedding = await embeddingService.generateQueryEmbedding(contextText);
        if (!queryEmbedding) return result;

        // Lane A: conversation patterns (style). tagged_by != 'seed'
        const patterns = db.searchSimilarPatterns(
            queryEmbedding,
            config.rag.maxPatterns,
            config.rag.similarityThreshold,
            'patterns'
        );

        // Lane B: knowledge facts (grounding). tagged_by = 'seed'
        const facts = db.searchSimilarPatterns(
            queryEmbedding,
            config.rag.maxFacts,
            config.rag.factsSimilarityThreshold,
            'facts'
        );

        if (patterns && patterns.length > 0) {
            result.patterns = patterns.map(formatPatternForContext);
            result.hasContext = true;
        }
        if (facts && facts.length > 0) {
            result.facts = facts.map(formatFactForContext);
            result.hasContext = true;
        }
    } catch (error) {
        console.error('Error getting RAG context:', error.message);
    }

    return result;
}

/**
 * Format a knowledge fact (case study, service, FAQ) for injection.
 * Facts are short blurbs, not dialogue, so the shape differs from patterns.
 */
function formatFactForContext(fact) {
    const firstMsg = Array.isArray(fact.messages) && fact.messages[0] ? fact.messages[0] : null;
    const content = firstMsg ? firstMsg.content : (fact.description || '');
    return {
        title: fact.title,
        type: fact.pattern_type,
        industry: fact.description,
        content,
        similarity: fact.similarity || 0
    };
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

    // Generate all embeddings first (async), then apply changes in a transaction
    const updates = [];
    for (const pattern of patterns) {
        try {
            const embedding = await embeddingService.generateConversationEmbedding(pattern.messages);
            if (embedding) {
                updates.push({ pattern, embedding });
            } else {
                failed++;
            }
        } catch (error) {
            console.error(`Error generating embedding for pattern ${pattern.id}:`, error.message);
            failed++;
        }
    }

    // Apply all delete/create operations in a single transaction
    if (updates.length > 0) {
        const dbInstance = db.getDb();
        const transaction = dbInstance.transaction(() => {
            for (const { pattern, embedding } of updates) {
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
            }
        });

        try {
            transaction();
        } catch (error) {
            console.error('Reindex transaction failed, no patterns were modified:', error.message);
            // Reset counts since transaction rolled back
            success = 0;
            failed = patterns.length;
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
