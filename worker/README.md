# PAA Dominator - Cloudflare Worker Backend

A Cloudflare Workers-based API for PAA (People Also Ask) research, tracking, and content generation.

## Features

- **Research**: Fetch PAA questions from Google via SerpAPI with recursive expansion
- **Tracking**: Monitor PAA changes for target keywords on a schedule
- **Generation**: AI-powered answer generation optimized for featured snippets
- **Publishing**: Export to Webflow CMS, HTML embeds, or CSV/JSON

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono.js
- **Database**: Cloudflare D1 (SQLite)
- **APIs**: SerpAPI, Anthropic Claude, Webflow, Resend
- **Auth**: Memberstack integration

## Setup

### 1. Install Dependencies

```bash
cd worker
npm install
```

### 2. Create D1 Database

```bash
# Create the database
npx wrangler d1 create paa-dominator-db

# Copy the database_id from the output and update wrangler.toml
```

### 3. Run Migrations

```bash
# Local development
npm run db:migrate

# Production
npm run db:migrate:prod
```

### 4. Set Secrets

```bash
wrangler secret put SERPAPI_KEY
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put MEMBERSTACK_SECRET_KEY
wrangler secret put RESEND_API_KEY
```

### 5. Update Configuration

Edit `wrangler.toml`:
- Set your `database_id`
- Update `APP_URL` to your domain
- Update `EMAIL_FROM` to your sender address

### 6. Deploy

```bash
npm run deploy
```

## Development

```bash
npm run dev
```

This starts a local development server at `http://localhost:8787`.

## API Endpoints

### Research

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/paa/fetch` | GET | Fetch PAA questions for a keyword |
| `/api/paa/generate` | POST | Generate AI answers for questions |
| `/api/paa/publish` | POST | Publish to Webflow or export |

### Tracker

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tracker/keywords` | POST | Add keyword to tracking |
| `/api/tracker/dashboard` | GET | Get dashboard overview |
| `/api/tracker/keyword` | GET | Get keyword details |
| `/api/tracker/changes` | GET | Get change feed |
| `/api/tracker/opportunities` | GET | Get content opportunities |

### Projects

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/projects` | GET, POST | List/create projects |
| `/api/projects/:id` | GET, PATCH, DELETE | Manage project |
| `/api/projects/:id/connect-webflow` | POST | Connect Webflow |

### User

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/user/settings` | GET, PATCH | Get/update settings |
| `/api/user/usage` | GET | Get API usage stats |

## Scheduled Jobs

The worker runs a cron job every 6 hours:
- Checks all due tracked keywords
- Detects PAA changes (additions, removals, position changes)
- Sends email/webhook notifications

## Tier Limits

| Tier | Keywords | API Calls/Month |
|------|----------|-----------------|
| Free | 3 | 50 |
| Pro | 25 | 3,000 |
| Agency | 100 | 15,000 |

## Project Structure

```
worker/
├── src/
│   ├── index.ts           # Entry point, router
│   ├── types.ts           # TypeScript interfaces
│   ├── middleware/
│   │   ├── auth.ts        # Memberstack auth
│   │   └── cors.ts        # CORS handling
│   ├── routes/
│   │   ├── paa.ts         # PAA endpoints
│   │   ├── tracker.ts     # Tracker endpoints
│   │   ├── projects.ts    # Project endpoints
│   │   └── user.ts        # User endpoints
│   ├── services/
│   │   ├── serpapi.ts     # SerpAPI client
│   │   └── claude.ts      # Claude AI client
│   ├── tracker/
│   │   ├── engine.ts      # Tracking logic
│   │   └── notifications.ts # Email/webhook alerts
│   └── utils/
│       ├── questions.ts   # Question utilities
│       └── html.ts        # HTML generation
├── migrations/
│   └── 0001_initial.sql   # Database schema
├── wrangler.toml          # Cloudflare config
├── package.json
└── tsconfig.json
```

## Environment Variables

Set via `wrangler.toml` [vars] or `wrangler secret put`:

| Variable | Type | Description |
|----------|------|-------------|
| SERPAPI_KEY | Secret | SerpAPI API key |
| ANTHROPIC_API_KEY | Secret | Anthropic Claude API key |
| MEMBERSTACK_SECRET_KEY | Secret | Memberstack admin API key |
| RESEND_API_KEY | Secret | Resend email API key |
| APP_URL | Var | Your frontend URL |
| EMAIL_FROM | Var | Sender email address |
