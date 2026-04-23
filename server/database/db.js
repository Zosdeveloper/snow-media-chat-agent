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

    // Migration: Add session_state, visitor_id, prompt_variant columns
    try {
        const hasSessionState = db.prepare("SELECT 1 FROM pragma_table_info('conversations') WHERE name = 'session_state'").get();
        if (!hasSessionState) {
            db.exec(`
                ALTER TABLE conversations ADD COLUMN session_state TEXT;
                ALTER TABLE conversations ADD COLUMN visitor_id TEXT;
                ALTER TABLE conversations ADD COLUMN prompt_variant TEXT;
            `);
            db.exec(`CREATE INDEX IF NOT EXISTS idx_conversations_visitor ON conversations(visitor_id)`);
            console.log('Added session_state, visitor_id, prompt_variant columns');
        }
    } catch (err) {
        // Columns may already exist
        if (!err.message.includes('duplicate column')) {
            console.log('Column migration note:', err.message);
        }
    }

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

    // Migration: Add follow_ups table for email follow-up sequences
    try {
        const alreadyRun = db.prepare("SELECT 1 FROM _migrations WHERE name = 'add_follow_ups_table'").get();
        if (!alreadyRun) {
            db.exec(`
                CREATE TABLE IF NOT EXISTS follow_ups (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    conversation_id TEXT NOT NULL,
                    lead_email TEXT NOT NULL,
                    lead_name TEXT,
                    sequence_step INTEGER NOT NULL DEFAULT 1,
                    email_type TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed', 'skipped')),
                    subject TEXT,
                    body_html TEXT,
                    scheduled_at DATETIME NOT NULL,
                    sent_at DATETIME,
                    error_message TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_follow_ups_status ON follow_ups(status, scheduled_at);
                CREATE INDEX IF NOT EXISTS idx_follow_ups_conversation ON follow_ups(conversation_id);
                CREATE INDEX IF NOT EXISTS idx_follow_ups_email ON follow_ups(lead_email);
            `);
            db.prepare("INSERT INTO _migrations (name) VALUES ('add_follow_ups_table')").run();
            console.log('Created follow_ups table');
        }
    } catch (err) {
        if (!err.message.includes('already exists')) {
            console.log('Follow-ups migration note:', err.message);
        }
    }

    // Migration: add intent classification columns on conversations
    try {
        const alreadyRun = db.prepare("SELECT 1 FROM _migrations WHERE name = 'add_intent_columns'").get();
        if (!alreadyRun) {
            const cols = db.prepare("PRAGMA table_info(conversations)").all().map(c => c.name);
            if (!cols.includes('intent')) {
                db.exec("ALTER TABLE conversations ADD COLUMN intent TEXT");
            }
            if (!cols.includes('intent_confidence')) {
                db.exec("ALTER TABLE conversations ADD COLUMN intent_confidence REAL");
            }
            if (!cols.includes('intent_source')) {
                db.exec("ALTER TABLE conversations ADD COLUMN intent_source TEXT");
            }
            db.exec("CREATE INDEX IF NOT EXISTS idx_conversations_intent ON conversations(intent)");
            db.prepare("INSERT INTO _migrations (name) VALUES ('add_intent_columns')").run();
            console.log('Added intent columns to conversations');
        }
    } catch (err) {
        console.log('Intent migration note:', err.message);
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
// SESSION STATE PERSISTENCE
// ============================================

/**
 * Save session state to database (survives restarts)
 */
function saveSessionState(sessionId, state) {
    const db = getDb();
    const stateJson = JSON.stringify(state);
    db.prepare('UPDATE conversations SET session_state = ? WHERE id = ?').run(stateJson, sessionId);
}

/**
 * Load session state from database
 */
function loadSessionState(sessionId) {
    const db = getDb();
    const row = db.prepare('SELECT session_state FROM conversations WHERE id = ?').get(sessionId);
    if (row && row.session_state) {
        try {
            return JSON.parse(row.session_state);
        } catch (e) {
            return null;
        }
    }
    return null;
}

/**
 * Set visitor_id and prompt_variant on a conversation
 */
function setConversationMeta(sessionId, visitorId, promptVariant) {
    const db = getDb();
    db.prepare('UPDATE conversations SET visitor_id = ?, prompt_variant = ? WHERE id = ?')
        .run(visitorId, promptVariant, sessionId);
}

/**
 * Find previous conversations for a visitor (for returning visitor recognition)
 * Returns the most recent conversation with captured lead data
 */
function findPreviousVisitorData(visitorId) {
    if (!visitorId) return null;
    const db = getDb();
    return db.prepare(`
        SELECT id, lead_name, lead_email, lead_phone, lead_business_type, outcome, session_state,
               (SELECT COUNT(*) FROM messages WHERE conversation_id = conversations.id) as msg_count
        FROM conversations
        WHERE visitor_id = ?
        AND (lead_name IS NOT NULL OR lead_email IS NOT NULL OR lead_business_type IS NOT NULL)
        ORDER BY updated_at DESC
        LIMIT 1
    `).get(visitorId);
}

/**
 * Get conversation count per prompt variant (for A/B testing analytics)
 */
function getVariantStats() {
    const db = getDb();
    return db.prepare(`
        SELECT
            prompt_variant,
            COUNT(*) as total,
            SUM(CASE WHEN outcome = 'converted' THEN 1 ELSE 0 END) as converted,
            SUM(CASE WHEN outcome = 'contact_captured' THEN 1 ELSE 0 END) as contact_captured,
            SUM(CASE WHEN outcome = 'abandoned' THEN 1 ELSE 0 END) as abandoned,
            AVG(message_count) as avg_messages
        FROM conversations
        WHERE prompt_variant IS NOT NULL
        GROUP BY prompt_variant
    `).all();
}

// ============================================
// FOLLOW-UP QUERIES
// ============================================

/**
 * Get conversations eligible for follow-up scheduling.
 * Must have email, outcome in_progress or contact_captured,
 * last message older than minAge minutes, and no follow-ups queued yet.
 */
function getFollowUpCandidates(minAgeMinutes = 30) {
    const db = getDb();
    return db.prepare(`
        SELECT c.id, c.lead_name, c.lead_email, c.lead_business_type, c.outcome,
               c.source_url, c.created_at, c.intent,
               MAX(m.created_at) as last_message_at
        FROM conversations c
        JOIN messages m ON m.conversation_id = c.id
        WHERE c.lead_email IS NOT NULL
          AND c.outcome IN ('in_progress', 'contact_captured')
          AND (c.intent IS NULL OR c.intent IN ('real_lead', 'partnership', 'unclear'))
          AND c.id NOT IN (SELECT DISTINCT conversation_id FROM follow_ups)
          AND datetime(m.created_at, '+' || ? || ' minutes') < datetime('now')
        GROUP BY c.id
    `).all(minAgeMinutes);
}

/**
 * Set conversation intent classification.
 * source: 'keyword' (regex match), 'classifier' (Claude), or 'manual' (admin override).
 */
function setConversationIntent(sessionId, intent, confidence = null, source = 'classifier') {
    const db = getDb();
    db.prepare(`
        UPDATE conversations
        SET intent = ?, intent_confidence = ?, intent_source = ?
        WHERE id = ?
    `).run(intent, confidence, source, sessionId);
}

/**
 * Get stored intent for a conversation.
 */
function getConversationIntent(sessionId) {
    const db = getDb();
    const row = db.prepare('SELECT intent, intent_confidence, intent_source FROM conversations WHERE id = ?').get(sessionId);
    return row || null;
}

/**
 * Create a follow-up email record
 */
function createFollowUp(data) {
    const db = getDb();
    return db.prepare(`
        INSERT INTO follow_ups (conversation_id, lead_email, lead_name, sequence_step, email_type, subject, body_html, scheduled_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        data.conversation_id,
        data.lead_email,
        data.lead_name || null,
        data.sequence_step,
        data.email_type,
        data.subject || null,
        data.body_html || null,
        data.scheduled_at
    );
}

/**
 * Get pending follow-ups that are due to send
 */
function getDueFollowUps() {
    const db = getDb();
    return db.prepare(`
        SELECT f.*, c.lead_business_type, c.source_url
        FROM follow_ups f
        JOIN conversations c ON c.id = f.conversation_id
        WHERE f.status = 'pending'
          AND datetime(f.scheduled_at) <= datetime('now')
        ORDER BY f.scheduled_at ASC
        LIMIT 20
    `).all();
}

/**
 * Mark a follow-up as sent
 */
function markFollowUpSent(followUpId) {
    const db = getDb();
    db.prepare(`UPDATE follow_ups SET status = 'sent', sent_at = datetime('now') WHERE id = ?`).run(followUpId);
}

/**
 * Mark a follow-up as failed
 */
function markFollowUpFailed(followUpId, errorMessage) {
    const db = getDb();
    db.prepare(`UPDATE follow_ups SET status = 'failed', error_message = ? WHERE id = ?`).run(errorMessage, followUpId);
}

/**
 * Skip remaining follow-ups for a conversation (e.g., they booked a call)
 */
function skipFollowUps(conversationId) {
    const db = getDb();
    db.prepare(`UPDATE follow_ups SET status = 'skipped' WHERE conversation_id = ? AND status = 'pending'`).run(conversationId);
}

/**
 * Count follow-ups sent today (for daily limit)
 */
function getFollowUpsSentToday() {
    const db = getDb();
    const result = db.prepare(`
        SELECT COUNT(*) as count FROM follow_ups
        WHERE status = 'sent' AND date(sent_at) = date('now')
    `).get();
    return result.count;
}

/**
 * List follow-ups with filtering (for admin)
 */
function listFollowUps({ limit = 50, offset = 0, status = null, conversationId = null } = {}) {
    const db = getDb();
    let query = 'SELECT f.*, c.lead_business_type FROM follow_ups f JOIN conversations c ON c.id = f.conversation_id WHERE 1=1';
    const params = [];

    if (status) {
        query += ' AND f.status = ?';
        params.push(status);
    }
    if (conversationId) {
        query += ' AND f.conversation_id = ?';
        params.push(conversationId);
    }

    query += ' ORDER BY f.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return db.prepare(query).all(...params);
}

/**
 * Get follow-up stats for admin dashboard
 */
function getFollowUpStats() {
    const db = getDb();
    return db.prepare(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped,
            COUNT(DISTINCT conversation_id) as unique_leads
        FROM follow_ups
    `).get();
}

/**
 * Check if a conversation already converted (booked) so we can skip follow-ups
 */
function isConversationConverted(conversationId) {
    const db = getDb();
    const result = db.prepare(`SELECT outcome FROM conversations WHERE id = ?`).get(conversationId);
    return result && result.outcome === 'converted';
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
    setConversationIntent,
    getConversationIntent,

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

    // Follow-ups
    getFollowUpCandidates,
    createFollowUp,
    getDueFollowUps,
    markFollowUpSent,
    markFollowUpFailed,
    skipFollowUps,
    getFollowUpsSentToday,
    listFollowUps,
    getFollowUpStats,
    isConversationConverted,

    // Session persistence
    saveSessionState,
    loadSessionState,
    setConversationMeta,
    findPreviousVisitorData,
    getVariantStats,

    // Utility
    getStats,
    close
};
