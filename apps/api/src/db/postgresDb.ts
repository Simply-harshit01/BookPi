import { Pool, type QueryResultRow } from "pg";
import type { Book, FeedbackEvent, RecommendationImpression, User, UserBookAffinity, UserPreferences } from "../types.js";
import type { Repository } from "./repository.js";

const TAG_MAP: Record<string, string[]> = {
  productivity: ["habit", "focus", "discipline", "success"],
  psychology: ["mind", "behavior", "thinking"],
  startup: ["business", "entrepreneur", "company"],
  fantasy: ["magic", "kingdom", "dragon"],
  finance: ["money", "investing", "wealth"]
};

function extractTags(book: Book): string[] {
  const text = `${book.title} ${book.summary ?? ""} ${book.genres.join(" ")}`.toLowerCase();
  const tags: string[] = [];
  for (const [tag, keywords] of Object.entries(TAG_MAP)) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      tags.push(tag);
    }
  }
  return tags;
}

export class PostgresDb implements Repository {
  constructor(private readonly pool: Pool) {}

  async createUser(email: string, passwordHash: string): Promise<User> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, password_hash, created_at",
        [email.toLowerCase(), passwordHash]
      );

      const row = inserted.rows[0];
      await client.query("INSERT INTO user_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [row.id]);
      await client.query("COMMIT");

      return {
        id: row.id,
        email: row.email,
        passwordHash: row.password_hash,
        createdAt: row.created_at.toISOString()
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await this.pool.query(
      "SELECT id, email, password_hash, created_at FROM users WHERE email = $1 LIMIT 1",
      [email.toLowerCase()]
    );
    return this.mapUser(result.rows[0]);
  }

  async getUserById(id: string): Promise<User | undefined> {
    const result = await this.pool.query("SELECT id, email, password_hash, created_at FROM users WHERE id = $1 LIMIT 1", [id]);
    return this.mapUser(result.rows[0]);
  }

  async upsertPreferences(
    userId: string,
    patch: Omit<UserPreferences, "userId" | "updatedAt">
  ): Promise<UserPreferences> {
    const result = await this.pool.query(
      `INSERT INTO user_preferences (user_id, last_read, favorite_genres, favorite_books, disliked_books, allow_mature_content)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id)
       DO UPDATE SET
         last_read = EXCLUDED.last_read,
         favorite_genres = EXCLUDED.favorite_genres,
         favorite_books = EXCLUDED.favorite_books,
         disliked_books = EXCLUDED.disliked_books,
         allow_mature_content = EXCLUDED.allow_mature_content,
         updated_at = NOW()
       RETURNING user_id, last_read, favorite_genres, favorite_books, disliked_books, allow_mature_content, updated_at`,
      [userId, patch.lastRead, patch.favoriteGenres, patch.favoriteBooks, patch.dislikedBooks, patch.allowMatureContent]
    );

    const row = result.rows[0];
    return {
      userId: row.user_id,
      lastRead: row.last_read ?? "",
      favoriteGenres: row.favorite_genres ?? [],
      favoriteBooks: row.favorite_books ?? [],
      dislikedBooks: row.disliked_books ?? [],
      allowMatureContent: row.allow_mature_content ?? false,
      updatedAt: row.updated_at.toISOString()
    };
  }

  async getPreferences(userId: string): Promise<UserPreferences | undefined> {
    const result = await this.pool.query(
      `SELECT user_id, last_read, favorite_genres, favorite_books, disliked_books, allow_mature_content, updated_at
       FROM user_preferences WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    const row = result.rows[0];
    if (!row) {
      return undefined;
    }
    return {
      userId: row.user_id,
      lastRead: row.last_read ?? "",
      favoriteGenres: row.favorite_genres ?? [],
      favoriteBooks: row.favorite_books ?? [],
      dislikedBooks: row.disliked_books ?? [],
      allowMatureContent: row.allow_mature_content ?? false,
      updatedAt: row.updated_at.toISOString()
    };
  }

  async cacheBooks(books: Book[]): Promise<void> {
    if (books.length === 0) {
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const book of books) {
        const tags = extractTags(book);
        await client.query(
          `INSERT INTO books_cache (book_id, title, authors, genres, tags, thumbnail_url, summary, rating, mature, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
           ON CONFLICT (book_id)
           DO UPDATE SET
             title = EXCLUDED.title,
             authors = EXCLUDED.authors,
             genres = EXCLUDED.genres,
             tags = EXCLUDED.tags,
             thumbnail_url = EXCLUDED.thumbnail_url,
             summary = EXCLUDED.summary,
             rating = EXCLUDED.rating,
             mature = EXCLUDED.mature,
             updated_at = NOW()`,
          [
            book.bookId,
            book.title,
            book.authors,
            book.genres,
            tags,
            book.thumbnailUrl ?? null,
            book.summary ?? null,
            book.rating ?? null,
            book.mature
          ]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getCachedBooks(): Promise<Book[]> {
    const result = await this.pool.query(
      "SELECT book_id, title, authors, genres, tags, thumbnail_url, summary, rating, mature FROM books_cache ORDER BY updated_at DESC LIMIT 300"
    );
    return result.rows.map((row) => this.mapBook(row));
  }

  async getCachedBookById(bookId: string): Promise<Book | undefined> {
    const result = await this.pool.query(
      "SELECT book_id, title, authors, genres, tags, thumbnail_url, summary, rating, mature FROM books_cache WHERE book_id = $1 LIMIT 1",
      [bookId]
    );
    const row = result.rows[0];
    return row ? this.mapBook(row) : undefined;
  }

  async findSimilarCachedBooks(anchorBookIds: string[], limit: number): Promise<Book[]> {
    if (anchorBookIds.length === 0) {
      return [];
    }

    const result = await this.pool.query(
      `WITH anchor_books AS (
         SELECT book_id, authors, genres, tags
         FROM books_cache
         WHERE book_id = ANY($1::text[])
       ),
       scored AS (
         SELECT
           b.book_id,
           b.title,
           b.authors,
           b.genres,
           b.tags,
           b.thumbnail_url,
           b.summary,
           b.rating,
           b.mature,
           b.updated_at,
           MAX(
             (
               3 * (
                 SELECT COUNT(DISTINCT t)
                 FROM unnest(COALESCE(b.tags, '{}'::text[])) AS t
                 JOIN unnest(COALESCE(anchor.tags, '{}'::text[])) AS at ON at = t
               )
               + 2 * CASE WHEN COALESCE(b.authors, '{}'::text[]) && COALESCE(anchor.authors, '{}'::text[]) THEN 1 ELSE 0 END
               + 1 * (
                 SELECT COUNT(DISTINCT g)
                 FROM unnest(COALESCE(b.genres, '{}'::text[])) AS g
                 JOIN unnest(COALESCE(anchor.genres, '{}'::text[])) AS ag ON ag = g
               )
             )
           ) AS similarity
         FROM books_cache b
         JOIN anchor_books anchor ON b.book_id <> anchor.book_id
         GROUP BY b.book_id, b.title, b.authors, b.genres, b.tags, b.thumbnail_url, b.summary, b.rating, b.mature, b.updated_at
       )
       SELECT book_id, title, authors, genres, tags, thumbnail_url, summary, rating, mature
       FROM scored
       WHERE similarity > 0
       ORDER BY similarity DESC, updated_at DESC
       LIMIT $2`,
      [anchorBookIds, Math.max(1, limit)]
    );
    return result.rows.map((row) => this.mapBook(row));
  }

  async recordFeedback(event: FeedbackEvent): Promise<{ stored: boolean }> {
    const result = await this.pool.query(
      `INSERT INTO user_feedback_events (user_id, book_id, action, event_ts)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, book_id, action, event_ts) DO NOTHING
       RETURNING id`,
      [event.userId, event.bookId, event.action, event.timestamp]
    );

    const stored = (result.rowCount ?? 0) > 0;
    if (stored && event.action === "save") {
      await this.pool.query(
        "INSERT INTO saved_books (user_id, book_id) VALUES ($1, $2) ON CONFLICT (user_id, book_id) DO NOTHING",
        [event.userId, event.bookId]
      );
    }
    if (stored && event.action === "mark_read") {
      await this.pool.query(
        "INSERT INTO read_books (user_id, book_id) VALUES ($1, $2) ON CONFLICT (user_id, book_id) DO NOTHING",
        [event.userId, event.bookId]
      );
    }
    return { stored };
  }

  async getFeedback(userId: string): Promise<FeedbackEvent[]> {
    const result = await this.pool.query(
      "SELECT user_id, book_id, action, event_ts FROM user_feedback_events WHERE user_id = $1 ORDER BY event_ts DESC LIMIT 500",
      [userId]
    );

    return result.rows.map((row) => ({
      userId: row.user_id,
      bookId: row.book_id,
      action: row.action,
      timestamp: row.event_ts.toISOString()
    }));
  }

  async getSavedBookIds(userId: string): Promise<string[]> {
    const result = await this.pool.query("SELECT book_id FROM saved_books WHERE user_id = $1 ORDER BY saved_at DESC", [userId]);
    return result.rows.map((row) => row.book_id);
  }

  async getSavedBooks(userId: string): Promise<Book[]> {
    const result = await this.pool.query(
      `SELECT b.book_id, b.title, b.authors, b.genres, b.thumbnail_url, b.summary, b.rating, b.mature
              , b.tags
       FROM saved_books s
       JOIN books_cache b ON b.book_id = s.book_id
       WHERE s.user_id = $1
       ORDER BY s.saved_at DESC`,
      [userId]
    );
    return result.rows.map((row) => this.mapBook(row));
  }

  async getReadBooks(userId: string): Promise<Book[]> {
    const result = await this.pool.query(
      `SELECT b.book_id, b.title, b.authors, b.genres, b.thumbnail_url, b.summary, b.rating, b.mature
              , b.tags
       FROM read_books r
       JOIN books_cache b ON b.book_id = r.book_id
       WHERE r.user_id = $1
       ORDER BY r.read_at DESC`,
      [userId]
    );
    return result.rows.map((row) => this.mapBook(row));
  }

  async getGlobalBookEngagement(): Promise<Record<string, number>> {
    const result = await this.pool.query(
      `WITH imp AS (
         SELECT book_id, COUNT(*)::float AS impressions
         FROM recommendation_impressions
         GROUP BY book_id
       ),
       pos AS (
         SELECT book_id, COUNT(*)::float AS positives
         FROM user_feedback_events
         WHERE action IN ('click', 'like', 'save', 'mark_read')
         GROUP BY book_id
       )
       SELECT imp.book_id,
              COALESCE(pos.positives, 0) / GREATEST(imp.impressions, 1) AS engagement
       FROM imp
       LEFT JOIN pos ON pos.book_id = imp.book_id`
    );

    const scores: Record<string, number> = {};
    for (const row of result.rows) {
      scores[row.book_id] = Number(row.engagement ?? 0);
    }
    return scores;
  }

  async upsertBookAffinity(userId: string, bookId: string, scoreDelta: number, source: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_book_affinity (user_id, book_id, score, source)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, book_id)
       DO UPDATE SET
         score = user_book_affinity.score + EXCLUDED.score,
         source = EXCLUDED.source,
         updated_at = NOW()`,
      [userId, bookId, scoreDelta, source]
    );
  }

  async seedBookAffinity(userId: string, bookId: string, seedScore: number, source: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_book_affinity (user_id, book_id, score, source)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, book_id)
       DO UPDATE SET
         score = GREATEST(user_book_affinity.score, EXCLUDED.score),
         source = CASE
           WHEN user_book_affinity.score >= EXCLUDED.score THEN user_book_affinity.source
           ELSE EXCLUDED.source
         END,
         updated_at = NOW()`,
      [userId, bookId, seedScore, source]
    );
  }

  async getTopBookAffinity(userId: string, limit: number): Promise<UserBookAffinity[]> {
    const result = await this.pool.query(
      `SELECT user_id, book_id, score, source, updated_at
       FROM user_book_affinity
       WHERE user_id = $1
       ORDER BY score DESC, updated_at DESC
       LIMIT $2`,
      [userId, Math.max(1, limit)]
    );
    return result.rows.map((row) => this.mapAffinity(row));
  }

  async getUserBookAffinity(userId: string, limit = 100): Promise<UserBookAffinity[]> {
    const result = await this.pool.query(
      `SELECT user_id, book_id, score, source, updated_at
       FROM user_book_affinity
       WHERE user_id = $1
       ORDER BY score DESC, updated_at DESC
       LIMIT $2`,
      [userId, Math.max(1, limit)]
    );
    return result.rows.map((row) => this.mapAffinity(row));
  }

  async recordImpressions(items: RecommendationImpression[]): Promise<void> {
    if (items.length === 0) {
      return;
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const item of items) {
        await client.query(
          "INSERT INTO recommendation_impressions (user_id, book_id, score, reason_label, impression_at) VALUES ($1, $2, $3, $4, $5)",
          [item.userId, item.bookId, item.score, item.reasonLabel, item.timestamp]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getImpressions(userId: string): Promise<RecommendationImpression[]> {
    const result = await this.pool.query(
      `SELECT user_id, book_id, score, reason_label, impression_at
       FROM recommendation_impressions
       WHERE user_id = $1
       ORDER BY impression_at DESC
       LIMIT 200`,
      [userId]
    );

    return result.rows.map((row) => ({
      userId: row.user_id,
      bookId: row.book_id,
      score: Number(row.score),
      reasonLabel: row.reason_label,
      timestamp: row.impression_at.toISOString()
    }));
  }

  private mapUser(row: QueryResultRow | undefined): User | undefined {
    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      createdAt: row.created_at.toISOString()
    };
  }

  private mapBook(row: QueryResultRow): Book {
    return {
      bookId: row.book_id,
      title: row.title,
      authors: row.authors ?? [],
      genres: row.genres ?? [],
      tags: row.tags ?? [],
      thumbnailUrl: row.thumbnail_url ?? undefined,
      summary: row.summary ?? undefined,
      rating: row.rating === null || row.rating === undefined ? undefined : Number(row.rating),
      mature: row.mature ?? false
    };
  }

  private mapAffinity(row: QueryResultRow): UserBookAffinity {
    return {
      userId: row.user_id,
      bookId: row.book_id,
      score: Number(row.score ?? 0),
      source: row.source ?? "",
      updatedAt: row.updated_at.toISOString()
    };
  }
}
