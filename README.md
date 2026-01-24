# The Snow Media - AI Sales Chat Agent

A conversational sales chat agent designed for The Snow Media, featuring both rule-based and AI-powered (Claude) modes.

## Features

- **AI-Powered Conversations**: Natural language understanding via Claude API
- **Lead Qualification**: Automatic capture of name, email, phone, business details
- **Smart Context**: Remembers conversation history and lead data
- **Quick Replies**: ManyChat-style buttons for guided conversation
- **Typing Indicators**: Realistic typing animation
- **Mobile Responsive**: Works on all device sizes
- **Easy Embedding**: Single script tag for any website

## File Structure

```
snow-media-chat-agent/
├── index.html          # Demo - Rule-based version
├── index-ai.html       # Demo - AI-powered version
├── styles.css          # Styles for demo pages
├── chat-agent.js       # Rule-based agent (50+ flows)
├── chat-agent-ai.js    # AI-powered frontend agent
├── embed.js            # Embeddable rule-based widget
├── embed-ai.js         # Embeddable AI-powered widget
├── server/
│   ├── server.js       # Node.js backend with Claude API
│   ├── package.json    # Dependencies
│   └── .env.example    # Environment variables template
└── README.md           # This file
```

---

## Quick Start: AI-Powered Version

### 1. Set Up the Backend

```bash
cd snow-media-chat-agent/server

# Install dependencies
npm install

# Create .env file with your API key
cp .env.example .env
# Edit .env and add your Anthropic API key

# Start the server
npm start
```

### 2. Get Your Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Create an account or sign in
3. Navigate to API Keys
4. Create a new key and copy it
5. Add it to your `.env` file:
   ```
   ANTHROPIC_API_KEY=sk-ant-xxxxx
   ```

### 3. Test the Chat

Open `index-ai.html` in your browser. The status indicator will show if the backend is connected.

---

## Embedding on Your Website

### AI-Powered Widget

```html
<script
  src="https://yourdomain.com/embed-ai.js"
  data-api-url="https://your-backend.com/api/chat"
  data-leads-url="https://your-backend.com/api/leads"
  data-company="The Snow Media"
  data-color="#2563eb"
  data-auto-open="true"
  data-delay="3000"
></script>
```

### Rule-Based Widget (No Backend Required)

```html
<script src="https://yourdomain.com/embed.js"></script>
```

---

## Configuration Options

| Attribute | Description | Default |
|-----------|-------------|---------|
| `data-api-url` | Chat API endpoint | `http://localhost:3000/api/chat` |
| `data-leads-url` | Leads submission endpoint | `http://localhost:3000/api/leads` |
| `data-company` | Company name displayed | `The Snow Media` |
| `data-color` | Primary brand color | `#2563eb` |
| `data-auto-open` | Auto-open chat | `true` |
| `data-delay` | Auto-open delay (ms) | `3000` |

---

## API Endpoints

### POST /api/chat

Send a message and get an AI response.

**Request:**
```json
{
  "sessionId": "session_123",
  "message": "I need help with Google Ads",
  "leadData": { "name": "John" }
}
```

**Response:**
```json
{
  "message": "Great! Google Ads is perfect for...",
  "quickReplies": ["Tell me more", "See pricing"],
  "leadData": { "name": "John", "interest": "google_ads" },
  "sessionId": "session_123"
}
```

### POST /api/leads

Submit qualified lead data.

**Request:**
```json
{
  "sessionId": "session_123",
  "leadData": {
    "name": "John Smith",
    "email": "john@example.com",
    "phone": "555-1234"
  },
  "conversationHistory": [...]
}
```

### GET /api/health

Health check endpoint.

---

## AI Agent Personality

The AI is configured with a detailed system prompt that defines:

- **Company Knowledge**: Services, pricing, unique value propositions
- **Personality**: Friendly, professional, direct, not pushy
- **Goals**: Understand needs → Educate → Qualify → Capture info → Book call
- **Lead Qualification**: Budget, timeline, decision-making authority
- **Objection Handling**: Pricing, timing, past agency experiences

You can customize the personality by editing `SYSTEM_PROMPT` in `server/server.js`.

---

## Lead Data Extraction

The AI automatically extracts:

| Data | Detection Method |
|------|------------------|
| Email | Regex pattern matching |
| Phone | Various phone formats |
| Name | Context-aware detection |
| Business Type | Conversation context |
| Budget | Mentioned ranges |
| Goals | Stated objectives |

---

## Events

Listen for chat events on your page:

```javascript
// Lead data updated
window.addEventListener('snowchat:leadupdate', (e) => {
  console.log('Lead updated:', e.detail.leadData);
});

// Lead submitted to backend
window.addEventListener('snowchat:leadsubmit', (e) => {
  console.log('Lead submitted:', e.detail);
  // Trigger your own tracking/analytics
});

// For embed-ai.js
window.addEventListener('snowchat:lead', (e) => {
  console.log('New lead:', e.detail);
});
```

---

## Production Deployment

### Backend Deployment Options

1. **Heroku**
   ```bash
   heroku create snow-media-chat
   heroku config:set ANTHROPIC_API_KEY=your-key
   git push heroku main
   ```

2. **Railway**
   - Connect GitHub repo
   - Add `ANTHROPIC_API_KEY` environment variable
   - Deploy

3. **AWS/GCP/Azure**
   - Deploy as container or serverless function
   - Set environment variables

4. **VPS (DigitalOcean, Linode)**
   ```bash
   npm install pm2 -g
   pm2 start server.js
   ```

### Frontend Deployment

1. Host `embed-ai.js` on CDN (CloudFlare, AWS CloudFront)
2. Update `data-api-url` to your production backend URL
3. Ensure HTTPS for both frontend and backend

### Security Considerations

- Use HTTPS everywhere
- Add rate limiting to prevent abuse
- Consider adding CORS restrictions
- Don't expose API keys in frontend code
- Validate and sanitize all inputs

---

## CRM Integrations

### HubSpot

```javascript
// In server.js, add to /api/leads endpoint:
const hubspot = require('@hubspot/api-client');
const client = new hubspot.Client({ accessToken: process.env.HUBSPOT_TOKEN });

await client.crm.contacts.basicApi.create({
  properties: {
    email: leadData.email,
    firstname: leadData.name,
    phone: leadData.phone
  }
});
```

### Zapier Webhook

```javascript
await fetch('https://hooks.zapier.com/hooks/catch/xxxxx', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(leadData)
});
```

### Email Notification

```javascript
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL, pass: process.env.EMAIL_PASS }
});

await transporter.sendMail({
  from: process.env.EMAIL,
  to: 'leads@thesnowmedia.com',
  subject: `New Lead: ${leadData.name}`,
  text: JSON.stringify(leadData, null, 2)
});
```

---

## Customization

### Change AI Personality

Edit `SYSTEM_PROMPT` in `server/server.js`:

```javascript
const SYSTEM_PROMPT = `You are an AI assistant for [Your Company]...`;
```

### Add Services/Products

Update the "About" section in the system prompt with your offerings.

### Change Qualification Criteria

Modify the qualification section to match your ideal customer profile.

### Custom Quick Replies

The AI generates these dynamically, but you can influence them through the system prompt.

---

## Troubleshooting

### "Backend not running" error
- Ensure server is running: `npm start`
- Check port 3000 is available
- Verify ANTHROPIC_API_KEY is set

### No AI responses
- Check browser console for errors
- Verify API key is valid
- Check network tab for failed requests

### Slow responses
- Normal: AI responses take 1-3 seconds
- If longer: Check API rate limits

### CORS errors
- Ensure `cors()` middleware is enabled
- Check allowed origins if restricted

---

## Cost Estimation

Claude API pricing (approximate):
- Input: $3 / million tokens
- Output: $15 / million tokens

Typical conversation (10 exchanges): ~2,000 tokens = ~$0.01

1,000 conversations/month ≈ $10-15

---

## Support

For help with customization or integration:
- Visit [thesnowmedia.com](https://thesnowmedia.com)
- Book a consultation call

---

Built with Claude API for The Snow Media. Grow. Scale. Thrive.
