import { Router } from "express";
import { z } from "zod";
import { getRepository } from "../db/dataSource.js";
import { requireAuth } from "../middleware/auth.js";
import { env } from "../config.js";
import { GoogleBooksClient } from "../services/googleBooksClient.js";
import { generateBookCandidatesWithDiagnostics } from "../services/candidateGeneration.js";
import { getDynamicRecommendations, type DynamicRecommendation } from "../services/recommenderV2.js";
import type { Book, RecommendationItem } from "../types.js";

const preferencesSchema = z.object({
  lastRead: z.string().max(255).default(""),
  favoriteGenres: z.array(z.string()).max(20).default([]),
  favoriteBooks: z.array(z.string()).max(30).default([]),
  dislikedBooks: z.array(z.string()).max(30).default([]),
  allowMatureContent: z.boolean().default(false)
});

export const meRouter = Router();
const repository = getRepository();
const booksClient = new GoogleBooksClient(env.GOOGLE_BOOKS_API_KEY);
meRouter.use(requireAuth);

meRouter.get("/", async (req, res) => {
  const user = await repository.getUserById(req.userId!);
  const preferences = await repository.getPreferences(req.userId!);
  if (!user || !preferences) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Sync onboarding books (favorite and last read) to shelf for all users
  await syncOnboardingBooksToShelf(req.userId!, preferences.favoriteBooks, preferences.lastRead);

  res.json({
    user: {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt
    },
    preferences,
    savedBookIds: await repository.getSavedBookIds(user.id),
    savedBooks: await repository.getSavedBooks(user.id),
    myShelfBooks: await repository.getReadBooks(user.id),
    impressions: await repository.getImpressions(user.id)
  });
});

meRouter.put("/preferences", async (req, res) => {
  const parsed = preferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  try {
    const preferences = await repository.upsertPreferences(req.userId!, parsed.data);
    await bootstrapAffinityFromOnboarding(req.userId!, parsed.data.favoriteBooks, parsed.data.lastRead);
    const onboardingRecommendations = await buildOnboardingRecommendations(preferences, 15);
    res.json({
      preferences,
      recommendations: onboardingRecommendations,
      nextCursor: null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update preferences";
    res.status(500).json({ error: message });
  }
});

async function bootstrapAffinityFromOnboarding(userId: string, favoriteBooks: string[], lastRead: string): Promise<void> {
  const seedQueries = [
    ...favoriteBooks.map((title) => ({ query: title.trim(), score: 5 })),
    { query: lastRead.trim(), score: 4 }
  ].filter((item) => item.query.length > 0);

  if (seedQueries.length === 0) {
    return;
  }

  const searches = await Promise.all(
    seedQueries.map((item) => booksClient.searchBooks(item.query, { limit: 1 }))
  );

  const seeds = searches
    .map((results, index) => {
      const top = results[0];
      if (!top) {
        return null;
      }
      return { book: top, score: seedQueries[index].score };
    })
    .filter((item): item is { book: Book; score: number } => Boolean(item));

  if (seeds.length === 0) {
    return;
  }

  await repository.cacheBooks(seeds.map((item) => item.book));
  await Promise.all(
    seeds.map((item) => repository.seedBookAffinity(userId, item.book.bookId, item.score, "onboarding"))
  );

  // Automatically add these books to the user's shelf (mark as read during onboarding)
  console.log(`[onboarding] Adding ${seeds.length} books to shelf for user ${userId}`);
  await Promise.all(
    seeds.map((item) => {
      console.log(`[onboarding] Adding to shelf: ${item.book.title} (${item.book.bookId})`);
      return repository.recordFeedback({
        userId,
        bookId: item.book.bookId,
        action: "mark_read",
        timestamp: new Date().toISOString()
      });
    })
  );
}

async function buildOnboardingRecommendations(
  preferences: {
    lastRead: string;
    favoriteBooks: string[];
    favoriteGenres: string[];
    allowMatureContent: boolean;
  },
  limit: number
) {
  // Fetch candidate books upfront to avoid model hallucination
  const candidateBooks = await buildGoogleFallbackRecommendations(preferences, Math.max(limit * 3, 30), `route=/me/preferences`);

  const candidateBooksForModel = candidateBooks.slice(0, 15).map((item) => ({
    title: item.book.title,
    authors: item.book.authors,
    genres: item.book.genres,
    rating: item.book.rating,
    preLlmScore: item.preLlmScore,
    summary: item.book.summary
  }));

  let dynamicRecs: DynamicRecommendation[] = [];
  if (candidateBooksForModel.length > 0) {
    try {
      dynamicRecs = await getDynamicRecommendations(
        {
          fav_genres: preferences.favoriteGenres,
          past_reads: dedupeStrings([preferences.lastRead, ...preferences.favoriteBooks])
        },
        [],
        {
          recommendationCount: Math.max(limit * 2, 15),
          slidingWindowSize: 10,
          candidateBooks: candidateBooksForModel
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown recommender error";
      console.warn(`[me/preferences] Onboarding recommender failed: ${message}`);
    }
  }
  console.info(
    `[me/preferences] candidates=${candidateBooks.length} llm_input=${candidateBooksForModel.length} llm_output=${dynamicRecs.length}`
  );

  // Map model selections back to books from candidates
  const resolvedBooks: { book: Book; reason: string }[] = [];
  const normalizedCandidates = new Map<string, { book: Book; reason: string }>();
  for (const item of candidateBooks) {
    const normalized = normalizeTitle(item.book.title);
    if (normalized && !normalizedCandidates.has(normalized)) {
      normalizedCandidates.set(normalized, item);
    }
  }

  for (const rec of dynamicRecs) {
    if (typeof rec.candidateId === "number") {
      const idx = rec.candidateId - 1;
      const byId = idx >= 0 && idx < candidateBooksForModel.length ? candidateBooks[idx] : undefined;
      if (byId) {
        resolvedBooks.push({
          book: byId.book,
          reason: rec.reason
        });
        continue;
      }
    }
    const normalized = normalizeTitle(rec.title ?? "");
    const candidate = normalizedCandidates.get(normalized) ?? resolveCandidateByTitle(candidateBooks, rec.title ?? "");
    if (candidate) {
      resolvedBooks.push({
        book: candidate.book,
        reason: rec.reason
      });
    }
  }
  console.info(`[me/preferences] llm_mapped=${resolvedBooks.length}`);

  // Add more books to reach the limit if needed
  const fallbackAdjustment = candidateBooks.filter(
    (item) => !resolvedBooks.some((r) => normalizeTitle(r.book.title) === normalizeTitle(item.book.title))
  );

  const mergedResolved = dedupeResolvedRecommendations([...resolvedBooks, ...fallbackAdjustment]);
  await repository.cacheBooks(mergedResolved.map((item) => item.book));
  console.info(`[me/preferences] final=${Math.min(Math.max(1, limit), mergedResolved.length)}`);
  return mapDirectModelRecsToItems(mergedResolved, Math.max(1, limit), preferences.allowMatureContent);
}

function dedupeBooks<T extends { bookId: string }>(books: T[]): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const book of books) {
    if (seen.has(book.bookId)) {
      continue;
    }
    seen.add(book.bookId);
    output.push(book);
  }
  return output;
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mapDirectModelRecsToItems(
  values: { book: Book; reason: string }[],
  limit: number,
  allowMatureContent: boolean
): RecommendationItem[] {
  const seen = new Set<string>();
  const output: RecommendationItem[] = [];
  let rank = 0;
  for (const item of values) {
    if (!allowMatureContent && item.book.mature) {
      continue;
    }
    if (seen.has(item.book.bookId)) {
      continue;
    }
    seen.add(item.book.bookId);
    rank += 1;
    output.push({
      bookId: item.book.bookId,
      title: item.book.title,
      authors: item.book.authors,
      genres: item.book.genres,
      thumbnailUrl: item.book.thumbnailUrl,
      summary: item.book.summary,
      rating: item.book.rating,
      reasonLabel: item.reason || "Suggested for your profile",
      score: Number(Math.max(0.1, 1 - (rank - 1) * 0.05).toFixed(3))
    });
    if (output.length >= Math.max(1, limit)) {
      break;
    }
  }
  return output;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = normalizeTitle(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(value);
  }
  return output;
}

function dedupeResolvedRecommendations(values: { book: Book; reason: string }[]): { book: Book; reason: string }[] {
  const seen = new Set<string>();
  const output: { book: Book; reason: string }[] = [];
  for (const item of values) {
    if (seen.has(item.book.bookId)) {
      continue;
    }
    seen.add(item.book.bookId);
    output.push(item);
  }
  return output;
}

function resolveCandidateByTitle(
  candidates: { book: Book; reason: string }[],
  predictedTitle: string
): { book: Book; reason: string } | undefined {
  const normalizedPredicted = normalizeTitle(predictedTitle);
  if (!normalizedPredicted) {
    return undefined;
  }

  const predictedTokens = tokenizeTitle(normalizedPredicted);
  let best: { item: { book: Book; reason: string }; overlap: number } | null = null;

  for (const item of candidates) {
    const normalizedCandidate = normalizeTitle(item.book.title);
    if (!normalizedCandidate) {
      continue;
    }
    if (
      normalizedCandidate === normalizedPredicted ||
      normalizedCandidate.includes(normalizedPredicted) ||
      normalizedPredicted.includes(normalizedCandidate)
    ) {
      return item;
    }

    const candidateTokens = tokenizeTitle(normalizedCandidate);
    if (predictedTokens.length === 0 || candidateTokens.length === 0) {
      continue;
    }

    let overlap = 0;
    const candidateTokenSet = new Set(candidateTokens);
    for (const token of predictedTokens) {
      if (candidateTokenSet.has(token)) {
        overlap += 1;
      }
    }

    const coverage = overlap / Math.max(1, predictedTokens.length);
    if (coverage >= 0.75 && overlap >= Math.min(3, predictedTokens.length)) {
      if (!best || overlap > best.overlap) {
        best = { item, overlap };
      }
    }
  }

  return best?.item;
}

function tokenizeTitle(value: string): string[] {
  return value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

async function buildGoogleFallbackRecommendations(
  preferences: {
    lastRead: string;
    favoriteBooks: string[];
    favoriteGenres: string[];
    allowMatureContent: boolean;
  },
  limit: number,
  debugContext?: string
): Promise<{ book: Book; reason: string; preLlmScore?: number }[]> {
  const { candidates, diagnostics } = await generateBookCandidatesWithDiagnostics(booksClient, {
    favoriteGenres: preferences.favoriteGenres,
    favoriteBooks: preferences.favoriteBooks,
    lastRead: preferences.lastRead,
    targetSize: 20
  });
  if (debugContext) {
    console.info(`[candidate-gen] ${debugContext} ${JSON.stringify(diagnostics)}`);
  }
  return candidates;
}

async function syncOnboardingBooksToShelf(
  userId: string,
  favoriteBooks: string[],
  lastRead: string
): Promise<void> {
  // Build a list of books to add to shelf
  const seedQueries = [
    ...favoriteBooks.map((title) => ({ query: title.trim(), book: "favoriteBook" })),
    { query: lastRead.trim(), book: "lastRead" }
  ].filter((item) => item.query.length > 0);

  if (seedQueries.length === 0) {
    return;
  }

  try {
    // Get existing books in user's shelf
    const existingShelfBooks = await repository.getReadBooks(userId);
    const shelfBookIds = new Set(existingShelfBooks.map((b) => b.bookId));

    // Search for onboarding books
    const searches = await Promise.all(
      seedQueries.map((item) => booksClient.searchBooks(item.query, { limit: 1 }))
    );

    const booksToAdd = searches
      .map((results) => results[0])
      .filter((book): book is Book => Boolean(book) && !shelfBookIds.has(book.bookId));

    if (booksToAdd.length === 0) {
      return;
    }

    // Cache books and add to shelf
    await repository.cacheBooks(booksToAdd);
    console.log(`[sync-shelf] Adding ${booksToAdd.length} onboarding books to shelf for user ${userId}`);

    await Promise.all(
      booksToAdd.map((book) => {
        console.log(`[sync-shelf] Adding to shelf: ${book.title} (${book.bookId})`);
        return repository.recordFeedback({
          userId,
          bookId: book.bookId,
          action: "mark_read",
          timestamp: new Date().toISOString()
        });
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.warn(`[sync-shelf] Failed to sync onboarding books for user ${userId}: ${message}`);
    // Don't throw - this is a non-critical operation
  }
}
