/**
 * Email Follow-Up Service
 * Sends personalized follow-up sequences to leads who chatted but didn't book.
 * Uses Claude to personalize content based on conversation context.
 * Uses SendGrid for delivery.
 */

const sgMail = require('@sendgrid/mail');
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../database/db');
const config = require('../config');
const alerts = require('./alertService');

let intervalHandle = null;

// Initialize SendGrid
function init() {
    if (!config.followUp.enabled) {
        console.log('Follow-up service disabled (no SENDGRID_API_KEY)');
        return false;
    }
    sgMail.setApiKey(config.followUp.sendgridApiKey);
    console.log('Follow-up service initialized');
    return true;
}

/**
 * Start the follow-up scheduler
 */
function start() {
    if (!init()) return;

    // Run immediately on boot, then on interval
    runCycle().catch(err => console.error('Follow-up cycle error:', err.message));

    intervalHandle = setInterval(() => {
        runCycle().catch(err => console.error('Follow-up cycle error:', err.message));
    }, config.followUp.checkIntervalMs);

    console.log(`Follow-up scheduler running every ${config.followUp.checkIntervalMs / 60000} minutes`);
}

/**
 * Stop the scheduler
 */
function stop() {
    if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
    }
}

/**
 * Main cycle: queue new candidates + send due emails
 */
async function runCycle() {
    try {
        // Step 1: Find new conversations that need follow-ups queued
        await queueNewFollowUps();

        // Step 2: Send any due follow-ups
        await sendDueFollowUps();
    } catch (err) {
        console.error('[FollowUp] Cycle error:', err.message);
        alerts.custom('Follow-Up Error', 'Follow-up cycle failed', { error: err.message });
    }
}

/**
 * Find eligible conversations and queue their email sequences
 */
async function queueNewFollowUps() {
    const candidates = db.getFollowUpCandidates(30);

    if (candidates.length === 0) return;

    console.log(`[FollowUp] Found ${candidates.length} new follow-up candidates`);

    for (const convo of candidates) {
        try {
            // Get conversation messages for personalization
            const messages = db.getMessages(convo.id, 30);

            // Use Claude to generate personalized email content for all 3 emails
            const emailContent = await generateEmailContent(convo, messages);

            // Queue all 3 emails in the sequence
            const now = new Date();
            for (let i = 0; i < config.followUp.sequence.length; i++) {
                const step = config.followUp.sequence[i];
                const scheduledAt = new Date(now.getTime() + step.delayMinutes * 60 * 1000);

                db.createFollowUp({
                    conversation_id: convo.id,
                    lead_email: convo.lead_email,
                    lead_name: convo.lead_name,
                    sequence_step: i + 1,
                    email_type: step.type,
                    subject: emailContent[i].subject,
                    body_html: emailContent[i].body,
                    scheduled_at: scheduledAt.toISOString(),
                });
            }

            console.log(`[FollowUp] Queued 3-email sequence for ${convo.lead_email} (convo: ${convo.id})`);
        } catch (err) {
            console.error(`[FollowUp] Error queuing for ${convo.id}:`, err.message);
        }
    }
}

/**
 * Send all follow-ups that are due
 */
async function sendDueFollowUps() {
    const sentToday = db.getFollowUpsSentToday();
    if (sentToday >= config.followUp.dailyLimit) {
        console.log(`[FollowUp] Daily limit reached (${sentToday}/${config.followUp.dailyLimit})`);
        return;
    }

    const dueEmails = db.getDueFollowUps();
    if (dueEmails.length === 0) return;

    let sendCount = 0;
    const remaining = config.followUp.dailyLimit - sentToday;

    for (const followUp of dueEmails) {
        if (sendCount >= remaining) {
            console.log('[FollowUp] Daily limit reached mid-batch');
            break;
        }

        // Check if conversation has since converted (skip if they booked)
        if (db.isConversationConverted(followUp.conversation_id)) {
            db.skipFollowUps(followUp.conversation_id);
            console.log(`[FollowUp] Skipped ${followUp.lead_email}, already converted`);
            continue;
        }

        try {
            await sendEmail(followUp);
            db.markFollowUpSent(followUp.id);
            sendCount++;
            console.log(`[FollowUp] Sent email ${followUp.sequence_step}/3 to ${followUp.lead_email}`);
        } catch (err) {
            db.markFollowUpFailed(followUp.id, err.message);
            console.error(`[FollowUp] Send failed for ${followUp.lead_email}:`, err.message);

            // Alert on send failures
            alerts.custom('Follow-Up Send Error', `Failed to send follow-up email`, {
                error: err.message,
                leadEmail: followUp.lead_email,
                sequenceStep: followUp.sequence_step,
            });
        }
    }

    if (sendCount > 0) {
        console.log(`[FollowUp] Sent ${sendCount} emails this cycle`);
    }
}

/**
 * Send a single email via SendGrid
 */
async function sendEmail(followUp) {
    const msg = {
        to: followUp.lead_email,
        from: {
            email: config.followUp.fromEmail,
            name: config.followUp.fromName,
        },
        subject: followUp.subject,
        html: followUp.body_html,
        trackingSettings: {
            openTracking: { enable: true },
            clickTracking: { enable: true },
        },
    };

    await sgMail.send(msg);
}

/**
 * Use Claude to generate personalized email content for the 3-email sequence
 */
async function generateEmailContent(conversation, messages) {
    const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

    // Build conversation transcript for context
    const transcript = messages
        .map(m => `${m.role === 'user' ? 'Visitor' : 'Milos'}: ${m.content}`)
        .join('\n');

    const leadName = conversation.lead_name || '';
    const businessType = conversation.lead_business_type || '';
    const calendlyUrl = config.followUp.calendlyUrl;

    const prompt = `You are writing follow-up emails for Milos from The Snow Media, a digital marketing agency. A website visitor chatted with us but didn't book a strategy call. Write 3 emails for a follow-up sequence.

VISITOR INFO:
- Name: ${leadName || 'Unknown'}
- Business type: ${businessType || 'Unknown'}
- Email: ${conversation.lead_email}

CHAT TRANSCRIPT:
${transcript}

WRITE 3 EMAILS:

Email 1 (sent ~45 minutes after chat): Quick, casual recap. Reference something specific they said. Include a relevant resource offer. End with Calendly link.

Email 2 (sent 24 hours later): Share a relevant case study result. Keep it short, one specific proof point that matches their industry or pain point. End with Calendly link.

Email 3 (sent 72 hours later): Final friendly nudge. Low pressure, mention limited availability. End with Calendly link.

RULES:
- Sound like Milos texting, not a corporate email. Short sentences, casual tone.
- NEVER use em dashes or double hyphens. Use commas or periods instead.
- Each email should be 3-5 short paragraphs max
- Subject lines should be lowercase, casual, like a friend emailing (e.g., "quick thought about your ads")
- Do NOT use fake stats or made-up case study numbers. Use general language like "significant improvement" or "strong results" if you don't have specifics.
- Include this Calendly link naturally: ${calendlyUrl}
- If you know their name, use it. If not, skip the greeting name.
- HTML format: use <p> tags for paragraphs, <a> for links. No fancy styling, just clean text.

Respond in this exact JSON format:
[
  {"subject": "...", "body": "<p>...</p>"},
  {"subject": "...", "body": "<p>...</p>"},
  {"subject": "...", "body": "<p>...</p>"}
]`;

    try {
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2000,
            messages: [{ role: 'user', content: prompt }],
        });

        const text = response.content[0].text;

        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            throw new Error('Could not parse email content from Claude response');
        }

        const emails = JSON.parse(jsonMatch[0]);

        if (!Array.isArray(emails) || emails.length !== 3) {
            throw new Error('Expected 3 emails from Claude');
        }

        // Add unsubscribe footer to each email
        const footer = `<p style="color:#999;font-size:12px;margin-top:30px;">Milos Petrovic | The Snow Media<br>Hit reply if you have any questions.<br><a href="mailto:${config.followUp.fromEmail}?subject=Unsubscribe" style="color:#999;">Unsubscribe</a></p>`;

        return emails.map(e => ({
            subject: e.subject,
            body: e.body + footer,
        }));
    } catch (err) {
        console.error('[FollowUp] Claude email generation failed:', err.message);
        // Fall back to template emails
        return getTemplateEmails(conversation, calendlyUrl);
    }
}

/**
 * Fallback template emails if Claude generation fails
 */
function getTemplateEmails(conversation, calendlyUrl) {
    const name = conversation.lead_name;
    const greeting = name ? `<p>Hey ${name},</p>` : '<p>Hey,</p>';
    const footer = `<p style="color:#999;font-size:12px;margin-top:30px;">Milos Petrovic | The Snow Media<br>Hit reply if you have any questions.<br><a href="mailto:${config.followUp.fromEmail}?subject=Unsubscribe" style="color:#999;">Unsubscribe</a></p>`;

    return [
        {
            subject: 'good chatting earlier',
            body: `${greeting}<p>Milos here from The Snow Media. We were just chatting on the site and I wanted to follow up real quick.</p><p>If you want to keep the conversation going, I'd love to hop on a quick strategy call. No pitch, just a look at what's working and what could be better.</p><p><a href="${calendlyUrl}">Grab a time here</a> whenever works for you.</p>${footer}`,
        },
        {
            subject: 're: your marketing setup',
            body: `${greeting}<p>Quick follow-up. We've been getting strong results for businesses like yours, and I think there's a real opportunity to improve your numbers.</p><p>Happy to walk you through what we're seeing in a quick call. No commitment, just useful info either way.</p><p><a href="${calendlyUrl}">Here's my calendar</a> if you want to lock in a time.</p>${footer}`,
        },
        {
            subject: 'last one from me',
            body: `${greeting}<p>Just a final nudge. I know things get busy, so no pressure at all.</p><p>If you ever want a second opinion on your marketing, the offer stands. We only take on a handful of new clients each month, so slots do fill up.</p><p><a href="${calendlyUrl}">Book a call here</a> if it makes sense down the road.</p><p>Either way, good luck with everything.</p>${footer}`,
        },
    ];
}

module.exports = {
    start,
    stop,
    runCycle,
};
