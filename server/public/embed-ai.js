/**
 * The Snow Media - AI-Powered Embeddable Chat Widget
 * Styled version matching the original design
 */

(function() {
    'use strict';

    const scriptTag = document.currentScript;
    const CONFIG = {
        apiUrl: scriptTag?.getAttribute('data-api-url') || 'https://snow-media-chat-agent-production.up.railway.app/api/chat',
        leadsUrl: scriptTag?.getAttribute('data-leads-url') || 'https://snow-media-chat-agent-production.up.railway.app/api/leads',
        calendlyUrl: scriptTag?.getAttribute('data-calendly-url') || 'https://calendly.com/milos-thesnowmedia/30min',
        autoOpen: scriptTag?.getAttribute('data-auto-open') !== 'false',
        autoOpenDelay: parseInt(scriptTag?.getAttribute('data-delay')) || 3000,
        milosImg: scriptTag?.getAttribute('data-avatar') || 'https://snow-media-chat-agent-production.up.railway.app/milos.jpg',
        logoImg: scriptTag?.getAttribute('data-logo') || 'https://snow-media-chat-agent-production.up.railway.app/logo.png'
    };

    // Inject Google Font
    const fontLink = document.createElement('link');
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap';
    fontLink.rel = 'stylesheet';
    document.head.appendChild(fontLink);

    // Inject Calendly
    const calendlyCSS = document.createElement('link');
    calendlyCSS.href = 'https://assets.calendly.com/assets/external/widget.css';
    calendlyCSS.rel = 'stylesheet';
    document.head.appendChild(calendlyCSS);

    const calendlyJS = document.createElement('script');
    calendlyJS.src = 'https://assets.calendly.com/assets/external/widget.js';
    calendlyJS.async = true;
    document.head.appendChild(calendlyJS);

    // Inject Styles
    const style = document.createElement('style');
    style.textContent = `
        #snow-chat-widget {
            --primary-color: #263B80;
            --primary-dark: #001468;
            --accent-color: #FFB949;
            --accent-dark: #EAB155;
            --success-color: #10b981;
            --background-light: #F0F6FB;
            --text-primary: #263B80;
            --text-secondary: #64748b;
            --border-color: #d4e3f0;
            --shadow-sm: 0 2px 4px rgba(38, 59, 128, 0.08);
            --shadow-md: 0 6px 12px rgba(38, 59, 128, 0.12);
            --shadow-lg: 0 12px 24px rgba(38, 59, 128, 0.15);
            --shadow-xl: 0 24px 48px rgba(38, 59, 128, 0.18);
            --radius-sm: 12px;
            --radius-md: 18px;
            --radius-lg: 24px;
            --radius-full: 9999px;

            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 999999;
            font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        #snow-chat-widget * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        .snow-toggle {
            width: 68px;
            height: 68px;
            border-radius: var(--radius-full);
            background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%);
            border: 3px solid var(--accent-color);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: var(--shadow-lg), 0 0 0 4px rgba(255, 185, 73, 0.2);
            transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
            position: relative;
            animation: snow-float 3s ease-in-out infinite;
        }

        @keyframes snow-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-6px); }
        }

        .snow-toggle:hover {
            transform: scale(1.1) translateY(-2px);
            box-shadow: var(--shadow-xl), 0 0 0 6px rgba(255, 185, 73, 0.3);
            animation: none;
        }

        .snow-toggle img {
            width: 42px;
            height: 42px;
            border-radius: 50%;
            object-fit: contain;
        }

        .snow-toggle svg {
            width: 28px;
            height: 28px;
            color: white;
            display: none;
        }

        .snow-toggle.open img { display: none; }
        .snow-toggle.open svg { display: block; }

        .snow-badge {
            position: absolute;
            top: -5px;
            right: -5px;
            background: linear-gradient(135deg, var(--accent-color) 0%, var(--accent-dark) 100%);
            color: var(--primary-dark);
            font-size: 12px;
            font-weight: 700;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid white;
            animation: snow-bounce 2s infinite;
        }

        @keyframes snow-bounce {
            0%, 100% { transform: scale(1); }
            25% { transform: scale(1.2); }
            50% { transform: scale(1); }
            75% { transform: scale(1.1); }
        }

        .snow-badge.hidden { display: none; }

        .snow-container {
            position: absolute;
            bottom: 80px;
            right: 0;
            width: 400px;
            height: 500px;
            max-height: calc(100vh - 120px);
            background: white;
            border-radius: var(--radius-lg);
            box-shadow: var(--shadow-xl);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            animation: snow-slideUp 0.3s ease;
        }

        .snow-container.hidden { display: none; }

        @keyframes snow-slideUp {
            0% { opacity: 0; transform: translateY(30px) scale(0.9); }
            60% { transform: translateY(-5px) scale(1.02); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
        }

        .snow-header {
            background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%);
            color: white;
            padding: 16px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .snow-header-info {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .snow-avatar {
            width: 44px;
            height: 44px;
            min-width: 44px;
            background: white;
            border-radius: 50%;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            border: 2px solid white;
        }

        .snow-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .snow-header-text h3 {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 2px;
        }

        .snow-status {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            opacity: 0.9;
        }

        .snow-status-dot {
            width: 8px;
            height: 8px;
            background: var(--success-color);
            border-radius: 50%;
            animation: snow-blink 2s infinite;
        }

        @keyframes snow-blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .snow-minimize {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            border-radius: var(--radius-sm);
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: background 0.2s ease;
        }

        .snow-minimize:hover { background: rgba(255, 255, 255, 0.3); }
        .snow-minimize svg { width: 18px; height: 18px; color: white; }

        .snow-messages {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            background: var(--background-light);
        }

        .snow-messages::-webkit-scrollbar { width: 6px; }
        .snow-messages::-webkit-scrollbar-track { background: transparent; }
        .snow-messages::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 3px; }

        .snow-message {
            display: flex;
            flex-direction: column;
            max-width: 85%;
            animation: snow-fadeIn 0.3s ease;
        }

        @keyframes snow-fadeIn {
            0% { opacity: 0; transform: translateY(15px) scale(0.95); }
            60% { transform: translateY(-3px) scale(1.01); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
        }

        .snow-message.bot { align-self: flex-start; }
        .snow-message.user { align-self: flex-end; }

        .snow-message-content {
            padding: 12px 16px;
            border-radius: var(--radius-md);
            font-size: 14px;
            line-height: 1.5;
        }

        .snow-message.bot .snow-message-content {
            background: white;
            color: var(--text-primary);
            border: 1px solid var(--border-color);
            border-bottom-left-radius: 4px;
        }

        .snow-message.user .snow-message-content {
            background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%);
            color: white;
            border-bottom-right-radius: 4px;
        }

        .snow-message-time {
            font-size: 11px;
            color: var(--text-secondary);
            margin-top: 4px;
            padding: 0 4px;
        }

        .snow-message.user .snow-message-time { text-align: right; }

        .snow-typing {
            display: flex;
            gap: 4px;
            padding: 12px 16px;
            background: white;
            border: 1px solid var(--border-color);
            border-radius: var(--radius-md);
            border-bottom-left-radius: 4px;
            width: fit-content;
        }

        .snow-typing span {
            width: 8px;
            height: 8px;
            background: var(--text-secondary);
            border-radius: 50%;
            animation: snow-typing 1.4s infinite ease-in-out;
        }

        .snow-typing span:nth-child(2) { animation-delay: 0.2s; }
        .snow-typing span:nth-child(3) { animation-delay: 0.4s; }

        @keyframes snow-typing {
            0%, 60%, 100% { transform: translateY(0); }
            30% { transform: translateY(-6px); }
        }

        .snow-quick-replies {
            padding: 12px 20px 20px;
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            background: var(--background-light);
            border-bottom: 1px solid var(--border-color);
        }

        .snow-quick-replies:empty { display: none; }

        .snow-quick-btn {
            padding: 12px 20px;
            background: white;
            border: 2px solid var(--accent-color);
            border-radius: var(--radius-full);
            color: var(--primary-color);
            font-family: inherit;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.25s cubic-bezier(0.68, -0.55, 0.265, 1.55);
            box-shadow: var(--shadow-sm);
        }

        .snow-quick-btn:hover {
            background: linear-gradient(135deg, var(--accent-color) 0%, var(--accent-dark) 100%);
            color: var(--primary-dark);
            border-color: var(--accent-dark);
            transform: translateY(-2px) scale(1.02);
            box-shadow: var(--shadow-md);
        }

        .snow-book-btn {
            display: inline-block;
            margin-top: 10px;
            padding: 12px 24px;
            background: linear-gradient(135deg, var(--success-color) 0%, #059669 100%);
            border: none;
            border-radius: var(--radius-full);
            color: white;
            font-family: inherit;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.25s ease;
            box-shadow: var(--shadow-md);
        }

        .snow-book-btn:hover {
            transform: translateY(-2px) scale(1.03);
            box-shadow: var(--shadow-lg);
        }

        .snow-input-container {
            padding: 16px 20px;
            background: white;
            border-top: 1px solid var(--border-color);
            display: flex;
            gap: 12px;
            align-items: center;
        }

        .snow-input {
            flex: 1;
            padding: 12px 16px;
            border: 1px solid var(--border-color);
            border-radius: var(--radius-full);
            font-family: inherit;
            font-size: 14px;
            outline: none;
            transition: border-color 0.2s ease;
        }

        .snow-input:focus { border-color: var(--primary-color); }
        .snow-input::placeholder { color: var(--text-secondary); }

        .snow-send {
            width: 48px;
            height: 48px;
            background: linear-gradient(135deg, var(--accent-color) 0%, var(--accent-dark) 100%);
            border: none;
            border-radius: var(--radius-full);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.25s cubic-bezier(0.68, -0.55, 0.265, 1.55);
            box-shadow: var(--shadow-sm);
        }

        .snow-send:hover {
            transform: scale(1.1) rotate(10deg);
            box-shadow: var(--shadow-md);
        }

        .snow-send svg {
            width: 20px;
            height: 20px;
            color: var(--primary-dark);
        }

        .snow-message-content a {
            color: var(--accent-dark);
            text-decoration: none;
            font-weight: 600;
            border-bottom: 2px solid var(--accent-color);
        }

        @media (max-width: 480px) {
            #snow-chat-widget { bottom: 16px; right: 16px; }
            .snow-container {
                width: calc(100vw - 32px);
                height: calc(100vh - 120px);
                max-height: 600px;
            }
        }
    `;
    document.head.appendChild(style);

    // Create Widget HTML
    function createWidget() {
        const widget = document.createElement('div');
        widget.id = 'snow-chat-widget';
        widget.innerHTML = `
            <button class="snow-toggle">
                <img src="${CONFIG.logoImg}" alt="Chat">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                <span class="snow-badge">1</span>
            </button>
            <div class="snow-container hidden">
                <div class="snow-header">
                    <div class="snow-header-info">
                        <div class="snow-avatar">
                            <img src="${CONFIG.milosImg}" alt="Milos">
                        </div>
                        <div class="snow-header-text">
                            <h3>Milos</h3>
                            <span class="snow-status">
                                <span class="snow-status-dot"></span>
                                Online now
                            </span>
                        </div>
                    </div>
                    <button class="snow-minimize">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </button>
                </div>
                <div class="snow-messages"></div>
                <div class="snow-quick-replies"></div>
                <div class="snow-input-container">
                    <input type="text" class="snow-input" placeholder="Type your message..." autocomplete="off">
                    <button class="snow-send">
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

    // Chat Agent Class
    class SnowChatAgent {
        constructor(widget) {
            this.widget = widget;
            this.toggle = widget.querySelector('.snow-toggle');
            this.container = widget.querySelector('.snow-container');
            this.messages = widget.querySelector('.snow-messages');
            this.quickReplies = widget.querySelector('.snow-quick-replies');
            this.input = widget.querySelector('.snow-input');
            this.sendBtn = widget.querySelector('.snow-send');
            this.minimizeBtn = widget.querySelector('.snow-minimize');
            this.badge = widget.querySelector('.snow-badge');

            this.isOpen = false;
            this.isTyping = false;
            this.sessionId = this.getSessionId();
            this.leadData = {};
            this.history = [];

            this.bindEvents();
            if (CONFIG.autoOpen) this.autoOpen();
        }

        getSessionId() {
            let id = sessionStorage.getItem('snow_chat_session');
            if (!id) {
                id = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                sessionStorage.setItem('snow_chat_session', id);
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
            this.toggle.classList.toggle('open', this.isOpen);
            this.badge.classList.add('hidden');

            if (this.isOpen) {
                this.input.focus();
                if (!this.history.length) this.startConversation();
            }
        }

        async startConversation() {
            const greeting = "Hey, I am Milos. Just browsing, or looking to scale profitably with paid ads?";
            await this.simulateTyping(1200);
            this.addMessage(greeting, 'bot');
            this.showReplies([
                "Yes, I run an e-commerce brand",
                "Yes, I run a home service business",
                "Just exploring"
            ]);
        }

        handleInput() {
            const text = this.input.value.trim();
            if (!text || this.isTyping) return;
            this.input.value = '';
            this.addMessage(text, 'user');
            this.clearReplies();
            this.getAIResponse(text);
        }

        handleReply(text) {
            if (this.isTyping) return;
            this.addMessage(text, 'user');
            this.clearReplies();
            this.getAIResponse(text);
        }

        async getAIResponse(message) {
            this.isTyping = true;
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

                const data = await response.json();

                if (data.leadData) {
                    this.leadData = { ...this.leadData, ...data.leadData };
                }

                const typingDelay = Math.min(1000 + (data.message.length * 20), 3000);
                await this.delay(typingDelay);

                this.hideTyping();
                this.addMessage(data.message, 'bot');

                if (data.quickReplies && data.quickReplies.length > 0) {
                    this.showReplies(data.quickReplies);
                }

                if (this.leadData.name && this.leadData.email && !this.leadSubmitted) {
                    this.submitLead();
                }

            } catch (error) {
                console.error('Snow Chat Error:', error);
                this.hideTyping();
                this.addMessage("Something went wrong. Please try again or visit thesnowmedia.com", 'bot');
            }

            this.isTyping = false;
        }

        addMessage(text, sender) {
            const div = document.createElement('div');
            div.className = `snow-message ${sender}`;
            const safeText = sender === 'bot' ? this.formatText(text) : this.escapeHtml(text);
            div.innerHTML = `
                <div class="snow-message-content">${safeText}</div>
                <div class="snow-message-time">${this.getTime()}</div>
            `;
            this.messages.appendChild(div);
            this.scrollToBottom();
            this.history.push({ text, sender, time: new Date().toISOString() });
        }

        formatText(text) {
            let escaped = this.escapeHtml(text);
            escaped = escaped.replace(/\[BOOK_CALL\]/g, '<button class="snow-book-btn" onclick="window.SnowChat.openCalendly()">📅 Book a Call</button>');
            escaped = escaped.replace(/(https?:\/\/[^\s&]+)/g, '<a href="$1" target="_blank">$1</a>');
            escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            escaped = escaped.replace(/\n/g, '<br>');
            return escaped;
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
                btn.className = 'snow-quick-btn';
                btn.textContent = text;
                btn.onclick = () => this.handleReply(text);
                this.quickReplies.appendChild(btn);
            });
        }

        clearReplies() {
            this.quickReplies.innerHTML = '';
        }

        showTyping() {
            if (document.getElementById('snow-typing')) return;
            const div = document.createElement('div');
            div.className = 'snow-message bot';
            div.id = 'snow-typing';
            div.innerHTML = '<div class="snow-typing"><span></span><span></span><span></span></div>';
            this.messages.appendChild(div);
            this.scrollToBottom();
        }

        hideTyping() {
            document.getElementById('snow-typing')?.remove();
        }

        async simulateTyping(ms) {
            this.showTyping();
            await this.delay(ms);
            this.hideTyping();
        }

        scrollToBottom() {
            this.messages.scrollTop = this.messages.scrollHeight;
        }

        getTime() {
            return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
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

        async submitLead() {
            if (this.leadSubmitted) return;
            try {
                await fetch(CONFIG.leadsUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: this.sessionId,
                        leadData: this.leadData,
                        conversationHistory: this.history
                    })
                });
                this.leadSubmitted = true;
            } catch (e) {
                console.error('Lead submit error:', e);
            }
        }
    }

    // Initialize
    function init() {
        if (document.getElementById('snow-chat-widget')) return;
        const widget = createWidget();
        window.SnowChat = new SnowChatAgent(widget);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
