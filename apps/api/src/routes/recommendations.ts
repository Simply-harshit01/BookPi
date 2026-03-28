import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { env } from "../config.js";
import { GoogleBooksClient } from "../services/googleBooksClient.js";
import { generateBookCandidatesWithDiagnostics } from "../services/candidateGeneration.js";
import { getDynamicRecommendations, type DynamicInteraction, type DynamicRecommendation } from "../services/recommenderV2.js";
import type { Book, FeedbackAction, RecommendationItem, UserBookAffinity } from "../types.js";
import { getRepository } from "../db/dataSource.js";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional()
});

const searchQuerySchema = z.object({
  q: z.string().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

const feedbackSchema = z.object({
  bookId: z.string().min(1),
  action: z.enum(["click", "like", "dislike", "save", "mark_read"] as [FeedbackAction, ...FeedbackAction[]]),
  timestamp: z.string().datetime().optional()
});

const ACTION_WEIGHTS: Partial<Record<FeedbackAction, number>> = {
  like: 3,
  save: 2,
  mark_read: 4,
  dislike: -4
};

const AFFINITY_DECAY_WINDOW_DAYS = 30;

const client = new GoogleBooksClient(env.GOOGLE_BOOKS_API_KEY);
const repository = getRepository();
export const recommendationsRouter = Router();
recommendationsRouter.use(requireAuth);

recommendationsRouter.get("/", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params", details: parsed.error.flatten() });
    return;
  }

  const preferences = await repository.getPreferences(req.userId!);
  if (!preferences) {
    res.status(404).json({ error: "Preferences not found" });
    return;
  }

  const limit = parsed.data.limit;
  console.log(`[recommendations GET] Starting for user=${req.userId}`);

  // Fetch candidate books upfront to avoid model hallucination
  const candidateBooks = await buildGoogleFallbackRecommendations(
    {
      favoriteGenres: preferences.favoriteGenres,
      favoriteBooks: preferences.favoriteBooks,
      lastRead: preferences.lastRead
    },
    Math.max(limit * 3, 30),
    {
      excludeSeedTitles: false,
      debugContext: `route=/recommendations user=${req.userId}`
    }
  );

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
      const interactions = await buildDynamicInteractions(req.userId!);
      console.info(`[recommendations GET] user=${req.userId} interactions_available=${interactions.length}`);
      
      dynamicRecs = await getDynamicRecommendations(
        {
          fav_genres: preferences.favoriteGenres,
          past_reads: dedupeStrings([preferences.lastRead, ...preferences.favoriteBooks])
        },
        interactions,
        {
          recommendationCount: Math.max(limit, 10),
          slidingWindowSize: 10,
          timeoutMs: 15000,
          candidateBooks: candidateBooksForModel
        }
      );
      console.info(`[recommendations GET] user=${req.userId} llm_returned=${dynamicRecs.length} recommendations`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown recommender error";
      console.warn(`[recommendations GET] Dynamic recommender failed for user ${req.userId}: ${message}`);
    }
  }
  console.info(
    `[recommendations] user=${req.userId} candidates=${candidateBooks.length} llm_input=${candidateBooksForModel.length} llm_output=${dynamicRecs.length}`
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
  console.info(`[recommendations] user=${req.userId} llm_mapped=${resolvedBooks.length}`);

  // Add more books to reach the limit if needed
  const fallbackAdjustment = candidateBooks.filter(
    (item) => !resolvedBooks.some((r) => normalizeTitle(r.book.title) === normalizeTitle(item.book.title))
  );

  const mergedResolved = dedupeResolvedRecommendations([...resolvedBooks, ...fallbackAdjustment]);
  const recommendations = mapDirectModelRecsToItems(mergedResolved, limit, preferences.allowMatureContent);
  console.info(`[recommendations] user=${req.userId} final=${recommendations.length}`);
  await repository.cacheBooks(mergedResolved.map((item) => item.book));

  await repository.recordImpressions(
    recommendations.map((item) => ({
      userId: req.userId!,
      bookId: item.bookId,
      score: item.score,
      reasonLabel: item.reasonLabel,
      timestamp: new Date().toISOString()
    }))
  );

  res.json({
    data: recommendations,
    nextCursor: null
  });
});

recommendationsRouter.get("/search", async (req, res) => {
  const parsed = searchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid search query", details: parsed.error.flatten() });
    return;
  }

  const preferences = await repository.getPreferences(req.userId!);
  if (!preferences) {
    res.status(404).json({ error: "Preferences not found" });
    return;
  }

  // Fetch candidate books upfront including search-specific results
  const candidateBooks = await buildGoogleFallbackRecommendations(
    {
      favoriteGenres: preferences.favoriteGenres,
      favoriteBooks: preferences.favoriteBooks,
      lastRead: preferences.lastRead
    },
    Math.max(parsed.data.limit * 3, 30),
    {
      searchIntent: parsed.data.q,
      debugContext: `route=/recommendations/search user=${req.userId} q=${parsed.data.q}`
    }
  );

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
          fav_genres: [...preferences.favoriteGenres, `Search intent: ${parsed.data.q}`],
          past_reads: dedupeStrings([preferences.lastRead, ...preferences.favoriteBooks])
        },
        await buildDynamicInteractions(req.userId!),
        {
          recommendationCount: Math.max(parsed.data.limit, 10),
          slidingWindowSize: 10,
          timeoutMs: 15000,
          candidateBooks: candidateBooksForModel
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown recommender error";
      console.warn(`[recommendations/search] Dynamic recommender failed for user ${req.userId}: ${message}`);
    }
  }
  console.info(
    `[recommendations/search] user=${req.userId} q="${parsed.data.q}" candidates=${candidateBooks.length} llm_input=${candidateBooksForModel.length} llm_output=${dynamicRecs.length}`
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
  console.info(`[recommendations/search] user=${req.userId} q="${parsed.data.q}" llm_mapped=${resolvedBooks.length}`);

  // Add more books to reach the limit if needed
  const fallbackAdjustment = candidateBooks.filter(
    (item) => !resolvedBooks.some((r) => normalizeTitle(r.book.title) === normalizeTitle(item.book.title))
  );

  const mergedResolved = dedupeResolvedRecommendations([...resolvedBooks, ...fallbackAdjustment]);
  const recommendations = mapDirectModelRecsToItems(mergedResolved, parsed.data.limit, preferences.allowMatureContent);
  console.info(`[recommendations/search] user=${req.userId} q="${parsed.data.q}" final=${recommendations.length}`);
  await repository.cacheBooks(mergedResolved.map((item) => item.book));

  res.json({
    data: recommendations,
    nextCursor: null
  });
});

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

recommendationsRouter.get("/book/:id", async (req, res) => {
  const fromApi = await client.getBookById(req.params.id);
  if (!fromApi) {
    const cached = await repository.getCachedBookById(req.params.id);
    if (!cached) {
      res.status(404).json({ error: "Book not found" });
      return;
    }
    res.json({ data: cached });
    return;
  }
  await repository.cacheBooks([fromApi]);
  res.json({ data: fromApi });
});

recommendationsRouter.post("/feedback", async (req, res) => {
  const parsed = feedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    console.warn(`[feedback] Invalid payload:`, parsed.error.flatten());
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const event = {
    userId: req.userId!,
    bookId: parsed.data.bookId,
    action: parsed.data.action,
    timestamp: parsed.data.timestamp ?? new Date().toISOString()
  };

  console.log(`[feedback] Recorded user=${event.userId} action=${event.action} bookId=${event.bookId}`);

  try {
    const result = await repository.recordFeedback(event);
    const weight = ACTION_WEIGHTS[event.action];
    if (result.stored && typeof weight === "number" && weight !== 0) {
      await repository.upsertBookAffinity(event.userId, event.bookId, weight, "feedback");
      console.log(`[feedback] Updated affinity: user=${event.userId} bookId=${event.bookId} weight=${weight}`);
    }
    console.log(`[feedback] Feedback stored=${result.stored}`);
    res.status(result.stored ? 201 : 200).json({ stored: result.stored });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[feedback] Error recording feedback:`, msg);
    res.status(500).json({ error: "Failed to record feedback", details: msg });
  }
});

function buildAnchorQuery(book: Book): string {
  const title = book.title.trim();
  const author = (book.authors[0] ?? "").trim();
  if (title && author) {
    return `${title} ${author}`;
  }
  return title || author || "popular books";
}

async function resolveAffinityBooks(affinity: Pick<UserBookAffinity, "bookId" | "score">[]): Promise<{ book: Book; score: number }[]> {
  const resolved = await Promise.all(
    affinity.map(async (item) => {
      const cached = await repository.getCachedBookById(item.bookId);
      if (cached) {
        return { book: cached, score: item.score };
      }
      const fromApi = await client.getBookById(item.bookId);
      if (!fromApi) {
        return null;
      }
      return { book: fromApi, score: item.score };
    })
  );

  return resolved.filter((item): item is { book: Book; score: number } => Boolean(item));
}

async function ensureAnchorsFromOnboarding(
  userId: string,
  existingAnchorCount: number,
  preferences: { lastRead: string; favoriteBooks: string[] }
): Promise<{ bookId: string; score: number }[]> {
  if (existingAnchorCount > 0) {
    return [];
  }

  const seeds = [
    ...preferences.favoriteBooks.map((title) => ({ title: title.trim(), score: 5 })),
    { title: preferences.lastRead.trim(), score: 4 }
  ].filter((item) => item.title.length > 0);

  if (seeds.length === 0) {
    return [];
  }

  const searched = await Promise.all(seeds.map((item) => client.searchBooks(item.title, { limit: 1 })));
  const mapped = searched
    .map((books, index) => {
      const top = books[0];
      if (!top) {
        return null;
      }
      return { book: top, score: seeds[index].score };
    })
    .filter((item): item is { book: Book; score: number } => Boolean(item));

  if (mapped.length === 0) {
    return [];
  }

  await repository.cacheBooks(mapped.map((item) => item.book));
  await Promise.all(mapped.map((item) => repository.seedBookAffinity(userId, item.book.bookId, item.score, "onboarding")));
  return mapped.map((item) => ({ bookId: item.book.bookId, score: item.score }));
}

function collectInteractedBookIds(
  affinity: Pick<UserBookAffinity, "bookId">[],
  feedbackBookIds: string[],
  readBookIds: string[]
): Set<string> {
  const ids = new Set<string>();
  for (const item of affinity) {
    ids.add(item.bookId);
  }
  for (const id of feedbackBookIds) {
    ids.add(id);
  }
  for (const id of readBookIds) {
    ids.add(id);
  }
  return ids;
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

function buildExcludedSeedTitles(preferences: { favoriteBooks: string[]; lastRead: string }): string[] {
  const titles = new Set<string>();
  for (const book of preferences.favoriteBooks) {
    const normalized = normalizeTitle(book);
    if (normalized) {
      titles.add(normalized);
    }
  }
  const normalizedLastRead = normalizeTitle(preferences.lastRead);
  if (normalizedLastRead) {
    titles.add(normalizedLastRead);
  }
  return Array.from(titles);
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

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isSeedTitleMatch(title: string, seedTitles: string[]): boolean {
  const normalizedTitle = normalizeTitle(title);
  if (!normalizedTitle) {
    return false;
  }

  const titleTokens = tokenizeTitle(normalizedTitle);
  for (const seed of seedTitles) {
    if (normalizedTitle === seed) {
      return true;
    }

    if (
      seed.length >= 6 &&
      normalizedTitle.length >= 6 &&
      (normalizedTitle.includes(seed) || seed.includes(normalizedTitle))
    ) {
      return true;
    }

    const seedTokens = tokenizeTitle(seed);
    if (seedTokens.length === 0 || titleTokens.length === 0) {
      continue;
    }

    let overlap = 0;
    const titleTokenSet = new Set(titleTokens);
    for (const token of seedTokens) {
      if (titleTokenSet.has(token)) {
        overlap += 1;
      }
    }

    const coverage = overlap / Math.max(1, seedTokens.length);
    if (coverage >= 0.8 && overlap >= Math.min(3, seedTokens.length)) {
      return true;
    }
  }

  return false;
}

function tokenizeTitle(value: string): string[] {
  return value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3);
}

function applyRecencyDecay(affinity: UserBookAffinity[]): UserBookAffinity[] {
  const now = Date.now();
  return affinity.map((item) => {
    const updatedAt = new Date(item.updatedAt).getTime();
    if (!Number.isFinite(updatedAt)) {
      return item;
    }
    const ageDays = (now - updatedAt) / (1000 * 60 * 60 * 24);
    const decayedScore = item.score * Math.exp(-Math.max(0, ageDays) / AFFINITY_DECAY_WINDOW_DAYS);
    return {
      ...item,
      score: decayedScore
    };
  });
}

async function buildDynamicInteractions(userId: string): Promise<DynamicInteraction[]> {
  const feedback = await repository.getFeedback(userId);
  const readBooks = await repository.getReadBooks(userId);
  
  console.log(`[buildDynamicInteractions] user=${userId} raw_feedback_count=${feedback.length}`);
  if (feedback.length > 0) {
    console.log(`[buildDynamicInteractions] Feedback items:`, feedback.map(f => ({ action: f.action, bookId: f.bookId, timestamp: f.timestamp })));
  }
  
  const feedbackMapped: DynamicInteraction[] = [];
  for (const item of feedback) {
    const mappedType = mapFeedbackActionToInteraction(item.action);
    if (!mappedType) {
      console.log(`[buildDynamicInteractions] Skipping action (unmapped): ${item.action}`);
      continue;
    }
    const cached = await repository.getCachedBookById(item.bookId);
    feedbackMapped.push({
      book_title: cached?.title ?? item.bookId,
      type: mappedType,
      created_at: item.timestamp
    });
  }

  const readMapped = readBooks.map((book) => ({
    book_title: book.title,
    type: "READ" as const
  }));

  const result = [...feedbackMapped, ...readMapped];
  console.log(`[buildDynamicInteractions] user=${userId} total_interactions=${result.length} (feedback=${feedbackMapped.length}, read=${readMapped.length})`);
  if (result.length > 0) {
    console.log(`[buildDynamicInteractions] Interactions:`, result.map(r => ({ book: r.book_title, type: r.type })));
  }
  
  return result;
}

function mapFeedbackActionToInteraction(action: FeedbackAction): DynamicInteraction["type"] | null {
  if (action === "like") {
    return "LIKE";
  }
  if (action === "dislike") {
    return "DISLIKE";
  }
  if (action === "save") {
    return "SAVED";
  }
  if (action === "mark_read") {
    return "READ";
  }
  return null;
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

async function buildGoogleFallbackRecommendations(
  preferences: { favoriteGenres: string[]; favoriteBooks: string[]; lastRead: string },
  limit: number,
  options: { searchIntent?: string; excludeSeedTitles?: boolean; debugContext?: string } = {}
): Promise<{ book: Book; reason: string; preLlmScore?: number }[]> {
  const { candidates, diagnostics } = await generateBookCandidatesWithDiagnostics(client, {
    favoriteGenres: preferences.favoriteGenres,
    favoriteBooks: preferences.favoriteBooks,
    lastRead: preferences.lastRead,
    searchIntent: options.searchIntent,
    excludeSeedTitles: options.excludeSeedTitles,
    targetSize: 20
  });
  if (options.debugContext) {
    console.info(`[candidate-gen] ${options.debugContext} ${JSON.stringify(diagnostics)}`);
  }
  return candidates;
}
