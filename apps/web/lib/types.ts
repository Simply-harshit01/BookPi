export type FeedbackAction = "click" | "like" | "dislike" | "save" | "mark_read";

export interface UserPreferences {
  lastRead: string;
  favoriteGenres: string[];
  favoriteBooks: string[];
  dislikedBooks: string[];
  allowMatureContent: boolean;
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

export interface Book {
  bookId: string;
  title: string;
  authors: string[];
  genres: string[];
  thumbnailUrl?: string;
  summary?: string;
  rating?: number;
  mature: boolean;
}

export interface MeResponse {
  user: { id: string; email: string; createdAt: string };
  preferences: UserPreferences;
  savedBookIds: string[];
  savedBooks: Book[];
  myShelfBooks: Book[];
}
