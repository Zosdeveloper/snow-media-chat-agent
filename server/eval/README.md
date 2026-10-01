# Chat agent eval harness

Three layers, cheapest first.

| Command (from `server/`) | What it checks | Cost |
|---|---|---|
| `npm run eval` | Pure guardrail logic: voice gate, output tripwires, lead extraction, junk detector, sentence counter. No API calls. Exits non-zero on failure. | Free |
| `node eval/run-eval.mjs` | Rule contract and outcomes on 10 scenarios against the real server. Exits non-zero on an outcome failure. | Under $1 |
| `node eval/sales-eval.mjs` | 18 tough buyers, outcomes reported by the buyer, plus a sales-trainer judge. | About $1 to $2 |

Both behavioral harnesses boot the real server and run LLM-simulated visitors
through `POST /api/chat`, so RAG, facts, guardrails, lead extraction, and the A/B
variant all fire exactly as in production. They need `ANTHROPIC_API_KEY` (and
`VOYAGE_API_KEY` for RAG) in `server/.env`, use a throwaway database that is
seeded fresh on boot, and never touch the real one. Discord alerts and SendGrid
are switched off for the spawned server, so an eval run never pages or emails
anyone.

## What "booked" means

The conversation does not stop when the agent offers the call. The visitor gets
up to two more turns to accept, object, or walk, and the agent has to handle
that. An offer the buyer ignores is not a booking.

- **Offered**: the agent fired `[BOOK_CALL]`.
- **Email captured by the server**: the `leadData.email` the server returns at
  the end. This exercises the real capture path, so "visitor typed an email but
  the server did not capture it" is reported as a failure.
- **Would book / email only / leave** (sales harness): asked of the simulated
  buyer, in character, after the chat ends. This is the headline number.

## Regression harness (`run-eval.mjs`)

Ten scenarios cover both directions of failure: should-close (hot ecom, HVAC
discovery, price-push, burned skeptic, send-info dodge, slow warm) and
should-NOT-close (vendor pitch, job seeker, out-of-geo, prompt injection).

Each transcript is scored two ways:

1. **Deterministic**, against the system prompt's own contract: two sentences
   per reply (45 words as a softer check on run-ons), em-dash and banned-phrase
   leaks, one question per turn, the 3-question and 4-turn budget before the
   offer, whether the offer asks for an email, whether the agent names a day and
   time it cannot see, and outcome correctness (did a should-close get the offer,
   did the server capture the email the visitor gave, did a disqualify scenario
   wrongly book).
2. **LLM judge** for soundsHuman, followedRules, close quality, and pricing
   leaks. Check a flagged pricing leak by hand: the judge sometimes flags the
   visitor's own numbers.

Writes `eval/last-report.md` with every transcript.

## Sales-craft battery (`sales-eval.mjs`)

Eighteen resistant buyers across the objection taxonomy (price in 4 flavors,
trust, stalls, incumbent/DIY, "what makes you different," rude,
over-analytical), each with a persona rule for what would make them book.
Reports the buyer outcomes above, reply length, and 7 craft dimensions from a
judge prompted as a veteran sales trainer. Writes `eval/sales-last-report.md`.

## Options

Environment variables, all optional:

- `EVAL_PORT`, `EVAL_DB`, `EVAL_OUT`, `EVAL_JSON`, `EVAL_LABEL`: run several
  configurations side by side without them colliding, and keep each report.
- `EVAL_CONCURRENCY` (default 4): scenarios in flight at once.
- `EVAL_ONLY=id1,id2`: run a subset.
- `EVAL_MAX_SENTENCES` (default 2), `EVAL_MAX_WORDS` (default 45, regression only).
- `CHAT_MODEL`, `CHAT_EFFORT`, `CHAT_THINKING` pass through to the server, so
  the same scenarios can compare models and settings.

## Interpreting results

Outcome counts move between runs: the simulated visitor is non-deterministic and
the agent's prompt variant is random per session. On the 17 winnable sales
scenarios, expect a swing of two or three bookings between identical runs. Run
a configuration twice before trusting a difference, compare before/after around
a change, and read the transcripts. A disqualify leak or a real pricing leak is
a hard stop regardless of the averages.

## Editing scenarios

Scenarios live at the top of each harness. Each has a deterministic `opener`
(the exact trigger) and a `persona` that drives reactive follow-ups. Add one by
copying the shape and setting `expectClose` / `expectDisqualify` (regression) or
`expect: 'win' | 'dq'` (sales). Shared plumbing is in `eval/lib.mjs`.
