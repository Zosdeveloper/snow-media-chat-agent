// Shared plumbing for the behavioral eval harnesses (run-eval.mjs, sales-eval.mjs).
// Both drive the REAL server over HTTP with simulated visitors, so nothing here
// knows about the agent's internals.
import { spawn } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

export const SERVER_DIR = join(__dirname, '..');
// Same counter the server's length guardrail uses, so the eval and production
// agree on what "two sentences" means.
export const { countSentences, countWords } = require('../services/guardrails');

const env = readFileSync(join(SERVER_DIR, '.env'), 'utf8');
const API_KEY = (env.match(/^ANTHROPIC_API_KEY=(.+)$/m) || [])[1]?.trim();
if (!API_KEY) { console.error('No ANTHROPIC_API_KEY in server/.env'); process.exit(1); }

export const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * One Claude call for a simulated visitor or a judge. Pass `schema` to get
 * guaranteed-valid JSON back (structured outputs), returned already parsed.
 */
export async function anthropic(model, system, messages, { maxTokens = 1024, effort = 'low', schema = null } = {}) {
  const output_config = { effort };
  if (schema) output_config.format = { type: 'json_schema', schema };
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: maxTokens, output_config, system, messages })
      });
      if (r.status === 429 || r.status >= 500) { await sleep(2500 * (attempt + 1)); continue; }
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
      if (!schema) return text;
      if (j.stop_reason !== 'end_turn') throw new Error(`structured output cut off (stop_reason=${j.stop_reason})`);
      return JSON.parse(text);
    } catch (e) {
      if (attempt === 4) throw e;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw new Error('anthropic: retries exhausted');
}

/**
 * POST one visitor message to the agent. `ip` gives every scenario its own
 * rate-limit bucket (the server trusts one proxy hop), so scenarios can run
 * side by side without tripping the 8/min per-IP limiter.
 */
export async function chat(base, sessionId, message, page, ip) {
  for (;;) {
    const r = await fetch(base + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ sessionId, message, pageContext: page })
    });
    // A 429 has no message field, so without this wait it scores as a blank reply.
    if (r.status === 429) {
      const reset = Number(r.headers.get('ratelimit-reset')) || 15;
      if (reset > 90) throw new Error('rate limited for ' + reset + 's');
      await sleep(reset * 1000 + 500);
      continue;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status} from /api/chat`);
    return r.json();
  }
}

/**
 * Boot a throwaway server and wait until it is healthy AND its knowledge base
 * has finished seeding. Seeding is async after boot; a scenario that starts
 * before it finishes runs with no facts to cite, which skews the first few.
 */
export async function bootServer({ port, dbPath }) {
  for (const ext of ['', '-wal', '-shm']) {
    try { rmSync(join(SERVER_DIR, dbPath.replace('./', '') + ext)); } catch {}
  }
  const srv = spawn('node', ['server.js'], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      PORT: String(port), DATABASE_PATH: dbPath, NODE_ENV: 'development',
      DAILY_IP_MAX: '100000', DAILY_CLAUDE_CALL_LIMIT: '100000',
      // Never page the owner or email anyone from an eval run.
      ALERT_WEBHOOK_URL: '', PUBLIC_URL: '', SENDGRID_API_KEY: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  srv.stdout.on('data', d => { log += d; });
  srv.stderr.on('data', d => { log += d; });

  const base = `http://127.0.0.1:${port}`;
  const start = Date.now();
  let healthy = false, lastPatterns = -1, stable = 0;
  while (Date.now() - start < 90000) {
    try {
      const r = await fetch(base + '/api/health');
      if (r.ok) {
        healthy = true;
        const h = await r.json();
        const seeded = /Knowledge base (seeded|up to date)|RAG features disabled/.test(log);
        if (seeded) break;
        stable = h.patterns === lastPatterns ? stable + 1 : 0;
        lastPatterns = h.patterns;
        if (h.patterns > 0 && stable >= 8) break;
      }
    } catch {}
    await sleep(800);
  }
  if (!healthy) {
    console.error('Server did not become healthy. Logs:\n', log.slice(-2000));
    srv.kill();
    process.exit(1);
  }
  return { base, stop: () => srv.kill('SIGINT'), log: () => log };
}

/** Run `worker` over `items` with at most `limit` in flight. Results keep input order. */
export async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }));
  return results;
}

/** Sentence / word stats over a list of agent replies, for the length scorecard. */
export function lengthStats(replies, maxSentences) {
  const s = replies.map(countSentences);
  const w = replies.map(countWords);
  const over = s.filter(n => n > maxSentences).length;
  const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  return {
    turns: replies.length,
    over,
    withinPct: replies.length ? Math.round(100 * (replies.length - over) / replies.length) : 100,
    avgSentences: +avg(s).toFixed(1), maxSentences: Math.max(0, ...s),
    avgWords: Math.round(avg(w)), maxWords: Math.max(0, ...w)
  };
}

// Day-and-time availability the agent cannot know ("Thursday at 2").
export const INVENTED_SLOT = /\b(?:mon|tues?|wed(?:nes)?|thur?s?|fri|sat(?:ur)?|sun)(?:day)?\b[^.?!]{0,20}\bat\s+\d{1,2}\b/i;
