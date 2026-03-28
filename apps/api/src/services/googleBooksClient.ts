import type { Book } from "../types.js";

interface SearchFilters {
  genres?: string[];
  limit?: number;
}

interface GoogleBooksVolume {
  id: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    categories?: string[];
    description?: string;
    averageRating?: number;
    ratingsCount?: number;
    publishedDate?: string;
    industryIdentifiers?: Array<{
      type?: string;
      identifier?: string;
    }>;
    imageLinks?: {
      thumbnail?: string;
    };
    maturityRating?: string;
  };
}

interface GoogleBooksResponse {
  items?: GoogleBooksVolume[];
}

export class GoogleBooksClient {
  constructor(private readonly apiKey?: string) {}

  async searchBooks(query: string, filters: SearchFilters = {}): Promise<Book[]> {
    const limit = Math.min(filters.limit ?? 20, 40);
    const genreClause = filters.genres && filters.genres.length > 0 ? `+subject:${filters.genres[0]}` : "";
    const q = encodeURIComponent(`${query}${genreClause}`.trim());
    const key = this.apiKey ? `&key=${encodeURIComponent(this.apiKey)}` : "";
    const url = `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=${limit}${key}`;

    const maxAttempts = 2;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 7000);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (!response.ok) {
          if (attempt < maxAttempts - 1 && (response.status === 429 || response.status >= 500)) {
            continue;
          }
          return [];
        }

        const payload = (await response.json()) as GoogleBooksResponse;
        const books = (payload.items ?? []).map((item) => this.mapVolume(item)).filter(Boolean) as Book[];
        if (books.length > 0) {
          return books;
        }
        return [];
      } catch {
        if (attempt >= maxAttempts - 1) {
          return [];
        }
      }
    }
    return [];
  }

  async getBookById(id: string): Promise<Book | null> {
    const key = this.apiKey ? `?key=${encodeURIComponent(this.apiKey)}` : "";
    const url = `https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(id)}${key}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as GoogleBooksVolume;
      return this.mapVolume(payload);
    } catch {
      return null;
    }
  }

  private mapVolume(item: GoogleBooksVolume): Book | null {
    const title = item.volumeInfo?.title?.trim();
    if (!item.id || !title) {
      return null;
    }

    const rating = item.volumeInfo?.maturityRating ?? "NOT_MATURE";
    const isbns = (item.volumeInfo?.industryIdentifiers ?? [])
      .filter((identifier) => {
        const type = identifier.type?.toUpperCase();
        return type === "ISBN_10" || type === "ISBN_13";
      })
      .map((identifier) => identifier.identifier?.trim() ?? "")
      .filter((identifier) => identifier.length > 0);

    return {
      bookId: item.id,
      title,
      authors: item.volumeInfo?.authors ?? [],
      genres: item.volumeInfo?.categories ?? [],
      isbns: isbns.length > 0 ? isbns : undefined,
      thumbnailUrl: item.volumeInfo?.imageLinks?.thumbnail,
      summary: item.volumeInfo?.description?.slice(0, 420),
      rating: item.volumeInfo?.averageRating,
      ratingCount: item.volumeInfo?.ratingsCount,
      publishedDate: item.volumeInfo?.publishedDate,
      mature: rating === "MATURE"
    };
  }
}
