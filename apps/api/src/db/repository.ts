import type { Book, FeedbackEvent, RecommendationImpression, User, UserBookAffinity, UserPreferences } from "../types.js";

export interface Repository {
  createUser(email: string, passwordHash: string): Promise<User>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  upsertPreferences(userId: string, patch: Omit<UserPreferences, "userId" | "updatedAt">): Promise<UserPreferences>;
  getPreferences(userId: string): Promise<UserPreferences | undefined>;
  cacheBooks(books: Book[]): Promise<void>;
  getCachedBooks(): Promise<Book[]>;
  getCachedBookById(bookId: string): Promise<Book | undefined>;
  findSimilarCachedBooks(anchorBookIds: string[], limit: number): Promise<Book[]>;
  recordFeedback(event: FeedbackEvent): Promise<{ stored: boolean }>;
  getFeedback(userId: string): Promise<FeedbackEvent[]>;
  getSavedBookIds(userId: string): Promise<string[]>;
  getSavedBooks(userId: string): Promise<Book[]>;
  getReadBooks(userId: string): Promise<Book[]>;
  getGlobalBookEngagement(): Promise<Record<string, number>>;
  upsertBookAffinity(userId: string, bookId: string, scoreDelta: number, source: string): Promise<void>;
  seedBookAffinity(userId: string, bookId: string, seedScore: number, source: string): Promise<void>;
  getTopBookAffinity(userId: string, limit: number): Promise<UserBookAffinity[]>;
  getUserBookAffinity(userId: string, limit?: number): Promise<UserBookAffinity[]>;
  recordImpressions(items: RecommendationImpression[]): Promise<void>;
  getImpressions(userId: string): Promise<RecommendationImpression[]>;
}
