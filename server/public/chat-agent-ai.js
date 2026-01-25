/**
 * The Snow Media - AI-Powered Sales Chat Agent
 * Uses Claude API for natural conversations with lead qualification
 */

class SnowMediaAIChatAgent {
    constructor(config = {}) {
        // Configuration
        this.config = {
            apiEndpoint: config.apiEndpoint || '/api/chat',
            leadsEndpoint: config.leadsEndpoint || '/api/leads',
            calendlyUrl: config.calendlyUrl || 'https://calendly.com/milos-thesnowmedia/30min',
            autoOpen: config.autoOpen !== false,
            autoOpenDelay: config.autoOpenDelay || 3000,
            greeting: config.greeting || null, // Custom greeting or null for AI greeting
            ...config
        };

        // Load Calendly embed script
        this.loadCalendlyScript();

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
        this.isTyping = false;
        this.sessionId = this.getOrCreateSessionId();
        this.leadData = {};
        this.messageHistory = [];
        this.pendingMessage = null;

        // Initialize
        this.bindEvents();
        if (this.config.autoOpen) {
            this.scheduleAutoOpen();
        }
    }

    loadCalendlyScript() {
        if (document.querySelector('script[src*="calendly.com"]')) return;
        const script = document.createElement('script');
        script.src = 'https://assets.calendly.com/assets/external/widget.js';
        script.async = true;
        document.head.appendChild(script);
    }

    openCalendly() {
        if (window.Calendly) {
            Calendly.initPopupWidget({
                url: this.config.calendlyUrl,
                prefill: {
                    name: this.leadData.name || '',
                    email: this.leadData.email || ''
                }
            });
        } else {
            // Fallback: open in new tab
            window.open(this.config.calendlyUrl, '_blank');
        }
    }

    getOrCreateSessionId() {
        let sessionId = sessionStorage.getItem('snow_chat_session');
        if (!sessionId) {
            sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            sessionStorage.setItem('snow_chat_session', sessionId);
        }
        return sessionId;
    }

    bindEvents() {
        this.chatToggle.addEventListener('click', () => this.toggleChat());
        this.minimizeBtn.addEventListener('click', () => this.toggleChat());
        this.sendBtn.addEventListener('click', () => this.handleUserInput());
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleUserInput();
            }
        });

        // Handle input focus
        this.chatInput.addEventListener('focus', () => {
            this.clearQuickReplies();
        });
    }

    scheduleAutoOpen() {
        setTimeout(() => {
            if (!this.isOpen) {
                this.toggleChat();
            }
        }, this.config.autoOpenDelay);
    }

    toggleChat() {
        this.isOpen = !this.isOpen;
        this.chatContainer.classList.toggle('hidden', !this.isOpen);
        this.chatIcon.classList.toggle('hidden', this.isOpen);
        this.closeIcon.classList.toggle('hidden', !this.isOpen);
        this.notificationBadge.classList.add('hidden');

        if (this.isOpen) {
            this.chatInput.focus();
            if (this.messageHistory.length === 0) {
                this.startConversation();
            }
        }
    }

    async startConversation() {
        // Initial greeting from Milos
        const greeting = this.config.greeting ||
            "Hey! I'm Milos. Are you looking to scale profitably with paid ads?";

        await this.simulateTyping(1200);
        this.addMessage(greeting, 'bot');

        // Show initial quick replies
        this.showQuickReplies([
            "Yes, I run an e-commerce brand",
            "Yes, I run a home service business",
            "Just exploring"
        ]);
    }

    async handleUserInput() {
        const input = this.chatInput.value.trim();
        if (!input || this.isTyping) return;

        this.chatInput.value = '';
        this.addMessage(input, 'user');
        this.clearQuickReplies();

        // Get AI response
        await this.getAIResponse(input);
    }

    handleQuickReply(text) {
        if (this.isTyping) return;

        this.addMessage(text, 'user');
        this.clearQuickReplies();

        // Get AI response
        this.getAIResponse(text);
    }

    async getAIResponse(userMessage) {
        this.isTyping = true;
        this.showTypingIndicator();

        try {
            const response = await fetch(this.config.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    message: userMessage,
                    leadData: this.leadData
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            // Update lead data
            if (data.leadData) {
                this.leadData = { ...this.leadData, ...data.leadData };
                this.onLeadDataUpdate(this.leadData);
            }

            // Simulate natural typing delay based on message length
            const typingDelay = Math.min(1000 + (data.message.length * 20), 3000);
            await this.delay(typingDelay);

            this.hideTypingIndicator();
            this.addMessage(data.message, 'bot');

            // Show quick replies if provided
            if (data.quickReplies && data.quickReplies.length > 0) {
                this.showQuickReplies(data.quickReplies);
            }

            // Check if lead is qualified and send to backend
            if (this.isLeadQualified()) {
                this.submitLead();
            }

        } catch (error) {
            console.error('AI Response Error:', error);
            this.hideTypingIndicator();

            // Fallback response
            this.addMessage(
                "Hmm, something glitched on my end. Mind trying that again? Or you can book a call directly at thesnowmedia.com/book",
                'bot'
            );
            this.showQuickReplies([
                "Try again",
                "Book a call"
            ]);
        }

        this.isTyping = false;
    }

    addMessage(text, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;

        // Process text for links and formatting
        const processedText = this.processMessageText(text);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = processedText;

        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = this.getTimeString();

        messageDiv.appendChild(contentDiv);
        messageDiv.appendChild(timeDiv);

        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();

        this.messageHistory.push({
            text,
            sender,
            time: new Date().toISOString()
        });
    }

    processMessageText(text) {
        // First, escape HTML to prevent XSS attacks
        const escaped = this.escapeHtml(text);

        // Convert [BOOK_CALL] to booking button
        let processed = escaped.replace(
            /\[BOOK_CALL\]/g,
            '<button class="book-call-btn" onclick="window.snowMediaChat.openCalendly()">📅 Book a Call</button>'
        );

        // Convert URLs to links (on escaped text)
        processed = processed.replace(
            /(https?:\/\/[^\s&]+)/g,
            '<a href="$1" target="_blank" rel="noopener">$1</a>'
        );

        // Convert **bold** to <strong>
        processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

        // Convert line breaks
        processed = processed.replace(/\n/g, '<br>');

        return processed;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showQuickReplies(replies) {
        this.quickReplies.innerHTML = '';

        replies.forEach(text => {
            const button = document.createElement('button');
            button.className = 'quick-reply-btn';
            button.textContent = text;
            button.addEventListener('click', () => this.handleQuickReply(text));
            this.quickReplies.appendChild(button);
        });

        // Scroll to show quick replies
        setTimeout(() => this.scrollToBottom(), 100);
    }

    clearQuickReplies() {
        this.quickReplies.innerHTML = '';
    }

    showTypingIndicator() {
        const existingIndicator = document.getElementById('typing-indicator');
        if (existingIndicator) return;

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

    async simulateTyping(duration) {
        this.showTypingIndicator();
        await this.delay(duration);
        this.hideTypingIndicator();
    }

    scrollToBottom() {
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    getTimeString() {
        return new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    isLeadQualified() {
        // Consider lead qualified if we have at least name and email
        return this.leadData.name && this.leadData.email;
    }

    onLeadDataUpdate(leadData) {
        console.log('Lead data updated:', leadData);

        // Dispatch custom event for integrations
        const event = new CustomEvent('snowchat:leadupdate', {
            detail: { leadData, sessionId: this.sessionId }
        });
        window.dispatchEvent(event);
    }

    async submitLead() {
        // Only submit once
        if (this.leadSubmitted) return;

        try {
            const response = await fetch(this.config.leadsEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    leadData: this.leadData,
                    conversationHistory: this.messageHistory
                })
            });

            if (response.ok) {
                this.leadSubmitted = true;
                console.log('Lead submitted successfully');

                // Dispatch event
                const event = new CustomEvent('snowchat:leadsubmit', {
                    detail: { leadData: this.leadData, sessionId: this.sessionId }
                });
                window.dispatchEvent(event);
            }
        } catch (error) {
            console.error('Error submitting lead:', error);
        }
    }

    // Public API methods
    getLeadData() {
        return { ...this.leadData };
    }

    getConversationHistory() {
        return [...this.messageHistory];
    }

    setLeadData(data) {
        this.leadData = { ...this.leadData, ...data };
    }

    open() {
        if (!this.isOpen) this.toggleChat();
    }

    close() {
        if (this.isOpen) this.toggleChat();
    }

    sendMessage(message) {
        if (!this.isOpen) this.open();
        this.chatInput.value = message;
        this.handleUserInput();
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Check for configuration from script tag
    const scriptTag = document.querySelector('script[data-snow-chat]');
    const config = scriptTag ? JSON.parse(scriptTag.dataset.snowChat || '{}') : {};

    window.snowMediaChat = new SnowMediaAIChatAgent(config);
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SnowMediaAIChatAgent;
}
