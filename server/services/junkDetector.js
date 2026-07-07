/**
 * Junk / Gibberish Message Detector
 * Cheap synchronous heuristics that catch fuzzer-bot traffic ("Rqmghhnjjnnn
 * xckmvxxd", ".", "aaaaaaaa") BEFORE the Claude call. Every rule here is
 * tuned for precision over recall: a false positive gives a real visitor a
 * canned "didn't catch that" reply and costs us a lead, so borderline
 * messages are let through and the strike system absorbs the cost.
 *
 * Works with the strike flow in server.js: each junk message gets a canned
 * response (no Claude call); after config.spamGuard.junkStrikeLimit strikes
 * the conversation is tagged intent 'bot_junk' and shadow-banned (all
 * subsequent messages get a static reply, AI never runs again).
 */

const VOWELS = /[aeiouy]/i;

/**
 * Tokens that look like domains, URLs, emails, codes, or numbers are skipped
 * by the word-level checks. A real lead pasting "mysite.io" or "GA4" must
 * never be flagged.
 */
function isSkippableToken(token) {
    return /[\/@:.\d]/.test(token);
}

/**
 * Analyze a single user message.
 * Returns { junk: true, reason } on a high-confidence junk match, else { junk: false }.
 */
function checkMessage(message) {
    if (typeof message !== 'string') return { junk: true, reason: 'not_a_string' };
    const trimmed = message.trim();

    // Nothing but punctuation/whitespace: ".", "???", "..."
    const alnum = trimmed.replace(/[^\p{L}\p{N}]/gu, '');
    if (alnum.length === 0) return { junk: true, reason: 'no_content' };

    // Same character flooded: "aaaaaaaa", "!!!!!!!!". Threshold 7 so a human
    // "hmmmmmm" / "soooooo" (typically <= 6) survives.
    if (/(.)\1{6,}/.test(trimmed)) return { junk: true, reason: 'char_flood' };

    // Keyboard mash produces long messages with almost no vowels. Real English
    // sits around 35-45% vowels (counting y); gibberish like
    // "Rqmghhnjjnnn xckmvxxd Xdo" lands under 10%.
    const letters = trimmed.replace(/[^\p{L}]/gu, '');
    if (letters.length >= 12) {
        const vowelCount = (letters.match(/[aeiouy]/gi) || []).length;
        if (vowelCount / letters.length < 0.15) return { junk: true, reason: 'low_vowel_ratio' };
    }

    // Word-level checks. Skip anything URL/email/code-shaped.
    const tokens = trimmed.split(/\s+/);
    for (const token of tokens) {
        if (isSkippableToken(token)) continue;
        const word = token.replace(/[^\p{L}]/gu, '');
        if (word.length === 0) continue;

        // A 6+ letter word with zero vowels doesn't exist in English
        // ("xckmvxxd"). Short vowel-less acronyms (HVAC, MSNBC) stay safe.
        if (word.length >= 6 && !VOWELS.test(word)) {
            return { junk: true, reason: 'vowelless_word' };
        }

        // 7+ consecutive consonants beats any real word ("strengths" peaks at 5).
        if (/[^aeiouy\P{L}]{7,}/iu.test(word)) {
            return { junk: true, reason: 'consonant_run' };
        }
    }

    // Long message built from <= 2 distinct characters: "abababababab"
    if (alnum.length >= 8 && new Set(alnum.toLowerCase()).size <= 2) {
        return { junk: true, reason: 'low_diversity' };
    }

    return { junk: false };
}

/**
 * Canned replies for junk strikes, indexed by how many strikes the session
 * already has. Stay in Milos's voice so a real human who fat-fingered a
 * message twice doesn't feel botted at.
 */
const STRIKE_REPLIES = [
    "Didn't quite catch that, looks like it might have been a typo. What's going on with your marketing right now?",
    "Still not following you. If you're checking whether this chat is real, it is. What kind of business are you running?",
];

// Static reply once a session is shadow-banned. Deliberately bland and
// unchanging so a bot gets no signal to adapt against.
const BANNED_REPLY = "If you have a real question about marketing for your business, I'm here. Otherwise you can reach the team at milos@thesnowmedia.com.";

function strikeReply(strikesSoFar) {
    return STRIKE_REPLIES[Math.min(strikesSoFar, STRIKE_REPLIES.length - 1)];
}

module.exports = {
    checkMessage,
    strikeReply,
    BANNED_REPLY,
};
