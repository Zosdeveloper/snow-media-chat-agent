/**
 * Alert Service - Send notifications when critical errors occur
 * Supports Discord webhooks (easy), with extensibility for Slack/SMS
 */

const config = require('../config');

// Rate limiting to prevent alert spam
const alertHistory = new Map();
const RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes
const MAX_ALERTS_PER_WINDOW = 5;

/**
 * Send alert via configured channel
 */
async function sendAlert(type, details) {
    // Check rate limit
    if (isRateLimited(type)) {
        console.warn(`[AlertService] Rate limited: ${type}`);
        return false;
    }

    const webhookUrl = process.env.ALERT_WEBHOOK_URL;

    if (!webhookUrl) {
        console.warn('[AlertService] No ALERT_WEBHOOK_URL configured, logging only');
        logAlert(type, details);
        return false;
    }

    try {
        const payload = formatPayload(type, details, webhookUrl);

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error(`[AlertService] Webhook failed: ${response.status}`);
            return false;
        }

        recordAlert(type);
        return true;
    } catch (err) {
        console.error('[AlertService] Failed to send alert:', err.message);
        return false;
    }
}

/**
 * Format payload based on webhook type (Discord vs Slack)
 */
function formatPayload(type, details, webhookUrl) {
    const timestamp = new Date().toISOString();
    const isDiscord = webhookUrl.includes('discord.com');
    const isSlack = webhookUrl.includes('slack.com');

    if (isDiscord) {
        return {
            embeds: [{
                title: `🚨 ${type}`,
                description: details.message || 'An error occurred',
                color: getColorForType(type),
                fields: formatFields(details),
                timestamp: timestamp,
                footer: { text: 'Snow Media Chat Agent' }
            }]
        };
    }

    if (isSlack) {
        return {
            blocks: [
                {
                    type: 'header',
                    text: { type: 'plain_text', text: `🚨 ${type}` }
                },
                {
                    type: 'section',
                    text: { type: 'mrkdwn', text: details.message || 'An error occurred' }
                },
                {
                    type: 'context',
                    elements: formatFields(details).map(f => ({
                        type: 'mrkdwn',
                        text: `*${f.name}:* ${f.value}`
                    }))
                }
            ]
        };
    }

    // Generic webhook format
    return {
        type,
        timestamp,
        ...details
    };
}

/**
 * Format error details as fields
 */
function formatFields(details) {
    const fields = [];

    if (details.error) {
        fields.push({ name: 'Error', value: truncate(details.error, 200), inline: false });
    }
    if (details.sessionId) {
        fields.push({ name: 'Session', value: details.sessionId, inline: true });
    }
    if (details.endpoint) {
        fields.push({ name: 'Endpoint', value: details.endpoint, inline: true });
    }
    if (details.userMessage) {
        fields.push({ name: 'User Message', value: truncate(details.userMessage, 100), inline: false });
    }
    if (details.stack && process.env.NODE_ENV === 'development') {
        fields.push({ name: 'Stack', value: '```' + truncate(details.stack, 500) + '```', inline: false });
    }

    return fields;
}

/**
 * Get Discord embed color based on alert type
 */
function getColorForType(type) {
    const colors = {
        'Chat Error': 0xFF0000,        // Red
        'API Error': 0xFF4500,         // Orange-red
        'Database Error': 0xFFFF00,    // Yellow
        'RAG Error': 0xFFA500,         // Orange
        'Lead Capture Error': 0xFF0000, // Red
        'Rate Limit': 0x808080          // Gray
    };
    return colors[type] || 0xFF0000;
}

/**
 * Rate limiting helpers
 */
function isRateLimited(type) {
    const key = type;
    const now = Date.now();
    const history = alertHistory.get(key) || [];

    // Clean old entries
    const recent = history.filter(t => now - t < RATE_LIMIT_WINDOW);

    if (recent.length >= MAX_ALERTS_PER_WINDOW) {
        return true;
    }

    return false;
}

function recordAlert(type) {
    const key = type;
    const now = Date.now();
    const history = alertHistory.get(key) || [];
    history.push(now);

    // Keep only recent entries
    const recent = history.filter(t => now - t < RATE_LIMIT_WINDOW);
    alertHistory.set(key, recent);
}

/**
 * Log alert to console (fallback when no webhook)
 */
function logAlert(type, details) {
    console.error(`[ALERT] ${type}:`, JSON.stringify(details, null, 2));
}

/**
 * Truncate string to max length
 */
function truncate(str, maxLen) {
    if (!str) return '';
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen) + '...';
}

// Convenience methods for common alert types
const alerts = {
    chatError: (error, context = {}) => sendAlert('Chat Error', {
        message: 'Chat endpoint failed - potential lost lead',
        error: error.message,
        stack: error.stack,
        ...context
    }),

    apiError: (error, context = {}) => sendAlert('API Error', {
        message: 'External API call failed',
        error: error.message,
        ...context
    }),

    databaseError: (error, context = {}) => sendAlert('Database Error', {
        message: 'Database operation failed',
        error: error.message,
        ...context
    }),

    ragError: (error, context = {}) => sendAlert('RAG Error', {
        message: 'RAG context retrieval failed',
        error: error.message,
        ...context
    }),

    leadCaptureError: (error, context = {}) => sendAlert('Lead Capture Error', {
        message: 'Failed to capture lead data',
        error: error.message,
        ...context
    }),

    custom: (type, message, details = {}) => sendAlert(type, {
        message,
        ...details
    })
};

module.exports = alerts;
