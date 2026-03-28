import crypto from "node:crypto";
import type { Book, FeedbackEvent, RecommendationImpression, User, UserBookAffinity, UserPreferences } from "../types.js";
import type { Repository } from "./repository.js";

const TAG_MAP: Record<string, string[]> = {
  productivity: ["habit", "focus", "discipline", "success"],
  psychology: ["mind", "behavior", "thinking"],
  startup: ["business", "entrepreneur", "company"],
  fantasy: ["magic", "kingdom", "dragon"],
  finance: ["money", "investing", "wealth"]
};

function normalizeTokens(values: string[]): Set<string> {
  return new Set(values.map((item) => item.toLowerCase().trim()).filter(Boolean));
}

function countOverlap(left: Set<string>, right: Set<string>): number {
  let overlap = 0;
  for (const item of left) {
    if (right.has(item)) {
      overlap += 1;
    }
  }
  return overlap;
}

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

export class InMemoryDb implements Repository {
  private users = new Map<string, User>();
  private usersByEmail = new Map<string, string>();
  private preferences = new Map<string, UserPreferences>();
  private feedbackEvents = new Set<string>();
  private feedbackByUser = new Map<string, FeedbackEvent[]>();
  private saved = new Map<string, Set<string>>();
  private read = new Map<string, Set<string>>();
  private booksCache = new Map<string, Book>();
  private impressionsByUser = new Map<string, RecommendationImpression[]>();
  private affinityByUser = new Map<string, Map<string, UserBookAffinity>>();

  async createUser(email: string, passwordHash: string): Promise<User> {
    const existingId = this.usersByEmail.get(email.toLowerCase());
    if (existingId) {
      throw new Error("User already exists");
    }

    const id = crypto.randomUUID();
    const user: User = {
      id,
      email: email.toLowerCase(),
      passwordHash,
      createdAt: new Date().toISOString()
    };

    this.users.set(id, user);
    this.usersByEmail.set(user.email, id);
    this.saved.set(id, new Set());
    this.read.set(id, new Set());
    this.affinityByUser.set(id, new Map());
    this.preferences.set(id, {
      userId: id,
      lastRead: "",
      favoriteGenres: [],
      favoriteBooks: [],
      dislikedBooks: [],
      allowMatureContent: false,
      updatedAt: new Date().toISOString()
    });

    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const id = this.usersByEmail.get(email.toLowerCase());
    return id ? this.users.get(id) : undefined;
  }

  async getUserById(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async upsertPreferences(userId: string, patch: Omit<UserPreferences, "userId" | "updatedAt">): Promise<UserPreferences> {
    const current = this.preferences.get(userId);
    if (!current) {
      throw new Error("User preferences not found");
    }

    const next: UserPreferences = {
      ...current,
      ...patch,
      userId,
      updatedAt: new Date().toISOString()
    };

    this.preferences.set(userId, next);
    return next;
  }

  async getPreferences(userId: string): Promise<UserPreferences | undefined> {
    return this.preferences.get(userId);
  }

  async cacheBooks(books: Book[]): Promise<void> {
    for (const book of books) {
      this.booksCache.set(book.bookId, { ...book, tags: extractTags(book) });
    }
  }

  async getCachedBooks(): Promise<Book[]> {
    return Array.from(this.booksCache.values());
  }

  async getCachedBookById(bookId: string): Promise<Book | undefined> {
    return this.booksCache.get(bookId);
  }

  async findSimilarCachedBooks(anchorBookIds: string[], limit: number): Promise<Book[]> {
    if (anchorBookIds.length === 0) {
      return [];
    }

    const anchors = anchorBookIds
      .map((id) => this.booksCache.get(id))
      .filter((book): book is Book => Boolean(book));
    if (anchors.length === 0) {
      return [];
    }

    const candidates = Array.from(this.booksCache.values()).filter((book) => !anchorBookIds.includes(book.bookId));
    const ranked = candidates
      .map((candidate) => {
        const candidateTags = normalizeTokens(candidate.tags ?? extractTags(candidate));
        const candidateAuthors = normalizeTokens(candidate.authors);
        const candidateGenres = normalizeTokens(candidate.genres);
        let bestSimilarity = 0;

        for (const anchor of anchors) {
          const tagOverlap = countOverlap(candidateTags, normalizeTokens(anchor.tags ?? extractTags(anchor)));
          const authorMatch = countOverlap(candidateAuthors, normalizeTokens(anchor.authors)) > 0 ? 1 : 0;
          const categoryOverlap = countOverlap(candidateGenres, normalizeTokens(anchor.genres));
          const similarity = 3 * tagOverlap + 2 * authorMatch + 1 * categoryOverlap;
          if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
          }
        }

        return { candidate, similarity: bestSimilarity };
      })
      .filter((item) => item.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, Math.max(1, limit))
      .map((item) => item.candidate);

    return ranked;
  }

  async recordFeedback(event: FeedbackEvent): Promise<{ stored: boolean }> {
    const dedupeKey = `${event.userId}:${event.bookId}:${event.action}:${event.timestamp.slice(0, 19)}`;
    if (this.feedbackEvents.has(dedupeKey)) {
      return { stored: false };
    }

    this.feedbackEvents.add(dedupeKey);
    const list = this.feedbackByUser.get(event.userId) ?? [];
    list.push(event);
    this.feedbackByUser.set(event.userId, list);

    if (event.action === "save") {
      const saved = this.saved.get(event.userId) ?? new Set<string>();
      saved.add(event.bookId);
      this.saved.set(event.userId, saved);
    }

    if (event.action === "mark_read") {
      const read = this.read.get(event.userId) ?? new Set<string>();
      read.add(event.bookId);
      this.read.set(event.userId, read);
    }

    return { stored: true };
  }

  async getFeedback(userId: string): Promise<FeedbackEvent[]> {
    return this.feedbackByUser.get(userId) ?? [];
  }

  async getSavedBookIds(userId: string): Promise<string[]> {
    return Array.from(this.saved.get(userId) ?? new Set<string>());
  }

  async getSavedBooks(userId: string): Promise<Book[]> {
    const ids = this.saved.get(userId) ?? new Set<string>();
    return Array.from(ids)
      .map((id) => this.booksCache.get(id))
      .filter((book): book is Book => Boolean(book));
  }

  async getReadBooks(userId: string): Promise<Book[]> {
    const ids = this.read.get(userId) ?? new Set<string>();
    return Array.from(ids)
      .map((id) => this.booksCache.get(id))
      .filter((book): book is Book => Boolean(book));
  }

  async getGlobalBookEngagement(): Promise<Record<string, number>> {
    const impressionCounts = new Map<string, number>();
    const positiveCounts = new Map<string, number>();

    for (const impressions of this.impressionsByUser.values()) {
      for (const impression of impressions) {
        impressionCounts.set(impression.bookId, (impressionCounts.get(impression.bookId) ?? 0) + 1);
      }
    }

    for (const events of this.feedbackByUser.values()) {
      for (const event of events) {
        if (event.action === "like" || event.action === "save" || event.action === "mark_read" || event.action === "click") {
          positiveCounts.set(event.bookId, (positiveCounts.get(event.bookId) ?? 0) + 1);
        }
      }
    }

    const scores: Record<string, number> = {};
    for (const [bookId, impressions] of impressionCounts.entries()) {
      const positive = positiveCounts.get(bookId) ?? 0;
      scores[bookId] = positive / Math.max(impressions, 1);
    }
    return scores;
  }

  async upsertBookAffinity(userId: string, bookId: string, scoreDelta: number, source: string): Promise<void> {
    const affinities = this.affinityByUser.get(userId) ?? new Map<string, UserBookAffinity>();
    const current = affinities.get(bookId);
    const next: UserBookAffinity = {
      userId,
      bookId,
      score: (current?.score ?? 0) + scoreDelta,
      source,
      updatedAt: new Date().toISOString()
    };
    affinities.set(bookId, next);
    this.affinityByUser.set(userId, affinities);
  }

  async seedBookAffinity(userId: string, bookId: string, seedScore: number, source: string): Promise<void> {
    const affinities = this.affinityByUser.get(userId) ?? new Map<string, UserBookAffinity>();
    const current = affinities.get(bookId);
    const next: UserBookAffinity = {
      userId,
      bookId,
      score: Math.max(current?.score ?? Number.NEGATIVE_INFINITY, seedScore),
      source: current && current.score >= seedScore ? current.source : source,
      updatedAt: new Date().toISOString()
    };
    affinities.set(bookId, next);
    this.affinityByUser.set(userId, affinities);
  }

  async getTopBookAffinity(userId: string, limit: number): Promise<UserBookAffinity[]> {
    return this.getUserBookAffinity(userId, limit);
  }

  async getUserBookAffinity(userId: string, limit = 100): Promise<UserBookAffinity[]> {
    const values = Array.from((this.affinityByUser.get(userId) ?? new Map()).values());
    values.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    return values.slice(0, Math.max(1, limit));
  }

  async recordImpressions(items: RecommendationImpression[]): Promise<void> {
    for (const item of items) {
      const current = this.impressionsByUser.get(item.userId) ?? [];
      current.push(item);
      this.impressionsByUser.set(item.userId, current);
    }
  }

  async getImpressions(userId: string): Promise<RecommendationImpression[]> {
    return this.impressionsByUser.get(userId) ?? [];
  }
}

export const db = new InMemoryDb();
