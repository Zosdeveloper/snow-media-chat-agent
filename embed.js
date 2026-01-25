/**
 * The Snow Media - Embeddable Chat Widget
 * Add this script to any website to enable the sales chat agent
 *
 * Usage:
 * <script src="https://yourdomain.com/snow-chat/embed.js" data-api-key="your-key"></script>
 */

(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        widgetId: 'snow-media-chat-widget',
        cssUrl: null, // Set to external URL in production
        apiEndpoint: null, // Set to your backend API endpoint
    };

    // Inject CSS
    function injectStyles() {
        const style = document.createElement('style');
        style.id = 'snow-media-chat-styles';
        style.textContent = `
            /* CSS Variables */
            :root {
                --sm-primary: #2563eb;
                --sm-primary-dark: #1d4ed8;
                --sm-success: #10b981;
                --sm-bg-light: #f8fafc;
                --sm-text-primary: #1e293b;
                --sm-text-secondary: #64748b;
                --sm-border: #e2e8f0;
                --sm-radius: 12px;
                --sm-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
            }

            #${CONFIG.widgetId} {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 999999;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }

            #${CONFIG.widgetId} * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }

            .sm-toggle {
                width: 60px;
                height: 60px;
                border-radius: 50%;
                background: linear-gradient(135deg, var(--sm-primary) 0%, var(--sm-primary-dark) 100%);
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: var(--sm-shadow);
                transition: transform 0.3s ease;
                position: relative;
            }

            .sm-toggle:hover {
                transform: scale(1.05);
            }

            .sm-toggle svg {
                width: 28px;
                height: 28px;
                color: white;
            }

            .sm-badge {
                position: absolute;
                top: -5px;
                right: -5px;
                background: #ef4444;
                color: white;
                font-size: 12px;
                font-weight: 600;
                width: 22px;
                height: 22px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 2px solid white;
            }

            .sm-badge.hidden { display: none; }

            .sm-container {
                position: absolute;
                bottom: 80px;
                right: 0;
                width: 380px;
                height: 550px;
                background: white;
                border-radius: var(--sm-radius);
                box-shadow: var(--sm-shadow);
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }

            .sm-container.hidden { display: none; }

            .sm-header {
                background: linear-gradient(135deg, var(--sm-primary) 0%, var(--sm-primary-dark) 100%);
                color: white;
                padding: 16px 20px;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }

            .sm-header-info {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .sm-avatar {
                width: 44px;
                height: 44px;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 700;
                font-size: 18px;
            }

            .sm-header-text h3 {
                font-size: 16px;
                font-weight: 600;
                margin-bottom: 2px;
            }

            .sm-status {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 12px;
                opacity: 0.9;
            }

            .sm-status-dot {
                width: 8px;
                height: 8px;
                background: var(--sm-success);
                border-radius: 50%;
            }

            .sm-minimize {
                background: rgba(255, 255, 255, 0.2);
                border: none;
                border-radius: 8px;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
            }

            .sm-minimize svg {
                width: 18px;
                height: 18px;
                color: white;
            }

            .sm-messages {
                flex: 1;
                overflow-y: auto;
                padding: 20px;
                display: flex;
                flex-direction: column;
                gap: 16px;
                background: var(--sm-bg-light);
            }

            .sm-message {
                display: flex;
                flex-direction: column;
                max-width: 85%;
            }

            .sm-message.bot { align-self: flex-start; }
            .sm-message.user { align-self: flex-end; }

            .sm-message-content {
                padding: 12px 16px;
                border-radius: var(--sm-radius);
                font-size: 14px;
                line-height: 1.5;
            }

            .sm-message.bot .sm-message-content {
                background: white;
                color: var(--sm-text-primary);
                border: 1px solid var(--sm-border);
                border-bottom-left-radius: 4px;
            }

            .sm-message.user .sm-message-content {
                background: linear-gradient(135deg, var(--sm-primary) 0%, var(--sm-primary-dark) 100%);
                color: white;
                border-bottom-right-radius: 4px;
            }

            .sm-message-time {
                font-size: 11px;
                color: var(--sm-text-secondary);
                margin-top: 4px;
                padding: 0 4px;
            }

            .sm-message.user .sm-message-time { text-align: right; }

            .sm-typing {
                display: flex;
                gap: 4px;
                padding: 12px 16px;
                background: white;
                border: 1px solid var(--sm-border);
                border-radius: var(--sm-radius);
                border-bottom-left-radius: 4px;
                width: fit-content;
            }

            .sm-typing span {
                width: 8px;
                height: 8px;
                background: var(--sm-text-secondary);
                border-radius: 50%;
                animation: smTyping 1.4s infinite ease-in-out;
            }

            .sm-typing span:nth-child(2) { animation-delay: 0.2s; }
            .sm-typing span:nth-child(3) { animation-delay: 0.4s; }

            @keyframes smTyping {
                0%, 60%, 100% { transform: translateY(0); }
                30% { transform: translateY(-6px); }
            }

            .sm-quick-replies {
                padding: 0 20px 16px;
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                background: var(--sm-bg-light);
            }

            .sm-quick-replies:empty { display: none; }

            .sm-quick-btn {
                padding: 10px 16px;
                background: white;
                border: 1px solid var(--sm-primary);
                border-radius: 9999px;
                color: var(--sm-primary);
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .sm-quick-btn:hover {
                background: var(--sm-primary);
                color: white;
            }

            .sm-input-container {
                padding: 16px 20px;
                background: white;
                border-top: 1px solid var(--sm-border);
                display: flex;
                gap: 12px;
                align-items: center;
            }

            .sm-input {
                flex: 1;
                padding: 12px 16px;
                border: 1px solid var(--sm-border);
                border-radius: 9999px;
                font-size: 14px;
                outline: none;
            }

            .sm-input:focus { border-color: var(--sm-primary); }

            .sm-send {
                width: 44px;
                height: 44px;
                background: linear-gradient(135deg, var(--sm-primary) 0%, var(--sm-primary-dark) 100%);
                border: none;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
            }

            .sm-send svg {
                width: 20px;
                height: 20px;
                color: white;
            }

            .sm-message-content a {
                color: var(--sm-primary);
                text-decoration: underline;
            }

            .sm-message.user .sm-message-content a { color: white; }

            .sm-message-content strong { font-weight: 600; }

            @media (max-width: 480px) {
                #${CONFIG.widgetId} {
                    bottom: 16px;
                    right: 16px;
                }
                .sm-container {
                    width: calc(100vw - 32px);
                    height: calc(100vh - 120px);
                    max-height: 550px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Create widget HTML
    function createWidget() {
        const widget = document.createElement('div');
        widget.id = CONFIG.widgetId;
        widget.innerHTML = `
            <button class="sm-toggle" aria-label="Open chat">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <span class="sm-badge">1</span>
            </button>
            <div class="sm-container hidden">
                <div class="sm-header">
                    <div class="sm-header-info">
                        <div class="sm-avatar">S</div>
                        <div class="sm-header-text">
                            <h3>The Snow Media</h3>
                            <span class="sm-status">
                                <span class="sm-status-dot"></span>
                                Online now
                            </span>
                        </div>
                    </div>
                    <button class="sm-minimize" aria-label="Minimize">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </button>
                </div>
                <div class="sm-messages"></div>
                <div class="sm-quick-replies"></div>
                <div class="sm-input-container">
                    <input type="text" class="sm-input" placeholder="Type your message..." autocomplete="off">
                    <button class="sm-send" aria-label="Send">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(widget);
        return widget;
    }

    // Mini chat agent (simplified version for embed)
    class EmbedChatAgent {
        constructor(widget) {
            this.widget = widget;
            this.toggle = widget.querySelector('.sm-toggle');
            this.container = widget.querySelector('.sm-container');
            this.messages = widget.querySelector('.sm-messages');
            this.quickReplies = widget.querySelector('.sm-quick-replies');
            this.input = widget.querySelector('.sm-input');
            this.sendBtn = widget.querySelector('.sm-send');
            this.minimizeBtn = widget.querySelector('.sm-minimize');
            this.badge = widget.querySelector('.sm-badge');

            this.isOpen = false;
            this.state = 'initial';
            this.leadData = {};
            this.flows = this.getFlows();

            this.bindEvents();
            this.autoOpen();
        }

        getFlows() {
            return {
                initial: {
                    message: "Hey there! Welcome to The Snow Media. I'm here to help you grow your business with high-performance paid advertising. What brings you here today?",
                    replies: [
                        { text: "I need help with ads", next: 'ads_interest' },
                        { text: "I want to scale", next: 'scale_interest' },
                        { text: "Just browsing", next: 'browsing' }
                    ]
                },
                ads_interest: {
                    message: "Great! We specialize in Google & Meta Ads. Are you currently running any paid campaigns?",
                    replies: [
                        { text: "Yes, need better results", next: 'improve' },
                        { text: "No, starting fresh", next: 'new_start' }
                    ]
                },
                scale_interest: {
                    message: "Love that energy! We've helped many businesses scale profitably. What's your current monthly revenue range?",
                    replies: [
                        { text: "Under $50K/month", next: 'revenue_low' },
                        { text: "$50K+/month", next: 'revenue_high' }
                    ]
                },
                browsing: {
                    message: "No problem! We're a boutique PPC studio that's helped generate millions in revenue for our clients. Anything specific you'd like to know?",
                    replies: [
                        { text: "Tell me more", next: 'services' },
                        { text: "See results", next: 'results' }
                    ]
                },
                improve: {
                    message: "We've helped many businesses turn around underperforming campaigns. Our typical clients see 30-50% improvement in ROI. Ready to chat with our team?",
                    replies: [
                        { text: "Yes, let's talk", next: 'get_contact' },
                        { text: "Tell me more first", next: 'services' }
                    ]
                },
                new_start: {
                    message: "Perfect timing! We'll set you up for success from day one. What type of business do you have?",
                    replies: [
                        { text: "E-commerce", next: 'get_contact' },
                        { text: "Services", next: 'get_contact' },
                        { text: "Other", next: 'get_contact' }
                    ]
                },
                revenue_low: {
                    message: "Great foundation! We love helping businesses at this stage break through to the next level. Let's discuss your growth goals.",
                    replies: [
                        { text: "Book a call", next: 'get_contact' }
                    ]
                },
                revenue_high: {
                    message: "Impressive! At your level, even small optimizations mean big money. Our founder works directly with accounts like yours.",
                    replies: [
                        { text: "Schedule a call", next: 'get_contact' }
                    ]
                },
                services: {
                    message: "We offer:<br><br><strong>Google Ads</strong> - Search, Shopping, Display<br><strong>Meta Ads</strong> - Facebook & Instagram<br><strong>CRO</strong> - Conversion optimization<br><strong>Local SEO</strong> - Dominate local search<br><br>Want to discuss which is right for you?",
                    replies: [
                        { text: "Yes please", next: 'get_contact' },
                        { text: "What's pricing?", next: 'pricing' }
                    ]
                },
                results: {
                    message: "Our track record:<br><br>- E-commerce: 4.2x ROAS<br>- Local business: 340% more leads<br>- SaaS: 67% lower CAC<br><br>Want to be our next success story?",
                    replies: [
                        { text: "Yes!", next: 'get_contact' }
                    ]
                },
                pricing: {
                    message: "Pricing depends on your needs, but most clients invest $1,500-$5,000/month. The best way to get a custom quote is to chat with us.",
                    replies: [
                        { text: "Get a quote", next: 'get_contact' }
                    ]
                },
                get_contact: {
                    message: "Awesome! What's your name?",
                    replies: [],
                    capture: 'name',
                    next: 'get_email'
                },
                get_email: {
                    message: (d) => `Nice to meet you${d.name ? ', ' + d.name : ''}! What's the best email to reach you?`,
                    replies: [],
                    capture: 'email',
                    next: 'complete'
                },
                complete: {
                    message: (d) => `Perfect! We'll reach out within 24 hours.<br><br>Or book a call directly:<br><a href="https://thesnowmedia.com" target="_blank" style="display:inline-block;margin-top:10px;padding:10px 20px;background:#2563eb;color:white;border-radius:8px;text-decoration:none;">Book Your Free Call</a>`,
                    replies: [
                        { text: "Thanks!", next: 'farewell' }
                    ]
                },
                farewell: {
                    message: "Looking forward to helping you grow! Talk soon.",
                    replies: [
                        { text: "I have a question", next: 'initial' }
                    ]
                }
            };
        }

        bindEvents() {
            this.toggle.onclick = () => this.toggleChat();
            this.minimizeBtn.onclick = () => this.toggleChat();
            this.sendBtn.onclick = () => this.handleInput();
            this.input.onkeypress = (e) => { if (e.key === 'Enter') this.handleInput(); };
        }

        autoOpen() {
            setTimeout(() => { if (!this.isOpen) this.toggleChat(); }, 3000);
        }

        toggleChat() {
            this.isOpen = !this.isOpen;
            this.container.classList.toggle('hidden', !this.isOpen);
            this.badge.classList.add('hidden');
            if (this.isOpen && !this.messages.children.length) this.processFlow('initial');
        }

        async processFlow(id) {
            const flow = this.flows[id];
            if (!flow) return;
            this.state = id;

            let msg = typeof flow.message === 'function' ? flow.message(this.leadData) : flow.message;

            this.showTyping();
            await this.delay(1000);
            this.hideTyping();
            this.addMessage(msg, 'bot');
            this.showReplies(flow.replies || []);
        }

        handleInput() {
            const text = this.input.value.trim();
            if (!text) return;
            this.input.value = '';
            this.addMessage(text, 'user');
            this.quickReplies.innerHTML = '';

            const flow = this.flows[this.state];
            if (flow && flow.capture) {
                this.leadData[flow.capture] = text;
                if (flow.capture === 'email' && !this.isValidEmail(text)) {
                    this.addMessage("That doesn't look like a valid email. Could you try again?", 'bot');
                    return;
                }
                this.sendLeadData();
                if (flow.next) setTimeout(() => this.processFlow(flow.next), 500);
            } else {
                setTimeout(() => this.processFlow('get_contact'), 500);
            }
        }

        handleReply(reply) {
            this.addMessage(reply.text, 'user');
            this.quickReplies.innerHTML = '';
            setTimeout(() => this.processFlow(reply.next), 500);
        }

        addMessage(text, sender) {
            const div = document.createElement('div');
            div.className = `sm-message ${sender}`;
            // Escape user input to prevent XSS, bot messages are trusted
            const safeText = sender === 'user' ? this.escapeHtml(text) : text;
            div.innerHTML = `
                <div class="sm-message-content">${safeText}</div>
                <div class="sm-message-time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</div>
            `;
            this.messages.appendChild(div);
            this.messages.scrollTop = this.messages.scrollHeight;
        }

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        showReplies(replies) {
            this.quickReplies.innerHTML = '';
            replies.forEach(r => {
                const btn = document.createElement('button');
                btn.className = 'sm-quick-btn';
                btn.textContent = r.text;
                btn.onclick = () => this.handleReply(r);
                this.quickReplies.appendChild(btn);
            });
        }

        showTyping() {
            const div = document.createElement('div');
            div.className = 'sm-message bot';
            div.id = 'sm-typing';
            div.innerHTML = '<div class="sm-typing"><span></span><span></span><span></span></div>';
            this.messages.appendChild(div);
            this.messages.scrollTop = this.messages.scrollHeight;
        }

        hideTyping() {
            const el = document.getElementById('sm-typing');
            if (el) el.remove();
        }

        isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
        delay(ms) { return new Promise(r => setTimeout(r, ms)); }

        sendLeadData() {
            console.log('Lead captured:', this.leadData);
            // In production, send to your backend:
            // fetch(CONFIG.apiEndpoint, { method: 'POST', body: JSON.stringify(this.leadData) });
        }
    }

    // Initialize
    function init() {
        if (document.getElementById(CONFIG.widgetId)) return;
        injectStyles();
        const widget = createWidget();
        window.SnowMediaChat = new EmbedChatAgent(widget);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
