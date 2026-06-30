# Chat agent eval harness

Regression test for the sales agent's *conversational* quality. It boots the
real server and runs LLM-simulated visitors through `POST /api/chat`, so RAG,
facts, guardrails, lead extraction, and the A/B variant all fire exactly as in
production. Each transcript is scored two ways:

1. **Deterministic** against the system prompt's own contract: em-dash / banned-phrase
   leaks, sentence and word caps (3/60, with 4/75 on turn 1 and the close turn),
   one-question-per-turn, the 3-question budget, the 4-turn cap, whether the close
   asks for an email, and outcome correctness (did a should-close book, did a
   disqualify scenario wrongly book).
2. **LLM judge** (Sonnet) for soundsHuman, followedRules, close quality, and
   pricing leaks.

Ten scenarios cover both directions of failure: should-close (hot ecom, HVAC
discovery, price-push, burned skeptic, send-info dodge, slow warm) and
should-NOT-close (vendor pitch, job seeker, out-of-geo, prompt injection).

## Run

```bash
cd server
node eval/run-eval.mjs
```

Needs `ANTHROPIC_API_KEY` (and `VOYAGE_API_KEY` for RAG) in `server/.env`. It
boots on port 3100 against a throwaway `data/eval-run.db` that the server seeds
fresh on boot, so it never touches your real DB. Costs a few cents in API calls.
Output: console summary plus `eval/last-report.md` with every transcript.

## Interpreting results

The aggregate counts have run-to-run variance (the simulated visitor is
non-deterministic and the agent's prompt variant is random per session). Use it
for **before/after** comparison around a prompt change and read the transcripts,
not as an absolute score. A single regression in the should-close booked count or
any disqualify leak is the signal that matters most.

## Sales-craft battery (`sales-eval.mjs`)

A second, harder harness focused on *sales craft*, not the rule contract. Run with
`node eval/sales-eval.mjs`. It drives 18 tough, resistant buyer scenarios across the
full objection taxonomy (price in 4 flavors, trust, stalls, incumbent/DIY, "what makes
you different," rude, over-analytical) with a stronger adversarial buyer model, and
grades each transcript on 7 craft dimensions (rapport, discovery, objection handling,
control, urgency, credibility, closing) via a judge prompted as a veteran sales trainer.
Use it to measure sales-craft lift after a prompt change. Writes `eval/sales-last-report.md`.
Higher cost than the regression harness (Sonnet buyers, more turns).

## Editing scenarios

Scenarios live at the top of `run-eval.mjs`. Each has a deterministic `opener`
(the exact trigger) and a `persona` that drives reactive follow-ups. Add one by
copying the shape and setting `expectClose` or `expectDisqualify`.
