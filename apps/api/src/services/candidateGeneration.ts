import type { Book } from "../types.js";
import type { GoogleBooksClient } from "./googleBooksClient.js";
import { scoreCandidates, selectDiverseTopCandidates } from "./candidateScoring.js";

interface CandidateQueryPlan {
  query: string;
  reason: string;
  limit: number;
}

export interface CandidateGenerationInput {
  favoriteGenres: string[];
  favoriteBooks: string[];
  lastRead?: string;
  searchIntent?: string;
  excludeSeedTitles?: boolean;
  targetSize?: number;
}

export interface CandidateBookWithReason {
  book: Book;
  reason: string;
  preLlmScore?: number;
}

export interface CandidateGenerationDiagnostics {
  queryPlanCount: number;
  semanticKeywordCount: number;
  rawFetchedCount: number;
  mergedCount: number;
  afterSeedExclusionCount: number;
  afterGenreFilterCount: number;
  afterQualityFilterCount: number;
  scoredCount: number;
  diversifiedCount: number;
}

const DEFAULT_TARGET_SIZE = 20;
const QUERY_LIMIT = 10;
const MIN_DESCRIPTION_LENGTH = 80;
const MIN_DESCRIPTION_LENGTH_RELAXED = 40;

const NEGATIVE_QUERY_TOKENS = "-textbook -academic -engineering -security -cryptography -rfid -protocols";
const BLOCKED_CATEGORY_TOKENS = [
  "computers",
  "engineering",
  "cryptography",
  "rfid",
  "security",
  "academic",
  "research"
];

const SUBJECT_QUERY_MAP: Record<string, string[]> = {
  self_help: ["self-help", "personal development", "motivation"],
  non_fiction: ["non-fiction", "true story", "memoir"],
  biography: ["biography", "autobiography", "memoir"],
  business: ["business", "economics", "entrepreneurship"],
  fiction: ["fiction", "literary fiction", "historical fiction"]
};

const SEMANTIC_BOOK_HINTS: Array<{ pattern: RegExp; keywords: string[] }> = [
  { pattern: /\bthe secret\b/i, keywords: ["motivation", "mindset", "law of attraction", "self improvement"] },
  { pattern: /\brework\b/i, keywords: ["startup", "productivity", "business thinking", "entrepreneurship"] },
  { pattern: /\bthe kite runner\b/i, keywords: ["emotional fiction", "family drama", "human resilience"] },
  { pattern: /\batomic habits\b/i, keywords: ["habits", "discipline", "self improvement", "behavior change"] },
  { pattern: /\bdeep work\b/i, keywords: ["focus", "productivity", "concentration", "high performance"] }
];

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "that",
  "with",
  "from",
  "book",
  "books",
  "your",
  "about",
  "into",
  "this",
  "they"
]);

export async function generateBookCandidates(
  client: GoogleBooksClient,
  input: CandidateGenerationInput
): Promise<CandidateBookWithReason[]> {
  const { candidates } = await generateBookCandidatesWithDiagnostics(client, input);
  return candidates;
}

export async function generateBookCandidatesWithDiagnostics(
  client: GoogleBooksClient,
  input: CandidateGenerationInput
): Promise<{ candidates: CandidateBookWithReason[]; diagnostics: CandidateGenerationDiagnostics }> {
  const targetSize = Math.max(1, input.targetSize ?? DEFAULT_TARGET_SIZE);
  const semanticKeywords = extractSemanticKeywords(input.favoriteBooks, input.favoriteGenres).slice(0, 15);
  const queryPlans = buildQueryPlans(input, semanticKeywords);

  const searches = await Promise.all(
    queryPlans.map((plan) => runPlannedSearch(client, plan.query, Math.min(QUERY_LIMIT, plan.limit)))
  );
  const rawFetchedCount = searches.reduce((sum, items) => sum + (items?.length ?? 0), 0);
  const merged = mergeAndDedupeResults(searches, queryPlans);

  const excludedSeedTitles = input.excludeSeedTitles ? buildExcludedSeedTitles(input.favoriteBooks, input.lastRead ?? "") : [];
  const withoutSeeds = excludedSeedTitles.length > 0
    ? merged.filter((item) => !isSeedTitleMatch(item.book.title, excludedSeedTitles))
    : merged;

  const genreFiltered = filterCandidatesByGenre(withoutSeeds, input.favoriteGenres, semanticKeywords);
  const minDescriptionLength = genreFiltered.length >= 12 ? MIN_DESCRIPTION_LENGTH : MIN_DESCRIPTION_LENGTH_RELAXED;
  const qualityFiltered = filterCandidatesByQuality(genreFiltered, { minDescriptionLength });
  const scored = scoreCandidates(qualityFiltered, {
    favoriteGenres: input.favoriteGenres,
    semanticKeywords
  });
  const diversified = selectDiverseTopCandidates(scored, targetSize);

  const candidates = diversified.map((item) => ({
    book: item.book,
    reason: `${item.reason} (score=${item.preLlmScore.toFixed(3)})`,
    preLlmScore: item.preLlmScore
  }));

  return {
    candidates,
    diagnostics: {
      queryPlanCount: queryPlans.length,
      semanticKeywordCount: semanticKeywords.length,
      rawFetchedCount,
      mergedCount: merged.length,
      afterSeedExclusionCount: withoutSeeds.length,
      afterGenreFilterCount: genreFiltered.length,
      afterQualityFilterCount: qualityFiltered.length,
      scoredCount: scored.length,
      diversifiedCount: candidates.length
    }
  };
}

export function extractSemanticKeywords(likedBooks: string[], favoriteGenres: string[]): string[] {
  const keywords = new Set<string>();

  for (const title of likedBooks) {
    const trimmed = title.trim();
    if (!trimmed) {
      continue;
    }
    for (const hint of SEMANTIC_BOOK_HINTS) {
      if (hint.pattern.test(trimmed)) {
        for (const keyword of hint.keywords) {
          keywords.add(keyword);
        }
      }
    }
    for (const token of tokenize(trimmed)) {
      if (token.length >= 4 && !STOPWORDS.has(token)) {
        keywords.add(token);
      }
    }
  }

  for (const genre of favoriteGenres) {
    const mapped = mapCategoryToInternalGenre(genre);
    if (mapped && SUBJECT_QUERY_MAP[mapped]) {
      for (const token of SUBJECT_QUERY_MAP[mapped]) {
        keywords.add(token);
      }
    }
  }

  return Array.from(keywords).slice(0, 15);
}

export function buildQueryPlans(input: CandidateGenerationInput, semanticKeywords: string[]): CandidateQueryPlan[] {
  const plans: CandidateQueryPlan[] = [];
  const normalizedGenres = dedupeStrings(input.favoriteGenres.map((genre) => mapCategoryToInternalGenre(genre)).filter(Boolean));

  // Subject queries generally produce higher-quality book results than plain keyword searches.
  for (const genre of normalizedGenres) {
    const subjects = SUBJECT_QUERY_MAP[genre] ?? [];
    for (const subject of subjects.slice(0, 3)) {
      plans.push({
        query: `subject:${subject} ${NEGATIVE_QUERY_TOKENS}`,
        reason: `Popular in ${subject}`,
        limit: QUERY_LIMIT
      });
    }
  }

  for (const keywordChunk of chunkArray(semanticKeywords, 2).slice(0, 5)) {
    if (keywordChunk.length === 0) {
      continue;
    }
    const phrase = keywordChunk.join(" ");
    plans.push({
      query: `${phrase} books ${NEGATIVE_QUERY_TOKENS}`,
      reason: "Theme match from your liked books",
      limit: QUERY_LIMIT
    });
  }

  for (const keyword of semanticKeywords.slice(0, 3)) {
    plans.push({
      query: `intitle:${keyword} ${NEGATIVE_QUERY_TOKENS}`,
      reason: `Title theme: ${keyword}`,
      limit: QUERY_LIMIT
    });
  }

  for (const title of dedupeStrings(input.favoriteBooks).slice(0, 4)) {
    const escaped = safeQuoted(title);
    plans.push({
      query: `intitle:${escaped} ${NEGATIVE_QUERY_TOKENS}`,
      reason: `Books around ${title}`,
      limit: QUERY_LIMIT
    });
    plans.push({
      query: `"${title}" similar books ${NEGATIVE_QUERY_TOKENS}`,
      reason: `Similar to ${title}`,
      limit: QUERY_LIMIT
    });
    plans.push({
      query: `books similar to "${title}" ${NEGATIVE_QUERY_TOKENS}`,
      reason: `Readers of ${title} also like`,
      limit: QUERY_LIMIT
    });
  }

  const lastRead = input.lastRead?.trim();
  if (lastRead) {
    plans.push({
      query: `intitle:${safeQuoted(lastRead)} ${NEGATIVE_QUERY_TOKENS}`,
      reason: `Similar to your recent read ${lastRead}`,
      limit: QUERY_LIMIT
    });
  }

  const searchIntent = input.searchIntent?.trim();
  if (searchIntent) {
    plans.push({
      query: `${searchIntent} ${NEGATIVE_QUERY_TOKENS}`,
      reason: `Matches your search: ${searchIntent}`,
      limit: QUERY_LIMIT
    });
  }

  if (plans.length === 0) {
    plans.push({
      query: `subject:self-help ${NEGATIVE_QUERY_TOKENS}`,
      reason: "Popular books",
      limit: QUERY_LIMIT
    });
    plans.push({
      query: `subject:biography ${NEGATIVE_QUERY_TOKENS}`,
      reason: "Popular biographies",
      limit: QUERY_LIMIT
    });
  }
  return dedupeQueryPlans(plans).slice(0, 10);
}

export function mergeAndDedupeResults(
  searches: Book[][],
  plans: CandidateQueryPlan[]
): CandidateBookWithReason[] {
  const byKey = new Map<string, CandidateBookWithReason>();

  for (let index = 0; index < searches.length; index += 1) {
    const reason = plans[index]?.reason ?? "Suggested for your profile";
    for (const book of searches[index] ?? []) {
      const candidate: CandidateBookWithReason = { book, reason };
      const keys = dedupeKeysForBook(book);
      const existing = keys.map((key) => byKey.get(key)).find((value) => Boolean(value));
      const preferred = pickBetterCandidate(existing, candidate);
      for (const key of keys) {
        byKey.set(key, preferred);
      }
    }
  }

  return Array.from(new Set(byKey.values()));
}

export function filterCandidatesByGenre<T extends { book: Book }>(
  items: T[],
  favoriteGenres: string[],
  semanticKeywords: string[] = []
): T[] {
  const preferred = new Set(
    favoriteGenres
      .map((genre) => mapCategoryToInternalGenre(genre))
      .filter((genre) => genre.length > 0)
  );

  return items.filter((item) => {
    const categories = item.book.genres ?? [];
    if (containsBlockedCategories(categories)) {
      return false;
    }

    if (preferred.size === 0) {
      return true;
    }

    const normalizedCandidateGenres = categories.map((genre) => mapCategoryToInternalGenre(genre)).filter((genre) => genre.length > 0);
    if (normalizedCandidateGenres.length === 0) {
      // Do not hard-drop uncategorized books; they are handled by scoring.
      return true;
    }

    if (normalizedCandidateGenres.some((genre) => preferred.has(genre))) {
      return true;
    }

    // Keep books that semantically match user intent even if provider categories are noisy.
    const text = normalize(`${item.book.title} ${item.book.summary ?? ""}`);
    if (text && semanticKeywords.some((keyword) => text.includes(normalize(keyword)))) {
      return true;
    }

    return false;
  });
}

export function filterCandidatesByQuality<T extends { book: Book }>(
  items: T[],
  options: { minDescriptionLength?: number } = {}
): T[] {
  const minDescriptionLength = Math.max(20, options.minDescriptionLength ?? MIN_DESCRIPTION_LENGTH);
  return items.filter((item) => {
    const book = item.book;
    if (!hasValidDescription(book, minDescriptionLength) && !isHighConfidenceBook(book)) {
      return false;
    }
    if (book.mature) {
      return false;
    }
    return true;
  });
}

function pickBetterCandidate(current: CandidateBookWithReason | undefined, next: CandidateBookWithReason): CandidateBookWithReason {
  if (!current) {
    return next;
  }
  const currentScore = quickQualityScore(current.book);
  const nextScore = quickQualityScore(next.book);
  if (nextScore > currentScore) {
    return next;
  }
  return current;
}

function quickQualityScore(book: Book): number {
  let score = 0;
  const rating = typeof book.rating === "number" ? book.rating : 0;
  const ratingCount = typeof book.ratingCount === "number" ? book.ratingCount : 0;

  if (hasValidDescription(book)) {
    score += 2;
  }
  if (rating >= 4.2) {
    score += 2;
  }
  if (ratingCount >= 200) {
    score += 1.8;
  }
  if (rating < 3.6 && rating > 0) {
    score -= 1.2;
  }
  if (book.mature) {
    score -= 3;
  }
  return score;
}

function hasValidDescription(book: Book, minDescriptionLength = MIN_DESCRIPTION_LENGTH): boolean {
  const summary = book.summary?.trim() ?? "";
  return summary.length >= minDescriptionLength;
}

function isHighConfidenceBook(book: Book): boolean {
  const rating = typeof book.rating === "number" ? book.rating : 0;
  const ratingCount = typeof book.ratingCount === "number" ? book.ratingCount : 0;
  return rating >= 4.1 && ratingCount >= 120;
}

async function runPlannedSearch(client: GoogleBooksClient, query: string, limit: number): Promise<Book[]> {
  const primary = await client.searchBooks(query, { limit });
  if (primary.length > 0) {
    return primary;
  }

  const relaxedQuery = stripNegativeTokens(query);
  if (!relaxedQuery || relaxedQuery === query) {
    return primary;
  }
  return client.searchBooks(relaxedQuery, { limit });
}

function stripNegativeTokens(query: string): string {
  return query.replace(/\s-\w+/g, "").replace(/\s+/g, " ").trim();
}

function containsBlockedCategories(categories: string[]): boolean {
  const text = normalize(categories.join(" "));
  return BLOCKED_CATEGORY_TOKENS.some((blocked) => text.includes(blocked));
}

function mapCategoryToInternalGenre(raw: string): string {
  const value = normalize(raw);
  if (!value) {
    return "";
  }
  if (value.includes("self-help") || value.includes("self help") || value.includes("psychology")) {
    return "self_help";
  }
  if (value.includes("business") || value.includes("economics") || value.includes("startup")) {
    return "business";
  }
  if (value.includes("biography") || value.includes("autobiography") || value.includes("memoir")) {
    return "biography";
  }
  if (value.includes("non-fiction") || value.includes("nonfiction") || value.includes("history")) {
    return "non_fiction";
  }
  if (value.includes("fiction") || value.includes("novel")) {
    return "fiction";
  }
  return value.replace(/\s+/g, "_");
}

function dedupeKeysForBook(book: Book): string[] {
  const keys: string[] = [];
  for (const isbn of book.isbns ?? []) {
    const normalizedIsbn = isbn.replace(/[^0-9xX]/g, "").toLowerCase();
    if (normalizedIsbn) {
      keys.push(`isbn:${normalizedIsbn}`);
    }
  }
  const normalizedTitle = normalize(book.title);
  const normalizedAuthor = normalize((book.authors ?? [])[0] ?? "");
  if (normalizedTitle) {
    keys.push(`title:${normalizedTitle}|author:${normalizedAuthor}`);
  }
  keys.push(`book:${book.bookId}`);
  return dedupeStrings(keys);
}

function buildExcludedSeedTitles(favoriteBooks: string[], lastRead: string): string[] {
  return dedupeStrings([...favoriteBooks, lastRead].map((item) => normalize(item)).filter((item) => item.length > 0));
}

function isSeedTitleMatch(title: string, seedTitles: string[]): boolean {
  const normalizedTitle = normalize(title);
  if (!normalizedTitle) {
    return false;
  }
  return seedTitles.some((seed) => normalizedTitle === seed || normalizedTitle.includes(seed) || seed.includes(normalizedTitle));
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    output.push(trimmed);
  }
  return output;
}

function dedupeQueryPlans(values: CandidateQueryPlan[]): CandidateQueryPlan[] {
  const seen = new Set<string>();
  const output: CandidateQueryPlan[] = [];
  for (const plan of values) {
    const normalized = normalize(plan.query);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(plan);
  }
  return output;
}

function chunkArray<T>(values: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

function safeQuoted(value: string): string {
  const stripped = value.replace(/["]/g, "");
  return `"${stripped}"`;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
