export type FeedbackAction = "click" | "like" | "dislike" | "save" | "mark_read";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface UserPreferences {
  userId: string;
  lastRead: string;
  favoriteGenres: string[];
  favoriteBooks: string[];
  dislikedBooks: string[];
  allowMatureContent: boolean;
  updatedAt: string;
}

export interface Book {
  bookId: string;
  title: string;
  authors: string[];
  genres: string[];
  isbns?: string[];
  tags?: string[];
  thumbnailUrl?: string;
  summary?: string;
  rating?: number;
  ratingCount?: number;
  publishedDate?: string;
  mature: boolean;
}

export interface RecommendationItem {
  bookId: string;
  title: string;
  authors: string[];
  genres: string[];
  thumbnailUrl?: string;
  summary?: string;
  rating?: number;
  reasonLabel: string;
  score: number;
}

export interface FeedbackEvent {
  userId: string;
  bookId: string;
  action: FeedbackAction;
  timestamp: string;
}

export interface RecommendationImpression {
  userId: string;
  bookId: string;
  score: number;
  reasonLabel: string;
  timestamp: string;
}

export interface UserBookAffinity {
  userId: string;
  bookId: string;
  score: number;
  source: string;
  updatedAt: string;
}
