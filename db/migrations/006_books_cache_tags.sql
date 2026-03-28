ALTER TABLE books_cache
ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_books_cache_tags_gin
  ON books_cache USING GIN (tags);
