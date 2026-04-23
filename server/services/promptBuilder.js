/**
 * Prompt Builder Service
 * Builds few-shot enhanced prompts by injecting successful conversation patterns
 */

/**
 * Build the conversation-pattern addendum (Lane A, style few-shot).
 * Returns '' when no patterns retrieved.
 * @param {Object} ragContext - Context from RAG service
 * @returns {string}
 */
function buildRagAddendum(ragContext) {
    if (!ragContext || !ragContext.patterns || !ragContext.patterns.length) {
        return '';
    }
    return formatExamples(ragContext.patterns);
}

/**
 * Build the knowledge-facts addendum (Lane B, grounding).
 * These are case studies, services, FAQs, resources. They're rendered as a
 * bulleted facts block with an explicit citation rule so the model grounds
 * claims rather than copying conversation style.
 * @param {Object} ragContext - Context from RAG service
 * @returns {string}
 */
function buildFactsAddendum(ragContext) {
    if (!ragContext || !ragContext.facts || !ragContext.facts.length) {
        return '';
    }
    const lines = [
        '<approved_facts>',
        'Facts you MAY cite in this turn. These are the only verified results, services, and FAQs you have for this conversation. Do not extend a client result to a different niche, and do not invent numbers.'
    ];
    for (const fact of ragContext.facts) {
        const typeTag = fact.type ? `[${fact.type}] ` : '';
        lines.push(`- ${typeTag}${fact.title}: ${fact.content}`);
    }
    lines.push('</approved_facts>');
    return lines.join('\n');
}

/**
 * Format patterns as few-shot examples
 * @param {Array} patterns - Relevant patterns from RAG
 * @returns {string} - Formatted examples section
 */
function formatExamples(patterns) {
    const lines = [
        '## SUCCESSFUL CONVERSATION EXAMPLES',
        'Here are real examples from conversations that led to bookings. Use these as inspiration, but respond naturally to THIS visitor.',
        ''
    ];

    patterns.forEach((pattern, index) => {
        lines.push(`### Example ${index + 1}: ${pattern.title}`);

        if (pattern.description) {
            lines.push(`*${pattern.description}*`);
        }

        lines.push('');

        // Format messages
        for (const msg of pattern.messages) {
            lines.push(`**${msg.role}**: ${msg.content}`);
        }

        lines.push('');
    });

    lines.push('---');
    lines.push('Remember: Adapt these approaches naturally. Do not copy responses verbatim.');
    lines.push('');

    return lines.join('\n');
}

/**
 * Build context string for lead data
 * @param {Object} leadData - Captured lead information
 * @returns {string} - Formatted context string
 */
function buildLeadContext(leadData) {
    if (!leadData) return '';

    const parts = [];

    if (leadData.name) {
        parts.push(`Name: ${leadData.name}`);
    }
    if (leadData.email) {
        parts.push(`Email: ${leadData.email}`);
    }
    if (leadData.phone) {
        parts.push(`Phone: ${leadData.phone}`);
    }
    if (leadData.businessType || leadData.business) {
        parts.push(`Business Type: ${leadData.businessType || leadData.business}`);
    }
    if (leadData.monthlyBudget) {
        parts.push(`Monthly Budget: ${leadData.monthlyBudget}`);
    }
    if (leadData.currentChallenges) {
        parts.push(`Challenges: ${leadData.currentChallenges}`);
    }

    if (parts.length === 0) return '';

    return '\n\n[CAPTURED LEAD INFO: ' + parts.join(' | ') + ']';
}

/**
 * Build a summary of conversation progress
 * @param {Object} session - Current session
 * @returns {string} - Progress summary
 */
function buildProgressSummary(session) {
    const parts = [];

    const messageCount = session.messages?.length || 0;
    parts.push(`Messages: ${messageCount}`);

    const leadData = session.leadData || {};
    const captured = [];
    if (leadData.name) captured.push('name');
    if (leadData.email) captured.push('email');
    if (leadData.phone) captured.push('phone');

    if (captured.length > 0) {
        parts.push(`Captured: ${captured.join(', ')}`);
    }

    const missing = [];
    if (!leadData.name) missing.push('name');
    if (!leadData.email) missing.push('email');
    if (!leadData.phone) missing.push('phone');

    if (missing.length > 0) {
        parts.push(`Still need: ${missing.join(', ')}`);
    }

    return `[CONVERSATION PROGRESS: ${parts.join(' | ')}]`;
}

/**
 * Determine the stage of conversation based on captured data
 * @param {Object} session - Current session
 * @returns {string} - Conversation stage
 */
function getConversationStage(session) {
    const leadData = session.leadData || {};
    const messageCount = session.messages?.length || 0;

    const hasName = !!leadData.name;
    const hasEmail = !!leadData.email;
    const hasPhone = !!leadData.phone;

    if (hasName && hasEmail && hasPhone) {
        return 'qualified'; // Ready to book
    }

    if (hasEmail || (hasName && (hasEmail || hasPhone))) {
        return 'engaged'; // Good progress
    }

    if (messageCount >= 3 && (leadData.businessType || leadData.business)) {
        return 'exploring'; // Learning about needs
    }

    if (messageCount >= 2) {
        return 'warming'; // Building rapport
    }

    return 'initial'; // Just started
}

/**
 * Get stage-specific guidance to append to prompt
 * @param {Object} session - Current session
 * @returns {string} - Stage-specific guidance
 */
function getStageGuidance(session) {
    const stage = getConversationStage(session);
    const leadData = session.leadData || {};

    const guidance = {
        initial: 'Focus on understanding their situation. Ask about their business.',
        warming: 'Build rapport. Show genuine interest in their challenges.',
        exploring: 'Dig deeper into their pain points. Start connecting to how we can help.',
        engaged: 'Good progress! Keep the momentum. Work toward missing contact info.',
        qualified: 'They\'re ready! Guide them toward booking a call.'
    };

    let result = `\n[STAGE: ${stage.toUpperCase()} - ${guidance[stage]}]`;

    // Add specific nudges
    if (stage === 'engaged' || stage === 'exploring') {
        const missing = [];
        if (!leadData.name) missing.push('name');
        if (!leadData.email) missing.push('email');
        if (!leadData.phone) missing.push('phone');

        if (missing.length > 0) {
            result += `\n[NUDGE: When natural, work toward getting their ${missing.join(' or ')}]`;
        }
    }

    return result;
}

/**
 * Build page context string for the prompt
 * @param {Object} pageContext - { url, title, referrer }
 * @returns {string}
 */
function buildPageContext(pageContext) {
    if (!pageContext || !pageContext.url) return '';

    const url = pageContext.url.toLowerCase();
    let pageType = 'homepage';
    let hint = '';

    if (url.includes('/services/google-ads')) {
        pageType = 'Google Ads service page';
        hint = 'They are interested in Google Ads. Reference Google Ads results if relevant.';
    } else if (url.includes('/services/meta-ads')) {
        pageType = 'Meta Ads service page';
        hint = 'They are interested in Meta Ads. Reference Meta/Facebook Ads results if relevant.';
    } else if (url.includes('/services/microsoft-ads')) {
        pageType = 'Microsoft Ads service page';
        hint = 'They are interested in Microsoft Ads. Mention 35% lower CPCs vs Google.';
    } else if (url.includes('/services/linkedin-ads')) {
        pageType = 'LinkedIn Ads service page';
        hint = 'They are interested in LinkedIn Ads. Good B2B signal.';
    } else if (url.includes('/services/ai-automations')) {
        pageType = 'AI Automations service page';
        hint = 'They are interested in AI automation.';
    } else if (url.includes('/services/ai-agents')) {
        pageType = 'AI Agents service page';
        hint = 'They are interested in AI agents for their business.';
    } else if (url.includes('/services/cro')) {
        pageType = 'CRO service page';
        hint = 'They are interested in conversion rate optimization.';
    } else if (url.includes('/services/local-seo')) {
        pageType = 'Local SEO service page';
        hint = 'They are interested in local SEO. Likely a local/service business.';
    } else if (url.includes('/services/brand-strategy')) {
        pageType = 'Brand Strategy service page';
        hint = 'They are interested in brand strategy and positioning.';
    } else if (url.includes('/services/web-development')) {
        pageType = 'Web Development service page';
        hint = 'They are interested in web development.';
    } else if (url.includes('/services')) {
        pageType = 'services overview page';
        hint = 'They are browsing services. Ask which one caught their eye.';
    } else if (url.includes('/case-studies')) {
        pageType = 'case studies page';
        hint = 'They are looking at results. High intent. Reference specific case studies.';
    } else if (url.includes('/pricing') || url.includes('/plans')) {
        pageType = 'pricing page';
        hint = 'High intent. They are evaluating cost. Help them see value, pivot to a call.';
    } else if (url.includes('/blog')) {
        pageType = 'blog page';
        hint = 'They are reading content. Be softer, offer value, do not push hard.';
    } else if (url.includes('/contact')) {
        pageType = 'contact page';
        hint = 'Very high intent. They want to reach out. Make it easy to book a call.';
    } else if (url.includes('/about')) {
        pageType = 'about page';
        hint = 'They are evaluating the team. Mention Snow founded the agency, senior team, boutique model.';
    } else if (url.includes('/resources') || url.includes('/ai-tools')) {
        pageType = 'resources page';
        hint = 'They are looking at free resources. Offer to send a relevant one to their email.';
    }

    let result = `\n[PAGE: ${pageType} (${pageContext.url}). ${hint}]`;
    return result;
}

/**
 * Build UTM context string for the prompt
 * @param {Object} utmParams - UTM parameters
 * @returns {string}
 */
function buildUtmContext(utmParams) {
    if (!utmParams) return '';

    const parts = [];

    if (utmParams.utm_source) parts.push(`Source: ${utmParams.utm_source}`);
    if (utmParams.utm_medium) parts.push(`Medium: ${utmParams.utm_medium}`);
    if (utmParams.utm_campaign) parts.push(`Campaign: ${utmParams.utm_campaign}`);
    if (utmParams.utm_term) parts.push(`Search term: ${utmParams.utm_term}`);

    if (parts.length === 0) return '';

    let hint = '';
    const source = (utmParams.utm_source || '').toLowerCase();
    const medium = (utmParams.utm_medium || '').toLowerCase();

    if (medium === 'cpc' || medium === 'ppc') {
        hint = 'This visitor came from a paid ad. They clicked on an ad to get here, so they have active intent.';
        if (utmParams.utm_term) {
            hint += ` They searched for "${utmParams.utm_term}". Reference this topic naturally.`;
        }
    } else if (source === 'facebook' || source === 'instagram' || source === 'meta') {
        hint = 'Visitor came from social media. They saw our content and clicked through.';
    } else if (source === 'linkedin') {
        hint = 'Visitor came from LinkedIn. Likely B2B. Tailor accordingly.';
    } else if (medium === 'email') {
        hint = 'Visitor came from an email campaign. They are already in our funnel.';
    }

    return `\n[TRAFFIC: ${parts.join(' | ')}. ${hint}]`;
}

/**
 * Build time-of-day context (after-hours awareness)
 * @returns {string}
 */
function buildTimeContext() {
    // US Eastern time (Snow Media timezone)
    const now = new Date();
    const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hour = eastern.getHours();
    const day = eastern.getDay(); // 0 = Sunday

    const isWeekend = day === 0 || day === 6;
    const isAfterHours = hour < 9 || hour >= 18;

    if (isWeekend || isAfterHours) {
        return '\n[TIME: After hours. Do NOT offer to connect them with someone right now. Focus on qualifying, capturing their email, and booking a call for the next business day. Say "I can book you a time with the team" not "let me connect you right now."]';
    }

    return '\n[TIME: Business hours. You can offer to connect them with the team if they are high-intent.]';
}

/**
 * Build behavior signals context
 * @param {Object} signals - { timeOnPage, maxScrollDepth, pagesViewed, entryPage }
 * @returns {string}
 */
function buildBehaviorContext(signals) {
    if (!signals) return '';

    const parts = [];

    if (signals.timeOnPage > 0) {
        parts.push(`${signals.timeOnPage}s on page`);
    }
    if (signals.maxScrollDepth > 0) {
        parts.push(`${signals.maxScrollDepth}% scrolled`);
    }
    if (signals.pagesViewed > 1) {
        parts.push(`${signals.pagesViewed} pages viewed this session`);
    }

    if (parts.length === 0) return '';

    // Determine intent level
    let intentHint = '';
    const highIntent = (signals.timeOnPage > 180 && signals.pagesViewed >= 3) ||
                       (signals.maxScrollDepth > 75 && signals.pagesViewed >= 2);
    const mediumIntent = signals.timeOnPage > 60 || signals.pagesViewed >= 2 || signals.maxScrollDepth > 50;

    if (highIntent) {
        intentHint = 'HIGH INTENT visitor. They have been researching. Be more direct, push toward booking.';
    } else if (mediumIntent) {
        intentHint = 'Engaged visitor. They are actively exploring.';
    }

    return `\n[BEHAVIOR: ${parts.join(', ')}. ${intentHint}]`;
}

/**
 * Build returning visitor context
 * @param {Object|null} previousData - Previous conversation data from DB
 * @returns {string}
 */
function buildReturningVisitorContext(previousData) {
    if (!previousData) return '';

    const parts = [];
    if (previousData.lead_name) parts.push(`Name: ${previousData.lead_name}`);
    if (previousData.lead_business_type) parts.push(`Business: ${previousData.lead_business_type}`);
    if (previousData.lead_email) parts.push(`Email: ${previousData.lead_email}`);
    if (previousData.outcome) parts.push(`Last outcome: ${previousData.outcome}`);
    if (previousData.msg_count) parts.push(`Previous messages: ${previousData.msg_count}`);

    if (parts.length === 0) return '';

    return `\n[RETURNING VISITOR: This person has chatted before. ${parts.join(' | ')}. Welcome them back warmly and reference what you know. Don't re-ask questions they already answered. Pick up where they left off.]`;
}

/**
 * Build A/B variant context (for prompt variation)
 * @param {string} variant - 'A' or 'B'
 * @returns {string}
 */
function buildVariantContext(variant) {
    if (!variant) return '';

    // Variant A: standard opener (control)
    // Variant B: value-first opener (test)
    if (variant === 'B') {
        return '\n[VARIANT B: For your first message, lead with a specific value offer. Example: "Hey, I just helped a [industry] business cut their CPA by 40%. What kind of business do you run?" Make it about them seeing a result, not about you.]';
    }

    return ''; // Variant A = default behavior (no extra instruction)
}

module.exports = {
    buildRagAddendum,
    buildFactsAddendum,
    buildLeadContext,
    buildProgressSummary,
    getConversationStage,
    getStageGuidance,
    buildPageContext,
    buildUtmContext,
    buildTimeContext,
    buildBehaviorContext,
    buildReturningVisitorContext,
    buildVariantContext
};
