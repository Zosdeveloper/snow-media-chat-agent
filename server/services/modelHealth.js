/**
 * Model Health - verifies the configured Claude models are still live.
 *
 * A retired model ID returns 404 from the Anthropic API, which is exactly what
 * took the chat agent down silently for 9 days (claude-sonnet-4-20250514 retired
 * 2026-06-15). This probe catches that automatically.
 *
 * It uses messages.countTokens() rather than messages.create():
 *   - free (no output tokens billed)
 *   - model-specific, so a retired/invalid model ID 404s just like a real call
 *
 * Results are cached so a frequently-polling uptime monitor doesn't hammer the
 * Anthropic API. Used by:
 *   - the boot-time preflight in startServer() (catches a dead model at deploy)
 *   - GET /api/health/model (catches a model that retires while running)
 */

const Anthropic = require('@anthropic-ai/sdk');
const config = require('./../config');

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cache = { at: 0, result: null };

/**
 * Probe a single model id. Returns { model, ok, dead, status, error }.
 * dead === true means the API returned 404 (retired / invalid model id).
 * Other failures (network, 429, 5xx) are ok:false but dead:false (unverified),
 * so a transient blip doesn't get reported as a retired model.
 */
async function probeModel(model) {
    try {
        await anthropic.messages.countTokens({
            model,
            messages: [{ role: 'user', content: 'ping' }],
        });
        return { model, ok: true, dead: false, status: 200, error: null };
    } catch (err) {
        const status = err?.status || err?.statusCode || null;
        const dead = status === 404;
        return { model, ok: false, dead, status, error: err.message };
    }
}

/**
 * Check every configured model. Returns:
 *   { ok, deadModels: [...], roles: [{role, model, ok, dead, status, error}], checkedAt }
 * ok is true only when no configured model is dead (404). Unverified failures
 * (network/transient) do NOT flip ok to false on their own.
 */
async function checkModels({ force = false } = {}) {
    const now = Date.now();
    if (!force && cache.result && now - cache.at < CACHE_TTL_MS) {
        return cache.result;
    }

    const entries = Object.entries(config.models); // [[role, modelId], ...]
    // De-dupe model ids so we make one probe per distinct model, not per role.
    const uniqueModels = [...new Set(entries.map(([, model]) => model))];
    const probes = await Promise.all(uniqueModels.map(probeModel));
    const byModel = new Map(probes.map(p => [p.model, p]));

    const roles = entries.map(([role, model]) => ({ role, ...byModel.get(model) }));
    const deadModels = probes.filter(p => p.dead).map(p => p.model);

    const result = {
        ok: deadModels.length === 0,
        deadModels,
        roles,
        checkedAt: new Date(now).toISOString(),
    };

    cache = { at: now, result };
    return result;
}

module.exports = { checkModels, probeModel };
