/**
 * SQLite Database Wrapper with Vector Search Support
 * Uses better-sqlite3 and sqlite-vec for efficient vector operations
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('../config');

let db = null;
let vecLoaded = false;

/**
 * Initialize the database connection and schema
 */
async function initialize() {
    if (db) return db;

    // Ensure data directory exists
    const dbDir = path.dirname(path.resolve(config.databasePath));
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    // Create database connection
    db = new Database(path.resolve(config.databasePath));
    db.pragma('journal_mode = WAL'); // Better concurrent access
    db.pragma('foreign_keys = ON');

    // Load sqlite-vec extension if available
    try {
        const sqliteVec = require('sqlite-vec');
        sqliteVec.load(db);
        vecLoaded = true;
        console.log('sqlite-vec extension loaded successfully');
    } catch (err) {
        console.warn('sqlite-vec extension not available, vector search disabled:', err.message);
    }

    // Run schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);

    // Migration: Add new outcome values to conversations table
    // SQLite doesn't support ALTER CHECK constraint, so we recreate the table
    // Only run once — tracked via a migrations meta table
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        const alreadyRun = db.prepare("SELECT 1 FROM _migrations WHERE name = 'add_outcome_values'").get();

        if (!alreadyRun) {
            const hasData = db.prepare("SELECT COUNT(*) as count FROM conversations").get();

            if (hasData.count > 0) {
                db.exec('BEGIN TRANSACTION');
                try {
                    db.exec(`
                        CREATE TABLE IF NOT EXISTS conversations_new (
                            id TEXT PRIMARY KEY,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            lead_name TEXT,
                            lead_email TEXT,
                            lead_phone TEXT,
                            lead_business_type TEXT,
                            outcome TEXT DEFAULT 'in_progress' CHECK(outcome IN ('in_progress', 'converted', 'contact_captured', 'not_qualified', 'abandoned')),
                            message_count INTEGER DEFAULT 0,
                            source_url TEXT
                        );

                        INSERT OR IGNORE INTO conversations_new SELECT * FROM conversations;

                        DROP TABLE conversations;

                        ALTER TABLE conversations_new RENAME TO conversations;

                        CREATE INDEX IF NOT EXISTS idx_conversations_outcome ON conversations(outcome);
                        CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created_at);
                    `);
                    db.exec('COMMIT');
                    console.log('Database migrated to support new outcome values');
                } catch (migrationErr) {
                    db.exec('ROLLBACK');
                    throw migrationErr;
                }
            }

            db.prepare("INSERT INTO _migrations (name) VALUES ('add_outcome_values')").run();
        }
    } catch (err) {
        console.log('Migration check completed:', err.message);
    }

    // Create virtual table for vector search if extension loaded
    if (vecLoaded) {
        try {
            db.exec(`
                CREATE VIRTUAL TABLE IF NOT EXISTS vec_patterns USING vec0(
                    pattern_id INTEGER PRIMARY KEY,
                    embedding FLOAT[${config.embedding.dimensions}]
                );
            `);
            console.log('Vector search table created');
        } catch (err) {
            console.warn('Could not create vector table:', err.message);
        }
    }

    console.log('Database initialized at:', config.databasePath);
    return db;
}

/**
 * Get the database instance
 */
function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call initialize() first.');
    }
    return db;
}

/**
 * Check if vector search is available
 */
function isVectorSearchEnabled() {
    return vecLoaded;
}

// ============================================
// CONVERSATION QUERIES
// ============================================

/**
 * Create or update a conversation
 */
function upsertConversation(sessionId, data = {}) {
    const db = getDb();

    const existing = db.prepare('SELECT id FROM conversations WHERE id = ?').get(sessionId);

    if (existing) {
        const updates = [];
        const values = [];

        if (data.lead_name !== undefined) { updates.push('lead_name = ?'); values.push(data.lead_name); }
        if (data.lead_email !== undefined) { updates.push('lead_email = ?'); values.push(data.lead_email); }
        if (data.lead_phone !== undefined) { updates.push('lead_phone = ?'); values.push(data.lead_phone); }
        if (data.lead_business_type !== undefined) { updates.push('lead_business_type = ?'); values.push(data.lead_business_type); }
        if (data.outcome !== undefined) { updates.push('outcome = ?'); values.push(data.outcome); }
        if (data.source_url !== undefined) { updates.push('source_url = ?'); values.push(data.source_url); }

        if (updates.length > 0) {
            values.push(sessionId);
            db.prepare(`UPDATE conversations SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        }
    } else {
        db.prepare(`
            INSERT INTO conversations (id, lead_name, lead_email, lead_phone, lead_business_type, source_url)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            sessionId,
            data.lead_name || null,
            data.lead_email || null,
            data.lead_phone || null,
            data.lead_business_type || null,
            data.source_url || null
        );
    }

    return sessionId;
}

/**
 * Update conversation with lead data from session
 */
function updateConversationLeadData(sessionId, leadData) {
    if (!leadData) return;

    upsertConversation(sessionId, {
        lead_name: leadData.name,
        lead_email: leadData.email,
        lead_phone: leadData.phone,
        lead_business_type: leadData.businessType || leadData.business,
    });
}

/**
 * Get a conversation by ID
 */
function getConversation(sessionId) {
    const db = getDb();
    return db.prepare('SELECT * FROM conversations WHERE id = ?').get(sessionId);
}

/**
 * List conversations with pagination and filtering
 */
function listConversations({ limit = 50, offset = 0, outcome = null, orderBy = 'created_at', order = 'DESC' } = {}) {
    const db = getDb();

    let query = 'SELECT * FROM conversations';
    const params = [];

    if (outcome) {
        query += ' WHERE outcome = ?';
        params.push(outcome);
    }

    // Sanitize orderBy to prevent SQL injection
    const allowedOrderBy = ['created_at', 'updated_at', 'message_count'];
    if (!allowedOrderBy.includes(orderBy)) orderBy = 'created_at';

    const orderDir = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    query += ` ORDER BY ${orderBy} ${orderDir} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    return db.prepare(query).all(...params);
}

/**
 * Mark a conversation as abandoned
 */
function markAbandoned(sessionId) {
    const db = getDb();
    db.prepare('UPDATE conversations SET outcome = ? WHERE id = ? AND outcome = ?')
        .run('abandoned', sessionId, 'in_progress');
}

/**
 * Mark a conversation as converted
 */
function markConverted(sessionId) {
    const db = getDb();
    db.prepare('UPDATE conversations SET outcome = ? WHERE id = ?')
        .run('converted', sessionId);
}

// ============================================
// MESSAGE QUERIES
// ============================================

/**
 * Add a message to a conversation
 */
function addMessage(conversationId, role, content, embedding = null, quickReplies = null) {
    const db = getDb();

    // Ensure conversation exists
    upsertConversation(conversationId);

    const embeddingBlob = embedding ? Buffer.from(new Float32Array(embedding).buffer) : null;
    const quickRepliesJson = quickReplies ? JSON.stringify(quickReplies) : null;

    const result = db.prepare(`
        INSERT INTO messages (conversation_id, role, content, embedding, quick_replies)
        VALUES (?, ?, ?, ?, ?)
    `).run(conversationId, role, content, embeddingBlob, quickRepliesJson);

    return result.lastInsertRowid;
}

/**
 * Get messages for a conversation
 */
function getMessages(conversationId, limit = 100) {
    const db = getDb();
    return db.prepare(`
        SELECT id, conversation_id, role, content, created_at, quick_replies
        FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC
        LIMIT ?
    `).all(conversationId, limit);
}

/**
 * Get full conversation with messages
 */
function getConversationWithMessages(sessionId) {
    const conversation = getConversation(sessionId);
    if (!conversation) return null;

    const messages = getMessages(sessionId);
    return { ...conversation, messages };
}

/**
 * Update message embedding
 */
function updateMessageEmbedding(messageId, embedding) {
    const db = getDb();
    const embeddingBlob = Buffer.from(new Float32Array(embedding).buffer);
    db.prepare('UPDATE messages SET embedding = ? WHERE id = ?').run(embeddingBlob, messageId);
}

// ============================================
// SUCCESSFUL PATTERNS QUERIES
// ============================================

/**
 * Create a successful pattern
 */
function createPattern(data) {
    const db = getDb();

    const embeddingBlob = data.embedding ? Buffer.from(new Float32Array(data.embedding).buffer) : null;

    const result = db.prepare(`
        INSERT INTO successful_patterns
        (conversation_id, pattern_type, title, description, messages_json, embedding, booking_achieved, tagged_by, confidence_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        data.conversation_id || null,
        data.pattern_type,
        data.title,
        data.description || null,
        JSON.stringify(data.messages),
        embeddingBlob,
        data.booking_achieved ? 1 : 0,
        data.tagged_by || 'auto',
        data.confidence_score || 0
    );

    // Add to vector index if available
    if (vecLoaded && data.embedding) {
        try {
            const embeddingStr = `[${data.embedding.join(',')}]`;
            db.prepare(`INSERT INTO vec_patterns (pattern_id, embedding) VALUES (?, ?)`).run(result.lastInsertRowid, embeddingStr);
        } catch (err) {
            console.error('Error adding pattern to vector index:', err.message);
        }
    }

    return result.lastInsertRowid;
}

/**
 * Get a pattern by ID
 */
function getPattern(patternId) {
    const db = getDb();
    const pattern = db.prepare('SELECT * FROM successful_patterns WHERE id = ?').get(patternId);
    if (pattern) {
        pattern.messages = JSON.parse(pattern.messages_json);
    }
    return pattern;
}

/**
 * List successful patterns
 */
function listPatterns({ limit = 50, offset = 0, pattern_type = null, minConfidence = 0 } = {}) {
    const db = getDb();

    let query = 'SELECT * FROM successful_patterns WHERE confidence_score >= ?';
    const params = [minConfidence];

    if (pattern_type) {
        query += ' AND pattern_type = ?';
        params.push(pattern_type);
    }

    query += ' ORDER BY confidence_score DESC, created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const patterns = db.prepare(query).all(...params);
    return patterns.map(p => ({ ...p, messages: JSON.parse(p.messages_json) }));
}

/**
 * Get patterns for a specific conversation
 */
function getPatternsByConversation(conversationId) {
    const db = getDb();
    const patterns = db.prepare('SELECT * FROM successful_patterns WHERE conversation_id = ?').all(conversationId);
    return patterns.map(p => ({ ...p, messages: JSON.parse(p.messages_json) }));
}

/**
 * Delete a pattern
 */
function deletePattern(patternId) {
    const db = getDb();

    // Remove from vector index first
    if (vecLoaded) {
        try {
            db.prepare('DELETE FROM vec_patterns WHERE pattern_id = ?').run(patternId);
        } catch (err) {
            console.error('Error removing pattern from vector index:', err.message);
        }
    }

    return db.prepare('DELETE FROM successful_patterns WHERE id = ?').run(patternId);
}

/**
 * Search for similar patterns using vector similarity
 */
function searchSimilarPatterns(queryEmbedding, limit = 3, minSimilarity = 0.6) {
    const db = getDb();

    if (!vecLoaded) {
        // Fallback: return recent high-confidence patterns
        return listPatterns({ limit, minConfidence: 0.7 });
    }

    try {
        const embeddingStr = `[${queryEmbedding.join(',')}]`;

        // Use sqlite-vec to find similar patterns
        const results = db.prepare(`
            SELECT
                vp.pattern_id,
                vp.distance,
                sp.*
            FROM vec_patterns vp
            JOIN successful_patterns sp ON sp.id = vp.pattern_id
            WHERE vp.embedding MATCH ?
            ORDER BY vp.distance ASC
            LIMIT ?
        `).all(embeddingStr, limit);

        // Convert distance to similarity and filter
        return results
            .map(r => {
                const similarity = 1 - r.distance; // Convert L2 distance to similarity
                return {
                    ...r,
                    similarity,
                    messages: JSON.parse(r.messages_json)
                };
            })
            .filter(r => r.similarity >= minSimilarity);
    } catch (err) {
        console.error('Vector search failed:', err.message);
        // Fallback to recent high-confidence patterns
        return listPatterns({ limit, minConfidence: 0.7 });
    }
}

/**
 * Check if a pattern already exists for a conversation
 */
function patternExistsForConversation(conversationId) {
    const db = getDb();
    const result = db.prepare('SELECT COUNT(*) as count FROM successful_patterns WHERE conversation_id = ?').get(conversationId);
    return result.count > 0;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get conversation statistics
 */
function getStats() {
    const db = getDb();

    const conversationStats = db.prepare(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN outcome = 'converted' THEN 1 ELSE 0 END) as converted,
            SUM(CASE WHEN outcome = 'contact_captured' THEN 1 ELSE 0 END) as contact_captured,
            SUM(CASE WHEN outcome = 'not_qualified' THEN 1 ELSE 0 END) as not_qualified,
            SUM(CASE WHEN outcome = 'abandoned' THEN 1 ELSE 0 END) as abandoned,
            SUM(CASE WHEN outcome = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
            AVG(message_count) as avg_messages
        FROM conversations
    `).get();

    const patternStats = db.prepare(`
        SELECT COUNT(*) as total, AVG(confidence_score) as avg_confidence
        FROM successful_patterns
    `).get();

    return {
        conversations: conversationStats,
        patterns: patternStats
    };
}

/**
 * Close the database connection
 */
function close() {
    if (db) {
        db.close();
        db = null;
    }
}

module.exports = {
    initialize,
    getDb,
    isVectorSearchEnabled,

    // Conversations
    upsertConversation,
    updateConversationLeadData,
    getConversation,
    listConversations,
    markAbandoned,
    markConverted,

    // Messages
    addMessage,
    getMessages,
    getConversationWithMessages,
    updateMessageEmbedding,

    // Patterns
    createPattern,
    getPattern,
    getPatternsByConversation,
    listPatterns,
    deletePattern,
    searchSimilarPatterns,
    patternExistsForConversation,

    // Utility
    getStats,
    close
};
