import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { env } from "../config.js";
import { GoogleBooksClient } from "../services/googleBooksClient.js";
import { getRepository } from "../db/dataSource.js";
import type { RecommendationItem } from "../types.js";

const searchQuerySchema = z.object({
  q: z.string().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

const client = new GoogleBooksClient(env.GOOGLE_BOOKS_API_KEY);
const repository = getRepository();

export const booksRouter = Router();
booksRouter.use(requireAuth);

/**
 * Simple books search by title or author
 * Does NOT use LLM ranking, just direct Google Books API search
 */
booksRouter.get("/search", async (req, res) => {
  const parsed = searchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid search query", details: parsed.error.flatten() });
    return;
  }

  const { q: query, limit } = parsed.data;

  try {
    // Search directly from Google Books API
    const searchResults = await client.searchBooks(query, { limit: Math.max(limit * 2, 30) });

    if (searchResults.length === 0) {
      res.json({
        data: [],
        nextCursor: null
      });
      return;
    }

    // Cache the results
    await repository.cacheBooks(searchResults);

    // Transform to RecommendationItem format
    const recommendations: RecommendationItem[] = searchResults.slice(0, limit).map((book, idx) => ({
      bookId: book.bookId,
      title: book.title,
      authors: book.authors,
      genres: book.genres,
      thumbnailUrl: book.thumbnailUrl,
      summary: book.summary,
      rating: book.rating,
      reasonLabel: `Search result for "${query}"`,
      score: Number(Math.max(0.1, 1 - idx * 0.05).toFixed(3))
    }));

    res.json({
      data: recommendations,
      nextCursor: null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    console.error(`[books/search] Error for user ${req.userId} querying "${query}":`, message);
    res.status(500).json({ error: "Search failed", details: message });
  }
});
