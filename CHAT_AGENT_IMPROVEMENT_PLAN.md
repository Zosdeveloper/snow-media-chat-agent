# Chat Agent Improvement Plan
_Synthesized 2026-04-23. Progress log kept in sync with commits on master._

## Current status

_Last updated 2026-06-30. The 2026-04-23 batches (below) plus a follow-on performance and correctness pass are all live on master. Railway auto-deploys from master, so everything here is in production._

**Production tip: `9717093` (master == dev, in sync).**

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

---

## Recommended next steps

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
4. **Length creep on the hardest objection turns.** Now that grounding is live, the agent packs retrieved specifics into tough re-deflect-and-close turns and sometimes overflows the 3-sentence / 60-word cap (caught as guardrail flags, never as leaks). Acceptable tradeoff for the credibility lift; revisit if real conversations feel long.
5. **The old `getStageGuidance` function still exists in `promptBuilder.js`** but is no longer called. Safe to delete in a future cleanup pass.

---

## How to resume

Everything through `9717093` is committed and live on master. `dev` and `master` are in sync, working tree clean. This file plus the commit messages since `ca27251` are the full record, and the per-project Claude memory (`project_chat_agent_perf.md`) carries the working detail. Safe to clear the session.

Next session should:
1. Pull the 2-week funnel-signal read (N-1) before building anything, it sizes the rest.
2. Pick one of N-2 through N-9. They are self-contained.
3. After any prompt or RAG change, run BOTH eval harnesses from `server/`: `node eval/run-eval.mjs` (contract) and `node eval/sales-eval.mjs` (craft). Confirm zero pricing and DQ leaks before deploying. Trust direction and magnitude, not exact integers (real run-to-run variance).
4. Deploy is `git push origin dev:master` (Railway auto-deploys from master). Only with owner go-ahead.
5. Check owner action items below are done: Calendly webhook secret, SendGrid key.
