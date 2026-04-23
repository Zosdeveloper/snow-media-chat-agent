# Chat Agent Improvement Plan
_Synthesized 2026-04-23. Progress log kept in sync with commits on master._

## Current status

4 of 5 planned batches shipped. Core improvements are live on master. Railway auto-deploys from master so all changes below are in production.

**Commit sequence:**
- `54dd608` Plan synthesis (this file's origin)
- `00a46d3` Batch 1: P0 fixes and P1 quick wins
- `33105c2` Batch 2: P2-5, P2-3, P3-3
- `202836f` Batch 3: P2-1, P2-2
- `ca27251` Batch 4: P2-4, P3-1, P3-2

## Product decisions locked in (owner confirmed 2026-04-23)

1. **Pricing.** All pricing is gated to the call. No dollar figures in chat, ever. The old "retainers start around $2,500" line has been removed.
2. **Fit-check is soft, never a gate.** A visitor who dodges a qualification question must still be able to book. Enforced via the `<workflow>` branch design and the prompt explicitly telling Milos "Dodging a question is not a reason to refuse the call."
3. **Pattern quarantine is fully automated.** No admin review queue. Voice gate rejects bad-voice conversations outright; voice-clean patterns land in `quarantined`, promote to `active` only when the source conversation's booking is confirmed via Calendly webhook. Stale quarantined patterns archive after 7 days.
4. **Follow-up email system (not yet built).** Planned to trigger on session abandonment AND booking confirmation; each goes into a different flow. The `abandoned_at` and `booking_confirmed` fields on conversations are in place to support both.
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

## REMAINING

Priority order for next sessions. Each item is self-contained; pick them off in any order.

### R-1: Widget-side Calendly tracking (unblock accurate booking attribution)
**Why:** The webhook currently matches by email only. If a visitor books with an email they never typed in chat, attribution silently fails (logs warning, no data). Appending `?utm_content=<sessionId>` to the Calendly URL when the widget opens it passes the session ID through the webhook payload, making matching deterministic.

**Where:**
- `server/public/chat-agent-ai.js` (production widget, relative paths)
- `server/public/embed-ai.js` (embeddable version)
- Server-side: update the webhook handler to prefer `payload.tracking.utm_content` over email matching, fall back to email.

**Scope:** ~30 minutes. One widget change, one webhook handler update, test with a real booking.

### R-2: Automated red-team script
**Why:** 19 adversarial prompts were identified by the guardrails research (role-swap, policy-puppetry, encoding attacks, authority spoofing, case-study fabrication pressure, free-consulting pressure, pricing pressure, etc.). Run them against the live endpoint before each prompt change to catch regressions.

**Where:**
- New `server/scripts/redteam.js` that posts 19 labeled test prompts to `/api/chat`, checks responses against expected-behavior heuristics (refusal, redirect, no banned phrases, no pricing, no em dashes), outputs pass/fail.
- Optional: wire to CI as a deploy gate.

**Scope:** 2-3 hours of work. The prompt list is in `C:\tmp\chat-agent-research\05-guardrails.md`.

### R-3: RAG eval set (20 hand-labeled conversations)
**Why:** Every threshold tweak in `config.rag` is currently blind. A fixed eval set lets us run A/B on retrieval quality when we adjust thresholds, chunk size, or add MMR diversity.

**Where:** New `server/scripts/rag-eval.js` + `server/data/rag-eval-set.json` with 20 labeled {conversation, expected_pattern_ids}.

**Scope:** Mostly a labeling task on the owner's side. 2 hours to pick and label conversations from `admin.html`, then a runnable script I can build in under an hour.

### R-4: Admin dashboard surfacing (optional polish)
**Why:** Three new data sources now exist that the admin dashboard doesn't surface: booking trigger reasons, tool events, guardrail events. Currently readable only via raw SQL.

**Where:** `server/routes/admin.js` + `server/public/admin.html`. Add endpoints for `/api/admin/tool-events`, `/api/admin/guardrail-events`, `/api/admin/pattern-status-counts`. Add simple tables to the HTML.

**Scope:** 1-2 hours.

### R-5: Automated guardrail replacement (after review window)
**Why:** P3-2 is log-only right now. After a week of event review, decide which patterns are safe to auto-replace with a fallback message vs which are false positives to remove. Flip replacement on for the confirmed-safe ones.

**Where:** `server/server.js` around the guardrail scan. Add a `replace` flag per pattern, rewrite the assistant message when triggered.

**Scope:** 1 hour of code, gated on owner review of `guardrail_events` rows.

### R-6: Deprioritized
- **P3-4 A/B test the fit-check.** Moot since fit-check is soft. Skip unless we later change that call.
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

1. **Booking attribution falls back to email matching.** Fixed by R-1.
2. **Auto-patterns require the Calendly webhook to promote.** Until R-1 lands and the webhook is actually configured in Calendly, patterns may stay quarantined indefinitely. This is by design. The 7-day archive will clean them up.
3. **vec0 JOIN query hits a known sqlite-vec warning** ("A LIMIT or 'k = ?' constraint is required"). The fallback path via `listPatterns` still returns results. Non-blocking.
4. **The old `getStageGuidance` function still exists in `promptBuilder.js`** but is no longer called. Safe to delete in a future cleanup pass.

---

## How to resume

Next session should open with:
1. Has Milos configured the Calendly webhook yet? (Check `booking_confirmed` column in production DB.)
2. Pick one of R-1 through R-5 based on priority.
3. Start by reading this file plus recent commits since `ca27251`.
