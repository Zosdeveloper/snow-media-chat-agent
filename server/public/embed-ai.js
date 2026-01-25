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

    // Inject Styles - Using #snow-chat-widget prefix for all rules to ensure specificity
    const style = document.createElement('style');
    style.textContent = `
        #snow-chat-widget {
            --sw-primary: #263B80;
            --sw-primary-dark: #001468;
            --sw-accent: #FFB949;
            --sw-accent-dark: #EAB155;
            --sw-success: #10b981;
            --sw-bg-light: #F0F6FB;
            --sw-text-primary: #263B80;
            --sw-text-secondary: #64748b;
            --sw-border: #d4e3f0;
            position: fixed !important;
            bottom: 24px !important;
            right: 24px !important;
            z-index: 999999 !important;
            font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        }

        #snow-chat-widget,
        #snow-chat-widget *,
        #snow-chat-widget *::before,
        #snow-chat-widget *::after {
            box-sizing: border-box !important;
            font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        }

        #snow-chat-widget .snow-container *,
        #snow-chat-widget .snow-toggle {
            margin: 0 !important;
            padding: 0 !important;
        }

        #snow-chat-widget .snow-toggle {
            width: 68px !important;
            height: 68px !important;
            border-radius: 9999px !important;
            background: linear-gradient(135deg, #263B80 0%, #001468 100%) !important;
            border: 3px solid #FFB949 !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            box-shadow: 0 12px 24px rgba(38, 59, 128, 0.15), 0 0 0 4px rgba(255, 185, 73, 0.2) !important;
            transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55) !important;
            position: relative !important;
            animation: swchat-float 3s ease-in-out infinite !important;
        }

        @keyframes swchat-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-6px); }
        }

        #snow-chat-widget .snow-toggle:hover {
            transform: scale(1.1) translateY(-2px) !important;
            box-shadow: 0 24px 48px rgba(38, 59, 128, 0.18), 0 0 0 6px rgba(255, 185, 73, 0.3) !important;
            animation: none !important;
        }

        #snow-chat-widget .snow-toggle img {
            width: 42px !important;
            height: 42px !important;
            border-radius: 50% !important;
            object-fit: contain !important;
            display: block !important;
        }

        #snow-chat-widget .snow-toggle svg {
            width: 28px !important;
            height: 28px !important;
            color: white !important;
            display: none !important;
        }

        #snow-chat-widget .snow-toggle.open img { display: none !important; }
        #snow-chat-widget .snow-toggle.open svg { display: block !important; }

        #snow-chat-widget .snow-badge {
            position: absolute !important;
            top: -5px !important;
            right: -5px !important;
            background: linear-gradient(135deg, #FFB949 0%, #EAB155 100%) !important;
            color: #001468 !important;
            font-size: 12px !important;
            font-weight: 700 !important;
            width: 24px !important;
            height: 24px !important;
            border-radius: 50% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            border: 2px solid white !important;
            animation: swchat-bounce 2s infinite !important;
        }

        @keyframes swchat-bounce {
            0%, 100% { transform: scale(1); }
            25% { transform: scale(1.2); }
            50% { transform: scale(1); }
            75% { transform: scale(1.1); }
        }

        #snow-chat-widget .snow-badge.hidden { display: none !important; }

        #snow-chat-widget .snow-container {
            position: absolute !important;
            bottom: 80px !important;
            right: 0 !important;
            width: 400px !important;
            height: 500px !important;
            max-height: calc(100vh - 120px) !important;
            background: white !important;
            border-radius: 24px !important;
            box-shadow: 0 24px 48px rgba(38, 59, 128, 0.18) !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
            animation: swchat-slideUp 0.3s ease !important;
        }

        #snow-chat-widget .snow-container.hidden { display: none !important; }

        @keyframes swchat-slideUp {
            0% { opacity: 0; transform: translateY(30px) scale(0.9); }
            60% { transform: translateY(-5px) scale(1.02); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
        }

        #snow-chat-widget .snow-header {
            background: linear-gradient(135deg, #263B80 0%, #001468 100%) !important;
            color: white !important;
            padding: 16px 20px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
        }

        #snow-chat-widget .snow-header-info {
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
        }

        #snow-chat-widget .snow-avatar {
            width: 44px !important;
            height: 44px !important;
            min-width: 44px !important;
            background: white !important;
            border-radius: 50% !important;
            overflow: hidden !important;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15) !important;
            border: 2px solid white !important;
        }

        #snow-chat-widget .snow-avatar img {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            border-radius: 0 !important;
        }

        #snow-chat-widget .snow-header-text h3 {
            font-size: 16px !important;
            font-weight: 600 !important;
            margin-bottom: 2px !important;
            color: white !important;
        }

        #snow-chat-widget .snow-status {
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
            font-size: 12px !important;
            opacity: 0.9 !important;
            color: white !important;
        }

        #snow-chat-widget .snow-status-dot {
            width: 8px !important;
            height: 8px !important;
            background: #10b981 !important;
            border-radius: 50% !important;
            animation: swchat-blink 2s infinite !important;
        }

        @keyframes swchat-blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        #snow-chat-widget .snow-minimize {
            background: rgba(255, 255, 255, 0.2) !important;
            border: none !important;
            border-radius: 12px !important;
            width: 32px !important;
            height: 32px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            cursor: pointer !important;
            transition: background 0.2s ease !important;
        }

        #snow-chat-widget .snow-minimize:hover { background: rgba(255, 255, 255, 0.3) !important; }
        #snow-chat-widget .snow-minimize svg { width: 18px !important; height: 18px !important; color: white !important; }

        #snow-chat-widget .snow-messages {
            flex: 1 !important;
            overflow-y: auto !important;
            padding: 20px !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 16px !important;
            background: #F0F6FB !important;
        }

        #snow-chat-widget .snow-messages::-webkit-scrollbar { width: 6px !important; }
        #snow-chat-widget .snow-messages::-webkit-scrollbar-track { background: transparent !important; }
        #snow-chat-widget .snow-messages::-webkit-scrollbar-thumb { background: #d4e3f0 !important; border-radius: 3px !important; }

        #snow-chat-widget .snow-message {
            display: flex !important;
            flex-direction: column !important;
            max-width: 85% !important;
            animation: swchat-fadeIn 0.3s ease !important;
        }

        @keyframes swchat-fadeIn {
            0% { opacity: 0; transform: translateY(15px) scale(0.95); }
            60% { transform: translateY(-3px) scale(1.01); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
        }

        #snow-chat-widget .snow-message.bot { align-self: flex-start !important; }
        #snow-chat-widget .snow-message.user { align-self: flex-end !important; }

        #snow-chat-widget .snow-message-content {
            padding: 12px 16px !important;
            border-radius: 18px !important;
            font-size: 14px !important;
            line-height: 1.5 !important;
        }

        #snow-chat-widget .snow-message.bot .snow-message-content {
            background: white !important;
            color: #263B80 !important;
            border: 1px solid #d4e3f0 !important;
            border-bottom-left-radius: 4px !important;
        }

        #snow-chat-widget .snow-message.user .snow-message-content {
            background: linear-gradient(135deg, #263B80 0%, #001468 100%) !important;
            color: white !important;
            border-bottom-right-radius: 4px !important;
            border: none !important;
        }

        #snow-chat-widget .snow-message-time {
            font-size: 11px !important;
            color: #64748b !important;
            margin-top: 4px !important;
            padding: 0 4px !important;
        }

        #snow-chat-widget .snow-message.user .snow-message-time { text-align: right !important; }

        #snow-chat-widget .snow-typing {
            display: flex !important;
            gap: 4px !important;
            padding: 12px 16px !important;
            background: white !important;
            border: 1px solid #d4e3f0 !important;
            border-radius: 18px !important;
            border-bottom-left-radius: 4px !important;
            width: fit-content !important;
        }

        #snow-chat-widget .snow-typing span {
            width: 8px !important;
            height: 8px !important;
            background: #64748b !important;
            border-radius: 50% !important;
            animation: snow-typing 1.4s infinite ease-in-out !important;
        }

        #snow-chat-widget .snow-typing span:nth-child(2) { animation-delay: 0.2s !important; }
        #snow-chat-widget .snow-typing span:nth-child(3) { animation-delay: 0.4s !important; }

        @keyframes snow-typing {
            0%, 60%, 100% { transform: translateY(0); }
            30% { transform: translateY(-6px); }
        }

        #snow-chat-widget .snow-quick-replies {
            padding: 12px 20px 16px 20px !important;
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 10px !important;
            background: #F0F6FB !important;
        }

        #snow-chat-widget .snow-quick-replies:empty { display: none !important; }

        #snow-chat-widget .snow-quick-btn {
            padding: 12px 20px !important;
            background: white !important;
            border: 2px solid #FFB949 !important;
            border-radius: 9999px !important;
            color: #263B80 !important;
            font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, sans-serif !important;
            font-size: 13px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            transition: all 0.25s cubic-bezier(0.68, -0.55, 0.265, 1.55) !important;
            box-shadow: 0 2px 4px rgba(38, 59, 128, 0.08) !important;
            text-decoration: none !important;
            display: inline-block !important;
            line-height: 1.2 !important;
        }

        #snow-chat-widget .snow-quick-btn:hover {
            background: linear-gradient(135deg, #FFB949 0%, #EAB155 100%) !important;
            color: #001468 !important;
            border-color: #EAB155 !important;
            transform: translateY(-2px) scale(1.02) !important;
            box-shadow: 0 6px 12px rgba(38, 59, 128, 0.12) !important;
        }

        #snow-chat-widget .snow-book-btn {
            display: inline-block !important;
            margin-top: 10px !important;
            padding: 12px 24px !important;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
            border: none !important;
            border-radius: 9999px !important;
            color: white !important;
            font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, sans-serif !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            transition: all 0.25s ease !important;
            box-shadow: 0 6px 12px rgba(38, 59, 128, 0.12) !important;
            text-decoration: none !important;
        }

        #snow-chat-widget .snow-book-btn:hover {
            transform: translateY(-2px) scale(1.03) !important;
            box-shadow: 0 12px 24px rgba(38, 59, 128, 0.15) !important;
        }

        #snow-chat-widget .snow-input-container {
            padding: 16px 20px !important;
            background: white !important;
            border-top: 1px solid #d4e3f0 !important;
            display: flex !important;
            gap: 12px !important;
            align-items: center !important;
        }

        #snow-chat-widget .snow-input {
            flex: 1 !important;
            padding: 12px 16px !important;
            border: 1px solid #d4e3f0 !important;
            border-radius: 9999px !important;
            font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, sans-serif !important;
            font-size: 14px !important;
            outline: none !important;
            transition: border-color 0.2s ease !important;
            background: white !important;
            color: #263B80 !important;
        }

        #snow-chat-widget .snow-input:focus { border-color: #263B80 !important; }
        #snow-chat-widget .snow-input::placeholder { color: #64748b !important; }

        #snow-chat-widget .snow-send {
            width: 48px !important;
            height: 48px !important;
            min-width: 48px !important;
            background: linear-gradient(135deg, #FFB949 0%, #EAB155 100%) !important;
            border: none !important;
            border-radius: 9999px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            cursor: pointer !important;
            transition: all 0.25s cubic-bezier(0.68, -0.55, 0.265, 1.55) !important;
            box-shadow: 0 2px 4px rgba(38, 59, 128, 0.08) !important;
        }

        #snow-chat-widget .snow-send:hover {
            transform: scale(1.1) rotate(10deg) !important;
            box-shadow: 0 6px 12px rgba(38, 59, 128, 0.12) !important;
        }

        #snow-chat-widget .snow-send svg {
            width: 20px !important;
            height: 20px !important;
            color: #001468 !important;
        }

        #snow-chat-widget .snow-message-content a {
            color: #EAB155 !important;
            text-decoration: none !important;
            font-weight: 600 !important;
            border-bottom: 2px solid #FFB949 !important;
        }

        @media screen and (max-width: 768px) {
            #snow-chat-widget {
                bottom: 16px !important;
                right: 16px !important;
                left: auto !important;
                position: fixed !important;
                z-index: 2147483647 !important;
            }
            #snow-chat-widget .snow-toggle {
                width: 60px !important;
                height: 60px !important;
            }
            #snow-chat-widget .snow-toggle img {
                width: 36px !important;
                height: 36px !important;
            }
            #snow-chat-widget .snow-container {
                width: calc(100vw - 32px) !important;
                height: calc(100vh - 100px) !important;
                max-height: none !important;
                right: -8px !important;
                bottom: 70px !important;
                border-radius: 16px !important;
            }
            #snow-chat-widget .snow-quick-btn {
                padding: 10px 16px !important;
                font-size: 12px !important;
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
