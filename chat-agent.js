/**
 * The Snow Media - Sales Chat Agent
 * Human-sounding, optimized for DTC E-commerce & Home Services
 */

class SnowMediaChatAgent {
    constructor() {
        // DOM Elements
        this.chatWidget = document.getElementById('chat-widget');
        this.chatToggle = document.getElementById('chat-toggle');
        this.chatContainer = document.getElementById('chat-container');
        this.chatMessages = document.getElementById('chat-messages');
        this.quickReplies = document.getElementById('quick-replies');
        this.chatInput = document.getElementById('chat-input');
        this.sendBtn = document.getElementById('send-btn');
        this.minimizeBtn = document.getElementById('minimize-chat');
        this.notificationBadge = document.querySelector('.notification-badge');
        this.chatIcon = document.querySelector('.chat-icon');
        this.closeIcon = document.querySelector('.close-icon');

        // State
        this.isOpen = false;
        this.conversationState = 'initial';
        this.leadData = {
            name: '',
            email: '',
            phone: '',
            businessType: '',
            challenges: '',
            runningAds: ''
        };
        this.messageHistory = [];

        // Conversation flows
        this.flows = this.initializeFlows();

        // Initialize
        this.bindEvents();
        this.autoOpen();
    }

    initializeFlows() {
        return {
            // ============================================
            // WELCOME
            // ============================================
            initial: {
                message: "Hey! I'm Milos. Are you looking to scale profitably with paid ads?",
                quickReplies: [
                    { text: "Yes, I run an e-commerce brand", next: 'ecommerce_intro' },
                    { text: "Yes, I run a home service business", next: 'homeservice_intro' },
                    { text: "Just exploring", next: 'exploring' }
                ]
            },

            exploring: {
                message: "No problem! We're a performance marketing agency that helps brands scale with Google and Meta Ads. What brings you here today?",
                quickReplies: [
                    { text: "Struggling with ad performance", next: 'pain_general' },
                    { text: "Looking for a new agency", next: 'new_agency' },
                    { text: "Want to see your results", next: 'show_results' }
                ]
            },

            // ============================================
            // E-COMMERCE PATH
            // ============================================
            ecommerce_intro: {
                message: "Nice! We work with DTC brands doing $1M to $30M in revenue. What's your biggest challenge right now?",
                quickReplies: [
                    { text: "MER is declining", next: 'ecom_mer' },
                    { text: "Attribution is a mess", next: 'ecom_attribution' },
                    { text: "Creative testing isn't working", next: 'ecom_creative' },
                    { text: "Spend feels inefficient", next: 'ecom_inefficient' }
                ]
            },

            ecom_mer: {
                message: "Yeah, MER decline is frustrating. Usually it's a sign of channel saturation or misallocated spend. We've helped brands recover MER by 30-50% through full-funnel restructuring. Are you running Google, Meta, or both?",
                quickReplies: [
                    { text: "Google Ads", next: 'platform_google' },
                    { text: "Meta Ads", next: 'platform_meta' },
                    { text: "Both", next: 'platform_both' }
                ]
            },

            ecom_attribution: {
                message: "Attribution headaches are everywhere after iOS14. We focus on incrementality and blended metrics instead of platform-reported ROAS. It's really the only way to get a true picture. What platforms are you running?",
                quickReplies: [
                    { text: "Google Ads", next: 'platform_google' },
                    { text: "Meta Ads", next: 'platform_meta' },
                    { text: "Both", next: 'platform_both' }
                ]
            },

            ecom_creative: {
                message: "Creative is the #1 lever on Meta right now. Most brands test wrong though. Too few concepts, no structured framework. We use a systematic testing process that finds winners fast. What platforms are you on?",
                quickReplies: [
                    { text: "Google Ads", next: 'platform_google' },
                    { text: "Meta Ads", next: 'platform_meta' },
                    { text: "Both", next: 'platform_both' }
                ]
            },

            ecom_inefficient: {
                message: "Inefficient spend usually means money is leaking to wrong audiences, bad placements, or poor campaign structure. We audit this stuff constantly for our clients. What platforms are you running?",
                quickReplies: [
                    { text: "Google Ads", next: 'platform_google' },
                    { text: "Meta Ads", next: 'platform_meta' },
                    { text: "Both", next: 'platform_both' }
                ]
            },

            // ============================================
            // HOME SERVICES PATH
            // ============================================
            homeservice_intro: {
                message: "Great! We work with home service companies doing $1M to $50M. What's your biggest pain point right now?",
                quickReplies: [
                    { text: "Leads are inconsistent", next: 'home_inconsistent' },
                    { text: "Cost per lead is too high", next: 'home_cpl' },
                    { text: "Tracking is broken", next: 'home_tracking' }
                ]
            },

            home_inconsistent: {
                message: "Inconsistent leads usually come from over-reliance on one channel or poor audience targeting. We build predictable lead engines that deliver month over month. Are you running Google, Meta, or both?",
                quickReplies: [
                    { text: "Google Ads", next: 'platform_google' },
                    { text: "Meta Ads", next: 'platform_meta' },
                    { text: "Both", next: 'platform_both' }
                ]
            },

            home_cpl: {
                message: "High CPL is painful. We've cut CPL by 30-50% for home service clients by fixing targeting, bid strategy, and landing pages. What platforms are you using?",
                quickReplies: [
                    { text: "Google Ads", next: 'platform_google' },
                    { text: "Meta Ads", next: 'platform_meta' },
                    { text: "Both", next: 'platform_both' }
                ]
            },

            home_tracking: {
                message: "Broken tracking means you're flying blind. We set up proper conversion tracking, call tracking, and attribution so you know exactly what's working. What platforms are you on?",
                quickReplies: [
                    { text: "Google Ads", next: 'platform_google' },
                    { text: "Meta Ads", next: 'platform_meta' },
                    { text: "Both", next: 'platform_both' }
                ]
            },

            // ============================================
            // PLATFORM RESPONSES
            // ============================================
            platform_google: {
                message: "Google is powerful for capturing intent. We've driven results like 636% more bookings and 110% revenue growth for clients through strategic Search and Performance Max campaigns.",
                quickReplies: [
                    { text: "Show me case studies", next: 'show_results' },
                    { text: "What makes you different?", next: 'differentiator' },
                    { text: "I'd like to chat", next: 'qualify_name' }
                ]
            },

            platform_meta: {
                message: "Meta is all about creative and audience strategy right now. We've helped brands see 230% more leads and 54% sales increases through systematic testing and full-funnel campaigns.",
                quickReplies: [
                    { text: "Show me case studies", next: 'show_results' },
                    { text: "What makes you different?", next: 'differentiator' },
                    { text: "I'd like to chat", next: 'qualify_name' }
                ]
            },

            platform_both: {
                message: "Smart move. Multi-channel is the way to go. We manage both together with a unified strategy, not siloed. That's how we've driven 211% revenue increases and 47% growth for DTC brands.",
                quickReplies: [
                    { text: "Show me case studies", next: 'show_results' },
                    { text: "What makes you different?", next: 'differentiator' },
                    { text: "I'd like to chat", next: 'qualify_name' }
                ]
            },

            // ============================================
            // PAIN POINTS (GENERAL)
            // ============================================
            pain_general: {
                message: "What's the main issue you're seeing?",
                quickReplies: [
                    { text: "ROAS/MER declining", next: 'ecom_mer' },
                    { text: "Cost per lead too high", next: 'home_cpl' },
                    { text: "Can't scale profitably", next: 'cant_scale' },
                    { text: "Results are inconsistent", next: 'home_inconsistent' }
                ]
            },

            cant_scale: {
                message: "The 'can't scale' wall is really common. Usually means you've maxed out the low-hanging fruit and need smarter audience expansion plus creative diversification. We specialize in breaking through these plateaus.",
                quickReplies: [
                    { text: "How do you do it?", next: 'differentiator' },
                    { text: "Show me results", next: 'show_results' },
                    { text: "Let's talk", next: 'qualify_name' }
                ]
            },

            // ============================================
            // NEW AGENCY PATH
            // ============================================
            new_agency: {
                message: "Looking to switch? What's not working with your current setup?",
                quickReplies: [
                    { text: "Not seeing results", next: 'pain_general' },
                    { text: "Poor communication", next: 'poor_communication' },
                    { text: "Feel like just a number", next: 'just_a_number' }
                ]
            },

            poor_communication: {
                message: "That's a red flag. We do weekly reporting and regular calls. No black boxes. Our founder is directly involved in every account. Transparency is non-negotiable for us.",
                quickReplies: [
                    { text: "Tell me more", next: 'differentiator' },
                    { text: "I'd like to chat", next: 'qualify_name' }
                ]
            },

            just_a_number: {
                message: "Big agencies do that all the time. We're boutique by design. Senior-led, no junior handoffs. You work with experts who actually touch your account daily.",
                quickReplies: [
                    { text: "What results have you gotten?", next: 'show_results' },
                    { text: "I'd like to chat", next: 'qualify_name' }
                ]
            },

            // ============================================
            // DIFFERENTIATOR
            // ============================================
            differentiator: {
                message: "Three things make us different:\n\n<strong>1. Senior-led</strong> - No junior handoffs. Experts run your account.\n\n<strong>2. Custom systems</strong> - No cookie-cutter playbooks. Strategy built for your business.\n\n<strong>3. Real outcomes</strong> - We focus on revenue and profit, not vanity metrics.",
                quickReplies: [
                    { text: "Show me results", next: 'show_results' },
                    { text: "I'd like to talk", next: 'qualify_name' }
                ]
            },

            // ============================================
            // RESULTS / CASE STUDIES
            // ============================================
            show_results: {
                message: "Here's a snapshot of recent wins:\n\n• <strong>E-commerce brand:</strong> 211% revenue increase, 185% ROAS improvement\n• <strong>Home services:</strong> 230% more leads, 32% lower CPL\n• <strong>Healthcare:</strong> 636% more bookings, 16% lower CPA\n\n<a href='case-studies.pdf' target='_blank' class='cta-btn'>Download Full Case Studies</a>",
                quickReplies: [
                    { text: "Impressive! Let's talk", next: 'qualify_name' },
                    { text: "What makes you different?", next: 'differentiator' }
                ]
            },

            // ============================================
            // OBJECTION HANDLING
            // ============================================
            burned_before: {
                message: "I hear that a lot honestly. Most agencies over-promise and under-deliver. We're different. No long contracts, full transparency, and our founder is in your account weekly. We only win if you win.",
                quickReplies: [
                    { text: "What results have you gotten?", next: 'show_results' },
                    { text: "I'm open to a conversation", next: 'qualify_name' }
                ]
            },

            dont_trust_agencies: {
                message: "Trust is earned, not given. That's why we offer full transparency. You see everything we do, every week. No black boxes. And you can leave anytime if it's not working.",
                quickReplies: [
                    { text: "Show me your results", next: 'show_results' },
                    { text: "Let's have a conversation", next: 'qualify_name' }
                ]
            },

            want_to_wait: {
                message: "Totally understand. When you're ready, we'll be here. Want me to send you our case studies so you have them when the time is right?",
                quickReplies: [
                    { text: "Yes, send them over", next: 'qualify_email_only' },
                    { text: "Actually, let's talk now", next: 'qualify_name' }
                ]
            },

            not_ready: {
                message: "No pressure at all. Want me to send you some case studies to review when you're ready?",
                quickReplies: [
                    { text: "Yes please", next: 'qualify_email_only' },
                    { text: "No thanks", next: 'farewell' }
                ]
            },

            // ============================================
            // LEAD QUALIFICATION
            // ============================================
            qualify_name: {
                message: "Great! What's your name?",
                quickReplies: [],
                freeInput: true,
                captureField: 'name',
                next: 'qualify_email'
            },

            qualify_email: {
                message: (data) => `Nice to meet you${data.name ? ', ' + data.name : ''}! What's the best email to reach you?`,
                quickReplies: [],
                freeInput: true,
                captureField: 'email',
                next: 'qualify_phone'
            },

            qualify_phone: {
                message: "And your phone number? Helps us reach you faster.",
                quickReplies: [
                    { text: "Skip", next: 'qualify_complete' }
                ],
                freeInput: true,
                captureField: 'phone',
                next: 'qualify_complete'
            },

            qualify_email_only: {
                message: "What's your email? I'll send the case studies right over.",
                quickReplies: [],
                freeInput: true,
                captureField: 'email',
                next: 'farewell_resources'
            },

            qualify_complete: {
                message: (data) => `Perfect${data.name ? ', ' + data.name : ''}! Someone from our team will reach out within 24 hours.\n\nWant to skip the wait? You can book directly with me here:`,
                quickReplies: [
                    { text: "Book a call now", next: 'book_call' },
                    { text: "I'll wait for the outreach", next: 'farewell_qualified' }
                ]
            },

            book_call: {
                message: "Here's the link to book a free strategy call:\n\n<a href='https://thesnowmedia.com/book' target='_blank' class='cta-btn'>Book Your Call</a>\n\nWe'll review your current setup and identify quick wins. No pitch, just value.",
                quickReplies: [
                    { text: "Thanks!", next: 'farewell_booked' }
                ]
            },

            // ============================================
            // FAREWELLS
            // ============================================
            farewell: {
                message: "No worries! If you ever need help scaling with paid ads, you know where to find us. Take care!",
                quickReplies: [
                    { text: "Actually, I have a question", next: 'initial' }
                ],
                isEnding: true
            },

            farewell_resources: {
                message: "Done! Check your inbox for the case studies. When you're ready to chat, just reply to that email or come back here. Talk soon!",
                quickReplies: [
                    { text: "Actually, let's book a call", next: 'book_call' }
                ],
                isEnding: true
            },

            farewell_qualified: {
                message: "Sounds good! We'll be in touch soon. In the meantime, feel free to check out our case studies:\n\n<a href='case-studies.pdf' target='_blank' class='cta-btn'>View Case Studies</a>",
                quickReplies: [
                    { text: "I have another question", next: 'initial' }
                ],
                isEnding: true
            },

            farewell_booked: {
                message: "Looking forward to it! Check your email for confirmation. Talk soon!",
                quickReplies: [
                    { text: "I have a question", next: 'initial' }
                ],
                isEnding: true
            },

            // ============================================
            // FALLBACK
            // ============================================
            fallback: {
                message: "Thanks for sharing! Let me connect you with our team for a more personalized conversation.",
                quickReplies: [
                    { text: "Sure, let's connect", next: 'qualify_name' },
                    { text: "Show me results first", next: 'show_results' }
                ]
            }
        };
    }

    bindEvents() {
        this.chatToggle.addEventListener('click', () => this.toggleChat());
        this.minimizeBtn.addEventListener('click', () => this.toggleChat());
        this.sendBtn.addEventListener('click', () => this.handleUserInput());
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleUserInput();
        });
    }

    autoOpen() {
        setTimeout(() => {
            if (!this.isOpen) {
                this.toggleChat();
            }
        }, 3000);
    }

    toggleChat() {
        this.isOpen = !this.isOpen;
        this.chatContainer.classList.toggle('hidden', !this.isOpen);
        this.chatIcon.classList.toggle('hidden', this.isOpen);
        this.closeIcon.classList.toggle('hidden', !this.isOpen);
        this.notificationBadge.classList.add('hidden');

        if (this.isOpen && this.messageHistory.length === 0) {
            this.startConversation();
        }
    }

    startConversation() {
        this.processFlow('initial');
    }

    async processFlow(flowId) {
        const flow = this.flows[flowId] || this.flows.fallback;
        this.conversationState = flowId;

        let message = typeof flow.message === 'function'
            ? flow.message(this.leadData)
            : flow.message;

        this.showTypingIndicator();
        await this.delay(800 + Math.random() * 600);
        this.hideTypingIndicator();
        this.addMessage(message, 'bot');
        this.showQuickReplies(flow.quickReplies || []);
    }

    handleUserInput() {
        const input = this.chatInput.value.trim();
        if (!input) return;

        this.chatInput.value = '';
        this.addMessage(input, 'user');
        this.clearQuickReplies();

        const currentFlow = this.flows[this.conversationState];

        if (currentFlow && currentFlow.captureField) {
            this.leadData[currentFlow.captureField] = input;

            if (currentFlow.captureField === 'email' && !this.isValidEmail(input)) {
                this.addMessage("Hmm, that doesn't look like a valid email. Can you try again?", 'bot');
                return;
            }

            if (currentFlow.captureField === 'phone') {
                this.leadData.phone = input.replace(/[^\d+\-\s()]/g, '');
            }

            if (currentFlow.next) {
                setTimeout(() => this.processFlow(currentFlow.next), 500);
            }
        } else if (currentFlow && currentFlow.freeInput) {
            this.leadData.additionalInfo = (this.leadData.additionalInfo || '') + ' ' + input;
            const detectedFlow = this.detectIntent(input);
            setTimeout(() => this.processFlow(detectedFlow || currentFlow.next || 'qualify_name'), 500);
        } else {
            const detectedFlow = this.detectIntent(input);
            setTimeout(() => this.processFlow(detectedFlow || 'fallback'), 500);
        }

        console.log('Lead Data:', this.leadData);
        this.dispatchLeadEvent();
    }

    handleQuickReply(reply) {
        this.addMessage(reply.text, 'user');
        this.clearQuickReplies();
        setTimeout(() => this.processFlow(reply.next), 500);
    }

    detectIntent(text) {
        const lowText = text.toLowerCase();

        // Objection detection
        if (lowText.includes('burned') || lowText.includes('bad experience')) {
            return 'burned_before';
        }
        if (lowText.includes('don\'t trust') || lowText.includes('dont trust') || lowText.includes('trust')) {
            return 'dont_trust_agencies';
        }
        if (lowText.includes('wait') || lowText.includes('not ready') || lowText.includes('later')) {
            return 'want_to_wait';
        }

        // Intent patterns
        const patterns = {
            'ecommerce_intro': ['ecommerce', 'e-commerce', 'dtc', 'shopify', 'online store', 'brand'],
            'homeservice_intro': ['home service', 'plumber', 'hvac', 'roofing', 'contractor', 'local'],
            'show_results': ['results', 'case study', 'case studies', 'examples', 'proof', 'portfolio'],
            'differentiator': ['different', 'why you', 'special', 'unique'],
            'qualify_name': ['interested', 'talk', 'chat', 'call', 'contact', 'connect'],
            'platform_google': ['google', 'search ads', 'ppc', 'adwords'],
            'platform_meta': ['facebook', 'instagram', 'meta', 'social'],
            'ecom_mer': ['mer', 'roas', 'return'],
            'home_cpl': ['cpl', 'cost per lead', 'expensive leads'],
        };

        for (const [flowId, keywords] of Object.entries(patterns)) {
            if (keywords.some(kw => lowText.includes(kw))) {
                return flowId;
            }
        }

        return null;
    }

    addMessage(text, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        // Escape HTML for user messages to prevent XSS, bot messages are trusted
        contentDiv.innerHTML = sender === 'user' ? this.escapeHtml(text) : text;

        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = this.getTimeString();

        messageDiv.appendChild(contentDiv);
        messageDiv.appendChild(timeDiv);

        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();

        this.messageHistory.push({ text, sender, time: new Date() });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showQuickReplies(replies) {
        this.quickReplies.innerHTML = '';

        replies.forEach(reply => {
            const button = document.createElement('button');
            button.className = 'quick-reply-btn';
            button.textContent = reply.text;
            button.addEventListener('click', () => this.handleQuickReply(reply));
            this.quickReplies.appendChild(button);
        });
    }

    clearQuickReplies() {
        this.quickReplies.innerHTML = '';
    }

    showTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'message bot';
        indicator.id = 'typing-indicator';
        indicator.innerHTML = `
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;
        this.chatMessages.appendChild(indicator);
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.remove();
    }

    scrollToBottom() {
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    getTimeString() {
        return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    dispatchLeadEvent() {
        window.dispatchEvent(new CustomEvent('snowchat:leadupdate', {
            detail: { leadData: this.leadData }
        }));
    }

    exportLeadData() {
        return {
            ...this.leadData,
            conversationHistory: this.messageHistory,
            timestamp: new Date().toISOString(),
            source: 'chat_widget'
        };
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.snowMediaChat = new SnowMediaChatAgent();
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SnowMediaChatAgent;
}
