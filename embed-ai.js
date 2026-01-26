/**
 * The Snow Media - AI-Powered Embeddable Chat Widget
 * Uses Claude API for intelligent conversations
 *
 * Usage:
 * <script
 *   src="https://yourdomain.com/snow-chat/embed-ai.js"
 *   data-api-url="https://your-backend.com/api/chat"
 * ></script>
 */

(function() {
    'use strict';

    // Get configuration from script tag
    const scriptTag = document.currentScript;
    const CONFIG = {
        widgetId: 'snow-media-ai-chat',
        apiUrl: scriptTag?.getAttribute('data-api-url') || 'http://localhost:3000/api/chat',
        leadsUrl: scriptTag?.getAttribute('data-leads-url') || 'http://localhost:3000/api/leads',
        calendlyUrl: scriptTag?.getAttribute('data-calendly-url') || 'https://calendly.com/milos-thesnowmedia/30min',
        autoOpen: scriptTag?.getAttribute('data-auto-open') !== 'false',
        autoOpenDelay: parseInt(scriptTag?.getAttribute('data-delay')) || 3000,
        primaryColor: scriptTag?.getAttribute('data-color') || '#2563eb',
        companyName: scriptTag?.getAttribute('data-company') || 'The Snow Media'
    };

    // Inject CSS
    function injectStyles() {
        const primaryColor = CONFIG.primaryColor;
        const primaryDark = adjustColor(primaryColor, -20);

        const style = document.createElement('style');
        style.id = 'snow-ai-chat-styles';
        style.textContent = `
            #${CONFIG.widgetId} {
                --sm-primary: ${primaryColor};
                --sm-primary-dark: ${primaryDark};
                --sm-success: #10b981;
                --sm-bg-light: #f8fafc;
                --sm-text-primary: #1e293b;
                --sm-text-secondary: #64748b;
                --sm-border: #e2e8f0;
                --sm-radius: 12px;
                --sm-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);

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

            .sm-ai-toggle {
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

            .sm-ai-toggle:hover { transform: scale(1.05); }
            .sm-ai-toggle svg { width: 28px; height: 28px; color: white; }

            .sm-ai-badge {
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
                animation: smPulse 2s infinite;
            }

            @keyframes smPulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.1); }
            }

            .sm-ai-badge.hidden { display: none; }

            .sm-ai-container {
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
                animation: smSlideUp 0.3s ease;
            }

            @keyframes smSlideUp {
                from { opacity: 0; transform: translateY(20px) scale(0.95); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }

            .sm-ai-container.hidden { display: none; }

            .sm-ai-header {
                background: linear-gradient(135deg, var(--sm-primary) 0%, var(--sm-primary-dark) 100%);
                color: white;
                padding: 16px 20px;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }

            .sm-ai-header-info {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .sm-ai-avatar {
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

            .sm-ai-header-text h3 {
                font-size: 16px;
                font-weight: 600;
                margin-bottom: 2px;
            }

            .sm-ai-status {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 12px;
                opacity: 0.9;
            }

            .sm-ai-status-dot {
                width: 8px;
                height: 8px;
                background: var(--sm-success);
                border-radius: 50%;
                animation: smBlink 2s infinite;
            }

            @keyframes smBlink {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }

            .sm-ai-minimize {
                background: rgba(255, 255, 255, 0.2);
                border: none;
                border-radius: 8px;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: background 0.2s;
            }

            .sm-ai-minimize:hover { background: rgba(255, 255, 255, 0.3); }
            .sm-ai-minimize svg { width: 18px; height: 18px; color: white; }

            .sm-ai-messages {
                flex: 1;
                overflow-y: auto;
                padding: 20px;
                display: flex;
                flex-direction: column;
                gap: 16px;
                background: var(--sm-bg-light);
            }

            .sm-ai-messages::-webkit-scrollbar { width: 6px; }
            .sm-ai-messages::-webkit-scrollbar-track { background: transparent; }
            .sm-ai-messages::-webkit-scrollbar-thumb { background: var(--sm-border); border-radius: 3px; }

            .sm-ai-message {
                display: flex;
                flex-direction: column;
                max-width: 85%;
                animation: smFadeIn 0.3s ease;
            }

            @keyframes smFadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }

            .sm-ai-message.bot { align-self: flex-start; }
            .sm-ai-message.user { align-self: flex-end; }

            .sm-ai-message-content {
                padding: 12px 16px;
                border-radius: var(--sm-radius);
                font-size: 14px;
                line-height: 1.5;
            }

            .sm-ai-message.bot .sm-ai-message-content {
                background: white;
                color: var(--sm-text-primary);
                border: 1px solid var(--sm-border);
                border-bottom-left-radius: 4px;
            }

            .sm-ai-message.user .sm-ai-message-content {
                background: linear-gradient(135deg, var(--sm-primary) 0%, var(--sm-primary-dark) 100%);
                color: white;
                border-bottom-right-radius: 4px;
            }

            .sm-ai-message-time {
                font-size: 11px;
                color: var(--sm-text-secondary);
                margin-top: 4px;
                padding: 0 4px;
            }

            .sm-ai-message.user .sm-ai-message-time { text-align: right; }

            .sm-ai-typing {
                display: flex;
                gap: 4px;
                padding: 12px 16px;
                background: white;
                border: 1px solid var(--sm-border);
                border-radius: var(--sm-radius);
                border-bottom-left-radius: 4px;
                width: fit-content;
            }

            .sm-ai-typing span {
                width: 8px;
                height: 8px;
                background: var(--sm-text-secondary);
                border-radius: 50%;
                animation: smTyping 1.4s infinite ease-in-out;
            }

            .sm-ai-typing span:nth-child(2) { animation-delay: 0.2s; }
            .sm-ai-typing span:nth-child(3) { animation-delay: 0.4s; }

            @keyframes smTyping {
                0%, 60%, 100% { transform: translateY(0); }
                30% { transform: translateY(-6px); }
            }

            .sm-ai-quick-replies {
                padding: 0 20px 16px;
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                background: var(--sm-bg-light);
            }

            .sm-ai-quick-replies:empty { display: none; }

            .sm-ai-quick-btn {
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

            .sm-ai-quick-btn:hover {
                background: var(--sm-primary);
                color: white;
            }

            .sm-ai-quick-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .sm-ai-book-btn {
                display: inline-block;
                margin-top: 10px;
                padding: 12px 24px;
                background: linear-gradient(135deg, var(--sm-success) 0%, #059669 100%);
                border: none;
                border-radius: 9999px;
                color: white;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }

            .sm-ai-book-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 10px rgba(0, 0, 0, 0.15);
            }

            .sm-ai-input-container {
                padding: 16px 20px;
                background: white;
                border-top: 1px solid var(--sm-border);
                display: flex;
                align-items: center;
                position: relative;
            }

            .sm-ai-input {
                flex: 1;
                padding: 12px 52px 12px 16px;
                border: 1px solid var(--sm-border);
                border-radius: 9999px;
                font-size: 14px;
                outline: none;
                transition: border-color 0.2s;
            }

            .sm-ai-input:focus { border-color: var(--sm-primary); }
            .sm-ai-input::placeholder { color: var(--sm-text-secondary); }

            .sm-ai-send {
                width: 36px;
                height: 36px;
                background: linear-gradient(135deg, var(--sm-primary) 0%, var(--sm-primary-dark) 100%);
                border: none;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s ease;
                position: absolute;
                right: 24px;
            }

            .sm-ai-send:hover { transform: scale(1.05); }
            .sm-ai-send:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
            .sm-ai-send svg { width: 18px; height: 18px; color: white; }

            .sm-ai-message-content a {
                color: var(--sm-primary);
                text-decoration: underline;
            }

            .sm-ai-message.user .sm-ai-message-content a { color: white; }
            .sm-ai-message-content strong { font-weight: 600; }

            .sm-ai-powered {
                text-align: center;
                padding: 8px;
                background: var(--sm-bg-light);
                font-size: 11px;
                color: var(--sm-text-secondary);
            }

            .sm-ai-powered a {
                color: var(--sm-primary);
                text-decoration: none;
            }

            @media (max-width: 480px) {
                #${CONFIG.widgetId} {
                    bottom: 16px;
                    right: 16px;
                }
                .sm-ai-container {
                    width: calc(100vw - 32px);
                    height: calc(100vh - 120px);
                    max-height: 550px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Helper to darken/lighten colors
    function adjustColor(color, amount) {
        const hex = color.replace('#', '');
        const num = parseInt(hex, 16);
        const r = Math.min(255, Math.max(0, (num >> 16) + amount));
        const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
        const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
        return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
    }

    // Create widget HTML
    function createWidget() {
        const widget = document.createElement('div');
        widget.id = CONFIG.widgetId;
        widget.innerHTML = `
            <button class="sm-ai-toggle" aria-label="Open chat">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <span class="sm-ai-badge">1</span>
            </button>
            <div class="sm-ai-container hidden">
                <div class="sm-ai-header">
                    <div class="sm-ai-header-info">
                        <div class="sm-ai-avatar">${CONFIG.companyName.charAt(0)}</div>
                        <div class="sm-ai-header-text">
                            <h3>${CONFIG.companyName}</h3>
                            <span class="sm-ai-status">
                                <span class="sm-ai-status-dot"></span>
                                AI Assistant
                            </span>
                        </div>
                    </div>
                    <button class="sm-ai-minimize" aria-label="Minimize">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </button>
                </div>
                <div class="sm-ai-messages"></div>
                <div class="sm-ai-quick-replies"></div>
                <div class="sm-ai-input-container">
                    <input type="text" class="sm-ai-input" placeholder="Type your message..." autocomplete="off">
                    <button class="sm-ai-send" aria-label="Send">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                    </button>
                </div>
                <div class="sm-ai-powered">
                    Powered by AI
                </div>
            </div>
        `;
        document.body.appendChild(widget);
        return widget;
    }

    // AI Chat Agent
    class AIEmbedChatAgent {
        constructor(widget) {
            this.widget = widget;
            this.toggle = widget.querySelector('.sm-ai-toggle');
            this.container = widget.querySelector('.sm-ai-container');
            this.messages = widget.querySelector('.sm-ai-messages');
            this.quickReplies = widget.querySelector('.sm-ai-quick-replies');
            this.input = widget.querySelector('.sm-ai-input');
            this.sendBtn = widget.querySelector('.sm-ai-send');
            this.minimizeBtn = widget.querySelector('.sm-ai-minimize');
            this.badge = widget.querySelector('.sm-ai-badge');

            this.isOpen = false;
            this.isTyping = false;
            this.sessionId = this.getSessionId();
            this.leadData = {};
            this.history = [];

            this.bindEvents();
            this.loadCalendly();
            if (CONFIG.autoOpen) this.autoOpen();
        }

        loadCalendly() {
            // Load Calendly CSS
            if (!document.querySelector('link[href*="calendly.com"]')) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = 'https://assets.calendly.com/assets/external/widget.css';
                document.head.appendChild(link);
            }
            // Load Calendly JS
            if (!document.querySelector('script[src*="calendly.com"]')) {
                const script = document.createElement('script');
                script.src = 'https://assets.calendly.com/assets/external/widget.js';
                script.async = true;
                document.head.appendChild(script);
            }
        }

        openCalendly() {
            if (window.Calendly) {
                Calendly.initPopupWidget({
                    url: CONFIG.calendlyUrl,
                    prefill: {
                        name: this.leadData.name || '',
                        email: this.leadData.email || ''
                    }
                });
            } else {
                window.open(CONFIG.calendlyUrl, '_blank');
            }
        }

        getSessionId() {
            let id = sessionStorage.getItem('sm_ai_session');
            if (!id) {
                id = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                sessionStorage.setItem('sm_ai_session', id);
            }
            return id;
        }

        bindEvents() {
            this.toggle.onclick = () => this.toggleChat();
            this.minimizeBtn.onclick = () => this.toggleChat();
            this.sendBtn.onclick = () => this.handleInput();
            this.input.onkeypress = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleInput();
                }
            };
        }

        autoOpen() {
            setTimeout(() => {
                if (!this.isOpen) this.toggleChat();
            }, CONFIG.autoOpenDelay);
        }

        toggleChat() {
            this.isOpen = !this.isOpen;
            this.container.classList.toggle('hidden', !this.isOpen);
            this.badge.classList.add('hidden');

            if (this.isOpen) {
                this.input.focus();
                if (!this.history.length) this.startConversation();
            }
        }

        async startConversation() {
            const greeting = `Hey there! 👋 Welcome to ${CONFIG.companyName}. I'm here to help you grow your business with high-performance paid advertising. What brings you here today?`;

            await this.simulateTyping(1200);
            this.addMessage(greeting, 'bot');
            this.showReplies([
                "I need help with ads",
                "I want to scale my business",
                "Tell me about your services"
            ]);
        }

        async handleInput() {
            const text = this.input.value.trim();
            if (!text || this.isTyping) return;

            this.input.value = '';
            this.addMessage(text, 'user');
            this.clearReplies();

            await this.getAIResponse(text);
        }

        async handleReply(text) {
            if (this.isTyping) return;
            this.addMessage(text, 'user');
            this.clearReplies();
            await this.getAIResponse(text);
        }

        async getAIResponse(message) {
            this.isTyping = true;
            this.setInputEnabled(false);
            this.showTyping();

            try {
                const response = await fetch(CONFIG.apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: this.sessionId,
                        message: message,
                        leadData: this.leadData
                    })
                });

                if (!response.ok) throw new Error('API error');

                const data = await response.json();

                // Update lead data
                if (data.leadData) {
                    this.leadData = { ...this.leadData, ...data.leadData };
                }

                // Natural typing delay
                const delay = Math.min(800 + (data.message.length * 15), 2500);
                await this.delay(delay);

                this.hideTyping();
                this.addMessage(data.message, 'bot');

                // Show quick replies
                if (data.quickReplies?.length) {
                    this.showReplies(data.quickReplies);
                }

                // Submit lead if qualified
                if (this.leadData.email) {
                    this.submitLead();
                }

            } catch (error) {
                console.error('AI Error:', error);
                this.hideTyping();
                this.addMessage(
                    "I apologize, but I'm having a brief technical issue. Please try again or visit thesnowmedia.com to book a call directly.",
                    'bot'
                );
                this.showReplies(["Try again", "Visit website"]);
            }

            this.isTyping = false;
            this.setInputEnabled(true);
            this.input.focus();
        }

        addMessage(text, sender) {
            const div = document.createElement('div');
            div.className = `sm-ai-message ${sender}`;
            div.innerHTML = `
                <div class="sm-ai-message-content">${this.formatText(text)}</div>
                <div class="sm-ai-message-time">${this.getTime()}</div>
            `;
            this.messages.appendChild(div);
            this.scrollToBottom();
            this.history.push({ text, sender, time: new Date().toISOString() });
        }

        formatText(text) {
            // Escape HTML first to prevent XSS
            const escaped = this.escapeHtml(text);
            return escaped
                .replace(/\[BOOK_CALL\]/g, '<button class="sm-ai-book-btn" onclick="window.SnowMediaAIChat.openCalendly()">📅 Book a Call</button>')
                .replace(/(https?:\/\/[^\s&]+)/g, '<a href="$1" target="_blank">$1</a>')
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br>');
        }

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        showReplies(replies) {
            this.quickReplies.innerHTML = '';
            replies.forEach(text => {
                const btn = document.createElement('button');
                btn.className = 'sm-ai-quick-btn';
                btn.textContent = text;
                btn.disabled = this.isTyping;
                btn.onclick = () => this.handleReply(text);
                this.quickReplies.appendChild(btn);
            });
        }

        clearReplies() {
            this.quickReplies.innerHTML = '';
        }

        showTyping() {
            if (document.getElementById('sm-ai-typing')) return;
            const div = document.createElement('div');
            div.className = 'sm-ai-message bot';
            div.id = 'sm-ai-typing';
            div.innerHTML = '<div class="sm-ai-typing"><span></span><span></span><span></span></div>';
            this.messages.appendChild(div);
            this.scrollToBottom();
        }

        hideTyping() {
            document.getElementById('sm-ai-typing')?.remove();
        }

        async simulateTyping(ms) {
            this.showTyping();
            await this.delay(ms);
            this.hideTyping();
        }

        setInputEnabled(enabled) {
            this.input.disabled = !enabled;
            this.sendBtn.disabled = !enabled;
            this.quickReplies.querySelectorAll('button').forEach(b => b.disabled = !enabled);
        }

        scrollToBottom() {
            this.messages.scrollTop = this.messages.scrollHeight;
        }

        getTime() {
            return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        delay(ms) {
            return new Promise(r => setTimeout(r, ms));
        }

        async submitLead() {
            if (this.leadSubmitted) return;
            try {
                await fetch(CONFIG.leadsUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: this.sessionId,
                        leadData: this.leadData,
                        history: this.history
                    })
                });
                this.leadSubmitted = true;
                window.dispatchEvent(new CustomEvent('snowchat:lead', { detail: this.leadData }));
            } catch (e) {
                console.error('Lead submit error:', e);
            }
        }
    }

    // Initialize
    function init() {
        if (document.getElementById(CONFIG.widgetId)) return;
        injectStyles();
        const widget = createWidget();
        window.SnowMediaAIChat = new AIEmbedChatAgent(widget);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
