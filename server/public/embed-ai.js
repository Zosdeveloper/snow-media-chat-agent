/**
 * The Snow Media - AI Chat Widget
 * Embeddable chat widget with Claude AI
 */
(function() {
    'use strict';

    const scriptTag = document.currentScript;
    const CONFIG = {
        apiUrl: scriptTag?.getAttribute('data-api-url') || 'https://snow-media-chat-agent-production.up.railway.app/api/chat',
        leadsUrl: scriptTag?.getAttribute('data-leads-url') || 'https://snow-media-chat-agent-production.up.railway.app/api/leads',
        calendlyUrl: scriptTag?.getAttribute('data-calendly-url') || 'https://calendly.com/milos-thesnowmedia/30min',
        autoOpen: scriptTag?.getAttribute('data-auto-open') !== 'false',
        autoOpenDelay: parseInt(scriptTag?.getAttribute('data-delay')) || 15000,
        avatarImg: scriptTag?.getAttribute('data-avatar') || 'https://snow-media-chat-agent-production.up.railway.app/milos.jpg',
        logoImg: scriptTag?.getAttribute('data-logo') || 'https://snow-media-chat-agent-production.up.railway.app/logo.png'
    };

    // Load external resources
    const loadResource = (tag, attrs) => {
        const el = document.createElement(tag);
        Object.assign(el, attrs);
        document.head.appendChild(el);
    };
    loadResource('link', { href: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap', rel: 'stylesheet' });
    loadResource('link', { href: 'https://assets.calendly.com/assets/external/widget.css', rel: 'stylesheet' });
    loadResource('script', { src: 'https://assets.calendly.com/assets/external/widget.js', async: true });

    // Styles
    const style = document.createElement('style');
    style.textContent = `
        /* Body scroll lock when chat is open on mobile */
        body.snow-chat-open {
            overflow: hidden !important;
            position: fixed !important;
            width: 100% !important;
            height: 100% !important;
        }

        #snow-chat-widget {
            position: fixed !important;
            bottom: 24px !important;
            right: 24px !important;
            z-index: 2147483647 !important;
            font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        }
        #snow-chat-widget *, #snow-chat-widget *::before, #snow-chat-widget *::after {
            box-sizing: border-box !important;
            font-family: inherit !important;
        }
        #snow-chat-widget .snow-container *, #snow-chat-widget .snow-toggle {
            margin: 0 !important;
            padding: 0 !important;
        }

        /* Toggle Button - Always on top */
        #snow-chat-widget .snow-toggle {
            width: 68px !important;
            height: 68px !important;
            border-radius: 50% !important;
            background: linear-gradient(135deg, #263B80, #001468) !important;
            border: 3px solid #FFB949 !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            box-shadow: 0 12px 24px rgba(38,59,128,0.15), 0 0 0 4px rgba(255,185,73,0.2) !important;
            position: relative !important;
            z-index: 2147483647 !important;
            animation: swchat-float 3s ease-in-out infinite !important;
            -webkit-tap-highlight-color: transparent !important;
            touch-action: manipulation !important;
        }
        @keyframes swchat-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-6px); }
        }
        #snow-chat-widget .snow-toggle:hover {
            transform: scale(1.1) !important;
            animation: none !important;
        }
        #snow-chat-widget .snow-toggle:active {
            transform: scale(0.95) !important;
        }
        #snow-chat-widget .snow-toggle img {
            width: 42px !important;
            height: 42px !important;
            border-radius: 50% !important;
            object-fit: contain !important;
            pointer-events: none !important;
        }
        #snow-chat-widget .snow-toggle svg {
            width: 28px !important;
            height: 28px !important;
            color: white !important;
            display: none !important;
            pointer-events: none !important;
        }
        #snow-chat-widget .snow-toggle.open img { display: none !important; }
        #snow-chat-widget .snow-toggle.open svg { display: block !important; }

        /* Badge */
        #snow-chat-widget .snow-badge {
            position: absolute !important;
            top: -5px !important;
            right: -5px !important;
            background: linear-gradient(135deg, #FFB949, #EAB155) !important;
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
            pointer-events: none !important;
        }
        #snow-chat-widget .snow-badge.hidden { display: none !important; }

        /* Container - Desktop */
        #snow-chat-widget .snow-container {
            position: absolute !important;
            bottom: 80px !important;
            right: 0 !important;
            width: 400px !important;
            height: 500px !important;
            max-height: calc(100vh - 120px) !important;
            background: white !important;
            border-radius: 24px !important;
            box-shadow: 0 24px 48px rgba(38,59,128,0.18) !important;
            display: none !important;
            flex-direction: column !important;
            overflow: hidden !important;
        }
        #snow-chat-widget .snow-container.open {
            display: flex !important;
        }

        /* Header */
        #snow-chat-widget .snow-header {
            background: linear-gradient(135deg, #263B80, #001468) !important;
            color: white !important;
            padding: 16px 20px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            flex-shrink: 0 !important;
        }
        #snow-chat-widget .snow-header-info {
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
        }
        #snow-chat-widget .snow-avatar {
            width: 44px !important;
            height: 44px !important;
            background: white !important;
            border-radius: 50% !important;
            overflow: hidden !important;
            border: 2px solid white !important;
            flex-shrink: 0 !important;
        }
        #snow-chat-widget .snow-avatar img {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
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
            color: rgba(255,255,255,0.9) !important;
        }
        #snow-chat-widget .snow-status-dot {
            width: 8px !important;
            height: 8px !important;
            background: #10b981 !important;
            border-radius: 50% !important;
        }
        #snow-chat-widget .snow-minimize {
            background: rgba(255,255,255,0.2) !important;
            border: none !important;
            border-radius: 12px !important;
            width: 36px !important;
            height: 36px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            cursor: pointer !important;
            -webkit-tap-highlight-color: transparent !important;
            touch-action: manipulation !important;
        }
        #snow-chat-widget .snow-minimize:hover { background: rgba(255,255,255,0.3) !important; }
        #snow-chat-widget .snow-minimize svg { width: 20px !important; height: 20px !important; color: white !important; pointer-events: none !important; }

        /* Messages */
        #snow-chat-widget .snow-messages {
            flex: 1 !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            padding: 20px !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 16px !important;
            background: #F0F6FB !important;
            -webkit-overflow-scrolling: touch !important;
            overscroll-behavior: contain !important;
        }
        #snow-chat-widget .snow-message {
            display: flex !important;
            flex-direction: column !important;
            max-width: 85% !important;
        }
        #snow-chat-widget .snow-message.bot { align-self: flex-start !important; }
        #snow-chat-widget .snow-message.user { align-self: flex-end !important; }
        #snow-chat-widget .snow-message-content {
            padding: 12px 16px !important;
            border-radius: 18px !important;
            font-size: 14px !important;
            line-height: 1.5 !important;
            word-wrap: break-word !important;
        }
        #snow-chat-widget .snow-message.bot .snow-message-content {
            background: white !important;
            color: #263B80 !important;
            border: 1px solid #d4e3f0 !important;
            border-bottom-left-radius: 4px !important;
        }
        #snow-chat-widget .snow-message.user .snow-message-content {
            background: linear-gradient(135deg, #263B80, #001468) !important;
            color: white !important;
            border-bottom-right-radius: 4px !important;
        }
        #snow-chat-widget .snow-message-time {
            font-size: 11px !important;
            color: #64748b !important;
            margin-top: 4px !important;
            padding: 0 4px !important;
        }
        #snow-chat-widget .snow-message.user .snow-message-time { text-align: right !important; }
        #snow-chat-widget .snow-message-content a {
            color: #EAB155 !important;
            font-weight: 600 !important;
        }

        /* Typing Indicator */
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
            animation: swchat-typing 1.4s infinite ease-in-out !important;
        }
        #snow-chat-widget .snow-typing span:nth-child(2) { animation-delay: 0.2s !important; }
        #snow-chat-widget .snow-typing span:nth-child(3) { animation-delay: 0.4s !important; }
        @keyframes swchat-typing {
            0%, 60%, 100% { transform: translateY(0); }
            30% { transform: translateY(-6px); }
        }

        /* Quick Replies */
        #snow-chat-widget .snow-quick-replies {
            padding: 12px 20px 16px !important;
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 10px !important;
            background: #F0F6FB !important;
            flex-shrink: 0 !important;
        }
        #snow-chat-widget .snow-quick-replies:empty { display: none !important; }
        #snow-chat-widget .snow-quick-btn {
            padding: 12px 20px !important;
            background: white !important;
            border: 2px solid #FFB949 !important;
            border-radius: 9999px !important;
            color: #263B80 !important;
            font-size: 13px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            -webkit-tap-highlight-color: transparent !important;
            touch-action: manipulation !important;
        }
        #snow-chat-widget .snow-quick-btn:active {
            background: linear-gradient(135deg, #FFB949, #EAB155) !important;
            color: #001468 !important;
        }

        /* Book Call Button */
        #snow-chat-widget .snow-book-btn {
            display: inline-block !important;
            margin-top: 10px !important;
            padding: 12px 24px !important;
            background: linear-gradient(135deg, #10b981, #059669) !important;
            border: none !important;
            border-radius: 9999px !important;
            color: white !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            -webkit-tap-highlight-color: transparent !important;
        }

        /* Input */
        #snow-chat-widget .snow-input-container {
            padding: 16px 20px !important;
            background: white !important;
            border-top: 1px solid #d4e3f0 !important;
            display: flex !important;
            align-items: center !important;
            flex-shrink: 0 !important;
            position: relative !important;
        }
        #snow-chat-widget .snow-input {
            flex: 1 !important;
            padding: 12px 56px 12px 16px !important;
            border: 1px solid #d4e3f0 !important;
            border-radius: 9999px !important;
            font-size: 16px !important;
            font-weight: 500 !important;
            outline: none !important;
            background: white !important;
            color: #263B80 !important;
            -webkit-appearance: none !important;
            appearance: none !important;
        }
        #snow-chat-widget .snow-input:focus { border-color: #263B80 !important; }
        #snow-chat-widget .snow-input::placeholder { color: #64748b !important; }
        #snow-chat-widget .snow-send {
            width: 40px !important;
            height: 40px !important;
            min-width: 40px !important;
            background: linear-gradient(135deg, #FFB949, #EAB155) !important;
            border: none !important;
            border-radius: 50% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            cursor: pointer !important;
            -webkit-tap-highlight-color: transparent !important;
            touch-action: manipulation !important;
            position: absolute !important;
            right: 24px !important;
        }
        #snow-chat-widget .snow-send:active { transform: scale(0.95) !important; }
        #snow-chat-widget .snow-send svg { width: 18px !important; height: 18px !important; color: #001468 !important; pointer-events: none !important; }

        /* Mobile - Full Screen */
        @media (max-width: 768px) {
            #snow-chat-widget {
                bottom: 16px !important;
                right: 16px !important;
            }
            #snow-chat-widget .snow-toggle {
                width: 60px !important;
                height: 60px !important;
            }
            #snow-chat-widget .snow-toggle.open {
                display: none !important;
            }
            #snow-chat-widget .snow-toggle img {
                width: 36px !important;
                height: 36px !important;
            }
            #snow-chat-widget .snow-container {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                bottom: 0 !important;
                width: 100% !important;
                height: 100% !important;
                max-height: none !important;
                border-radius: 0 !important;
                z-index: 2147483646 !important;
            }
            #snow-chat-widget .snow-header {
                padding-top: max(16px, env(safe-area-inset-top)) !important;
            }
            #snow-chat-widget .snow-input-container {
                padding-bottom: max(16px, env(safe-area-inset-bottom)) !important;
            }
            #snow-chat-widget .snow-messages {
                padding-bottom: 10px !important;
            }
        }

        /* Ensure Calendly popup appears above chat widget */
        .calendly-overlay {
            z-index: 2147483648 !important;
        }
        .calendly-popup {
            z-index: 2147483648 !important;
        }
    `;
    document.head.appendChild(style);

    // Create Widget HTML
    function createWidget() {
        const widget = document.createElement('div');
        widget.id = 'snow-chat-widget';
        widget.innerHTML = `
            <button class="snow-toggle" type="button" aria-label="Open chat">
                <img src="${CONFIG.logoImg}" alt="Chat">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                <span class="snow-badge">1</span>
            </button>
            <div class="snow-container">
                <div class="snow-header">
                    <div class="snow-header-info">
                        <div class="snow-avatar"><img src="${CONFIG.avatarImg}" alt="Milos"></div>
                        <div class="snow-header-text">
                            <h3>Milos</h3>
                            <span class="snow-status"><span class="snow-status-dot"></span>Online now</span>
                        </div>
                    </div>
                    <button class="snow-minimize" type="button" aria-label="Close chat">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="snow-messages"></div>
                <div class="snow-quick-replies"></div>
                <div class="snow-input-container">
                    <input type="text" class="snow-input" placeholder="Type your message..." autocomplete="off">
                    <button class="snow-send" type="button" aria-label="Send message">
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

    // Chat Agent
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
            this.isMobile = window.innerWidth <= 768;
            this.scrollY = 0;

            this.sessionId = sessionStorage.getItem('snow_chat_session') ||
                ('sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));
            sessionStorage.setItem('snow_chat_session', this.sessionId);

            this.leadData = this.loadLeadData();
            this.history = this.loadHistory();
            this.leadSubmitted = false;
            this.historyRestored = false;

            this.bindEvents();
            // Only auto-open if user hasn't manually closed before
            if (CONFIG.autoOpen && localStorage.getItem('sm_chat_closed') !== 'true') {
                setTimeout(() => {
                    if (!this.isOpen && localStorage.getItem('sm_chat_closed') !== 'true') {
                        this.toggleChat();
                    }
                }, CONFIG.autoOpenDelay);
            }
        }

        loadHistory() {
            try {
                const saved = localStorage.getItem('sm_chat_history');
                return saved ? JSON.parse(saved) : [];
            } catch (e) {
                return [];
            }
        }

        saveHistory() {
            try {
                localStorage.setItem('sm_chat_history', JSON.stringify(this.history));
            } catch (e) {
                console.error('Failed to save chat history:', e);
            }
        }

        loadLeadData() {
            try {
                const saved = localStorage.getItem('sm_lead_data');
                return saved ? JSON.parse(saved) : {};
            } catch (e) {
                return {};
            }
        }

        saveLeadData() {
            try {
                localStorage.setItem('sm_lead_data', JSON.stringify(this.leadData));
            } catch (e) {
                console.error('Failed to save lead data:', e);
            }
        }

        bindEvents() {
            // Toggle button
            this.toggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleChat();
            });

            // Close button
            this.minimizeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleChat();
            });

            // Send button
            this.sendBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleInput();
            });

            // Input enter key
            this.input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleInput();
                }
            });

            // Prevent body scroll when touching messages area
            this.container.addEventListener('touchmove', (e) => {
                e.stopPropagation();
            }, { passive: true });

            // Update mobile state on resize
            window.addEventListener('resize', () => {
                this.isMobile = window.innerWidth <= 768;
            });
        }

        toggleChat() {
            this.isOpen = !this.isOpen;

            if (this.isOpen) {
                // Open chat
                this.container.classList.add('open');
                this.toggle.classList.add('open');
                this.badge.classList.add('hidden');

                // Lock body scroll on mobile
                if (this.isMobile) {
                    this.scrollY = window.scrollY;
                    document.body.classList.add('snow-chat-open');
                    document.body.style.top = `-${this.scrollY}px`;
                }

                // Restore history if exists, otherwise start new conversation
                if (this.history.length && !this.historyRestored) {
                    this.restoreHistory();
                } else if (!this.history.length) {
                    this.startConversation();
                }
            } else {
                // Close chat
                this.container.classList.remove('open');
                this.toggle.classList.remove('open');

                // User manually closed - remember this to prevent auto-reopen
                localStorage.setItem('sm_chat_closed', 'true');

                // Unlock body scroll on mobile
                if (this.isMobile) {
                    document.body.classList.remove('snow-chat-open');
                    document.body.style.top = '';
                    window.scrollTo(0, this.scrollY);
                }

                // Blur input to close keyboard
                this.input.blur();
            }
        }

        restoreHistory() {
            this.historyRestored = true;
            this.history.forEach(msg => {
                const div = document.createElement('div');
                div.className = `snow-message ${msg.sender}`;
                div.innerHTML = `<div class="snow-message-content">${msg.sender === 'bot' ? this.formatText(msg.text) : this.escapeHtml(msg.text)}</div>
                    <div class="snow-message-time">${new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>`;
                this.messages.appendChild(div);
            });
            this.scrollToBottom();
        }

        async startConversation() {
            await this.simulateTyping(1200);
            this.addMessage("Hey, I am Milos. Just browsing, or looking to scale profitably with paid ads?", 'bot');
            this.showReplies(["Yes, I run an e-commerce brand", "Yes, I do lead gen", "Just exploring"]);
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
                const res = await fetch(CONFIG.apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: this.sessionId, message, leadData: this.leadData })
                });
                const data = await res.json();
                if (data.leadData) {
                    this.leadData = { ...this.leadData, ...data.leadData };
                    this.saveLeadData();
                }
                await this.delay(Math.min(1000 + data.message.length * 20, 3000));
                this.hideTyping();
                this.addMessage(data.message, 'bot');
                if (data.quickReplies?.length) this.showReplies(data.quickReplies);
                if (this.leadData.name && this.leadData.email && !this.leadSubmitted) this.submitLead();
            } catch (e) {
                console.error('Snow Chat Error:', e);
                this.hideTyping();
                this.addMessage("Something went wrong. Please try again or visit thesnowmedia.com", 'bot');
            }
            this.isTyping = false;
        }

        addMessage(text, sender) {
            const div = document.createElement('div');
            div.className = `snow-message ${sender}`;
            div.innerHTML = `<div class="snow-message-content">${sender === 'bot' ? this.formatText(text) : this.escapeHtml(text)}</div>
                <div class="snow-message-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>`;
            this.messages.appendChild(div);
            this.scrollToBottom();
            this.history.push({ text, sender, time: new Date().toISOString() });
            this.saveHistory();
        }

        formatText(text) {
            let t = this.escapeHtml(text);
            t = t.replace(/\[BOOK_CALL\]/g, '<button class="snow-book-btn" onclick="window.SnowChat.openCalendly()">📅 Book a Call</button>');
            t = t.replace(/(https?:\/\/[^\s&]+)/g, '<a href="$1" target="_blank">$1</a>');
            t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            return t.replace(/\n/g, '<br>');
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
                btn.type = 'button';
                btn.textContent = text;
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.handleReply(text);
                });
                this.quickReplies.appendChild(btn);
            });
            this.scrollToBottom();
        }

        clearReplies() { this.quickReplies.innerHTML = ''; }

        showTyping() {
            if (document.getElementById('snow-typing')) return;
            const div = document.createElement('div');
            div.className = 'snow-message bot';
            div.id = 'snow-typing';
            div.innerHTML = '<div class="snow-typing"><span></span><span></span><span></span></div>';
            this.messages.appendChild(div);
            this.scrollToBottom();
        }

        hideTyping() { document.getElementById('snow-typing')?.remove(); }

        async simulateTyping(ms) {
            this.showTyping();
            await this.delay(ms);
            this.hideTyping();
        }

        scrollToBottom() {
            requestAnimationFrame(() => {
                this.messages.scrollTop = this.messages.scrollHeight;
            });
        }

        delay(ms) { return new Promise(r => setTimeout(r, ms)); }

        openCalendly() {
            // On mobile, close chat first so Calendly is fully visible
            if (this.isMobile && this.isOpen) {
                this.toggleChat();
            }

            window.Calendly ? Calendly.initPopupWidget({
                url: CONFIG.calendlyUrl,
                prefill: { name: this.leadData.name || '', email: this.leadData.email || '' }
            }) : window.open(CONFIG.calendlyUrl, '_blank');
        }

        async submitLead() {
            if (this.leadSubmitted) return;
            try {
                await fetch(CONFIG.leadsUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: this.sessionId, leadData: this.leadData, conversationHistory: this.history })
                });
                this.leadSubmitted = true;
            } catch (e) { console.error('Lead submit error:', e); }
        }
    }

    // Initialize
    function init() {
        if (document.getElementById('snow-chat-widget')) return;
        window.SnowChat = new SnowChatAgent(createWidget());
    }

    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
