# Personalized Book Recommendation App - Product Requirements Document (PRD)

## 1. Product Definition

### Problem Statement
Readers often spend too much time searching for books that fit their interests. Discovery is fragmented and generic lists do not adapt quickly to personal taste.

### Target Users
- Casual readers who want quick, relevant recommendations.
- Active readers who want recommendations that evolve based on their reading behavior.

### Goals (v1)
- Deliver relevant recommendations within seconds after user login.
- Capture measurable engagement signals to improve ranking over time.
- Establish a feedback loop that adapts recommendations per user.

### Non-Goals (v1)
- Social graph features (friends, follows, shared shelves).
- Advanced parental controls and policy-heavy content governance.
- Heavy dependence on LLM-driven generation for ranking or explanations.

## 2. Scope

### In Scope
- Web app (Next.js + TypeScript).
- Backend API (Node.js + Express + TypeScript).
- PostgreSQL-backed data model and SQL migrations.
- Email/social login endpoints.
- Onboarding capture:
  - `last_read`
  - `favorite_genres`
  - `favorite_books`
  - `disliked_books`
  - mature content toggle
- Recommendation feed with reason labels.
- Feedback actions: click, like, dislike, save, mark read.
- Cold-start flow: onboarding preferences + trending fallback.
- Google Books API integration for metadata and catalog enrichment.

### Out of Scope
- Native mobile client.
- Multi-tenant org controls.
- Editorial CMS.

## 3. User Experience Requirements

### UX Direction
- Clean and minimal interface.
- Fast onboarding with low input friction.
- Recommendation cards with prominent actions and reason labels.

### Main Screens
1. Onboarding
2. Home recommendations feed
3. Book detail
4. Profile/preferences

### Key Interaction Principles
- A user can onboard and receive recommendations in one session.
- Feedback controls are visible on every recommendation card.
- Preference edits immediately affect future recommendation ranking.

## 4. Functional Requirements

### FR-1 Authentication
- API endpoints:
  - `POST /api/auth/signup`
  - `POST /api/auth/login`
  - `POST /api/auth/oauth/callback`
- Authentication produces a bearer token.

### FR-2 User Profile + Preferences
- `GET /api/me`
- `PUT /api/me/preferences`

Type: `UserPreferences`
```ts
interface UserPreferences {
  lastRead: string;
  favoriteGenres: string[];
  favoriteBooks: string[];
  dislikedBooks: string[];
  allowMatureContent: boolean;
}
```

### FR-3 Recommendation Feed
- `GET /api/recommendations?limit=&cursor=`
- Returns `RecommendationItem[]` and optional `nextCursor`.

Type: `RecommendationItem`
```ts
interface RecommendationItem {
  bookId: string;
  title: string;
  authors: string[];
  genres: string[];
  thumbnailUrl?: string;
  reasonLabel: string;
  score: number;
}
```

### FR-4 Feedback Event Capture
- `POST /api/recommendations/feedback`

Type: `FeedbackEvent`
```ts
type FeedbackAction = 'click' | 'like' | 'dislike' | 'save' | 'mark_read';

interface FeedbackEvent {
  bookId: string;
  action: FeedbackAction;
  timestamp: string;
}
```

### FR-5 External Catalog Boundary
- `GoogleBooksClient.searchBooks(query, filters)`
- `GoogleBooksClient.getBookById(id)`

## 5. Recommendation System (v1)

### Candidate Generation
- Generate candidates from:
  - Favorite genres
  - Favorite books (author/title expansion)
  - Last read metadata
  - Trending fallback when history is sparse or API fails

### Ranking
- Stage 1: Rule-based score
  - Genre match boosts
  - Favorite author/title affinity boosts
  - Disliked-title penalties
  - Mature-content filtering before ranking
- Stage 2: Lightweight re-ranker
  - Linear/logistic score calibration from feedback events
  - Features include action counts, recency, and content similarity

### Explanations
- Deterministic templates, e.g., "Because you liked fantasy and recently read X".
- Must map directly to top contributing rule signal.

## 6. Data Model

Required tables:
- `users`
- `user_preferences`
- `books_cache`
- `recommendation_impressions`
- `user_feedback_events`
- `saved_books`

See `db/schema.sql` for exact DDL.

## 7. Non-Functional Requirements

### Performance
- Initial feed response under 2.5s p95 after login.
- Recommendation endpoint should degrade gracefully to cached/trending data.

### Reliability
- Timeout and retry strategy for Google Books API.
- If provider unavailable, serve cached/trending books with explanatory reason labels.

### Privacy/Security
- Standard US privacy baseline:
  - Consent notice.
  - Account deletion pathway.
  - Secure password hashing and token handling.
- Minimize sensitive data storage.

### Observability
- Track impression/click/feedback/save events.
- Ensure CTR can be calculated by user cohort and date.

## 8. Success Metrics

### Primary KPI
- Recommendation CTR.

### Secondary Metrics
- Save rate.
- Onboarding completion rate.
- Day-7 retention (monitoring, not launch gate).

## 9. Test Scenarios (Acceptance)
1. New user completes onboarding and gets personalized recommendations in one session.
2. Returning user sees ranking updates after like/dislike events.
3. Mature-content toggle excludes mature books when disabled.
4. Explanation label matches the strongest personalization signal.
5. Google Books API failure triggers cached/trending fallback.
6. Click event logging supports CTR calculation.
7. User updates preferences and recommendations refresh accordingly.
8. Duplicate feedback events are handled idempotently.

## 10. Delivery Plan (3-4 Weeks)
1. Week 1: PRD sign-off, schema, auth endpoints, onboarding UI shell.
2. Week 2: Catalog integration, recommendation pipeline, feed UI.
3. Week 3: Feedback loop, analytics events, reason labels, mature filter.
4. Week 4: Performance tuning, QA, bug fixes, launch checklist.

## 11. Risks and Mitigations
- Risk: Sparse feedback data in early launch.
  - Mitigation: Start with deterministic rule-based ranking and gradually calibrate with feedback.
- Risk: External API latency/outages.
  - Mitigation: local cache + trending fallback + provider timeout guard.
- Risk: Cold-start relevance variance.
  - Mitigation: mandatory onboarding with quick preference capture.

## 12. Open Decisions Deferred Intentionally
- Deployment platform/provider.
- Infrastructure vendor choices for managed Postgres and monitoring.

Default remains implementation-agnostic until infrastructure planning begins.
