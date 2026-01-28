/**
 * Admin Routes for Snow Media Chat Agent
 * Provides endpoints for viewing/managing conversations and patterns
 */

const express = require('express');
const router = express.Router();
const db = require('../database/db');
const ragService = require('../services/ragService');
const autoTagger = require('../services/autoTagger');
const config = require('../config');

/**
 * Admin authentication middleware
 */
function adminAuth(req, res, next) {
    const apiKey = req.headers['x-admin-api-key'] || req.query.apiKey;

    if (!config.adminApiKey) {
        return res.status(500).json({ error: 'Admin API key not configured' });
    }

    if (!apiKey || apiKey !== config.adminApiKey) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
}

// Apply auth to all admin routes
router.use(adminAuth);

// ============================================
// CONVERSATION ENDPOINTS
// ============================================

/**
 * GET /api/admin/conversations
 * List conversations with pagination and filtering
 */
router.get('/conversations', (req, res) => {
    try {
        const {
            limit = 50,
            offset = 0,
            outcome,
            orderBy = 'created_at',
            order = 'DESC'
        } = req.query;

        const conversations = db.listConversations({
            limit: parseInt(limit),
            offset: parseInt(offset),
            outcome,
            orderBy,
            order
        });

        res.json({
            conversations,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                count: conversations.length
            }
        });
    } catch (error) {
        console.error('Error listing conversations:', error.message);
        res.status(500).json({ error: 'Failed to list conversations' });
    }
});

/**
 * GET /api/admin/conversations/:id
 * Get full conversation with messages
 */
router.get('/conversations/:id', (req, res) => {
    try {
        const conversation = db.getConversationWithMessages(req.params.id);

        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        res.json(conversation);
    } catch (error) {
        console.error('Error getting conversation:', error.message);
        res.status(500).json({ error: 'Failed to get conversation' });
    }
});

/**
 * PATCH /api/admin/conversations/:id/outcome
 * Update conversation outcome (converted/abandoned)
 */
router.patch('/conversations/:id/outcome', async (req, res) => {
    try {
        const { outcome } = req.body;

        if (!['converted', 'contact_captured', 'not_qualified', 'abandoned', 'in_progress'].includes(outcome)) {
            return res.status(400).json({ error: 'Invalid outcome. Must be: converted, contact_captured, not_qualified, abandoned, or in_progress' });
        }

        const conversation = db.getConversation(req.params.id);
        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        if (outcome === 'converted') {
            // Mark as converted and potentially create pattern
            const fullConversation = db.getConversationWithMessages(req.params.id);
            await autoTagger.markAsConverted(req.params.id, {
                messages: fullConversation.messages.map(m => ({
                    role: m.role,
                    content: m.content
                })),
                leadData: {
                    name: fullConversation.lead_name,
                    email: fullConversation.lead_email,
                    phone: fullConversation.lead_phone,
                    businessType: fullConversation.lead_business_type
                }
            });
        } else if (outcome === 'abandoned') {
            db.markAbandoned(req.params.id);
        } else {
            db.upsertConversation(req.params.id, { outcome });
        }

        res.json({ success: true, outcome });
    } catch (error) {
        console.error('Error updating outcome:', error.message);
        res.status(500).json({ error: 'Failed to update outcome' });
    }
});

// ============================================
// PATTERN ENDPOINTS
// ============================================

/**
 * GET /api/admin/patterns
 * List successful patterns
 */
router.get('/patterns', (req, res) => {
    try {
        const {
            limit = 50,
            offset = 0,
            pattern_type,
            minConfidence = 0
        } = req.query;

        const patterns = db.listPatterns({
            limit: parseInt(limit),
            offset: parseInt(offset),
            pattern_type,
            minConfidence: parseFloat(minConfidence)
        });

        res.json({
            patterns,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                count: patterns.length
            }
        });
    } catch (error) {
        console.error('Error listing patterns:', error.message);
        res.status(500).json({ error: 'Failed to list patterns' });
    }
});

/**
 * GET /api/admin/patterns/:id
 * Get a specific pattern
 */
router.get('/patterns/:id', (req, res) => {
    try {
        const pattern = db.getPattern(parseInt(req.params.id));

        if (!pattern) {
            return res.status(404).json({ error: 'Pattern not found' });
        }

        res.json(pattern);
    } catch (error) {
        console.error('Error getting pattern:', error.message);
        res.status(500).json({ error: 'Failed to get pattern' });
    }
});

/**
 * POST /api/admin/patterns
 * Manually create a pattern
 */
router.post('/patterns', async (req, res) => {
    try {
        const {
            conversation_id,
            pattern_type,
            title,
            description,
            messages,
            booking_achieved = false
        } = req.body;

        // Validate required fields
        if (!pattern_type || !title || !messages || !Array.isArray(messages)) {
            return res.status(400).json({
                error: 'Missing required fields: pattern_type, title, messages (array)'
            });
        }

        // Validate messages format
        for (const msg of messages) {
            if (!msg.role || !msg.content) {
                return res.status(400).json({
                    error: 'Each message must have role and content'
                });
            }
            if (!['user', 'assistant'].includes(msg.role)) {
                return res.status(400).json({
                    error: 'Message role must be "user" or "assistant"'
                });
            }
        }

        const patternId = await ragService.indexPattern({
            conversation_id,
            pattern_type,
            title,
            description,
            messages,
            booking_achieved,
            tagged_by: 'manual',
            confidence_score: 1.0 // Manual patterns get full confidence
        });

        if (!patternId) {
            return res.status(500).json({ error: 'Failed to create pattern' });
        }

        const pattern = db.getPattern(patternId);
        res.status(201).json(pattern);
    } catch (error) {
        console.error('Error creating pattern:', error.message);
        res.status(500).json({ error: 'Failed to create pattern' });
    }
});

/**
 * DELETE /api/admin/patterns/:id
 * Delete a pattern
 */
router.delete('/patterns/:id', (req, res) => {
    try {
        const pattern = db.getPattern(parseInt(req.params.id));

        if (!pattern) {
            return res.status(404).json({ error: 'Pattern not found' });
        }

        db.deletePattern(parseInt(req.params.id));
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting pattern:', error.message);
        res.status(500).json({ error: 'Failed to delete pattern' });
    }
});

/**
 * POST /api/admin/patterns/search
 * Search patterns by query
 */
router.post('/patterns/search', async (req, res) => {
    try {
        const { query, limit = 5 } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        const patterns = await ragService.searchPatterns(query, parseInt(limit));
        res.json({ patterns });
    } catch (error) {
        console.error('Error searching patterns:', error.message);
        res.status(500).json({ error: 'Failed to search patterns' });
    }
});

/**
 * POST /api/admin/patterns/reindex
 * Reindex all pattern embeddings
 */
router.post('/patterns/reindex', async (req, res) => {
    try {
        const result = await ragService.reindexAllPatterns();
        res.json({
            success: true,
            reindexed: result.success,
            failed: result.failed
        });
    } catch (error) {
        console.error('Error reindexing patterns:', error.message);
        res.status(500).json({ error: 'Failed to reindex patterns' });
    }
});

// ============================================
// EXPORT ENDPOINTS
// ============================================

/**
 * GET /api/admin/export/leads
 * Export leads as CSV
 */
router.get('/export/leads', (req, res) => {
    try {
        const { outcome, from, to } = req.query;

        const conversations = db.listConversations({
            limit: 10000,
            outcome: outcome || null,
            orderBy: 'created_at',
            order: 'DESC'
        });

        // Filter by date if provided
        let filtered = conversations;
        if (from) {
            const fromDate = new Date(from);
            filtered = filtered.filter(c => new Date(c.created_at) >= fromDate);
        }
        if (to) {
            const toDate = new Date(to);
            filtered = filtered.filter(c => new Date(c.created_at) <= toDate);
        }

        // Build CSV
        const headers = ['Date', 'Name', 'Email', 'Phone', 'Business Type', 'Outcome', 'Messages', 'Source URL'];
        const rows = filtered.map(c => [
            new Date(c.created_at).toISOString().split('T')[0],
            (c.lead_name || '').replace(/,/g, ' '),
            (c.lead_email || '').replace(/,/g, ' '),
            (c.lead_phone || '').replace(/,/g, ' '),
            (c.lead_business_type || '').replace(/,/g, ' '),
            c.outcome || 'in_progress',
            c.message_count || 0,
            (c.source_url || '').replace(/,/g, ' ')
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="leads-${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csv);
    } catch (error) {
        console.error('Error exporting leads:', error.message);
        res.status(500).json({ error: 'Failed to export leads' });
    }
});

// ============================================
// STATS ENDPOINTS
// ============================================

/**
 * GET /api/admin/stats
 * Get overall statistics
 */
router.get('/stats', (req, res) => {
    try {
        const dbStats = db.getStats();
        const taggingStats = autoTagger.getTaggingStats();

        res.json({
            database: dbStats,
            tagging: taggingStats,
            vectorSearch: db.isVectorSearchEnabled()
        });
    } catch (error) {
        console.error('Error getting stats:', error.message);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

/**
 * GET /api/admin/health
 * Admin health check with more details
 */
router.get('/health', (req, res) => {
    try {
        const stats = db.getStats();

        res.json({
            status: 'ok',
            database: 'connected',
            vectorSearch: db.isVectorSearchEnabled(),
            conversations: stats.conversations.total,
            patterns: stats.patterns.total
        });
    } catch (error) {
        res.json({
            status: 'degraded',
            database: 'error',
            error: error.message
        });
    }
});

module.exports = router;
