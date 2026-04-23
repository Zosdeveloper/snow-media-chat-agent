/**
 * Spam / Non-Customer Filter
 * Fast synchronous checks that run before the Claude call:
 *   1. Honeypot fields (hidden inputs bots fill, real users don't)
 *   2. Keyword pre-filter on first message (obvious job seekers, vendors, etc.)
 *
 * On match we respond with a canned deflection and skip the expensive Claude
 * call. Matched intent is returned so the caller can persist it for downstream
 * gating (follow-up emails, RAG learning, booking tool).
 */

// Intent classifications used across the app.
// Allow-listed intents get full treatment (booking, follow-ups, etc.).
// partnership is included because Milos wants to engage influencers/affiliates.
const ALLOWED_INTENTS = new Set(['real_lead', 'partnership', 'unclear']);
const BLOCKED_INTENTS = new Set([
    'job_seeker', 'vendor_pitch', 'link_spam', 'academic',
    'competitor', 'free_advice', 'wrong_business', 'prompt_abuse', 'scam',
]);

/**
 * Keyword patterns ordered by specificity. First match wins.
 * Each pattern should be high-precision: a false positive here blocks a real lead.
 * Keep these narrow and obvious. Let the Claude classifier catch subtle cases.
 */
const KEYWORD_RULES = [
    {
        intent: 'job_seeker',
        patterns: [
            /\b(?:my\s+)?(?:resume|cv)\b/i,
            /\b(?:looking|searching)\s+for\s+(?:a\s+)?(?:job|position|role|work)\b/i,
            /\b(?:are\s+you|you\s+guys?)\s+hiring\b/i,
            /\b(?:apply|applying)\s+(?:for|to)\s+(?:a\s+)?(?:job|position|role)\b/i,
            /\bjob\s+(?:opening|opportunit)/i,
            /\b(?:internship|intern)\s+(?:opportunit|position|opening|at)/i,
            /\b(?:join|work\s+for|work\s+with)\s+your\s+(?:team|agency|company)\b/i,
            /\bcareer(?:s)?\s+(?:page|opportunit|opening)/i,
            /\bentry[\s-]level\s+position/i,
        ],
        response: "Appreciate the interest, but we aren't hiring right now. When we are, openings get posted on our LinkedIn. Good luck with the search.",
    },
    {
        intent: 'link_spam',
        patterns: [
            /\bguest\s+post/i,
            /\b(?:quality|high[\s-]quality)\s+backlinks?\b/i,
            /\bbacklink\s+(?:opportunity|exchange|package)/i,
            /\blink\s+(?:exchange|insertion|swap|placement)/i,
            /\bwrite\s+(?:a|an)?\s*(?:article|post)\s+for\s+your\s+(?:blog|site|website)/i,
            /\bcontribute\s+(?:an?\s+)?article/i,
            /\bDA\s*\d{2,}\b/i,
            /\bDR\s*\d{2,}\b/i,
            /\bdomain\s+(?:authority|rating)\s+of\s+\d/i,
        ],
        response: "Thanks, but we don't do guest posts, link exchanges, or paid placements on thesnowmedia.com. Best of luck.",
    },
    {
        intent: 'vendor_pitch',
        patterns: [
            // "we offer [optional adjectives] seo/web design/etc services"
            /\b(?:i|we|our\s+(?:agency|company|team))\s+(?:offer|offers|provide|provides|specialize\s+in|specializes\s+in|can\s+help\s+you\s+with)\s+(?:[\w-]+\s){0,5}?(?:seo|link[\s-]?building|web\s+design|web\s+development|virtual\s+assistant|content\s+writing|graphic\s+design|software\s+development|app\s+development|programming|backlink|facebook\s+ads|google\s+ads|ppc|paid\s+ads|paid\s+social|ads\s+management|social\s+media\s+marketing)/i,
            /\b(?:i'?m|i\s+am)\s+(?:a\s+)?(?:freelance|freelancer)\s+(?:developer|designer|writer|seo|marketer|va|virtual\s+assistant)/i,
            /\bwhite[\s-]label(?:ing)?\s+(?:seo|web|development|design|content|marketing|services|solutions|partner|agency|reseller)/i,
            /\boutsource\s+your\s+(?:development|design|seo|content|marketing|ads)/i,
            /\bwe\s+are\s+(?:a|an)\s+(?:seo|development|design|content|web\s+design|software\s+development|marketing)\s+(?:agency|company|firm)/i,
            /\b(?:hire\s+me|hire\s+us)\s+(?:for|to\s+build|to\s+design|to\s+manage)/i,
        ],
        response: "Thanks for reaching out, but we don't take on vendor pitches through the chat. If it's a real partnership fit, email it to milos@thesnowmedia.com so it doesn't get lost.",
    },
    {
        intent: 'scam',
        patterns: [
            /\b(?:crypto|bitcoin|ethereum|nft|web3|forex)\s+(?:investment|opportunity|trading)/i,
            /\b(?:investment|trading)\s+(?:opportunity|platform)\s+(?:with|guaranteed)/i,
            /\bmake\s+(?:money|income)\s+(?:fast|quickly|online)/i,
            /\binheritance\s+(?:of|fund)/i,
            /\bprince\s+of\s+nigeria/i,
        ],
        response: "Not interested. Have a good one.",
    },
    {
        intent: 'academic',
        patterns: [
            /\bfor\s+my\s+(?:thesis|dissertation|research\s+paper|class\s+project|school\s+project|assignment|homework)/i,
            /\b(?:i'?m|i\s+am)\s+(?:a\s+)?(?:student|phd\s+candidate|researcher)\s+(?:writing|studying|researching)/i,
            /\bcould\s+(?:you|i)\s+interview\s+you\s+for\s+(?:my|a)\s+(?:paper|research|class)/i,
        ],
        response: "Appreciate the interest. We don't do academic interviews through the chat, but Milos has written publicly about agency work on LinkedIn if that helps. Good luck with the project.",
    },
];

/**
 * Partnership rules are allow-listed but tagged so we skip RAG learning on them.
 * These are the pitches Milos WANTS to engage with (influencers, affiliates, resellers).
 */
const PARTNERSHIP_PATTERNS = [
    /\b(?:influencer|creator|content\s+creator)\s+(?:partnership|collab|promotion)/i,
    /\b(?:sponsorship|sponsor)\s+(?:opportunity|inquiry|your\s+content)/i,
    /\b(?:affiliate|referral)\s+(?:program|partnership|commission)/i,
    /\b(?:reseller|white[\s-]label\s+reseller)\s+(?:program|partnership)/i,
    /\b(?:i'?m|i\s+am)\s+(?:an\s+)?influencer\s+(?:with|who|and)/i,
    /\b(?:promote|promo)\s+your\s+(?:agency|services)\s+to\s+my\s+(?:audience|followers|list)/i,
];

const HONEYPOT_FIELDS = ['hp_website', 'hp_company', 'hp_timing'];

/**
 * Check honeypot fields in request body. Real users never see these.
 * Returns true if any honeypot field has a value (bot detected).
 */
function checkHoneypot(body) {
    if (!body || typeof body !== 'object') return false;
    for (const field of HONEYPOT_FIELDS) {
        const value = body[field];
        if (typeof value === 'string' && value.trim().length > 0) {
            return true;
        }
    }
    return false;
}

/**
 * Run keyword pre-filter on a single user message.
 * Returns { intent, response, confidence } if matched, or null.
 * Use only on first 1-2 messages in a conversation (context-dependent later).
 */
function keywordFilter(message) {
    if (!message || typeof message !== 'string') return null;

    for (const rule of KEYWORD_RULES) {
        for (const pattern of rule.patterns) {
            if (pattern.test(message)) {
                return {
                    intent: rule.intent,
                    response: rule.response,
                    confidence: 0.95,
                    matched: pattern.source,
                };
            }
        }
    }

    // Partnership check (allow-listed, no canned response)
    for (const pattern of PARTNERSHIP_PATTERNS) {
        if (pattern.test(message)) {
            return {
                intent: 'partnership',
                response: null, // let Claude handle it normally
                confidence: 0.85,
                matched: pattern.source,
            };
        }
    }

    return null;
}

function isAllowedIntent(intent) {
    if (!intent) return true; // unknown = default to allow
    return ALLOWED_INTENTS.has(intent);
}

function isBlockedIntent(intent) {
    if (!intent) return false;
    return BLOCKED_INTENTS.has(intent);
}

module.exports = {
    checkHoneypot,
    keywordFilter,
    isAllowedIntent,
    isBlockedIntent,
    ALLOWED_INTENTS,
    BLOCKED_INTENTS,
    HONEYPOT_FIELDS,
};
