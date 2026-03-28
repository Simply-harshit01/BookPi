import { env } from "../config.js";
import type { RecommendationItem } from "../types.js";

export type InteractionType = "LIKE" | "DISLIKE" | "READ" | "SAVED";

export interface DynamicProfile {
  fav_genres: string[];
  past_reads: string[];
}

export interface DynamicInteraction {
  book_title: string;
  type: InteractionType;
  created_at?: string;
}

export interface DynamicRecsOptions {
  apiKey?: string;
  recommendationCount?: number;
  slidingWindowSize?: number;
  maxNewTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  modelUrl?: string;
  provider?: string;
  candidateBooks?: Array<{
    title: string;
    authors: string[];
    genres?: string[];
    rating?: number;
    preLlmScore?: number;
    summary?: string;
  }>;
}

export interface DynamicRecommendation {
  candidateId?: number;
  title?: string;
  reason: string;
  author?: string;
  score?: number;
}

interface HuggingFaceError {
  error?: string;
}

interface HuggingFaceChatCompletion {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface DynamicUserState {
  liked: string[];
  disliked: string[];
  alreadyRead: string[];
}

const DEFAULT_MODEL_URL = "meta-llama/Llama-4-Scout-17B-16E-Instruct";
const HF_CHAT_COMPLETIONS_URL = "https://router.huggingface.co/v1/chat/completions";

export function shouldRefreshRecommendations(interactionsSinceLastRefresh: number, threshold = 3): boolean {
  return interactionsSinceLastRefresh >= Math.max(1, threshold);
}

export async function getDynamicRecs(
  profile: DynamicProfile,
  interactions: DynamicInteraction[],
  options: DynamicRecsOptions
): Promise<string[]> {
  const recommendations = await getDynamicRecommendations(profile, interactions, options);
  return recommendations.map((item) => item.title).filter((title): title is string => Boolean(title && title.trim().length > 0));
}

export async function getDynamicRecommendations(
  profile: DynamicProfile,
  interactions: DynamicInteraction[],
  options: DynamicRecsOptions
): Promise<DynamicRecommendation[]> {
  const apiKey = options.apiKey ?? env.HUGGING_FACE_API_KEY ?? "";
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("Missing Hugging Face API key.");
  }

  const recommendationCount = Math.max(1, options.recommendationCount ?? 10);
  const slidingWindowSize = Math.max(1, options.slidingWindowSize ?? 10);
  const maxNewTokens = Math.max(256, options.maxNewTokens ?? 800);
  const temperature = options.temperature ?? 0.25;
  const timeoutMs = Math.max(1000, options.timeoutMs ?? 12000);
  const modelUrl = resolveModelUrl(options.modelUrl ?? env.HUGGING_FACE_MODEL_URL ?? DEFAULT_MODEL_URL);
  const provider = (options.provider ?? env.HUGGING_FACE_PROVIDER ?? "").trim();

  console.log(`[getDynamicRecommendations] Starting with ${interactions.length} interactions, candidates=${options.candidateBooks?.length ?? 0}`);

  const state = buildDynamicUserState(profile, interactions, slidingWindowSize);
  const prompt = buildRecommendationPrompt(profile, state, recommendationCount, options.candidateBooks);
  
  console.log(`[getDynamicRecommendations] Prompt (first 200 chars): ${prompt.slice(0, 200)}`);
  
  const rawText = await generateWithHFRouter(prompt, { apiKey, modelUrl, provider, temperature, maxNewTokens, timeoutMs });
  console.log(`[getDynamicRecommendations] LLM raw response (first 300 chars): ${rawText.slice(0, 300)}`);
  
  const parsed = parseDynamicRecommendations(rawText);
  console.log(`[getDynamicRecommendations] Parsed recommendations: ${parsed.length} items`);
  if (parsed.length > 0) {
    console.log(`[getDynamicRecommendations] Parsed items:`, parsed.map(p => ({ title: p.title, reason: p.reason })));
  }
  
  const hydrated = hydrateRecommendationsFromCandidates(parsed, options.candidateBooks);

  const blocked = new Set(
    [...state.disliked, ...state.alreadyRead, ...state.liked]
      .map((title) => normalizeTitle(title))
      .filter((title) => title.length > 0)
  );

  const unique: DynamicRecommendation[] = [];
  const seen = new Set<string>();
  for (const item of hydrated) {
    const normalized = normalizeTitle(item.title ?? "");
    const dedupeKey = item.candidateId ? `id:${item.candidateId}` : `title:${normalized}`;
    if ((!normalized && !item.candidateId) || (normalized && blocked.has(normalized)) || seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    const finalTitle = (item.title ?? "").trim();
    if (!finalTitle) {
      continue;
    }
    unique.push({
      title: finalTitle,
      reason: item.reason.trim() || "Suggested for your profile"
    });
    if (unique.length >= recommendationCount) {
      break;
    }
  }

  return unique;
}

export function rankBooksByDynamicTitles(
  books: Array<{
    bookId: string;
    title: string;
    authors: string[];
    genres: string[];
    thumbnailUrl?: string;
    summary?: string;
    rating?: number;
    mature: boolean;
  }>,
  suggestedTitles: string[],
  limit: number,
  allowMatureContent: boolean
): RecommendationItem[] {
  const normalizedOrder = suggestedTitles
    .map((title) => ({ raw: title, normalized: normalizeTitle(title) }))
    .filter((item) => item.normalized.length > 0);
  const orderMap = new Map<string, number>();
  normalizedOrder.forEach((item, index) => {
    if (!orderMap.has(item.normalized)) {
      orderMap.set(item.normalized, index);
    }
  });

  const candidates = books
    .filter((book) => allowMatureContent || !book.mature)
    .map((book) => {
      const normalized = normalizeTitle(book.title);
      const idx = orderMap.has(normalized) ? orderMap.get(normalized)! : Number.MAX_SAFE_INTEGER;
      return { book, idx };
    })
    .sort((a, b) => a.idx - b.idx);

  const seen = new Set<string>();
  const output: RecommendationItem[] = [];
  for (const item of candidates) {
    if (item.idx === Number.MAX_SAFE_INTEGER) {
      continue;
    }
    if (seen.has(item.book.bookId)) {
      continue;
    }
    seen.add(item.book.bookId);
    const rank = output.length + 1;
    output.push({
      bookId: item.book.bookId,
      title: item.book.title,
      authors: item.book.authors,
      genres: item.book.genres,
      thumbnailUrl: item.book.thumbnailUrl,
      summary: item.book.summary,
      rating: item.book.rating,
      reasonLabel: `Because you may like ${suggestedTitles[item.idx] ?? item.book.title}`,
      score: Number(Math.max(0.1, 1 - (rank - 1) * 0.05).toFixed(3))
    });
    if (output.length >= Math.max(1, limit)) {
      break;
    }
  }
  return output;
}

function buildDynamicUserState(
  profile: DynamicProfile,
  interactions: DynamicInteraction[],
  slidingWindowSize: number
): DynamicUserState {
  const sorted = [...interactions].sort((a, b) => {
    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return timeB - timeA;
  });

  const recent = sorted.slice(0, slidingWindowSize);
  const liked = recent.filter((item) => item.type === "LIKE").map((item) => item.book_title);
  const saved = recent.filter((item) => item.type === "SAVED").map((item) => item.book_title);
  const disliked = recent.filter((item) => item.type === "DISLIKE").map((item) => item.book_title);
  const readFromInteractions = recent.filter((item) => item.type === "READ").map((item) => item.book_title);
  const alreadyRead = dedupeStrings([...(profile.past_reads ?? []), ...readFromInteractions]);

  const state = {
    liked: dedupeStrings([...liked, ...saved]),
    disliked: dedupeStrings(disliked),
    alreadyRead
  };
  
  console.log(`[buildDynamicUserState] Interactions: total=${interactions.length}, recent_window=${recent.length}`);
  console.log(`[buildDynamicUserState] State: liked=${state.liked.length}, disliked=${state.disliked.length}, alreadyRead=${state.alreadyRead.length}`);
  if (state.liked.length > 0) console.log(`[buildDynamicUserState] Liked books:`, state.liked);
  if (state.disliked.length > 0) console.log(`[buildDynamicUserState] Disliked books:`, state.disliked);
  
  return state;
}

function buildRecommendationPrompt(
  profile: DynamicProfile,
  state: DynamicUserState,
  recommendationCount: number,
  candidateBooks?: Array<{
    title: string;
    authors: string[];
    genres?: string[];
    rating?: number;
    preLlmScore?: number;
    summary?: string;
  }>
): string {
  const isColdStart = state.liked.length === 0 && state.disliked.length === 0 && state.alreadyRead.length === (profile.past_reads ?? []).length;

  // If we have candidate books, build a selection prompt instead of generation
  if (candidateBooks && candidateBooks.length > 0) {
    const limitedCandidates = candidateBooks.slice(0, Math.min(candidateBooks.length, 20));
    const booksList = JSON.stringify(
      limitedCandidates.map((book, idx) => ({
        id: idx + 1,
        title: book.title,
        author: book.authors?.[0] ?? "Unknown",
        genres: book.genres ?? [],
        rating: book.rating ?? null,
        preLlmScore: book.preLlmScore ?? null,
        description: (book.summary ?? "").slice(0, 220)
      }))
    );

    if (isColdStart) {
      return `[INST]
USER PROFILE:
- Favorite Genres: ${(profile.fav_genres ?? []).join(", ") || "none"}
- Already Read: ${(profile.past_reads ?? []).join(", ") || "none"}

AVAILABLE BOOKS:
${booksList}

TASK:
Pick the best ${Math.min(recommendationCount, limitedCandidates.length)} books from the list above for this reader.
You MUST select only from AVAILABLE BOOKS and must not invent titles.
Do not pick books from "Already Read".
Return ONLY valid JSON.
Format exactly:
{"recommendations":[{"candidateId":1,"title":"Title 1","author":"Author 1","reason":"Why this fits","score":0.91},{"candidateId":2,"title":"Title 2","author":"Author 2","reason":"Why this fits","score":0.84}]}
[/INST]`;
    }

    return `[INST]
USER PROFILE:
- Favorite Genres: ${(profile.fav_genres ?? []).join(", ") || "none"}
- Highly Rated (Liked): ${state.liked.join(", ") || "none"}
- Avoid (Disliked): ${state.disliked.join(", ") || "none"}
- Ignore (Already Read): ${state.alreadyRead.join(", ") || "none"}

AVAILABLE BOOKS:
${booksList}

TASK:
Pick the best ${Math.min(recommendationCount, limitedCandidates.length)} books from the list above.
You MUST select only from AVAILABLE BOOKS and must not invent titles.
Do NOT pick any title from the disliked or already-read lists.
Prioritize books matching style/pattern from liked books.
Return ONLY valid JSON.
Format exactly:
{"recommendations":[{"candidateId":1,"title":"Title 1","author":"Author 1","reason":"Why this fits","score":0.91},{"candidateId":2,"title":"Title 2","author":"Author 2","reason":"Why this fits","score":0.84}]}
[/INST]`;
  }

  // Fallback to generation mode if no candidates provided
  if (isColdStart) {
    return `[INST]
USER PROFILE:
- Favorite Genres: ${(profile.fav_genres ?? []).join(", ") || "none"}
- Already Read: ${(profile.past_reads ?? []).join(", ") || "none"}

TASK:
Suggest ${recommendationCount} fresh books for this reader.
Do not suggest books from "Already Read".
Return ONLY valid JSON.
Format exactly:
{"recommendations":[{"title":"Title 1","reason":"Why this fits"},{"title":"Title 2","reason":"Why this fits"}]}
[/INST]`;
  }

  return `[INST]
USER PROFILE:
- Favorite Genres: ${(profile.fav_genres ?? []).join(", ") || "none"}
- Highly Rated (Liked): ${state.liked.join(", ") || "none"}
- Avoid (Disliked): ${state.disliked.join(", ") || "none"}
- Ignore (Already Read): ${state.alreadyRead.join(", ") || "none"}

TASK:
Suggest ${recommendationCount} fresh books.
Do NOT suggest any title from the disliked or already-read lists.
Prioritize the style/pattern from liked books.
Return ONLY valid JSON.
Format exactly:
{"recommendations":[{"title":"Title 1","reason":"Why this fits"},{"title":"Title 2","reason":"Why this fits"}]}
[/INST]`;
}

async function generateWithHFRouter(
  prompt: string,
  input: {
    apiKey: string;
    modelUrl: string;
    provider: string;
    temperature: number;
    maxNewTokens: number;
    timeoutMs: number;
  },
  retryCount = 0
): Promise<string> {
  const MAX_RETRIES = 2;
  const BASE_DELAY_MS = 1000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await fetch(HF_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: resolveModelWithProvider(input.modelUrl, input.provider),
        messages: [
          {
            role: "system",
            content:
              "You are a book recommender API. Output only strict JSON. No markdown. No explanation. Do not include author names in title."
          },
          { role: "user", content: prompt }
        ],
        temperature: input.temperature,
        max_tokens: input.maxNewTokens
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text();
      const errorMsg = `Hugging Face request failed (${response.status}): ${body.slice(0, 240)}`;
      
      // Retry on 429 (rate limit) or 503 (service unavailable)
      if ((response.status === 429 || response.status === 503) && retryCount < MAX_RETRIES) {
        const delayMs = BASE_DELAY_MS * Math.pow(2, retryCount);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return generateWithHFRouter(prompt, input, retryCount + 1);
      }
      
      throw new Error(errorMsg);
    }

    const payload = (await response.json()) as HuggingFaceChatCompletion | HuggingFaceError;
    if (!payload) {
      throw new Error("Empty Hugging Face response.");
    }

    if (isHuggingFaceError(payload) && typeof payload.error === "string" && payload.error.length > 0) {
      throw new Error(`Hugging Face error: ${payload.error}`);
    }

    if (isHuggingFaceChatCompletion(payload)) {
      return payload.choices?.[0]?.message?.content?.trim() ?? "";
    }
    return "";
  } catch (error) {
    // Retry on network errors
    if (retryCount < MAX_RETRIES && (error instanceof Error && (error.name === "AbortError" || error.message.includes("fetch")))) {
      const delayMs = BASE_DELAY_MS * Math.pow(2, retryCount);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      clearTimeout(timeout);
      return generateWithHFRouter(prompt, input, retryCount + 1);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function isHuggingFaceError(value: unknown): value is HuggingFaceError {
  return value !== null && typeof value === "object" && "error" in value;
}

function isHuggingFaceChatCompletion(value: unknown): value is HuggingFaceChatCompletion {
  return value !== null && typeof value === "object" && "choices" in value;
}

function parseDynamicRecommendations(rawText: string): DynamicRecommendation[] {
  if (!rawText || rawText.trim().length === 0) {
    return [];
  }

  const cleaned = rawText.replace(/```json|```/gi, "").trim();
  
  // First try: extract and parse full JSON object with "recommendations" key
  const jsonObject = extractFirstJsonObject(cleaned);
  if (jsonObject) {
    try {
      const parsedObj = JSON.parse(jsonObject) as unknown;
      if (
        parsedObj &&
        typeof parsedObj === "object" &&
        "recommendations" in parsedObj &&
        Array.isArray((parsedObj as { recommendations?: unknown }).recommendations)
      ) {
        const items = ((parsedObj as { recommendations: unknown[] }).recommendations ?? [])
          .map((item) => {
            if (!item || typeof item !== "object" || !("title" in item)) {
              return null;
            }
            const title = sanitizeTitle(String((item as { title: unknown }).title ?? ""));
            const reason = sanitizeReason(String((item as { reason?: unknown }).reason ?? ""));
            const author = sanitizeReason(String((item as { author?: unknown }).author ?? ""));
            const rawCandidateId = Number((item as { candidateId?: unknown }).candidateId);
            const candidateId = Number.isInteger(rawCandidateId) && rawCandidateId > 0 ? rawCandidateId : undefined;
            const rawScore = Number((item as { score?: unknown }).score);
            const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(1, rawScore)) : undefined;
            if (!title && candidateId === undefined) {
              return null;
            }
            const recommendation: DynamicRecommendation = { title: title || undefined, reason: reason || "Suggested for your profile" };
            if (candidateId !== undefined) {
              recommendation.candidateId = candidateId;
            }
            if (author) {
              recommendation.author = author;
            }
            if (score !== undefined) {
              recommendation.score = score;
            }
            return recommendation;
          })
          .filter((item): item is DynamicRecommendation => Boolean(item));
        if (items.length > 0) {
          return dedupeRecommendations(items);
        }
      }
      if (parsedObj && typeof parsedObj === "object" && "titles" in parsedObj && Array.isArray((parsedObj as { titles?: unknown }).titles)) {
        const titles = ((parsedObj as { titles: unknown[] }).titles ?? []).map((item) => sanitizeTitle(String(item ?? "")));
        const items = titles.filter((item) => item.length > 0).map((title) => ({ title, reason: "Suggested for your profile" }));
        if (items.length > 0) {
          return dedupeRecommendations(items);
        }
      }
    } catch (error) {
      console.warn(`[parseDynamicRecommendations] Failed to parse extracted JSON object: ${error instanceof Error ? error.message : String(error)}`);
      // continue to array/object fallback parsing
    }
  }

  const jsonArray = extractFirstJsonArray(cleaned);
  if (jsonArray) {
    try {
      const parsed = JSON.parse(jsonArray) as unknown;
      if (Array.isArray(parsed)) {
        const items: DynamicRecommendation[] = [];
        for (const item of parsed) {
          if (typeof item === "string") {
            const title = sanitizeTitle(item);
            if (title) {
              items.push({ title, reason: "Suggested for your profile" });
            }
            continue;
          }
          if (item && typeof item === "object") {
            if ("title" in item) {
                const title = sanitizeTitle(String((item as { title: unknown }).title ?? ""));
              const reason = sanitizeReason(String((item as { reason?: unknown }).reason ?? ""));
              const author = sanitizeReason(String((item as { author?: unknown }).author ?? ""));
              const rawCandidateId = Number((item as { candidateId?: unknown }).candidateId);
              const candidateId = Number.isInteger(rawCandidateId) && rawCandidateId > 0 ? rawCandidateId : undefined;
              const rawScore = Number((item as { score?: unknown }).score);
              const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(1, rawScore)) : undefined;
              if (!title && candidateId === undefined) {
                continue;
              }
              const recommendation: DynamicRecommendation = { title: title || undefined, reason: reason || "Suggested for your profile" };
              if (candidateId !== undefined) {
                recommendation.candidateId = candidateId;
              }
              if (author) {
                recommendation.author = author;
              }
              if (score !== undefined) {
                recommendation.score = score;
              }
              items.push(recommendation);
              continue;
            }
            if ("name" in item) {
              const title = sanitizeTitle(String((item as { name: unknown }).name ?? ""));
              if (title) {
                items.push({ title, reason: "Suggested for your profile" });
              }
            }
          }
        }
        if (items.length > 0) {
          return dedupeRecommendations(items);
        }
      }
    } catch (error) {
      console.warn(`[parseDynamicRecommendations] Failed to parse extracted JSON array: ${error instanceof Error ? error.message : String(error)}`);
      // continue to line fallback parsing
    }
  }

  console.warn(`[parseDynamicRecommendations] All JSON extraction failed, falling back to line-based parsing`);
  return parseTitlesFromLines(cleaned).map((title) => ({ title, reason: "Suggested for your profile" }));
}

function extractFirstJsonArray(text: string): string | null {
  const start = text.indexOf("[");
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "[") {
      depth += 1;
      continue;
    }
    if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const result = text.slice(start, i + 1);
        console.log(`[extractFirstJsonObject] Extracted JSON (first 100 chars): ${result.slice(0, 100)}`);
        return result;
      }
    }
  }

  console.warn(`[extractFirstJsonObject] Could not find complete JSON object. Depth at end: ${depth}, inString: ${inString}`);
  return null;
}

function parseTitlesFromLines(text: string): string[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const titles = lines
    .map((line) => line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, ""))
    .map((line) => sanitizeTitle(line))
    .filter((line) => line.length > 0);
  return dedupeStrings(titles);
}

function hydrateRecommendationsFromCandidates(
  items: DynamicRecommendation[],
  candidateBooks?: Array<{
    title: string;
    authors: string[];
    genres?: string[];
    rating?: number;
    preLlmScore?: number;
    summary?: string;
  }>
): DynamicRecommendation[] {
  if (!candidateBooks || candidateBooks.length === 0) {
    return items.filter((item) => Boolean(item.title && item.title.trim().length > 0));
  }

  return items
    .map((item) => {
      if (item.title && item.title.trim().length > 0) {
        return item;
      }
      if (!item.candidateId) {
        return null;
      }
      const idx = item.candidateId - 1;
      if (idx < 0 || idx >= candidateBooks.length) {
        return null;
      }
      return {
        ...item,
        title: candidateBooks[idx]?.title ?? item.title
      };
    })
    .filter((item): item is DynamicRecommendation => Boolean(item && item.title && item.title.trim().length > 0));
}

function sanitizeTitle(value: string): string {
  const withoutQuotes = value.trim().replace(/^["'`]+|["'`]+$/g, "");
  const withoutAuthor = withoutQuotes.replace(/\s+by\s+.+$/i, "").trim();
  return withoutAuthor.replace(/\s+/g, " ");
}

function sanitizeReason(value: string): string {
  const withoutQuotes = value.trim().replace(/^["'`]+|["'`]+$/g, "");
  return withoutQuotes.replace(/\s+/g, " ");
}

function dedupeRecommendations(values: DynamicRecommendation[]): DynamicRecommendation[] {
  const seen = new Set<string>();
  const output: DynamicRecommendation[] = [];
  for (const value of values) {
    const normalized = normalizeTitle(value.title ?? "");
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(value);
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
    output.push(value.trim());
  }
  return output;
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function resolveModelUrl(url: string): string {
  const trimmed = url.trim();
  const oldPrefix = "https://api-inference.huggingface.co/models/";
  if (trimmed.startsWith(oldPrefix)) {
    const modelId = trimmed.slice(oldPrefix.length);
    if (modelId.length > 0) {
      return `https://router.huggingface.co/hf-inference/models/${modelId}`;
    }
  }
  return trimmed;
}


function resolveModelWithProvider(urlOrModel: string, provider: string): string {
  const modelId = resolveModelId(urlOrModel);
  if (!provider || provider.length === 0) {
    return modelId;
  }
  if (modelId.includes(":")) {
    return modelId;
  }
  return `${modelId}:${provider}`;
}

function resolveModelId(urlOrModel: string): string {
  const resolvedUrl = resolveModelUrl(urlOrModel);
  const marker = "/models/";
  const index = resolvedUrl.indexOf(marker);
  if (index >= 0) {
    const modelId = resolvedUrl.slice(index + marker.length).trim();
    return modelId || "meta-llama/Llama-4-Scout-17B-16E-Instruct";
  }
  try {
    const parsed = new URL(resolvedUrl);
    if (parsed.hostname.endsWith("huggingface.co")) {
      const segments = parsed.pathname.split("/").map((item) => item.trim()).filter(Boolean);
      if (segments.length >= 2) {
        return `${segments[0]}/${segments[1]}`;
      }
    }
  } catch {
    // not a URL, continue
  }
  return resolvedUrl || "meta-llama/Llama-4-Scout-17B-16E-Instruct";
}
