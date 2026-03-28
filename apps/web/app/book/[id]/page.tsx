"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "../../../lib/api";
import type { Book } from "../../../lib/types";

export default function BookDetailPage() {
  const params = useParams<{ id: string }>();
  const [book, setBook] = useState<Book | null>(null);
  const [status, setStatus] = useState("Loading book...");

  useEffect(() => {
    if (!params?.id) {
      return;
    }
    void apiClient
      .bookById(params.id)
      .then((result) => {
        setBook(result.data);
        setStatus("Loaded");
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : "Failed to load book");
      });
  }, [params?.id]);

  return (
    <section className="card">
      <span className="feature-pill">Book Spotlight</span>
      <h1 className="page-title" style={{ marginTop: 8, marginBottom: 4 }}>
        Book Detail
      </h1>
      <small className="soft-text">{status}</small>
      {book ? (
        <div style={{ marginTop: 12 }} className="grid two">
          <div>
            <h2 className="page-title" style={{ marginTop: 0 }}>
              {book.title}
            </h2>
            <p className="soft-text">Authors: {book.authors.join(", ") || "Unknown author"}</p>
            <p className="soft-text">Genres: {book.genres.join(", ") || "Unknown genre"}</p>
            <p className="soft-text">Rating: {book.rating ? `${book.rating.toFixed(1)} / 5` : "N/A"}</p>
            <p className="soft-text">Mature: {book.mature ? "Yes" : "No"}</p>
            <p className="soft-text">{book.summary ?? "No summary available."}</p>
          </div>
          <div className="card">
            <h3 className="page-title" style={{ marginTop: 0 }}>
              Why it can appear
            </h3>
            <p className="soft-text" style={{ marginBottom: 0 }}>
              This title enters your feed through genre/interest matching and is re-ranked by your interaction history.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
