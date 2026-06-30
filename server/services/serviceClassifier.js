/**
 * serviceClassifier.js
 *
 * Deterministic keyword classifier that maps a visitor message to the Snow Media
 * service they are asking about. Mirrors the "service interest" tracking from the
 * Elevated Collective agent, adapted to Snow Media's service lineup.
 *
 * Cheap (string .includes), runs inline on every user message. The most specific
 * service wins; generic "paid ads" is the last resort so a platform-named request
 * (e.g. "google ads") is not swallowed by the generic bucket.
 *
 * No external calls. Returns a slug string or null.
 */

// Ordered most-specific -> most-generic. First bucket with a hit wins.
const SERVICES = [
    { slug: 'google_ads',     label: 'Google Ads',     patterns: ['google ads', 'google ppc', 'adwords', 'search ads', 'shopping ads', 'pmax', 'performance max', 'google campaign'] },
    { slug: 'meta_ads',       label: 'Meta Ads',       patterns: ['meta ads', 'facebook ads', 'fb ads', 'instagram ads', 'ig ads', 'meta advertising', 'facebook advertising', 'advantage+'] },
    { slug: 'microsoft_ads',  label: 'Microsoft Ads',  patterns: ['microsoft ads', 'bing ads', 'bing ppc', 'bing search'] },
    { slug: 'linkedin_ads',   label: 'LinkedIn Ads',   patterns: ['linkedin ads', 'linkedin advertising', 'linkedin campaign'] },
    { slug: 'ai_agents',      label: 'AI Agents',      patterns: ['ai agent', 'chat agent', 'chatbot', 'chat bot', 'voice agent', 'ai assistant', 'ai receptionist', 'phone agent'] },
    { slug: 'ai_automation',  label: 'AI Automation',  patterns: ['ai automation', 'automation', 'automate', 'workflow', 'n8n', 'zapier', 'make.com', 'integrate my', 'integration'] },
    { slug: 'cro',            label: 'CRO',            patterns: ['cro', 'conversion rate', 'conversion optimization', 'a/b test', 'split test', 'optimize conversions', 'improve conversion'] },
    { slug: 'local_seo',      label: 'Local SEO',      patterns: ['local seo', 'seo', 'google business', 'gbp', 'map pack', 'local pack', 'rank on google', 'search ranking', 'organic traffic', 'show up on google'] },
    { slug: 'web_dev',        label: 'Web Dev',        patterns: ['website', 'web design', 'web development', 'wordpress', 'webflow', 'build a site', 'build my site', 'redesign', 'new site', 'landing page'] },
    { slug: 'brand',          label: 'Brand Strategy', patterns: ['branding', 'brand strategy', 'brand identity', 'rebrand', 'logo', 'positioning'] },
    { slug: 'paid_ads',       label: 'Paid Ads (general)', patterns: ['paid ads', 'paid media', 'ppc', 'ad spend', 'run ads', 'running ads', 'advertising', 'paid traffic', 'media buying'] },
];

/**
 * Classify a single message. Returns { slug, label } or null.
 */
function classify(message) {
    if (!message || typeof message !== 'string') return null;
    const lower = message.toLowerCase();
    for (const svc of SERVICES) {
        if (svc.patterns.some(p => lower.includes(p))) {
            return { slug: svc.slug, label: svc.label };
        }
    }
    return null;
}

/** Human-readable label for a stored slug (dashboard fallback lives client-side too). */
function labelFor(slug) {
    const svc = SERVICES.find(s => s.slug === slug);
    return svc ? svc.label : (slug || 'Unclassified');
}

module.exports = { classify, labelFor, SERVICES };
