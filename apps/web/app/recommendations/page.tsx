"use client";

import { useEffect, useState } from "react";
import { RecommendationCard } from "../../components/RecommendationCard";
import { apiClient } from "../../lib/api";
import type { RecommendationItem } from "../../lib/types";

const INTERACTION_THRESHOLD = 7; // Refresh after 5-10 interactions (configurable)

export default function RecommendationsPage() {
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState(false);
  const [status, setStatus] = useState("Loading recommendations...");
  const [loading, setLoading] = useState(true);
  const [interactionsSinceLastRefresh, setInteractionsSinceLastRefresh] = useState(0);
  const [refreshIndicator, setRefreshIndicator] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    setRefreshIndicator(true);
    setInteractionsSinceLastRefresh(0); // Reset counter after refresh
    console.log("[RecommendationsPage] Loading recommendations...");
    try {
      const response = await apiClient.recommendations();
      console.log(`[RecommendationsPage] Loaded ${response.data.length} recommendations`);
      setItems(response.data);
      setStatus(`Loaded ${response.data.length} recommendations`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to load recommendations";
      console.error(`[RecommendationsPage] Error loading:`, msg);
      setStatus(msg);
    } finally {
      setLoading(false);
      // Show refresh indicator briefly
      setTimeout(() => setRefreshIndicator(false), 600);
    }
  };

  const handleInteraction = async () => {
    // Don't count interactions during search mode
    if (searchMode) {
      console.log("[RecommendationsPage] In search mode, skipping interaction count");
      return;
    }

    const newCount = interactionsSinceLastRefresh + 1;
    console.log(`[RecommendationsPage] Interaction: ${newCount}/${INTERACTION_THRESHOLD}`);
    setInteractionsSinceLastRefresh(newCount);

    // Refresh only after threshold is reached
    if (newCount >= INTERACTION_THRESHOLD) {
      console.log(`[RecommendationsPage] Threshold reached, refreshing recommendations...`);
      await load();
    }
  };

  const onSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchMode(false);
      await load();
      return;
    }

    setLoading(true);
    setSearchMode(true);
    setStatus(`Searching for "${trimmed}"...`);
    console.log(`[RecommendationsPage] Searching for: ${trimmed}`);
    try {
      const response = await apiClient.search(trimmed);
      console.log(`[RecommendationsPage] Search returned ${response.data.length} results`);
      setItems(response.data);
      setStatus(`Found ${response.data.length} books matching "${trimmed}"`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to search books";
      console.error(`[RecommendationsPage] Search error:`, msg);
      setStatus(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="grid" style={{ gap: 14 }}>
      <article className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <span className="feature-pill">Step 2: Personalized Feed</span>
            <h1 className="page-title" style={{ margin: "8px 0 2px 0" }}>
              Recommendations
            </h1>
            <small className="soft-text">
              {status}
              {!searchMode && interactionsSinceLastRefresh > 0 && (
                <span style={{ marginLeft: 12, color: "var(--accent)" }}>
                  ({interactionsSinceLastRefresh}/{INTERACTION_THRESHOLD} interactions on feed)
                </span>
              )}
            </small>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              className="input"
              style={{ width: 220 }}
              placeholder="Search books..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void onSearch();
                }
              }}
            />
            <button className="button secondary" onClick={() => void onSearch()} disabled={loading}>
              Search
            </button>
            <button
              className="button secondary"
              onClick={() => {
                setQuery("");
                setSearchMode(false);
                void load();
              }}
              disabled={loading}
            >
              {loading ? "Refreshing..." : searchMode ? "Back to Feed" : "Refresh Shelf"}
            </button>
          </div>
        </div>
      </article>
      <div className="recommend-grid" style={refreshIndicator ? { opacity: 0.9, transition: "opacity 0.6s ease-in-out" } : { opacity: 1, transition: "opacity 0.6s ease-in-out" }}>
        {items.map((item) => (
          <RecommendationCard key={item.bookId} item={item} onFeedback={handleInteraction} />
        ))}
      </div>
      {!loading && items.length === 0 ? (
        <article className="card">
          <p className="soft-text" style={{ margin: 0 }}>
            No recommendations found yet. Update your profile preferences and refresh the shelf.
          </p>
        </article>
      ) : null}
    </section>
  );
}
