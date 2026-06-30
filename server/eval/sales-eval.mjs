// Sales-trainer eval. Drives the REAL server with TOUGH, resistant buyers across
// the objection taxonomy (multiple variations each), then grades each transcript
// on sales craft via a judge prompted as a veteran sales trainer.
// Run from server/:  node eval/sales-eval.mjs   (needs ANTHROPIC_API_KEY + VOYAGE_API_KEY in server/.env)
// Boots its own server on PORT 3101 against a throwaway self-seeded DB; never touches the real DB.
// Writes eval/sales-last-report.md.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(__dirname, '..');
const PORT = Number(process.env.EVAL_PORT || 3101);
const BASE = `http://127.0.0.1:${PORT}`;
const EVAL_DB = './data/eval-sales.db';
const OUT = join(__dirname, 'sales-last-report.md');

const env = readFileSync(SERVER_DIR + '/.env', 'utf8');
const API_KEY = (env.match(/^ANTHROPIC_API_KEY=(.+)$/m) || [])[1]?.trim();
if (!API_KEY) { console.error('No ANTHROPIC_API_KEY'); process.exit(1); }

const RUNTAG = String(Date.now());
const VISITOR_MODEL = 'claude-sonnet-4-6';   // strong, stays in character, pushes back
const JUDGE_MODEL = 'claude-sonnet-4-6';
const MAX_TURNS = 7;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function anthropic(model, system, messages, max_tokens = 350) {
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens, system, messages })
      });
      if (r.status === 429 || r.status >= 500) { await sleep(2000 * (a + 1)); continue; }
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    } catch (e) { if (a === 3) throw e; await sleep(1500 * (a + 1)); }
  }
}

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

async function chat(sessionId, message, page) {
  const r = await fetch(BASE + '/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, message, pageContext: page })
  });
  return r.json();
}
const strip = s => s.replace(/\[BOOK_CALL\]/g, '').replace(/\[QUICK_REPLIES:.*?\]/g, '').trim();

async function runScenario(sc, idx) {
  const sessionId = `sales_${sc.id}_${idx}_${RUNTAG}`;
  const transcript = [];
  let visitorMsg = sc.opener, booked = false;
  for (let round = 0; round < MAX_TURNS; round++) {
    transcript.push({ role: 'visitor', text: visitorMsg });
    let res; try { res = await chat(sessionId, visitorMsg, sc.page); }
    catch (e) { transcript.push({ role: 'agent', text: '[ERR] ' + e.message }); break; }
    const raw = res.message || '';
    const booking = /\[BOOK_CALL\]/.test(raw);
    if (booking) booked = true;
    transcript.push({ role: 'agent', text: strip(raw), booked: booking, qr: res.quickReplies || [] });
    if (booking) break;
    const vMsgs = transcript.map(t => ({ role: t.role === 'visitor' ? 'assistant' : 'user', content: t.role === 'visitor' ? t.text : (t.text || '(silence)') }));
    const vSys = `You are roleplaying a real prospective buyer in a live website chat with a marketing agency. STAY FULLY IN CHARACTER. Never reveal you are an AI, never mention being a test, never break role. Be a realistic, tough buyer: concise (1-3 sentences), a little guarded, and do NOT cave easily. Persona and behavior: ${sc.persona}\n\nIf you decide to fully disengage, reply with exactly [END].`;
    let v; try { v = await anthropic(VISITOR_MODEL, vSys, vMsgs, 160); } catch { v = '[END]'; }
    if (!v || /\[END\]/i.test(v)) break;
    visitorMsg = v;
  }
  return { sessionId, transcript, booked };
}

const DIMS = ['rapport', 'discovery', 'objectionHandling', 'control', 'urgency', 'credibility', 'closing'];
async function judge(sc, run) {
  const convo = run.transcript.map(t => `${t.role === 'visitor' ? 'BUYER' : 'AGENT'}: ${t.text}`).join('\n');
  const sys = `You are a veteran B2B sales trainer (Sandler, Challenger, and SPIN schooled) doing a hard call-review of a website sales-chat agent. You grade CRAFT, not politeness. Be demanding: a 7 means solidly competent, 9-10 is elite, 5 is mediocre, 3 is poor. Reward isolating objections, reframing without defensiveness, cost-of-delay, taking control, specificity, and clean closes. Penalize caving, boilerplate, happy-ears, accepting stalls, interrogating, and weak/passive closes. Return ONLY compact JSON.`;
  const goal = sc.expect === 'dq'
    ? `This is NOT a real prospect (should be politely disqualified, no booking). Grade how cleanly and professionally the agent held the boundary.`
    : `This is a winnable but RESISTANT buyer. A skilled rep should handle the objection and earn a booking or a firm next step. Grade whether the agent earned it.`;
  const prompt = `Objection type: ${sc.type} (${sc.variation}). ${goal}

TRANSCRIPT:
${convo}

Grade the AGENT only, 1-10 per dimension. Return JSON exactly:
{"rapport":n,"discovery":n,"objectionHandling":n,"control":n,"urgency":n,"credibility":n,"closing":n,"earnedTheBooking":true|false,"leakedPricing":true|false,"biggestMiss":"one sharp sentence","bestMoment":"one quote or short note","coachingNote":"one or two sentences of specific coaching"}`;
  try {
    const out = await anthropic(JUDGE_MODEL, sys, [{ role: 'user', content: prompt }], 500);
    const m = out.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : { parseError: out.slice(0, 160) };
  } catch (e) { return { judgeError: e.message }; }
}

async function waitHealth(t = 40000) { const s = Date.now(); while (Date.now() - s < t) { try { const r = await fetch(BASE + '/api/health'); if (r.ok) return true; } catch {} await sleep(800); } return false; }

async function main() {
  for (const ext of ['', '-wal', '-shm']) { try { rmSync(SERVER_DIR + '/' + EVAL_DB.replace('./', '') + ext); } catch {} }
  console.log('Booting on', PORT, '...');
  const srv = spawn('node', ['server.js'], { cwd: SERVER_DIR, env: { ...process.env, PORT: String(PORT), DATABASE_PATH: EVAL_DB, NODE_ENV: 'development' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  if (!await waitHealth()) { console.error('unhealthy\n', log.slice(-1500)); srv.kill(); process.exit(1); }
  console.log('Healthy. Running', S.length, 'sales scenarios (tough buyers)...\n');

  const results = [];
  for (let i = 0; i < S.length; i++) {
    process.stdout.write(`  [${i + 1}/${S.length}] ${S[i].id} (${S[i].type}) ... `);
    const run = await runScenario(S[i], i);
    const j = await judge(S[i], run);
    const composite = DIMS.every(d => typeof j[d] === 'number') ? (DIMS.reduce((a, d) => a + j[d], 0) / DIMS.length) : null;
    results.push({ sc: S[i], run, j, composite });
    console.log(`booked:${run.booked} earned:${j.earnedTheBooking} score:${composite ? composite.toFixed(1) : '?'}/10`);
  }
  srv.kill('SIGINT');

  const winScn = results.filter(r => r.sc.expect === 'win');
  const dq = results.filter(r => r.sc.expect === 'dq');
  const dimAvg = {}; DIMS.forEach(d => { const v = results.map(r => r.j[d]).filter(x => typeof x === 'number'); dimAvg[d] = v.length ? (v.reduce((a, b) => a + b, 0) / v.length) : null; });
  const overall = results.map(r => r.composite).filter(Boolean);
  const overallAvg = overall.reduce((a, b) => a + b, 0) / overall.length;
  const bookedWin = winScn.filter(r => r.run.booked).length;
  const earnedWin = winScn.filter(r => r.j.earnedTheBooking).length;
  const dqLeak = dq.filter(r => r.run.booked).length;
  const pricingLeaks = results.filter(r => r.j.leakedPricing === true);

  let md = `# Sales-Trainer Eval (tough buyers)\n\nAgent: dev build. ${S.length} scenarios, Sonnet adversarial buyers, sales-trainer judge.\n\n## Composite scorecard (1-10)\n`;
  md += `**Overall craft score: ${overallAvg.toFixed(1)}/10**\n\n`;
  DIMS.forEach(d => md += `- ${d}: **${dimAvg[d].toFixed(1)}**\n`);
  md += `\n- Winnable buyers that BOOKED: **${bookedWin}/${winScn.length}**\n`;
  md += `- Winnable buyers the trainer says were EARNED: **${earnedWin}/${winScn.length}**\n`;
  md += `- Disqualify leaks: **${dqLeak}/${dq.length}**\n`;
  md += `- Pricing leaks: **${pricingLeaks.length}** ${pricingLeaks.map(r => r.sc.id).join(', ')}\n\n`;

  md += `## By objection type\n\n`;
  for (const { sc, run, j, composite } of results) {
    md += `### ${sc.id} — ${sc.type}: ${sc.variation}\n`;
    md += `Score **${composite ? composite.toFixed(1) : '?'}/10** | booked:${run.booked} earned:${j.earnedTheBooking} | rapport ${j.rapport} disc ${j.discovery} obj ${j.objectionHandling} ctrl ${j.control} urg ${j.urgency} cred ${j.credibility} close ${j.closing}\n`;
    md += `- Biggest miss: ${j.biggestMiss || j.parseError || j.judgeError || '-'}\n`;
    md += `- Best moment: ${j.bestMoment || '-'}\n`;
    md += `- Coaching: ${j.coachingNote || '-'}\n\n`;
    md += `\`\`\`\n`;
    for (const t of run.transcript) md += `${t.role === 'visitor' ? 'BUYER' : 'AGENT'}: ${t.text}${t.booked ? '  [BOOK_CALL]' : ''}${t.qr?.length ? '  {QR:' + t.qr.join('/') + '}' : ''}\n`;
    md += `\`\`\`\n\n`;
  }
  writeFileSync(OUT, md);
  console.log('\nReport:', OUT);
  console.log(`\n=== OVERALL ${overallAvg.toFixed(1)}/10 ===`);
  DIMS.forEach(d => console.log(`  ${d}: ${dimAvg[d].toFixed(1)}`));
  console.log(`booked ${bookedWin}/${winScn.length} | earned ${earnedWin}/${winScn.length} | dq leaks ${dqLeak}/${dq.length} | pricing leaks ${pricingLeaks.length}`);
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
