CREATE TABLE IF NOT EXISTS user_book_affinity (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL,
  score DOUBLE PRECISION NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_user_book_affinity_user_score
  ON user_book_affinity (user_id, score DESC, updated_at DESC);
