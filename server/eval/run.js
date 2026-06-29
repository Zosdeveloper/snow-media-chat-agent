/**
 * Golden-transcript eval harness for the deterministic guard logic.
 *
 * Zero dependencies. Loads cases.json and asserts that the pure functions in
 * services/guardrails.js produce the expected verdicts. Run with `npm run eval`
 * (from server/). Exits non-zero on any failure so it can gate CI.
 *
 * This intentionally does NOT call the Claude API: it catches voice/format/
 * extraction/injection regressions deterministically and for free. Behavioral
 * regressions ("does the model still book on warm intent") are out of scope.
 */

const path = require('path');
const fs = require('fs');
const guardrails = require('../services/guardrails');

const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8'));

let passed = 0;
const failures = [];

function eq(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

function runCase(c) {
    switch (c.check) {
        case 'voiceGate': {
            const result = guardrails.voiceGate(c.messages);
            if (result.pass !== c.expect.pass) {
                return `expected pass=${c.expect.pass}, got pass=${result.pass} (reason: ${result.reason})`;
            }
            return null;
        }
        case 'checkOutput': {
            const trips = guardrails.checkOutput(c.input);
            const tripped = trips.length > 0;
            if (tripped !== c.expect.tripped) {
                return `expected tripped=${c.expect.tripped}, got ${tripped} (${trips.map(t => t.name).join(', ') || 'none'})`;
            }
            if (c.expect.pattern && !trips.some(t => t.name === c.expect.pattern)) {
                return `expected pattern "${c.expect.pattern}", got [${trips.map(t => t.name).join(', ')}]`;
            }
            return null;
        }
        case 'extractLeadData': {
            const result = guardrails.extractLeadData(c.input, {});
            if (!eq(result, c.expect.extracted)) {
                return `expected ${JSON.stringify(c.expect.extracted)}, got ${JSON.stringify(result)}`;
            }
            return null;
        }
        case 'detectPromptInjection': {
            const result = guardrails.detectPromptInjection(c.input);
            const detected = result !== c.input;
            if (detected !== c.expect.detected) {
                return `expected detected=${c.expect.detected}, got ${detected}`;
            }
            return null;
        }
        default:
            return `unknown check type: ${c.check}`;
    }
}

for (const c of cases) {
    let err;
    try {
        err = runCase(c);
    } catch (e) {
        err = `threw: ${e.message}`;
    }
    if (err) {
        failures.push({ name: c.name, err });
        console.log(`  FAIL  ${c.name}\n        ${err}`);
    } else {
        passed++;
        console.log(`  ok    ${c.name}`);
    }
}

console.log(`\n${passed}/${cases.length} passed`);

if (failures.length > 0) {
    console.error(`\n${failures.length} failure(s).`);
    process.exit(1);
}
