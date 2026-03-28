CREATE TABLE IF NOT EXISTS read_books (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_read_books_user_read_at ON read_books (user_id, read_at DESC);
