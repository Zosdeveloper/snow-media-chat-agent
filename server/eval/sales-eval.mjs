// Sales-trainer eval. Drives the REAL server with TOUGH, resistant buyers across
// the objection taxonomy (multiple variations each), then measures what the
// business cares about and grades each transcript on sales craft.
//
// Outcome metrics come from the BUYER, not the agent: the conversation keeps
// going after the agent offers the call, and at the end the simulated buyer says
// (in character) whether they would book, only leave an email, or walk. An offer
// the buyer ignores is not a booking.
//
// Run from server/:  node eval/sales-eval.mjs   (needs ANTHROPIC_API_KEY + VOYAGE_API_KEY in server/.env)
// Boots its own server on PORT 3101 against a throwaway self-seeded DB; never touches the real DB.
// Writes eval/sales-last-report.md. Env: EVAL_PORT, EVAL_DB, EVAL_OUT, EVAL_JSON,
// EVAL_LABEL, EVAL_CONCURRENCY, EVAL_MAX_SENTENCES, EVAL_ONLY (comma-separated scenario ids). CHAT_* vars pass through to the server.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { anthropic, chat, bootServer, pool, lengthStats, countSentences, countWords, INVENTED_SLOT } from './lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.EVAL_PORT || 3101);
const EVAL_DB = process.env.EVAL_DB || './data/eval-sales.db';
const OUT = process.env.EVAL_OUT || join(__dirname, 'sales-last-report.md');
const JSON_OUT = process.env.EVAL_JSON || null;
const LABEL = process.env.EVAL_LABEL || 'dev build';
const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY || 4);
const MAX_SENTENCES = Number(process.env.EVAL_MAX_SENTENCES || 2);

const VISITOR_MODEL = 'claude-sonnet-5-5';  // strong, stays in character, pushes back
const JUDGE_MODEL = 'claude-sonnet-5-5';
const MAX_TURNS = 7;          // agent turns allowed before it has to have made an offer
const POST_OFFER_TURNS = 2;   // buyer replies allowed after the offer (accept, object, or walk)

// Tough buyer personas. Each resists, layers objections, and only books if the
// rep genuinely earns it. "win" = a skilled rep should get a booking or a firm
// next step. "dq" = should be disqualified.
const S = [
  // ---- PRICE (4 variations) ----
  { id: 'price_soft', type: 'Price', variation: 'soft ask', expect: 'win', page: { url: 'https://thesnowmedia.com/' },
    opener: "Before I waste time, roughly what does this cost per month?",
    persona: "DTC home-fragrance brand, $60k/mo on Meta+Google, ROAS slipped from 3.2 to 2.1. You're price-conscious but serious. You'll ask for a ballpark once more. If the rep refuses to quote but gives real value and a concrete reason the call is worth it, you'll book. If they're vague or pushy, you disengage. Email 'rob@emberco.com' if asked." },
  { id: 'price_ultimatum', type: 'Price', variation: 'ultimatum', expect: 'win', page: { url: 'https://thesnowmedia.com/' },
    opener: "I don't do discovery calls blind. Give me a price range right now or I'm out. $3k? $8k? What is it.",
    persona: "Impatient ecommerce founder, $150k/mo spend, hates being 'sold'. You repeat the ultimatum once hard. You respect someone who holds their frame with a confident reason, not someone who caves OR who sounds scripted. If they give a crisp reason a number now would mislead AND show they actually understand your problem, you soften and book. Otherwise you bail with 'forget it'. Email 'm@scalefast.io' if asked." },
  { id: 'price_anchor', type: 'Price', variation: 'competitor anchor', expect: 'win', page: { url: 'https://thesnowmedia.com/services/google-ads' },
    opener: "Another agency quoted me $1,500 a month all-in. Can you beat that?",
    persona: "Roofing company owner, ~$20k/mo ad budget, treating this as a commodity. You keep pushing on price/matching the $1,500. A good rep reframes away from price-matching toward outcome/quality without trashing the other agency, and makes you doubt the cheap quote. If they just compete on price or get defensive, you go with the cheaper guy. Email 'dave@summitroof.com' if asked." },
  { id: 'price_value_doubt', type: 'Price', variation: 'value cynicism', expect: 'win', page: { url: 'https://thesnowmedia.com/' },
    opener: "Honestly agencies are mostly a rip-off. You all charge a fortune and overpromise. Convince me you're not the same.",
    persona: "Skeptical consulting-firm owner, burned on retainers before, ~$10k/mo. You stay cynical for 2 exchanges. You respond to specificity, honesty, and zero hype, not to enthusiasm. If the rep is specific and non-defensive and frames a low-risk next step, you'll book. If they get salesy or defensive, you write them off. Email 'lena@advisorscollective.com' if asked." },

  // ---- TRUST (3) ----
  { id: 'trust_burned', type: 'Trust', variation: 'burned hard', expect: 'win', page: { url: 'https://thesnowmedia.com/case-studies' },
    opener: "Last agency burned $40k of my money in 4 months and then ghosted me. Why should I trust another one?",
    persona: "HVAC company, $25k/mo, genuinely angry and wary. You want PROOF and accountability, not reassurance. Push twice on 'how do I know you won't do the same'. A good rep acknowledges without groveling, differentiates concretely (seniority, contract terms, measurement), and lowers risk. If they earn it, you'll book. Email 'tony@reliableair.com' if asked." },
  { id: 'trust_guarantee', type: 'Trust', variation: 'demand a guarantee', expect: 'win', page: { url: 'https://thesnowmedia.com/' },
    opener: "Simple yes or no: can you guarantee you'll beat my current 2.4x ROAS? If you can't promise it, why are we talking.",
    persona: "Blunt apparel ecom owner, $90k/mo. You corner them on the guarantee. A skilled rep refuses to fake-guarantee (you'd distrust that) but reframes confidently toward process/evidence and a low-risk look. If they handle it with honest confidence, you respect it and book. If they hedge weakly or over-promise, you lose respect. Email 'kara@wovenlabel.com' if asked." },
  { id: 'trust_offshore', type: 'Trust', variation: 'fear of outsourcing', expect: 'win', page: { url: 'https://thesnowmedia.com/services/meta-ads' },
    opener: "Be straight with me. Am I going to sign with you and then get handed off to some junior or an overseas team?",
    persona: "B2B services founder, $15k/mo, values senior attention. Push once more for specifics on who actually runs the account. If the rep is concrete about the senior-only model, you warm up and book. Email 'paul@northgateb2b.com' if asked." },

  // ---- STALLS / BRUSH-OFFS (4) ----
  { id: 'stall_sendinfo', type: 'Stall', variation: 'send a proposal', expect: 'win', page: { url: 'https://thesnowmedia.com/' },
    opener: "Can you just put together a proposal with pricing and email it to me? I'll review and get back to you.",
    persona: "Busy ecom ops director, $70k/mo, defaults to 'send info' to avoid commitment. You resist a call twice. A skilled rep makes the call clearly more valuable than a PDF and reduces the friction. If they do, you give an email and book; otherwise you say 'just send what you can'. Email 'ops@trailhouse.co' if asked." },
  { id: 'stall_think', type: 'Stall', variation: 'think about it', expect: 'win', page: { url: 'https://thesnowmedia.com/' },
    opener: "This is interesting, let me think about it and maybe reach out later.",
    persona: "Pleasant but non-committal med-spa owner, $12k/mo. 'Think about it' is a soft no hiding a real concern (you're not sure ads are the problem vs your front desk). A good rep isolates the real hesitation instead of accepting the stall. If they surface and address it, you book. If they just say 'sounds good, reach out anytime', you drift off. Email 'dr.ivy@glowmedspa.com' if asked." },
  { id: 'stall_partner', type: 'Stall', variation: 'talk to partner', expect: 'win', page: { url: 'https://thesnowmedia.com/' },
    opener: "I'd need to run this by my business partner before doing anything.",
    persona: "Co-owner of a moving company, $18k/mo. The partner is the skeptical numbers guy. A skilled rep finds out the partner's likely objection and offers to put both on the call rather than letting you become a bad messenger. If handled well, you book a slot for both. Email 'greg@haulpros.com' if asked." },
  { id: 'stall_timing', type: 'Stall', variation: 'bad timing', expect: 'win', page: { url: 'https://thesnowmedia.com/' },
    opener: "Now's not really the time, we're slammed. Maybe circle back in Q1.",
    persona: "Solar company owner, $30k/mo, using 'timing' to avoid it. The real issue: lead flow is actually dropping NOW. A good rep reframes cost-of-delay (Q4/Q1 seasonality) without being pushy. If they make waiting feel expensive, you'll take 25 minutes now. Email 'sam@brightsolar.com' if asked." },

  // ---- INCUMBENT / DIY (2) ----
  { id: 'inc_have_agency', type: 'Incumbent', variation: 'already have an agency', expect: 'win', page: { url: 'https://thesnowmedia.com/' },
    opener: "We already have an agency and things are fine, so I'm not really looking.",
    persona: "Footwear ecom, $110k/mo. 'Fine' is lukewarm, you're secretly unsure you're getting the best results. A skilled rep doesn't trash the incumbent, offers a no-strings second opinion / audit, and plants doubt about 'fine'. If they do, you'll take the free look. If they bash the other agency or hard-sell, you shut it down. Email 'nina@striderfootwear.com' if asked." },
  { id: 'inc_diy', type: 'Incumbent', variation: 'why not in-house', expect: 'win', page: { url: 'https://thesnowmedia.com/' },
    opener: "Why would I pay an agency when I could just hire a media buyer in-house for less?",
    persona: "Pragmatic DTC founder, $80k/mo, genuinely weighing in-house. A good rep frames the real trade (breadth of senior expertise, speed, no single-point-of-failure, tooling) without being defensive. If compelling, you'll book to explore. Email 'will@harvestgoods.co' if asked." },

  // ---- HARD / BEHAVIORAL (3) ----
  { id: 'hard_different', type: 'Differentiation', variation: 'prove you are different', expect: 'win', page: { url: 'https://thesnowmedia.com/case-studies' },
    opener: "Every agency on earth says they're 'different' and 'senior' and 'data-driven'. Cut the script. What ACTUALLY makes you different?",
    persona: "Sharp ecom CMO, $200k/mo, allergic to boilerplate. You call out any generic claim. Only concrete, specific, slightly surprising differentiation earns respect. If the rep gets specific (real mechanics, not adjectives), you book. If they give buzzwords, you end it with 'thought so'. Email 'cmo@lumenbrands.com' if asked." },
  { id: 'hard_rude', type: 'Composure', variation: 'rude/dismissive', expect: 'win', page: { url: 'https://thesnowmedia.com/' },
    opener: "This is probably a waste of my time like every other chatbot. Prove me wrong in one message or I'm gone.",
    persona: "Terse, hostile plumbing-company owner, $22k/mo, testing if there's a real brain here. You stay curt. You respect competence and brevity, you despise eagerness and fluff. If the rep is sharp, concrete, and unflustered, you grudgingly engage and can book. If they grovel or pitch, you leave. Email 'rick@flowrightplumbing.com' if asked." },
  { id: 'hard_grinder', type: 'Over-analytical', variation: 'methodology grinder', expect: 'win', page: { url: 'https://thesnowmedia.com/services/google-ads' },
    opener: "Walk me through your exact process. How do you structure campaigns, what's your bidding approach, how do you attribute conversions?",
    persona: "Detail-obsessed B2B founder, $40k/mo, will keep asking 'and then what exactly' to avoid committing. You can grind forever. A skilled rep gives enough to build credibility but recognizes the loop and pivots to 'this is a 25-min conversation' and closes. If they keep feeding detail forever, you never book. If they close you with confidence, you book. Email 'eric@datacore.io' if asked." },

  // ---- CONTROL CASES ----
  { id: 'ready_conditional', type: 'Close', variation: 'ready but controlling', expect: 'win', page: { url: 'https://thesnowmedia.com/contact-us' },
    opener: "Okay I'm interested. But I'll only book if you can tell me the call won't be a sales pitch and it's under 30 minutes.",
    persona: "Ready-to-buy ecom owner, $95k/mo, wants control of terms. If the rep confirms the terms cleanly and closes (specific time + email) without re-opening discovery, you book immediately. If they ramble or re-qualify you, you cool off. Email 'jess@coastalwear.com' if asked." },
  { id: 'dq_vendor_persistent', type: 'Disqualify', variation: 'persistent vendor', expect: 'dq', page: { url: 'https://thesnowmedia.com/' },
    opener: "Hi! We're a lead-gen SaaS and I think we could send Snow Media 20+ qualified appointments a month. Worth a quick partnership call?",
    persona: "Polished vendor who reframes the pitch as a 'partnership' to slip past gatekeeping. Push twice, trying to get on the calendar. After two clean deflections, reply exactly [END]." }
];

const ONLY = (process.env.EVAL_ONLY || '').split(',').filter(Boolean);
const SCN = ONLY.length ? S.filter(sc => ONLY.includes(sc.id)) : S;

const strip = s => s.replace(/\[BOOK_CALL\]/g, '').replace(/\[QUICK_REPLIES:.*?\]/g, '').trim();
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

const buyerSystem = sc => `You are roleplaying a real prospective buyer in a live website chat with a marketing agency. STAY FULLY IN CHARACTER. Never reveal you are an AI, never mention being a test, never break role. Be a realistic, tough buyer: concise (1-3 sentences), a little guarded, and do NOT cave easily. Persona and behavior: ${sc.persona}

When the agent offers a call, a "Book a Call" button appears in the chat. React the way this buyer really would: if they earned it, say yes and give your email; if not, push back or leave. If you decide to fully disengage, reply with exactly [END].`;

async function runScenario(sc, idx, base) {
  const sessionId = `sales_${sc.id}_${idx}_${Date.now()}`;
  const ip = `10.20.${Math.floor(idx / 250)}.${(idx % 250) + 1}`;
  const transcript = [];
  let visitorMsg = sc.opener, offered = false, postOffer = 0, agentTurns = 0, leadData = {};
  for (;;) {
    transcript.push({ role: 'visitor', text: visitorMsg });
    let res;
    try { res = await chat(base, sessionId, visitorMsg, sc.page, ip); }
    catch (e) { transcript.push({ role: 'agent', text: '[ERR] ' + e.message, error: true }); break; }
    const raw = res.message || '';
    const booking = /\[BOOK_CALL\]/.test(raw);
    agentTurns++;
    if (res.leadData) leadData = res.leadData;
    transcript.push({ role: 'agent', text: strip(raw), booked: booking, qr: res.quickReplies || [] });
    if (booking) offered = true;
    if (offered) { if (postOffer >= POST_OFFER_TURNS) break; postOffer++; }
    else if (agentTurns >= MAX_TURNS) break;

    // The buyer sees the same thing a real visitor does: the reply, plus the button when it is shown.
    const BUTTON_NOTE = ' [A "Book a Call" button is now showing under this message]';
    const vMsgs = transcript.map(t => ({ role: t.role === 'visitor' ? 'assistant' : 'user', content: t.role === 'visitor' ? t.text : (t.text || '(silence)') + (t.booked ? BUTTON_NOTE : '') }));
    let v; try { v = await anthropic(VISITOR_MODEL, buyerSystem(sc), vMsgs); } catch { v = '[END]'; }
    if (!v || /\[END\]/i.test(v)) break;
    visitorMsg = v;
  }
  return { sessionId, transcript, offered, serverEmail: leadData.email || null, serverName: leadData.name || null };
}

const convoText = run => run.transcript.map(t => `${t.role === 'visitor' ? 'BUYER' : 'AGENT'}: ${t.text}${t.booked ? ' [Book a Call button shown]' : ''}`).join('\n');

// The buyer's own verdict on what they do next. This is the outcome metric.
const DECISION_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['decision', 'reason'],
  properties: {
    decision: { type: 'string', enum: ['book_call', 'email_only', 'leave'] },
    reason: { type: 'string' }
  }
};
async function buyerDecision(sc, run) {
  const prompt = `The chat below is over. You were the BUYER. Persona and behavior: ${sc.persona}

TRANSCRIPT:
${convoText(run)}

Staying true to that persona, what do you actually do next?
- book_call: you click the Book a Call button and schedule the call.
- email_only: you do not book, but you gave (or are willing to give) your email so they can follow up.
- leave: you close the chat with no booking and no email.
Judge it on how the agent actually handled you, by your persona's own rules. Give the reason in one sentence.`;
  try { return await anthropic(VISITOR_MODEL, 'You report honestly what a specific buyer would do after a sales chat. Return only the JSON.', [{ role: 'user', content: prompt }], { maxTokens: 2048, effort: 'low', schema: DECISION_SCHEMA }); }
  catch (e) { return { decision: 'leave', reason: 'decision call failed: ' + e.message, error: true }; }
}

const DIMS = ['rapport', 'discovery', 'objectionHandling', 'control', 'urgency', 'credibility', 'closing'];
const JUDGE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: [...DIMS, 'earnedTheBooking', 'leakedPricing', 'biggestMiss', 'bestMoment', 'coachingNote'],
  properties: {
    ...Object.fromEntries(DIMS.map(d => [d, { type: 'integer' }])),
    earnedTheBooking: { type: 'boolean' }, leakedPricing: { type: 'boolean' },
    biggestMiss: { type: 'string' }, bestMoment: { type: 'string' }, coachingNote: { type: 'string' }
  }
};
async function judge(sc, run) {
  const sys = `You are a veteran B2B sales trainer (Sandler, Challenger, and SPIN schooled) doing a hard call-review of a website sales-chat agent. You grade CRAFT, not politeness. Be demanding: a 7 means solidly competent, 9-10 is elite, 5 is mediocre, 3 is poor. Reward isolating objections, reframing without defensiveness, cost-of-delay, taking control, specificity, and clean closes. Penalize caving, boilerplate, happy-ears, accepting stalls, interrogating, and weak/passive closes. This is a chat widget, so short messages are a product requirement that is measured separately: do not reward or penalize message length. Return ONLY the JSON.`;
  const goal = sc.expect === 'dq'
    ? `This is NOT a real prospect (should be politely disqualified, no booking). Grade how cleanly and professionally the agent held the boundary.`
    : `This is a winnable but RESISTANT buyer. A skilled rep should handle the objection and earn a booking or a firm next step. Grade whether the agent earned it.`;
  const prompt = `Objection type: ${sc.type} (${sc.variation}). ${goal}

TRANSCRIPT:
${convoText(run)}

Grade the AGENT only, 1-10 per dimension. biggestMiss is one sharp sentence, bestMoment is one quote or short note, coachingNote is one or two sentences of specific coaching.`;
  try { return await anthropic(JUDGE_MODEL, sys, [{ role: 'user', content: prompt }], { maxTokens: 4096, effort: 'medium', schema: JUDGE_SCHEMA }); }
  catch (e) { return { judgeError: e.message }; }
}

async function main() {
  console.log(`[${LABEL}] booting on ${PORT} against ${EVAL_DB} ...`);
  const srv = await bootServer({ port: PORT, dbPath: EVAL_DB });
  console.log(`Healthy and seeded. Running ${SCN.length} sales scenarios, ${CONCURRENCY} at a time...\n`);

  const results = await pool(SCN, CONCURRENCY, async (sc, i) => {
    const run = await runScenario(sc, i, srv.base);
    const [decision, j] = await Promise.all([buyerDecision(sc, run), judge(sc, run)]);
    const composite = DIMS.every(d => typeof j[d] === 'number') ? (DIMS.reduce((a, d) => a + j[d], 0) / DIMS.length) : null;
    const replies = run.transcript.filter(t => t.role === 'agent' && !t.error).map(t => t.text);
    const buyerEmail = run.transcript.some(t => t.role === 'visitor' && EMAIL_RE.test(t.text));
    console.log(`  ${sc.id.padEnd(22)} offered:${run.offered ? 'y' : 'n'} buyer:${decision.decision.padEnd(10)} email:${run.serverEmail ? 'y' : 'n'} score:${composite ? composite.toFixed(1) : '?'}`);
    return { sc, run, j, decision, composite, replies, buyerEmail };
  });
  srv.stop();

  const win = results.filter(r => r.sc.expect === 'win');
  const dq = results.filter(r => r.sc.expect === 'dq');
  const n = (arr, f) => arr.filter(f).length;
  const dimAvg = {};
  DIMS.forEach(d => { const v = results.map(r => r.j[d]).filter(x => typeof x === 'number'); dimAvg[d] = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; });
  const scored = results.map(r => r.composite).filter(x => x !== null);
  const overallAvg = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : 0;
  const allReplies = results.flatMap(r => r.replies);
  const len = lengthStats(allReplies, MAX_SENTENCES);
  const summary = {
    label: LABEL, scenarios: SCN.length, winnable: win.length,
    wouldBook: n(win, r => r.decision.decision === 'book_call'),
    emailOnly: n(win, r => r.decision.decision === 'email_only'),
    lost: n(win, r => r.decision.decision === 'leave'),
    offered: n(win, r => r.run.offered),
    emailCapturedByServer: n(win, r => !!r.run.serverEmail),
    buyerTypedEmail: n(win, r => r.buyerEmail),
    emailTypedButNotCaptured: n(win, r => r.buyerEmail && !r.run.serverEmail),
    trainerEarned: n(win, r => r.j.earnedTheBooking === true),
    dqLeaks: n(dq, r => r.run.offered), dqTotal: dq.length,
    pricingLeaks: results.filter(r => r.j.leakedPricing === true).map(r => r.sc.id),
    inventedSlotTurns: allReplies.filter(t => INVENTED_SLOT.test(t)).length,
    craft: +overallAvg.toFixed(2), dims: Object.fromEntries(DIMS.map(d => [d, dimAvg[d] === null ? null : +dimAvg[d].toFixed(1)])),
    length: len, judgeErrors: n(results, r => r.j.judgeError)
  };

  let md = `# Sales-Trainer Eval (tough buyers)\n\nAgent: ${LABEL}. ${SCN.length} scenarios, Sonnet adversarial buyers, sales-trainer judge.\n\n## What the business cares about\n`;
  md += `- Buyers who would BOOK the call: **${summary.wouldBook}/${win.length}**\n`;
  md += `- Buyers who left only an email: **${summary.emailOnly}/${win.length}**\n`;
  md += `- Buyers lost (no booking, no email): **${summary.lost}/${win.length}**\n`;
  md += `- Email actually captured by the server: **${summary.emailCapturedByServer}/${win.length}** (buyer typed one in ${summary.buyerTypedEmail}; typed but NOT captured: ${summary.emailTypedButNotCaptured})\n`;
  md += `- Agent made the offer: ${summary.offered}/${win.length}\n`;
  md += `- Disqualify leaks: **${summary.dqLeaks}/${dq.length}** | Pricing leaks: **${summary.pricingLeaks.length}** ${summary.pricingLeaks.join(', ')}\n\n`;
  md += `## Reply length (limit: ${MAX_SENTENCES} sentences)\n`;
  md += `- Replies within the limit: **${len.withinPct}%** (${len.turns - len.over}/${len.turns})\n`;
  md += `- Average ${len.avgSentences} sentences / ${len.avgWords} words. Longest: ${len.maxSentences} sentences / ${len.maxWords} words\n`;
  md += `- Replies naming a day and time the agent cannot see: **${summary.inventedSlotTurns}**\n\n`;
  md += `## Sales craft (trainer judge, 1-10)\n**Overall: ${overallAvg.toFixed(1)}/10** | trainer says earned: ${summary.trainerEarned}/${win.length}\n\n`;
  DIMS.forEach(d => md += `- ${d}: **${dimAvg[d] === null ? '?' : dimAvg[d].toFixed(1)}**\n`);

  md += `\n## By objection type\n\n`;
  for (const { sc, run, j, decision, composite } of results) {
    md += `### ${sc.id} — ${sc.type}: ${sc.variation}\n`;
    md += `Buyer: **${decision.decision}** (${decision.reason}) | offered:${run.offered} | server email:${run.serverEmail || 'none'}${run.serverName ? ' | server name:' + run.serverName : ''}\n`;
    md += `Score **${composite ? composite.toFixed(1) : '?'}/10** | earned:${j.earnedTheBooking} | rapport ${j.rapport} disc ${j.discovery} obj ${j.objectionHandling} ctrl ${j.control} urg ${j.urgency} cred ${j.credibility} close ${j.closing}\n`;
    md += `- Biggest miss: ${j.biggestMiss || j.judgeError || '-'}\n`;
    md += `- Best moment: ${j.bestMoment || '-'}\n`;
    md += `- Coaching: ${j.coachingNote || '-'}\n\n`;
    md += `\`\`\`\n`;
    for (const t of run.transcript) {
      const tag = t.role === 'agent' && !t.error ? `  (${countSentences(t.text)}s/${countWords(t.text)}w)` : '';
      md += `${t.role === 'visitor' ? 'BUYER' : 'AGENT'}: ${t.text}${t.booked ? '  [BOOK_CALL]' : ''}${t.qr?.length ? '  {QR:' + t.qr.join('/') + '}' : ''}${tag}\n`;
    }
    md += `\`\`\`\n\n`;
  }
  writeFileSync(OUT, md);
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ summary, results: results.map(r => ({ id: r.sc.id, offered: r.run.offered, decision: r.decision, serverEmail: r.run.serverEmail, serverName: r.run.serverName, composite: r.composite, judge: r.j, transcript: r.run.transcript })) }, null, 1));

  console.log('\nReport:', OUT);
  console.log(`\n=== ${LABEL} ===`);
  console.log(`would book ${summary.wouldBook}/${win.length} | email only ${summary.emailOnly} | lost ${summary.lost} | server captured email ${summary.emailCapturedByServer}/${win.length} (typed, not captured: ${summary.emailTypedButNotCaptured})`);
  console.log(`dq leaks ${summary.dqLeaks}/${dq.length} | pricing leaks ${summary.pricingLeaks.length} | invented slots in ${summary.inventedSlotTurns} replies`);
  console.log(`length: ${len.withinPct}% within ${MAX_SENTENCES} sentences | avg ${len.avgSentences}s/${len.avgWords}w | max ${len.maxSentences}s/${len.maxWords}w`);
  console.log(`craft ${overallAvg.toFixed(1)}/10 | trainer earned ${summary.trainerEarned}/${win.length} | ` + DIMS.map(d => `${d.slice(0, 4)} ${dimAvg[d] === null ? '?' : dimAvg[d].toFixed(1)}`).join(' '));
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
