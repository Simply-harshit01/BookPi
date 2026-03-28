CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_read TEXT NOT NULL DEFAULT '',
  favorite_genres TEXT[] NOT NULL DEFAULT '{}',
  favorite_books TEXT[] NOT NULL DEFAULT '{}',
  disliked_books TEXT[] NOT NULL DEFAULT '{}',
  allow_mature_content BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS books_cache (
  book_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  authors TEXT[] NOT NULL DEFAULT '{}',
  genres TEXT[] NOT NULL DEFAULT '{}',
  thumbnail_url TEXT,
  summary TEXT,
  rating NUMERIC(3, 2),
  mature BOOLEAN NOT NULL DEFAULT FALSE,
  raw_payload JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recommendation_impressions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL,
  score NUMERIC(8, 4) NOT NULL,
  reason_label TEXT NOT NULL,
  impression_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_feedback_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('click', 'like', 'dislike', 'save', 'mark_read')),
  event_ts TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, book_id, action, event_ts)
);

CREATE TABLE IF NOT EXISTS saved_books (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, book_id)
);

CREATE TABLE IF NOT EXISTS read_books (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, book_id)
);
