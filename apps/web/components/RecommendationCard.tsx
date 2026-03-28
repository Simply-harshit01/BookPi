"use client";

import { apiClient } from "../lib/api";
import type { FeedbackAction, RecommendationItem } from "../lib/types";
import Link from "next/link";
import { useState } from "react";

const ACTIONS: FeedbackAction[] = ["like", "dislike", "save", "mark_read"];

export function RecommendationCard({
  item,
  onFeedback
}: {
  item: RecommendationItem;
  onFeedback: () => void | Promise<void>;
}) {
  const [busyAction, setBusyAction] = useState<FeedbackAction | null>(null);
  const [completedActions, setCompletedActions] = useState<Set<FeedbackAction>>(new Set());

  const send = async (action: FeedbackAction) => {
    setBusyAction(action);
    try {
      await apiClient.feedback({
        bookId: item.bookId,
        action,
        timestamp: new Date().toISOString()
      });
      console.log(`[RecommendationCard] Feedback sent successfully: ${action} on ${item.bookId}`);
      setCompletedActions((prev) => new Set([...prev, action]));
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error(`[RecommendationCard] Feedback failed for ${action}: ${msg}`);
    } finally {
      setBusyAction(null);
      // Always call feedback callback regardless of success/failure
      await onFeedback();
    }
  };

  return (
    <article className="card book-card">
      <div className="book-cover-wrap">
        {item.thumbnailUrl ? (
          <img className="book-cover" src={item.thumbnailUrl} alt={`${item.title} cover`} loading="lazy" />
        ) : (
          <div className="book-cover placeholder">
            <span>{item.title.slice(0, 1).toUpperCase()}</span>
          </div>
        )}
      </div>
      <div className="book-content">
        <h2 className="page-title" style={{ marginTop: 0, marginBottom: 6 }}>
          {item.title}
        </h2>
        <p className="soft-text" style={{ marginTop: 0, marginBottom: 6 }}>
          By {item.authors.join(", ") || "Unknown author"}
        </p>
        <div className="meta-row">
          <span className="reason-badge">{item.reasonLabel}</span>
          <span className="genre-tag">{item.genres[0] ?? "General"}</span>
        </div>
        <p className="summary-text">{item.summary ?? "No summary available for this title."}</p>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, gap: 10, flexWrap: "wrap" }}>
          <small className="soft-text">
            Rating: {item.rating ? `${item.rating.toFixed(1)} / 5` : "N/A"} | Score: {item.score}
          </small>
          <Link href={`/book/${item.bookId}`} className="soft-text" style={{ fontWeight: 700 }}>
            View details
          </Link>
        </div>
      </div>
      <div className="action-row" style={{ marginTop: 12 }}>
        {ACTIONS.map((action) => {
          const isCompleted = completedActions.has(action);
          return (
            <button
              key={action}
              className="action-btn"
              data-tone={action === "dislike" ? "negative" : action === "like" || action === "save" ? "positive" : "neutral"}
              onClick={() => void send(action)}
              disabled={busyAction !== null || isCompleted}
            >
              {busyAction === action ? "..." : labelForAction(action, isCompleted)}
            </button>
          );
        })}
      </div>
    </article>
  );
}

function labelForAction(action: FeedbackAction, isCompleted: boolean = false): string {
  const baseLabel = action === "mark_read" ? "Mark read" : action.charAt(0).toUpperCase() + action.slice(1);
  
  if (isCompleted) {
    if (action === "mark_read") {
      return "Marked read";
    }
    return baseLabel + "d";
  }
  
  return baseLabel;
}
