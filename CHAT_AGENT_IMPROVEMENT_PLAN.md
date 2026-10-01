# Chat Agent Improvement Plan
_Synthesized 2026-04-23. Progress log kept in sync with commits on master._

## Current status

_Last updated 2026-10-01. **`dev` is ahead of `master` and NOT deployed.** Production still runs the 2026-07-07 build (chat on Sonnet 4.6, summarizer and classifier on Haiku 4.5, confirmed via `/api/health/model`). Everything dated 2026-07-07 and earlier is live. Deploy the 2026-10-01 work only with owner go-ahead._

**2026-10-01 session (on `dev`, not deployed): Sonnet 5.5 migration, full audit, two-sentence replies.**

Owner requirements restated this session: goal 1 is a booked call, goal 2 is contact info for the CRM, and replies must be very short, two sentences max.

What changed:
- **Sonnet 5.5 for every role** (`b77cc7f`). Thinking is always on and counts against `max_tokens`, so token caps were raised, effort is set per role (`config.modelEffort`, default `low`), and responses are read by block type.
- **Chat reply is structured output, one request per turn.** `REPLY_FORMAT` in `server.js`: two sentence slots plus `booking_reason`, `quick_replies`, and `lead`. This replaced the three tools. Reason: Sonnet 5.5 calls tools first and writes the message after the results come back, so a tool turn cost two or three requests and sometimes came back as a bare "Grab a time below." A 400 on the structured request retries once as plain text so chat stays up.
- **System prompt rewritten for the two-sentence rule.** The close is two sentences (stake, then email ask plus button). "Answer first, close next" replaces closing on top of an unanswered question. The email-only fallback is explicit (the old prompt called a captured email both "a saved lead" and "a lost lead"). The prompt's own examples were fixed where they broke its rules: two-question openers, the banned phrase "happy to", and a ROAS example whose math a buyer caught in the eval (3.2 to 2.1 on $60k is $66k of revenue, not "$60k in lost efficiency").
- **No invented availability.** The old prompt asked for "a specific time", and Sonnet 5.5 took that literally: "I've got Thursday at 2 or Friday at 10" in 31 replies of one eval run (Sonnet 4.6 did it in 2). The agent cannot see the calendar and does not send invites, so it now points to the button, which shows real openings. See product decision 7.
- **Knowledge base checked against the live site.** All 22 headline results were right, but 14 of the 22 descriptions named a channel or tactic that is not in the published case study (PlugPV is Meta, not Google; The Cover Guy is Google plus Microsoft, not Meta; Elevated Diversity is Google, not LinkedIn) and one number was wrong (Black Halo CPA is 16% lower, not 72%). All rewritten from the published pages. 8 missing case studies added: Ironclad Plumbing Google Ads, Thai Basil Google Ads, two AI builds (voice agent, estimate recovery), four website builds. The prompt no longer says "ZERO published for AI".
- **Proof the agent can cite.** Who the call is with (Milos Vranes, Director of Strategy & Growth), team size, and the site's headline numbers, all taken from the About page and the Calendly event.
- **Context builders** (`promptBuilder.js`): client-supplied values (lead fields, page URL, UTM) are length-capped and stripped of brackets before they enter the system block; a non-string page URL no longer throws; only `/` is labelled homepage; the resources hint no longer tells the agent to offer to email things; Variant B no longer models an invented "cut their CPA by 40%" opener.
- **Lead capture fixes.** The regex name extractor was case-insensitive after "I'm / it's / this is", so "I'm based in Denver" stored the name "based in" and "this is interesting" stored "interesting" (13 of 16 sample messages produced a wrong name, and the wrong name beat the real one later). Rewritten with tests. Regex capture now runs before the junk, spend-breaker, and outage early returns, and the junk detector never flags a message that carries an email or phone (a consonant-heavy address was treated as keyboard mash). Empty strings replayed by the widget can no longer blank a captured email.
- **Widget fixes** (`embed-ai.js` is the one the live site loads): the email-gate POST no longer carries the whole transcript (it blew the 10kb body limit on long or returning chats, the server answered 413, and the email was silently lost); the Book a Call button no longer goes dead after "Skip"; page URL and UTM are now sent, so the page-aware prompt logic finally has something to work with on the live site; the fake typing delay (up to 3s on top of real latency) is gone; links no longer swallow trailing punctuation or allow a quote to break out of `href`; the button sits on its own line.
- **Follow-up emails:** the booking link pointed at `calendly.com/milos-thesnowmedia/strategy-call`, which is a 404. Now the live `/30min` event. Signature corrected from "Milos Petrovic" to "Milos Vranes".
- **Reliability:** 3s timeout on the per-reply Voyage embedding call; a reply that is only a booking token now gets the text fallback instead of a bare button.
- **Evals rebuilt** (`server/eval/README.md`). The old harnesses stopped the moment the agent offered the call, so "booked 17/17" could not fail and email capture was never exercised. Now the buyer gets to respond, the simulated buyer reports whether they would book, the server's captured email is checked, and replies are counted against the two-sentence rule. Also: 429s from the chat limiter were scored as blank replies; judge output is schema-constrained; eval runs can no longer send Discord alerts or SendGrid email.

Eval results, same scenarios, same buyer model and judge (17 winnable tough buyers plus 1 disqualify; 10 regression scenarios):

| Build | Would book | Email only | Lost | Email captured by server | Replies within 2 sentences | Avg words | Replies naming a fake slot |
|---|---|---|---|---|---|---|---|
| Production config (Sonnet 4.6, old prompt), 1 run | 12 | 1 | 4 | 13 | 22% | 58 | 2 |
| Sonnet 5.5, old prompt, 1 run | 12 | 1 | 4 | 11 | 6% | 53 | 31 |
| `dev` final design, 4 runs (the last on the exact commit) | 11 to 14 | 1 to 3 | 1 to 4 | 10 to 14 | 96% to 100% | 35 | 0 |

Regression harness on `dev`: 6/6 offered, every email the visitor gave was captured, 0/4 disqualify leaks, 0 pricing leaks, 100% of replies within two sentences. Latency p50 about 4s, p95 about 7s, the same as the production config. Cost about $0.007 per turn.

Read the table as parity on bookings with replies about 40% shorter. Identical runs differ by one to three bookings, so no claim beyond parity. One intermediate result is worth keeping: the first two-sentence version (before "answer first, close next" and the proof facts) dropped to 6 of 17, because short replies expose an agent that has nothing concrete to say. The buyers that remain hard are the price ultimatum and anyone asking who owns the ad accounts, how reporting works, or what they get from the audit. The agent has no facts for those.

**2026-07-07 session shipped:**
- **Anti-bot Layer 1 (spend guards).** Production had 390 of 394 conversations as bot gibberish ("Rqmghhnjjnnn xckmvxxd", "."), one session burning 41 Sonnet calls on keyboard mash. Four stacked gates, all server-side, no widget changes:
  - **Origin gate** on `/api/chat`, `/api/leads`, poll, and session-info: requests whose Origin/Referer match nothing in `config.allowedOrigins` get 403. CORS only binds browsers; this stops direct curl/script POSTs. Prod-on by default, `ENFORCE_ORIGIN=false` kill-switch. Webhooks/health untouched (server-to-server).
  - **Junk detector + strike system** (`services/junkDetector.js`): high-precision gibberish heuristics (punctuation-only, vowelless words, consonant runs, char floods) run before Claude/Voyage. Junk gets a canned in-voice reply at zero API cost; 3 strikes tags the conversation `intent=bot_junk` (new `BLOCKED_INTENTS` member) and shadow-bans it with a static reply. Ban persists via the conversation row; existing intent gates keep junk out of follow-ups, booking, and RAG learning. Verified 0 false positives on 16 real-lead phrases incl. "HVAC", "MSNBC", URLs.
  - **Tighter rate limits:** 8/min per IP (was 20) plus a new 80/day per-IP ceiling (`DAILY_IP_MAX`).
  - **Daily circuit breaker:** hard cap on chat Claude calls per day (default 400, `DAILY_CLAUDE_CALL_LIMIT`); past it, visitors get a polite email pointer and a one-time Discord alert fires. Caps worst-case daily API spend even against IP rotation.
- **Anti-bot follow-up (same day): retro cleanup + analytics + dormant Turnstile.**
  - **Retro junk sweep:** one-time boot migration (`retro_junk_sweep_2026_07`) tags historical gibberish conversations `bot_junk` (only NULL-intent, no contact info, no booking, >=50% junk user messages). Verified on a scratch DB: pure-junk tagged, real/mixed/email-bearing conversations untouched, idempotent. Reversible: `intent_source='retro_junk_sweep'`. Fires a Discord alert with the tagged count on deploy.
  - **Analytics de-noised:** admin `/analytics` and `/stats` (and `/api/health` counts) exclude `bot_junk` everywhere that measures humans; junk stays visible in the conversations list and the intent-mix table, and `stats.conversations.bot_junk` reports the excluded count.
  - **Turnstile (Layer 2) shipped DORMANT.** Server verifies a token once per NEW conversation via `services/turnstileService.js` (fails open only if Cloudflare itself is unreachable); widget auto-discovers the site key via new `GET /api/chat/config`, lazily loads the Turnstile script, and attaches the token to the first message with a one-shot retry on `verification_required`. Completely inert until `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` are set in Railway (create a Managed widget in the Cloudflare dash with thesnowmedia.com + the Railway domain as hostnames; no client redeploy needed). Verified end-to-end locally with Cloudflare's always-pass/always-fail test keys, including the real browser token mint through the embed widget.
  - **Bug fix found during verification:** canned-reply paths (junk strikes, shadow-ban, budget breaker, and the pre-existing keyword-filter deflection) now return `messageId`, so the widget's takeover-poll cursor advances and canned replies no longer render twice.

**2026-07-01 session shipped (newest first):**
- `190c2d9` Re-synced the stale root widget copies (`chat-agent-ai.js`, `embed-ai.js`) to be byte-identical to `server/public`. They had drifted a full feature behind (missing the email gate, stale localhost endpoints) but are still loaded by dev test pages (`product-landing-v3.html`, `embed-test.html`), so re-synced rather than deleted.
- `9fac928` Doc fix: corrected the deploy-branch references in `CLAUDE.md` from `main` to `master` (the actual default/deploy branch; there is no `main`).
- `3a437d2` **Live human takeover.** An operator steps into a live conversation from their phone and replies as "Milos" while the AI goes silent. Strictly additive: if nobody takes over, visitor behavior is byte-for-byte unchanged. Pieces:
  - `takeover_mode` on conversations (`ai | requested | human`; only `human` silences the AI) + `sender_type` on messages (`operator | system`). Migration `add_takeover_mode`.
  - Poll transport: widget polls `GET /api/chat/:id/poll?since=<cursor>` every 5s while open; the chat POST returns the assistant message id as the cursor. Operator messages render seamlessly as Milos (no "a human joined" banner; the AI/human distinction lives only in the console).
  - Admin endpoints: `GET /api/admin/live-queue`, `POST .../takeover`, `.../release`, `.../operator-message`. Shared `server/sessionStore.js` Map so takeover/release invalidate the in-memory session and the AI rebuilds full context (including operator turns) from the DB on resume.
  - Mobile operator console at `/live.html` (admin-key auth, live queue, transcript, take over/release, reply + canned snippets, `?c=` deep link, PWA installable). Served from `server/public` like `admin.html`.
  - Silence fallback: a 30s sweep hands control back to the AI with a graceful bridge message if an operator takes over then goes quiet for 90s (`config.takeover.operatorSilenceMs`), so no visitor is stranded.
  - Discord handoff pings deep-link to `/live.html?c=<sessionId>` when `PUBLIC_URL` is set. Notifications stay on Discord (already on the phone); no native web push built.
  - Verified: DB layer + sweep query via a throwaway-DB script; full HTTP round-trip (takeover silences the AI, operator message delivered via poll, release restores AI mode, admin auth enforced).

**2026-06-30 session shipped (newest first):**
- `9717093` RAG similarity metric fix. The code reported `1 - L2distance` as similarity, which is not cosine. vec_patterns uses L2 distance and Voyage embeddings are unit-normalized, so a strong topical match (true cosine ~0.6) reported ~0.18, far below the thresholds. The facts lane was effectively dead, so the agent could never cite a retrieved case study (hard rule #4 only allows citing from retrieved context). Now true cosine (`1 - d^2/2`) with thresholds recalibrated on the real scale (facts 0.45, patterns 0.5). Sales battery 6.8 to 7.2, earned bookings 10 to 14 of 17. Biggest single craft lift measured.
- `4ae236d` Three fixes: vec_patterns insert bug (PK must bind as a BigInt for sqlite-vec; auto-tag and seed indexing were silently failing), runtime change 4 (a Calendly-confirmed booking now makes the agent stop selling), and real resource delivery (9 live Resource Hub URLs wired into the prompt and KB facts).
- `4bc7da3` Discovery SPIN-implication pass plus a price-ultimatum close that holds the line and books instead of collapsing.
- `e06acd8` Email-gate on the booking button: capture an email before opening Calendly so a click-then-abandon still leaves a follow-up-able lead. Both widgets, and `/api/leads` now actually persists (was a logging stub).
- `e470447` Lean system prompt rewrite (494 to ~140 lines, every guardrail preserved) plus a post-close state machine and funnel instrumentation.

**Earlier (2026-04 / -06):** model-retirement prevention (`/api/health/model` + boot preflight), follow-up email system built (3-email SendGrid nurture + 30-min scheduler), seed-stat audit against the live site, two committed eval harnesses in `server/eval/`.

**2026-04-23 commit sequence:**
- `54dd608` Plan synthesis (this file's origin)
- `00a46d3` Batch 1: P0 fixes and P1 quick wins
- `33105c2` Batch 2: P2-5, P2-3, P3-3
- `202836f` Batch 3: P2-1, P2-2
- `ca27251` Batch 4: P2-4, P3-1, P3-2

## Product decisions locked in (owner confirmed 2026-04-23)

1. **Pricing.** All pricing is gated to the call. No dollar figures in chat, ever. The old "retainers start around $2,500" line has been removed.
2. **Fit-check is soft, never a gate.** A visitor who dodges a qualification question must still be able to book. Enforced via the `<workflow>` branch design and the prompt explicitly telling Milos "Dodging a question is not a reason to refuse the call."
3. **Pattern quarantine is fully automated.** No admin review queue. Voice gate rejects bad-voice conversations outright; voice-clean patterns land in `quarantined`, promote to `active` only when the source conversation's booking is confirmed via Calendly webhook. Stale quarantined patterns archive after 7 days.
4. **Follow-up email system (BUILT, live).** 3-email nurture personalized by Claude, queued for conversations that captured an email but did not convert, 30-minute scheduler, skipped on booking confirmation. See `server/services/followUpService.js`. Needs `SENDGRID_API_KEY` in Railway to actually send (gracefully disabled without it). The email-gate (e06acd8) feeds this: a captured email makes the lead a follow-up candidate even if Calendly is abandoned.
5. **Red-team cadence.** Undecided. Recommendation: automated script after everything else ships.
6. **Reply length (owner, 2026-10-01).** Very short, two sentences max, every turn. Held by the two sentence slots in the reply format plus the prompt; misses are logged as `reply_too_long` in `guardrail_events`. This replaces the old 3-sentence / 60-word cap and its 4 / 75 exception for the close.
7. **No invented calendar slots (changed 2026-10-01, owner to confirm).** The time-anchored close from `b26577a` named slots the agent could not see. Removed on `dev`. To bring the tactic back honestly, feed real openings into the context from the Calendly API (`CALENDLY_PAT` is already in the local `.env` and unused). Reverting to the old wording is a one-line change to hard rule 7 and the close in `systemPrompt.js`.

---

## DONE

### P0 (correctness fixes)
- **P0-1** Pricing contradiction removed from objections block (`systemPrompt.js`)
- **P0-2** Dead RAG injection marker killed (`promptBuilder.js`). Replaced with `buildRagAddendum()` that returns just the addendum for assembly into the dynamic system block
- **P0-3** Banned phrase "Happy to" removed from two security responses

### P1 (high impact, low effort)
- **P1-1** Prompt caching enabled. `system` is a two-block array with `cache_control: ephemeral` on the static base. Expected 60-70 percent input token reduction on multi-turn sessions.
- **P1-2** `suggest_resource.resource_name` is a schema enum. Hallucinated names rejected at the API boundary.
- **P1-3** `offer_quick_replies.options` has `minItems: 2`.
- **P1-4** `capture_lead_field` server-side dedupe with prefer-better-value logic and `field_conflict` logging.
- **P1-5** Consecutive quick-reply suppression via `session.lastHadQuickReplies`.
- **P1-6** Banned phrase list expanded: antithesis formulas, formal transitions, filler openers, buzzwords, rule-of-three stacks. Exclamation rule tightened to zero default.
- **P1-7** Closing `<reminders>` block for recency anchoring on critical rules.
- **P1-8** Security block hardened: structured-payload injection defense, professional-advice refusal, political neutrality. Fifth critical rule added banning commitments/guarantees (Chevy Tahoe class of jailbreak). Case-study generalization guard added.
- **Bonus:** Every em dash stripped from the prompt itself (the prompt banned them but still contained them).

### P2 (structural)
- **P2-1** Soft qualification signal score. New `qualificationService.detectSignals()` returns `[QUALIFICATION: N/6 signals. Known: ...]` injected into the dynamic system block. Six categories: ad spend, revenue, KPI vocabulary, niche, evaluation urgency, decision authority. Score is a tiebreaker, never a gate.
- **P2-2** Signal-gated workflow rewrite. Every `(typical messages N-M)` anchor removed. Warm-visitor branch promoted to first-class Branch A. Standard path is Branch B with "Advance when:" signal conditions. New fit-check, disqualify, and repair branches. 12-turn soft cap with resource exit.
- **P2-3** Pattern quarantine with fully automated gates. Status column (`quarantined | active | archived`). Voice gate in `autoTagger` rejects em dashes and banned phrases outright. Auto-tagged patterns land as quarantined; promote to active when source conversation's `booking_confirmed=1`. 30-minute maintenance tick promotes and archives.
- **P2-4** Two-lane RAG. Patterns (style) and facts (grounding) retrieve separately with different thresholds (0.6 and 0.5). Facts render as `<approved_facts>` bulleted block before style mimicry.
- **P2-5** `show_booking_calendar.trigger_reason` enum (`explicit_request | qualification_complete | warm_visitor_shortcut`). Required field forces the model to justify booking. Persisted to `conversations.booking_trigger_reason`.

### P3 (instrumentation)
- **P3-1** `tool_events` table. Every tool call logged with `tool_name`, `trigger_reason`, `user_message_index`, `input_json`. Enables booking attribution analytics.
- **P3-2** `guardrail_events` table. Expanded from 4 patterns to 9 (em dashes, antithesis, transitions, guarantees, timeframes, specific pricing, banned phrase family). Log-only; replacement is off by default until the event stream is reviewed.
- **P3-3** Calendly webhook at `POST /api/webhooks/calendly` with HMAC-SHA256 signature verification. On `invitee.created`: match by email, set `booking_confirmed=1`, skip pending follow-ups, promote quarantined pattern. Idempotent via `booking_event_id`.

---

## Owner action items (outside code)

1. **Configure the Calendly webhook** in the Calendly dashboard:
   - URL: `https://snow-media-chat-agent-production.up.railway.app/api/webhooks/calendly`
   - Event: `invitee.created`
   - Copy the signing key from Calendly, set `CALENDLY_WEBHOOK_SECRET` in Railway env vars
   - Without the secret set, the endpoint falls back to no-verification mode (dev only). Leaving this unset in production means any HTTP client can forge bookings.

2. **Set the `sendgrid` key / other env** when the follow-up email system starts building. Not blocking yet.

3. **`PUBLIC_URL` set in Railway (DONE 2026-07-01).** Required so Discord handoff alerts include the `/live.html?c=...` deep link. Set to `https://snow-media-chat-agent-production.up.railway.app` (no trailing slash). Live takeover works without it; you just lose the tap-through link. Console installed to the owner's phone home screen as a PWA.

Added 2026-10-01:

4. **Check three Railway env vars.** `CALENDLY_WEBHOOK_SECRET` (if unset, production rejects every Calendly webhook, so no booking is ever confirmed), `SENDGRID_API_KEY` (follow-ups only send when it is set; read the follow-up items under "Recommended next steps" before turning it on), and any `CHAT_MODEL` / `SUMMARIZER_MODEL` / `FOLLOWUP_MODEL` / `CLASSIFIER_MODEL` overrides, which would beat the new Sonnet 5.5 defaults.
5. **Confirm what the agent promises.** It says "month-to-month, no lock-in", "senior strategists run every account", and "you see the audit before paying" in almost every trust objection. The last two are on the site. "Month-to-month" is not on any page checked, so confirm it is the actual contract.
6. **Give the agent the facts it keeps getting asked for.** Who owns the ad accounts, what reporting a client gets and how often, what the audit deliverable is. Tough buyers leave over these and the agent can only say "ask on the call". One short paragraph each, then they go into `knowledgeBase.js`.
7. **Line up the call.** The agent sells a "25-minute 3-in-1 audit, not a discovery call" and the Calendly event is named "30 Minute Discovery". Rename the event or change the prompt.
8. **Fix the Snow Media MCP.** Every `chatbot_*` tool returns 404: `Infra/snow-media-mcp-server/src/chatbot-tools.ts` requests `/admin/...` but the server mounts `/api/admin/...` (and health at `/api/health`). Until it is fixed there is no way to pull production numbers from a session, which is why this audit has no production funnel data.
9. **Decide on the pricing floor again.** Decision 1 stands, but the price ultimatum is the one buyer the agent loses in almost every run. A stated floor would also filter people who cannot afford the retainer.

---

## Recommended next steps

### From the 2026-10-01 audit (open, in priority order)

Found by a full review (code, widget, data layer, security, prompt, evals). None of these are fixed yet. File and line references were checked against the code on `dev`.

**A. Captured contacts do not reach anyone automatically.** There is no push to a CRM, a database, or a webhook, and no alert fires when an email is captured or a call is booked (Discord only fires on a handoff phrase or a high-value regex). The only routes out are the dashboard and a manual CSV export, and the CSV drops the whole "to" day (`routes/admin.js:471`). Build: on first contact capture, POST the lead to n8n or Supabase and send a Discord alert with the deep link. This is goal 2, and it is also what makes "the team will follow up" true.

**B. Follow-up emails are not safe to rely on yet** (`services/followUpService.js`, `db.js:1264`). Enrolment is per conversation and the widget replays the stored email into every new session, so someone who booked or unsubscribed gets a fresh "you didn't book" sequence the next time they open a tab. Unsubscribe is a `mailto:` with no suppression list, the footer has no postal address, and any address a client puts in `leadData.email` gets three emails (a spoofed Origin is enough). Fix before enabling: suppression table keyed on the lowercased email, one-click unsubscribe, enrol only emails the visitor typed or entered at the gate, a unique index on (conversation, step).

**C. Bookings that do not match by email vanish** (`server.js` Calendly webhook, `db.js:521`). A visitor who skips the gate or books with a different address is never counted, gets no alert, and keeps getting nag emails. This is N-3 below: pass the session id as `utm_content` and match on it first. Also store and alert on unmatched bookings.

**D. Widget session and transcript are out of sync** (`embed-ai.js`). The session id is per tab, the transcript is permanent in localStorage. A new tab or a next-day visit shows the old conversation while the agent has no memory of it, and closing and reopening the panel on the first visit duplicates the transcript. Keep session id, poll cursor, and history together under one idle timeout.

**E. Outcome labels undercount.** `contact_captured` is only ever set by the admin button, and the idle sweep marks a conversation `abandoned` even when it holds an email (`db.js:475`). The "Contact Captured" tile reads near zero, and the KPI grid still counts bots (`routes/admin.js:839`). Set `contact_captured` when contact is first stored and apply the same bot filter everywhere.

**F. Abuse and exposure.** The origin gate is a header check, so a script that sends the right Origin can burn the 400-call daily budget and take chat down for every real visitor until midnight UTC: turn on Turnstile, which is already built and dormant. The admin key sits in localStorage on the same origin as the public demo page, with no CSP and no rate limit on `/api/admin`. `npm audit` reports 7 issues in production dependencies (express, qs, path-to-regexp), all fixed by `npm audit fix`. The Anthropic SDK is 0.52 against a current 0.131.

**G. One lead's email can end up in another visitor's prompt.** A learned pattern is the last six raw messages of a booked conversation (`services/autoTagger.js`), which usually includes the email the visitor typed, injected verbatim as an example. Scrub emails and phones when a pattern is saved.

**H. The widget does not say it is an AI.** Header reads "Milos, Online now" with a photo, the greeting is "Hey, I am Milos", and the follow-up email says "Milos here, we were just chatting". The agent only discloses when asked. Add a visible "AI assistant" label. Worth doing for trust alone, and bot-disclosure rules apply to some visitors.

**I. The model never sees the greeting.** The opener and its three chips are static in the widget and never sent to the server, so "Yes, I run a lead gen business" arrives as a first message with no question in front of it. Send the greeting as the first assistant turn.

**J. End the A/B test.** Variant B is fixed but still splits traffic 50/50, and at current human volume it will not reach a result. It only adds variance to the evals.

**K. Operations.** No backup of the SQLite file on the Railway volume. No external uptime monitor on `/api/health/model` (N-9). No CI: the evals exit non-zero on failure, so a GitHub Action running `npm run eval` on push is ten minutes of work.

The N-items below predate the audit. N-1 is blocked until owner action item 8 (MCP) is done.

Priority order, reassessed 2026-06-30 after the performance pass. Each item is self-contained.

### N-1: Read the funnel signals (2-week data pull, no code)
**Why:** The email-gate and funnel instrumentation are now live. Before building anything else, pull ~2 weeks of `signal_events` and compare `email_captured_at_booking` against `booking_offered_no_email` to size the lead leak the gate actually recovered, plus `chat_continued_after_booking` for how often the post-close state fires. This sizes the value of everything below.
**Where:** `signal_events` table (raw SQL for now, or build N-5 first). **Scope:** 30 min of analysis.

### N-2: Watch the patterns lane (light monitoring, then decide)
**Why:** vec_patterns insert (4ae236d) and RAG retrieval (9717093) were both broken, so the auto-tagged conversation patterns lane has effectively never worked. It will now start filling and retrieving for the first time. The quarantine/promote gates are automated, but the voice quality of what lands as `active` should be eyeballed after a handful accumulate, since these become the agent's style few-shot.
**Where:** `admin.html` patterns view + `successful_patterns` where `tagged_by != 'seed'`. **Scope:** monitoring, then a decision.

### N-3: Widget-side Calendly attribution (was R-1)
**Why:** The webhook still matches bookings by email only. The email-gate makes that match far more reliable (we now usually have the email), but it is not deterministic. Appending `?utm_content=<sessionId>` to the Calendly URL passes the session ID through the webhook payload for exact matching.
**Where:** `openCalendly()` in both `server/public/chat-agent-ai.js` and `server/public/embed-ai.js`; webhook handler to prefer `payload.tracking.utm_content`, fall back to email. **Scope:** ~30 min.

### N-4: `late_disqualifier` signal
**Why:** `<after_the_offer>` tells the agent to gracefully walk back a booking when a disqualifier surfaces after the offer, but nothing measures how often that happens. Needs a cheap per-turn DQ check to emit the signal.
**Where:** chat handler, alongside the existing post-offer signal logging. **Scope:** 1-2 hours.

### N-5: Admin dashboard surfacing (was R-4)
**Why:** Several data sources are now raw-SQL only: `signal_events`, `tool_events`, `guardrail_events`, booking trigger reasons, pattern status counts. Surfacing them makes N-1 a dashboard glance instead of a query.
**Where:** `server/routes/admin.js` + `server/public/admin.html`. **Scope:** 1-2 hours.

### N-6: RAG eval set (was R-3, now higher value)
**Why:** Thresholds were just calibrated (9717093) against ad-hoc queries. A persisted, hand-labeled set locks retrieval quality against future tweaks. The 2026-06-30 calibration method (seed KB, embed real queries, print true-cosine top hits) is reusable as the harness core.
**Where:** New `server/eval/rag-eval.mjs` + a small labeled set. **Scope:** ~1 hour of code, plus owner labeling.

### N-7: Automated red-team script (was R-2)
**Why:** The eval harnesses cover one injection scenario; the full 19-prompt adversarial set is not yet a regression gate.
**Where:** New `server/eval/redteam.mjs`. Prompt list in `C:\tmp\chat-agent-research\05-guardrails.md`. **Scope:** 2-3 hours.

### N-8: Automated guardrail replacement (was R-5)
**Why:** `guardrail_events` is still log-only. After a review window, flip replacement on for confirmed-safe patterns. **Scope:** 1 hour, gated on reviewing the event rows.

### N-9: Ops follow-through (from model-health work)
**Why:** `/api/health/model` exists but two ops items are open: confirm the Railway deploy webhook and point an external uptime monitor at the endpoint so a mid-run model retirement pages someone.

### Deprioritized
- **P3-4 A/B test the fit-check.** Moot since fit-check is soft.
- **Admin review queue for quarantined patterns.** Decided against per owner.
- **Native web push for the live-takeover console.** Skipped by design (owner confirmed 2026-07-01). Discord already delivers phone notifications and the deep link opens the console. Revisit only to drop Discord from the loop. An SSE/WebSocket upgrade of the widget poll and multi-operator assignment are likewise out of scope until volume warrants.

---

## What we ignored from the original synthesis (still valid)

- MEDDIC/MEDDPICC framework (too heavy for agency-sized deals)
- 1-hour cache TTL (default 5-min is correct for chat turn cadence)
- `search_knowledge_base` as an explicit tool (pre-injected RAG is already the right architecture)
- Prefill for role tag (deprecated in Sonnet 4.5+)
- Negative pattern injection (advanced technique; revisit after 6 months of stable operation)

---

## Known limitations in the current build

1. **Booking attribution still falls back to email matching.** Mitigated by the email-gate (we now usually have the email captured); made deterministic by N-3.
2. **Auto-patterns require the Calendly webhook to promote.** Until the webhook is configured in Calendly (owner action item 1), confirmed bookings will not promote quarantined patterns, so the `active` patterns lane stays empty. The 7-day archive cleans up unpromoted ones.
3. ~~vec0 JOIN warning + vec insert failure~~ **FIXED (4ae236d, 779c250).** The knn runs in a CTE with an explicit `k = ?`, and the PK binds as a BigInt. Both lanes index and retrieve.
4. ~~Length creep on the hardest objection turns.~~ **Superseded 2026-10-01** by the two-sentence reply format (decision 6). What remains: about 2% to 4% of replies in the sales eval still run to three sentences (usually a "Got it, Sam." in front of two more) and the longest reach about 50 words. Both are logged as `reply_too_long`. A hard guarantee would take one corrective retry on those turns; not built, because the residue is small.
5. ~~The old `getStageGuidance` function still exists in `promptBuilder.js`.~~ **Gone** (removed in `cc39e97`).
6. **The booking button is not hard-gated for blocked intents.** The old code withheld the booking tool from job seekers, vendors, and the like, but a typed `[BOOK_CALL]` always got through, so the gate was the prompt in practice. The structured reply has no tool to withhold, so the prompt is now the only gate. Zero disqualify leaks across every eval run. A hard gate is deliberately not added: a real lead misclassified on their first message would never be able to book.
7. **The simulated buyers are a stress test, not a forecast.** They are tougher and wordier than real visitors and their booking decisions carry noise of one to three in seventeen. Use the evals to catch regressions and compare builds, and production numbers (once the MCP is fixed) for the real rate.

---

## How to resume

Everything through `76b429f` is live on master. The 2026-10-01 work is committed and pushed on `dev` only. This file plus the commit messages are the full record. Safe to clear the session.

Before deploying the 2026-10-01 work:
1. Owner reviews `server/prompts/systemPrompt.js` (rewritten this session) and decides on product decision 7 (no invented slots).
2. Check owner action item 4: any model env vars in Railway override the new defaults.
3. After deploy, the server re-seeds the knowledge base on boot (22 rows re-embedded, 8 added). Confirm the log line `Knowledge base re-seeded` / `seeded 8 new items`, then `GET /api/health/model` shows `claude-sonnet-5-5` for all four roles.
4. WordPress loads `embed-ai.js` from Railway with `max-age=0`, so the widget fixes go live with the deploy. Send one test message from the live site and click Book a Call, Skip, then Book a Call again.
5. Deploy is `git push origin dev:master` (Railway auto-deploys from master). Only with owner go-ahead.

Next session should:
1. Start with audit items A to C above: they are the ones that lose leads after the chat has already done its job.
2. Fix the MCP (owner action item 8), then pull the funnel read (N-1). Production volume decides how much more prompt work is worth.
3. After any prompt, knowledge base, or chat-call change, run all three eval layers from `server/` (`npm run eval`, `node eval/run-eval.mjs`, `node eval/sales-eval.mjs`). Zero disqualify leaks and zero real pricing leaks before deploying. Run the sales eval twice before believing a difference.
