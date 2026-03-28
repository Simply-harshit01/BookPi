# BookPi

Personalized book recommendation app v1.

## Structure
- `apps/web`: Next.js frontend
- `apps/api`: Express API
- `db/schema.sql`: PostgreSQL schema
- `prd.md`: Product requirements document

## Quick Start
1. Copy `.env.example` to `.env`.
2. Install dependencies with `npm install`.
3. Create a PostgreSQL database.
4. Run migrations: `npm run db:migrate`
5. Seed base catalog cache: `npm run db:seed`
6. Run API: `npm run dev:api`
7. Run web: `npm run dev:web`

## Notes
- API defaults to PostgreSQL when `DATABASE_URL` is set.
- Set `USE_IN_MEMORY_DB=true` to run API with the in-memory repository.
- Google Books integration reads `GOOGLE_BOOKS_API_KEY` when provided.
- Recommendation ranking uses:
  - feature-based scoring with learned weights from `apps/api/data/learned_weights.json`
  - recency decay on feedback signals
  - candidate quality filtering + dedupe
  - light exploration injection to avoid repetitive feeds
  - popularity prior from historical engagement (cold start support)

## Recommendation Training
- Train/update weights from impressions + feedback:
  - `npm run reco:train`
- This updates `apps/api/data/learned_weights.json`.
