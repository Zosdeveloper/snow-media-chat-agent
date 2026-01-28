-- Snow Media Chat Agent Database Schema
-- SQLite with sqlite-vec extension for vector search

-- Conversations table: stores metadata about each chat session
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,                              -- sessionId from the chat
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

-- Messages table: stores all messages with embeddings
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    embedding BLOB,                                   -- float32 array stored as blob
    quick_replies TEXT,                               -- JSON array of quick reply options
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Successful patterns table: stores conversation snippets that led to bookings
CREATE TABLE IF NOT EXISTS successful_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT,
    pattern_type TEXT NOT NULL,                       -- 'objection_handling', 'value_prop', 'booking_close', etc.
    title TEXT NOT NULL,                              -- Short description e.g. "HVAC Objection Handling"
    description TEXT,                                 -- Longer explanation of why this worked
    messages_json TEXT NOT NULL,                      -- JSON array of {role, content} messages
    embedding BLOB,                                   -- Embedding of concatenated messages
    booking_achieved INTEGER DEFAULT 0,               -- 1 if led to actual booking
    tagged_by TEXT DEFAULT 'auto',                    -- 'auto' or 'manual'
    confidence_score REAL DEFAULT 0,                  -- Auto-tagging confidence (0-1)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_outcome ON conversations(outcome);
CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created_at);
CREATE INDEX IF NOT EXISTS idx_patterns_type ON successful_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON successful_patterns(confidence_score);

-- Trigger to update conversation updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_conversation_timestamp
AFTER UPDATE ON conversations
BEGIN
    UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger to increment message count
CREATE TRIGGER IF NOT EXISTS increment_message_count
AFTER INSERT ON messages
BEGIN
    UPDATE conversations
    SET message_count = message_count + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.conversation_id;
END;
