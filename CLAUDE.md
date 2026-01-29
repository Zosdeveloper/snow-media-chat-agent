# CLAUDE.md - Snow Media Chat Agent

This file provides guidance for Claude Code when working on this repository.

## Project Overview

AI-powered sales chat widget for The Snow Media marketing agency. The chat agent uses Claude API to qualify leads, capture contact information, and book strategy calls. It includes a RAG (Retrieval Augmented Generation) system that learns from successful conversation patterns.

## Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: SQLite (better-sqlite3) with sqlite-vec extension for vector search
- **AI**: Claude API (Anthropic) for conversations
- **Embeddings**: Voyage AI (voyage-3-lite model, 512 dimensions)
- **Deployment**: Railway (auto-deploy from GitHub)
- **Alerting**: Discord webhooks for error notifications

## Commands

### Development

```bash
cd server
npm install
npm run dev     # Uses nodemon for hot reload
```

### Production

```bash
cd server
npm start       # Runs node server.js
```

### Environment Variables

Required in `.env` (see `.env.example`):

```
ANTHROPIC_API_KEY=     # Claude API key (required)
VOYAGE_API_KEY=        # Voyage AI for embeddings (required for RAG)
ADMIN_API_KEY=         # Admin dashboard authentication
ALERT_WEBHOOK_URL=     # Discord webhook for error alerts
PORT=3000              # Server port
NODE_ENV=development   # or production
DATABASE_PATH=./data/chat.db
```

## Architecture

### Directory Structure

```
snow-media-chat-agent/
├── server/                    # Backend (this is the deployable unit)
│   ├── server.js             # Main Express app, chat endpoint, system prompt
│   ├── config.js             # Centralized configuration
│   ├── database/
│   │   ├── db.js             # SQLite wrapper with vector search
│   │   └── schema.sql        # Database schema
│   ├── services/
│   │   ├── ragService.js     # RAG context retrieval
│   │   ├── embeddingService.js # Voyage AI embeddings
│   │   ├── autoTagger.js     # Auto-detect successful patterns
│   │   ├── promptBuilder.js  # Build enriched prompts
│   │   └── alertService.js   # Discord/Slack notifications
│   ├── routes/
│   │   └── admin.js          # Admin API endpoints
│   └── public/               # Static files for production
│       ├── chat-agent-ai.js  # Client-side chat widget
│       ├── embed-ai.js       # Embeddable version
│       └── admin.html        # Admin dashboard
├── chat-agent-ai.js          # Development client-side widget
├── index.html                # Development test page
└── admin.html                # Development admin dashboard
```

### Key Files

- **server/server.js:77-207** - Main system prompt defining Milos's personality, The Snow Media services, case studies, and conversation rules
- **server/config.js** - All configuration values (RAG thresholds, session limits, etc.)
- **server/database/db.js** - Database operations including vector similarity search
- **server/services/ragService.js** - Retrieves relevant conversation patterns for few-shot learning

### Data Flow

1. User sends message to `/api/chat`
2. Session retrieved/created, message persisted to SQLite
3. RAG service finds similar successful patterns via Voyage embeddings
4. Prompt enriched with relevant examples
5. Claude generates response with lead extraction
6. Response parsed for quick replies and [BOOK_CALL] tokens
7. Auto-tagger checks if conversation should be saved as a pattern

### API Endpoints

**Public:**
- `POST /api/chat` - Main chat endpoint (rate limited: 20/min)
- `POST /api/leads` - Lead submission
- `GET /api/health` - Health check

**Admin (requires X-Admin-Api-Key header):**
- `GET /api/admin/conversations` - List conversations with filtering
- `GET /api/admin/conversations/:id` - Get conversation with messages
- `PATCH /api/admin/conversations/:id/outcome` - Update outcome
- `GET /api/admin/patterns` - List successful patterns
- `POST /api/admin/patterns` - Create pattern manually
- `DELETE /api/admin/patterns/:id` - Delete pattern
- `GET /api/admin/export/leads` - CSV export with filters
- `GET /api/admin/analytics` - Dashboard analytics
- `GET /api/admin/stats` - Quick stats

## Conversation Outcomes

- `in_progress` - Active conversation
- `converted` - Booked a call
- `contact_captured` - Got contact info but no booking
- `not_qualified` - Not a fit (wrong industry/size)
- `abandoned` - Inactive for 1 hour

## RAG System

The RAG system improves responses by:
1. Generating embeddings for current conversation context
2. Finding similar successful patterns via vector similarity (sqlite-vec)
3. Injecting relevant examples into the system prompt

Configuration in `config.js`:
- `rag.maxPatterns`: 3 (patterns retrieved per query)
- `rag.similarityThreshold`: 0.6 (minimum similarity score)
- `autoTag.minConfidence`: 0.7 (threshold for auto-saving patterns)

## Client Widget

Two versions of the client-side widget:
- `chat-agent-ai.js` - Development version (uses localhost:3000)
- `server/public/chat-agent-ai.js` - Production version (uses relative paths)

Special tokens in AI responses:
- `[BOOK_CALL]` - Renders as Calendly booking button
- `[QUICK_REPLIES: "Option 1", "Option 2"]` - Renders quick reply buttons

## Testing Locally

1. Set up environment variables in `server/.env`
2. Run `npm run dev` in server directory
3. Open `http://localhost:3000` to test chat widget
4. Open `http://localhost:3000/admin.html` for admin (enter API key via login prompt)

## Deployment

Deployed to Railway with auto-deploy from GitHub main branch.

Admin dashboard: `https://snow-media-chat-agent-production.up.railway.app/admin.html` (enter API key via the login prompt)

## Important Notes

- Never commit API keys - they should only exist in Railway environment variables
- The `server/public/` directory is what gets served in production
- Changes to client-side files need to be made in both root and `server/public/`
- Database is persisted at `./data/chat.db` (Railway persistent volume)
- Alert webhook sends to Discord on chat errors and lead capture failures

## Future Improvements (Discussed)

- Page-specific chat triggers based on URL
- Lead magnet gating (capture email before downloads)
- Weekly email reports
- A/B testing different openers
