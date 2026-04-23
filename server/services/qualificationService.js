/**
 * Qualification Signal Detector
 *
 * Scans the conversation for lightweight qualification signals that suggest a
 * visitor is worth booking. The score is injected into the dynamic system
 * block as context and used by Milos as a TIEBREAKER, never as a hard gate.
 *
 * Design rule from owner: "I don't want this to be the key factor of somebody
 * not booking a call if they don't answer this question." So no signal is
 * required, and the prompt must never block booking on a missing signal.
 */

// Pattern detectors. Each returns true/false for one signal category.
// Detection is intentionally generous: better to over-credit a real buyer
// than to miss them. False positives just nudge Milos toward booking sooner.

// Ad spend named: "$3k", "$5,000/mo", "spending 10k a month", "5k a month on Meta", etc.
// Requires one of: k suffix, explicit monthly unit, or the word "spend".
// Avoids false positives on revenue ("$3M") by not matching bare dollar amounts.
const AD_SPEND_RE = /(?:\$\s*\d[\d,]*\s*k\b|\d[\d,]*\s*k\s*(?:\/|\s*per\s+|\s+a\s+)(?:mo|month)|\$\s*\d[\d,]*\s*(?:\/|\s+per\s+|\s+a\s+)(?:mo|month)|\bspend(?:ing)?\s+(?:around|about|like)?\s*\$?\s*\d[\d,]*\s*k?)/i;

// Revenue named: "$2M", "2 million in revenue", "about $500k", "10m business"
const REVENUE_RE = /\$\s*\d[\d,]*\s*[mM]\b|\b\d+\s*(?:million|mil)\b|\b\d+\s*m\s+(?:revenue|business|company|shop|brand)|\brevenue\s+(?:is|of)\s+\$?\s*\d/i;

// KPI vocabulary (mentioning these is buyer language, not window-shopper language)
const KPI_RE = /\b(?:roas|roi|cpa|cpl|ltv|aov|cac|mer|conversion\s+rate|cost\s+per\s+(?:lead|acquisition|click)|pipeline)\b/i;

// Explicit niche identification in the user's own words
const NICHE_RE = /\b(?:i\s+run|we\s+run|we'?re|i\s+own|i\s+have|we\s+have)\s+(?:an?\s+)?(?:hvac|plumbing|roofing|solar|electrical|ecom(?:merce)?|shopify|dtc|agency|saas|b2b|restaurant|clinic|dental|law(?:\s*firm)?|medspa|real\s*estate)\b|\b(?:hvac|plumbing|roofing|solar|ecom(?:merce)?|shopify|dtc|b2b|saas)\s+(?:company|business|brand|shop|store)\b/i;

// Urgency / evaluation intent
const URGENCY_RE = /\b(?:looking\s+(?:to|for)\s+hire|hiring\s+an?\s+agency|evaluating|vetting|choosing|considering\s+(?:an?\s+)?agenc|need\s+(?:help|an?\s+agency)|already\s+(?:got|have)\s+(?:quotes|proposals))\b/i;

// Decision authority
const AUTHORITY_RE = /\b(?:i'?m\s+the\s+(?:owner|founder|ceo|cmo|cto|coo|vp|director|head\s+of)|i\s+founded|we'?re\s+(?:the\s+)?founders?|my\s+team|our\s+team|in\s+charge\s+of|i\s+oversee|i\s+manage|i\s+run\s+the)\b/i;

/**
 * Compute qualification signals from the current session.
 * @param {Object} session - Session with messages and leadData
 * @param {string} [latestMessage] - Current user message not yet in session.messages
 * @returns {Object} - { score, signals, description }
 */
function detectSignals(session, latestMessage = '') {
    const userText = [
        ...((session.messages || []).filter(m => m.role === 'user').map(m => m.content)),
        latestMessage
    ].join('\n');

    const signals = {
        adSpend: AD_SPEND_RE.test(userText),
        revenue: REVENUE_RE.test(userText),
        kpi: KPI_RE.test(userText),
        niche: NICHE_RE.test(userText) || !!(session.leadData?.businessType || session.leadData?.business),
        urgency: URGENCY_RE.test(userText),
        authority: AUTHORITY_RE.test(userText)
    };

    const score = Object.values(signals).filter(Boolean).length;
    const known = Object.entries(signals).filter(([, v]) => v).map(([k]) => k);

    let interpretation;
    if (score >= 3) {
        interpretation = 'High. Book without friction if they agree.';
    } else if (score === 2) {
        interpretation = 'Moderate. Book if they ask; one soft fit-check question is optional.';
    } else {
        interpretation = 'Low. Still book if they ask. Do NOT gate the booking on answering a qualifier.';
    }

    return {
        score,
        total: Object.keys(signals).length,
        signals,
        known,
        description: `[QUALIFICATION: ${score}/${Object.keys(signals).length} signals. Known: ${known.length ? known.join(', ') : 'none'}. ${interpretation}]`
    };
}

module.exports = {
    detectSignals
};
