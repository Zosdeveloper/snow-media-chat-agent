/**
 * Cloudflare Turnstile verification (anti-bot Layer 2).
 * Verifies widget-supplied tokens against the siteverify API. Only called when
 * config.turnstile.enabled (both env keys set) and only for the first message
 * of a new conversation.
 *
 * Failure policy:
 *   - Missing/invalid/expired token -> reject (that's the whole point)
 *   - Cloudflare API unreachable/timeout -> ALLOW (degraded). An upstream
 *     outage must never take the chat down; the other three spam-guard layers
 *     still apply.
 */

const config = require('../config');

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

async function verify(token, remoteip) {
    if (!token || typeof token !== 'string' || token.length > 4096) {
        return { ok: false, reason: 'missing_token' };
    }
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const params = new URLSearchParams({
            secret: config.turnstile.secretKey,
            response: token,
        });
        if (remoteip) params.set('remoteip', remoteip);

        const res = await fetch(SITEVERIFY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params,
            signal: controller.signal,
        });
        clearTimeout(timer);
        const data = await res.json();
        if (data.success) return { ok: true };
        return { ok: false, reason: (data['error-codes'] || []).join(',') || 'invalid' };
    } catch (err) {
        console.error('[TURNSTILE] siteverify unreachable, failing open:', err.message);
        return { ok: true, degraded: true };
    }
}

module.exports = { verify };
