import type { Book } from "../types.js";

export interface CandidateScoringContext {
  favoriteGenres: string[];
  semanticKeywords: string[];
}

export interface ScoredCandidate {
  book: Book;
  reason: string;
  preLlmScore: number;
  genreMatch: number;
  keywordSimilarity: number;
  ratingScore: number;
  popularityScore: number;
  recencyScore: number;
}

const GENRE_SYNONYMS: Record<string, string[]> = {
  self_help: ["self-help", "self help", "personal development", "motivation", "psychology"],
  non_fiction: ["non-fiction", "nonfiction", "memoir", "essay", "true story", "history"],
  biography: ["biography", "autobiography", "memoir", "life story"],
  business: ["business", "economics", "leadership", "management", "entrepreneurship"],
  fiction: ["fiction", "novel", "literary", "drama"]
};

const WEIGHTS = {
  genreMatch: 0.35,
  keywordSimilarity: 0.25,
  ratingScore: 0.2,
  popularityScore: 0.1,
  recencyScore: 0.1
} as const;

export function scoreCandidates(
  candidates: Array<{ book: Book; reason: string }>,
  context: CandidateScoringContext
): ScoredCandidate[] {
  return candidates
    .map((candidate) => {
      const genreMatch = computeGenreMatch(candidate.book, context.favoriteGenres);
      const keywordSimilarity = computeKeywordSimilarity(candidate.book, context.semanticKeywords);
      const ratingScore = computeRatingScore(candidate.book);
      const popularityScore = computePopularityScore(candidate.book);
      const recencyScore = computeRecencyScore(candidate.book);
      const preLlmScore =
        WEIGHTS.genreMatch * genreMatch +
        WEIGHTS.keywordSimilarity * keywordSimilarity +
        WEIGHTS.ratingScore * ratingScore +
        WEIGHTS.popularityScore * popularityScore +
        WEIGHTS.recencyScore * recencyScore;

      return {
        ...candidate,
        preLlmScore: Number(preLlmScore.toFixed(4)),
        genreMatch: Number(genreMatch.toFixed(4)),
        keywordSimilarity: Number(keywordSimilarity.toFixed(4)),
        ratingScore: Number(ratingScore.toFixed(4)),
        popularityScore: Number(popularityScore.toFixed(4)),
        recencyScore: Number(recencyScore.toFixed(4))
      };
    })
    .sort((a, b) => b.preLlmScore - a.preLlmScore);
}

export function selectDiverseTopCandidates(scored: ScoredCandidate[], limit: number): ScoredCandidate[] {
  const selected: ScoredCandidate[] = [];
  const remaining = [...scored];

  while (remaining.length > 0 && selected.length < Math.max(1, limit)) {
    let bestIndex = 0;
    let bestAdjustedScore = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i];
      const penalty = computeDiversityPenalty(candidate, selected);
      const adjustedScore = candidate.preLlmScore - penalty;
      if (adjustedScore > bestAdjustedScore) {
        bestAdjustedScore = adjustedScore;
        bestIndex = i;
      }
    }

    selected.push(remaining[bestIndex]);
    remaining.splice(bestIndex, 1);
  }

  return selected;
}

function computeGenreMatch(book: Book, favoriteGenres: string[]): number {
  const mappedFavorite = new Set(
    favoriteGenres
      .map((genre) => mapGenre(genre))
      .filter((genre) => genre.length > 0)
  );
  if (mappedFavorite.size === 0) {
    return 0.5;
  }

  const candidateGenres = new Set(
    (book.genres ?? [])
      .map((genre) => mapGenre(genre))
      .filter((genre) => genre.length > 0)
  );

  if (candidateGenres.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const genre of candidateGenres) {
    if (mappedFavorite.has(genre)) {
      overlap += 1;
    }
  }

  return clamp(overlap / Math.max(1, mappedFavorite.size), 0, 1);
}

function computeKeywordSimilarity(book: Book, semanticKeywords: string[]): number {
  if (semanticKeywords.length === 0) {
    return 0.5;
  }
  const text = normalize(`${book.title} ${book.summary ?? ""} ${(book.genres ?? []).join(" ")}`);
  if (!text) {
    return 0;
  }

  let matches = 0;
  for (const keyword of semanticKeywords) {
    const normalizedKeyword = normalize(keyword);
    if (normalizedKeyword && text.includes(normalizedKeyword)) {
      matches += 1;
    }
  }

  return clamp(matches / semanticKeywords.length, 0, 1);
}

function computeRatingScore(book: Book): number {
  const rating = typeof book.rating === "number" ? book.rating : 0;
  if (rating <= 0) {
    return 0.4;
  }
  return clamp((rating - 3) / 2, 0, 1);
}

function computePopularityScore(book: Book): number {
  const count = typeof book.ratingCount === "number" ? book.ratingCount : 0;
  if (count <= 0) {
    return 0;
  }
  return clamp(Math.log10(count + 1) / 3, 0, 1);
}

function computeRecencyScore(book: Book): number {
  const year = extractYear(book.publishedDate);
  if (!year) {
    return 0.4;
  }
  const currentYear = new Date().getUTCFullYear();
  const age = Math.max(0, currentYear - year);
  return clamp(1 - age / 20, 0, 1);
}

function computeDiversityPenalty(candidate: ScoredCandidate, selected: ScoredCandidate[]): number {
  if (selected.length === 0) {
    return 0;
  }
  const candidateTokens = collectThemeTokens(candidate.book);
  let maxSimilarity = 0;
  for (const picked of selected) {
    const pickedTokens = collectThemeTokens(picked.book);
    const similarity = jaccard(candidateTokens, pickedTokens);
    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
    }
  }
  return maxSimilarity * 0.2;
}

function collectThemeTokens(book: Book): Set<string> {
  const text = normalize(`${book.title} ${book.summary ?? ""} ${(book.genres ?? []).join(" ")}`);
  const tokens = text.split(/\s+/).filter((token) => token.length >= 4);
  return new Set(tokens);
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }
  const union = left.size + right.size - intersection;
  if (union <= 0) {
    return 0;
  }
  return intersection / union;
}

function mapGenre(raw: string): string {
  const normalized = normalize(raw);
  if (!normalized) {
    return "";
  }

  for (const [target, synonyms] of Object.entries(GENRE_SYNONYMS)) {
    if (synonyms.some((token) => normalized.includes(token))) {
      return target;
    }
  }
  return normalized.replace(/\s+/g, "_");
}

function extractYear(value?: string): number | null {
  if (!value) {
    return null;
  }
  const match = value.match(/\b(19|20)\d{2}\b/);
  if (!match) {
    return null;
  }
  const year = Number(match[0]);
  if (!Number.isFinite(year)) {
    return null;
  }
  return year;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
