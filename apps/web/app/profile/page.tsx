"use client";

import { useEffect, useState } from "react";
import { apiClient } from "../../lib/api";
import type { Book, UserPreferences } from "../../lib/types";

export default function ProfilePage() {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [savedBooks, setSavedBooks] = useState<Book[]>([]);
  const [myShelfBooks, setMyShelfBooks] = useState<Book[]>([]);
  const [status, setStatus] = useState("Loading profile...");

  useEffect(() => {
    void apiClient
      .me()
      .then((result) => {
        setPreferences(result.preferences);
        setSavedBooks(result.savedBooks);
        setMyShelfBooks(result.myShelfBooks);
        setStatus("Profile loaded");
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : "Failed to load profile");
      });
  }, []);

  return (
    <section className="grid" style={{ gap: 14 }}>
      <article className="card">
        <span className="feature-pill">Your Reader Settings</span>
        <h1 className="page-title" style={{ marginTop: 8, marginBottom: 6 }}>
          Profile
        </h1>
        <small className="soft-text">{status}</small>
      </article>
      {preferences ? (
        <article className="card grid two">
          <div>
            <h3 className="page-title" style={{ marginTop: 0 }}>
              Last Read
            </h3>
            <p className="soft-text">{preferences.lastRead || "Not set yet"}</p>
          </div>
          <div>
            <h3 className="page-title" style={{ marginTop: 0 }}>
              Mature Content
            </h3>
            <p className="soft-text">{preferences.allowMatureContent ? "Enabled" : "Disabled"}</p>
          </div>
          <div>
            <h3 className="page-title" style={{ marginTop: 0 }}>
              Favorite Genres
            </h3>
            <p className="soft-text">{preferences.favoriteGenres.join(", ") || "None"}</p>
          </div>
          <div>
            <h3 className="page-title" style={{ marginTop: 0 }}>
              Favorite Books
            </h3>
            <p className="soft-text">{preferences.favoriteBooks.join(", ") || "None"}</p>
          </div>
        </article>
      ) : null}
      {preferences ? (
        <article className="card">
          <h3 className="page-title" style={{ marginTop: 0 }}>
            Saved
          </h3>
          {savedBooks.length === 0 ? (
            <p className="soft-text" style={{ margin: 0 }}>
              No saved books yet. Use the Save action in recommendations.
            </p>
          ) : (
            <div className="small-book-grid">
              {savedBooks.map((book) => (
                <BookMiniCard key={`saved-${book.bookId}`} book={book} />
              ))}
            </div>
          )}
        </article>
      ) : null}
      {preferences ? (
        <article className="card">
          <h3 className="page-title" style={{ marginTop: 0 }}>
            My Shelf
          </h3>
          {myShelfBooks.length === 0 ? (
            <p className="soft-text" style={{ margin: 0 }}>
              No completed reads yet. Use Mark Read in recommendations to track reading progress.
            </p>
          ) : (
            <div className="small-book-grid">
              {myShelfBooks.map((book) => (
                <BookMiniCard key={`shelf-${book.bookId}`} book={book} />
              ))}
            </div>
          )}
        </article>
      ) : null}
    </section>
  );
}

function BookMiniCard({ book }: { book: Book }) {
  return (
    <article className="small-book-card">
      {book.thumbnailUrl ? (
        <img src={book.thumbnailUrl} alt={`${book.title} cover`} className="small-book-cover" loading="lazy" />
      ) : (
        <div className="small-book-cover placeholder">{book.title.slice(0, 1).toUpperCase()}</div>
      )}
      <div>
        <h4 className="page-title" style={{ margin: "0 0 4px 0", fontSize: "1rem" }}>
          {book.title}
        </h4>
        <p className="soft-text" style={{ margin: "0 0 2px 0", fontSize: "0.9rem" }}>
          {book.authors.join(", ") || "Unknown author"}
        </p>
        <p className="soft-text" style={{ margin: 0, fontSize: "0.85rem" }}>
          {book.genres[0] ?? "General"} {book.rating ? `| ${book.rating.toFixed(1)}/5` : ""}
        </p>
      </div>
    </article>
  );
}
