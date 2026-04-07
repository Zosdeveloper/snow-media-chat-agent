# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered sales chat widget for The Snow Media marketing agency. The chat agent uses Claude API (as "Milos") to qualify leads, capture contact info, and book strategy calls. Includes a RAG system that learns from successful conversation patterns.

## Tech Stack

- **Backend**: Node.js + Express.js (all code in `server/`)
- **Database**: SQLite (better-sqlite3) with sqlite-vec extension for vector search
- **AI**: Claude API (claude-sonnet-4-20250514) for conversations
- **Embeddings**: Voyage AI (voyage-3-lite, 512 dimensions) for RAG similarity search
- **Deployment**: Railway (auto-deploy from GitHub `main`)

## Commands

```bash
# All commands run from server/
cd server
npm install
npm run dev          # nodemon hot reload on localhost:3000
npm start            # production: node server.js
```

No test suite exists. No linter configured.

## Environment Variables

Required in `server/.env` (see `server/.env.example`):
- `ANTHROPIC_API_KEY` - Claude API (required)
- `VOYAGE_API_KEY` - Voyage AI embeddings (required for RAG, gracefully degrades without)
- `ADMIN_API_KEY` - Admin dashboard auth via `X-Admin-Api-Key` header
- `ALERT_WEBHOOK_URL` - Discord webhook for error alerts
- `PORT`, `NODE_ENV`, `DATABASE_PATH`

## Architecture

### Request Flow (POST /api/chat)

1. Validate input, get/create in-memory session (`Map`)
2. Persist conversation + message to SQLite
3. RAG: embed current context via Voyage AI, find similar successful patterns via sqlite-vec
4. `promptBuilder` enriches system prompt with RAG examples + lead context + stage guidance
5. Claude generates response (max 500 tokens)
6. Parse special tokens (`[BOOK_CALL]`, `[QUICK_REPLIES: ...]`) from response
7. Extract lead data (name/email/phone) from user message via regex
8. Auto-tagger evaluates if conversation qualifies as a saveable pattern

### Key Files

- **`server/prompts/systemPrompt.js`** - Full system prompt defining Milos's personality, services, case studies, objection handling, and conversation rules
- **`server/config.js`** - All tunable values: RAG thresholds, rate limits, session settings, CORS origins, embedding config
- **`server/database/db.js`** - SQLite wrapper with vector search, migrations, all CRUD operations
- **`server/database/schema.sql`** - Three tables: `conversations`, `messages`, `successful_patterns` + triggers
- **`server/services/ragService.js`** - Vector similarity search for few-shot pattern retrieval
- **`server/services/embeddingService.js`** - Voyage AI API wrapper
- **`server/services/autoTagger.js`** - Scores conversations for auto-saving as patterns (weighted: booking 0.3, positive response 0.2, email captured 0.2, etc.)
- **`server/services/promptBuilder.js`** - Assembles enriched prompt from base + RAG context + lead data
- **`server/services/alertService.js`** - Discord webhook notifications on errors
- **`server/routes/admin.js`** - Admin API: conversations, patterns CRUD, analytics, CSV export

### Client Widget

- **`server/public/chat-agent-ai.js`** - Production widget (relative paths, served by Express)
- **`server/public/embed-ai.js`** - Embeddable version for external sites

Special tokens in AI responses:
- `[BOOK_CALL]` - Renders Calendly booking button
- `[QUICK_REPLIES: "Option 1", "Option 2"]` - Renders quick reply buttons

### Static Serving

- Production (`NODE_ENV=production`): serves `server/public/`
- Development: serves repo root (for dev HTML pages)

### Database

SQLite at `./data/chat.db` (Railway persistent volume). WAL mode enabled. Migrations tracked in `_migrations` table.

Vector search: `vec_patterns` virtual table (sqlite-vec). Falls back to recent high-confidence patterns if extension unavailable.

### Sessions

In-memory `Map` in `server.js`. Sessions expire after 1 hour (marked `abandoned` in DB). Cleanup runs every 15 minutes. Max 20 messages kept per session.

## API Endpoints

**Public:**
- `POST /api/chat` - Main chat (rate limited: 20/min)
- `POST /api/leads` - Lead submission
- `GET /api/health` - Health check with DB stats

**Admin (requires `X-Admin-Api-Key` header):**
- `GET /api/admin/conversations` - List with filtering/pagination
- `GET /api/admin/conversations/:id` - Conversation with messages
- `PATCH /api/admin/conversations/:id/outcome` - Update outcome
- `GET/POST/DELETE /api/admin/patterns` - Pattern CRUD
- `GET /api/admin/export/leads` - CSV export
- `GET /api/admin/analytics` - Dashboard analytics
- `GET /api/admin/stats` - Quick stats

## Conversation Outcomes

`in_progress` | `converted` | `contact_captured` | `not_qualified` | `abandoned`

## Deployment

Railway auto-deploys from `main`. Admin dashboard at the Railway URL + `/admin.html`.

Database persisted at `./data/chat.db` on Railway persistent volume.

## Important Patterns

- CORS whitelist in `config.js` - add new domains there, not in server.js
- Output validation in the chat endpoint flags suspicious AI responses (unrealistic percentages, guarantee language, specific pricing)
- Lead data extraction uses regex patterns in `extractLeadData()` in server.js - name detection requires explicit introduction phrases to avoid false positives
- All DB writes in the chat flow are fire-and-forget (caught errors logged but don't block response)
