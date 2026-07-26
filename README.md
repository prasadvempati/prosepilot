# ProsePilot

**Your Writing Co-Pilot** — Grammar, clarity, and tone checking at $5/month.

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL (local or Railway)
- Redis (optional, for caching)
- DeepSeek API key

### Setup

```bash
# Install dependencies
npm install

# Set up environment
cp services/api/.env.example services/api/.env
# Edit services/api/.env with your keys

# Start development
npm run dev
```

This starts:
- Web app at http://localhost:3000
- API at http://localhost:3001

### Database Setup

```bash
# Generate migrations
npm run db:generate

# Push schema to database
npm run db:push
```

## Project Structure

```
prosepilot/
├── apps/web/          # React + Vite frontend
├── apps/extension/    # Chrome/Edge extension (Phase 2)
├── services/api/      # Fastify API server
├── packages/
│   ├── ui/            # Shared React components
│   ├── writing-core/  # Shared types, fact extraction, offsets
│   └── config/        # Shared TypeScript, ESLint config
└── infra/             # Railway, Docker configs
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, Zustand |
| Backend | Fastify, TypeScript, Drizzle ORM |
| Database | PostgreSQL |
| Grammar Engine | LanguageTool OSS (free) + DeepSeek V4 Flash ($0.14/M tokens) |
| Auth | Clerk |
| Payments | Stripe |
| Hosting | Railway |

## API

| Endpoint | Purpose |
|---|---|
| POST /v1/check | Grammar, spelling, punctuation, clarity, style issues |
| POST /v1/rewrite | Tone-controlled rewrite with fact preservation |
| POST /v1/facts/validate | Compare protected facts |
| GET /v1/usage | Current quota and usage |
| GET /health/live | Health check |

## Pricing

| Plan | Price | Features |
|---|---|---|
| Free | $0 | 5,000 words/day, basic grammar, 3 rewrites/day |
| Pro | $5/mo | Unlimited checks, all 12 tones, fact preservation, extension |
| Team | $4/user/mo | Shared terminology, admin dashboard, team billing |

## License

Proprietary — All rights reserved.
