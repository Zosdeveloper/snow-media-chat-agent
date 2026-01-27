/**
 * Embedding Service using Voyage AI
 * Generates vector embeddings for text using voyage-3-lite model
 */

const config = require('../config');

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';

/**
 * Generate embeddings for one or more texts
 * @param {string|string[]} texts - Single text or array of texts
 * @returns {Promise<number[]|number[][]>} - Single embedding or array of embeddings
 */
async function generateEmbeddings(texts) {
    if (!config.voyageApiKey) {
        console.warn('VOYAGE_API_KEY not configured, embeddings disabled');
        return null;
    }

    const isArray = Array.isArray(texts);
    const inputTexts = isArray ? texts : [texts];

    // Validate inputs
    if (inputTexts.length === 0) {
        return isArray ? [] : null;
    }

    // Filter out empty strings
    const validTexts = inputTexts.map(t => (t || '').trim()).filter(t => t.length > 0);
    if (validTexts.length === 0) {
        return isArray ? [] : null;
    }

    try {
        // Process in batches if needed
        const embeddings = [];
        for (let i = 0; i < validTexts.length; i += config.embedding.batchSize) {
            const batch = validTexts.slice(i, i + config.embedding.batchSize);
            const batchEmbeddings = await callVoyageApi(batch);
            embeddings.push(...batchEmbeddings);
        }

        return isArray ? embeddings : embeddings[0];
    } catch (error) {
        console.error('Embedding generation failed:', error.message);
        return isArray ? [] : null;
    }
}

/**
 * Call the Voyage AI API
 * @param {string[]} texts - Array of texts to embed
 * @returns {Promise<number[][]>} - Array of embeddings
 */
async function callVoyageApi(texts) {
    const response = await fetch(VOYAGE_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.voyageApiKey}`
        },
        body: JSON.stringify({
            input: texts,
            model: config.embedding.model,
            input_type: 'document' // Use 'query' for search queries
        })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Voyage API error (${response.status}): ${error}`);
    }

    const data = await response.json();
    return data.data.map(item => item.embedding);
}

/**
 * Generate query embedding (optimized for search)
 * @param {string} query - Search query text
 * @returns {Promise<number[]|null>} - Query embedding
 */
async function generateQueryEmbedding(query) {
    if (!config.voyageApiKey) {
        console.warn('VOYAGE_API_KEY not configured, embeddings disabled');
        return null;
    }

    const text = (query || '').trim();
    if (!text) return null;

    try {
        const response = await fetch(VOYAGE_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.voyageApiKey}`
            },
            body: JSON.stringify({
                input: [text],
                model: config.embedding.model,
                input_type: 'query' // Optimized for similarity search
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Voyage API error (${response.status}): ${error}`);
        }

        const data = await response.json();
        return data.data[0].embedding;
    } catch (error) {
        console.error('Query embedding generation failed:', error.message);
        return null;
    }
}

/**
 * Generate embedding for a conversation (concatenated messages)
 * @param {Array<{role: string, content: string}>} messages - Conversation messages
 * @returns {Promise<number[]|null>} - Conversation embedding
 */
async function generateConversationEmbedding(messages) {
    if (!messages || messages.length === 0) return null;

    // Concatenate messages with role prefixes
    const text = messages
        .map(m => `${m.role === 'user' ? 'Visitor' : 'Milos'}: ${m.content}`)
        .join('\n');

    return generateEmbeddings(text);
}

/**
 * Calculate cosine similarity between two embeddings
 * @param {number[]} a - First embedding
 * @param {number[]} b - Second embedding
 * @returns {number} - Similarity score (0-1)
 */
function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Check if embedding service is available
 * @returns {boolean}
 */
function isAvailable() {
    return !!config.voyageApiKey;
}

module.exports = {
    generateEmbeddings,
    generateQueryEmbedding,
    generateConversationEmbedding,
    cosineSimilarity,
    isAvailable
};
