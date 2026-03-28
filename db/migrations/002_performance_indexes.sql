CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_preferences_genres_gin ON user_preferences USING GIN (favorite_genres);
CREATE INDEX IF NOT EXISTS idx_books_cache_updated_at ON books_cache (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_books_cache_genres_gin ON books_cache USING GIN (genres);
CREATE INDEX IF NOT EXISTS idx_feedback_user_action ON user_feedback_events (user_id, action);
CREATE INDEX IF NOT EXISTS idx_feedback_user_time ON user_feedback_events (user_id, event_ts DESC);
CREATE INDEX IF NOT EXISTS idx_saved_books_user_saved_at ON saved_books (user_id, saved_at DESC);
CREATE INDEX IF NOT EXISTS idx_read_books_user_read_at ON read_books (user_id, read_at DESC);
CREATE INDEX IF NOT EXISTS idx_impressions_user_time ON recommendation_impressions (user_id, impression_at DESC);
