/**
 * Prompt Builder Service
 * Builds few-shot enhanced prompts by injecting successful conversation patterns
 */

/**
 * Build an enriched system prompt with few-shot examples
 * @param {string} basePrompt - The original system prompt
 * @param {Object} ragContext - Context from RAG service
 * @returns {string} - Enriched prompt with few-shot examples
 */
function build(basePrompt, ragContext) {
    // If no relevant patterns, return original prompt
    if (!ragContext || !ragContext.hasContext || !ragContext.patterns.length) {
        return basePrompt;
    }

    // Format patterns as examples
    const examplesSection = formatExamples(ragContext.patterns);

    // Find the injection point - before "## FIRST MESSAGE CONTEXT"
    // or at the end of "CRITICAL ACCURACY RULES" section
    const injectionMarker = '## FIRST MESSAGE CONTEXT';
    const injectionIndex = basePrompt.indexOf(injectionMarker);

    if (injectionIndex !== -1) {
        // Insert before FIRST MESSAGE CONTEXT
        return (
            basePrompt.slice(0, injectionIndex) +
            examplesSection +
            '\n\n' +
            basePrompt.slice(injectionIndex)
        );
    }

    // Fallback: append at the end
    return basePrompt + '\n\n' + examplesSection;
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

module.exports = {
    build,
    buildLeadContext,
    buildProgressSummary,
    getConversationStage,
    getStageGuidance
};
