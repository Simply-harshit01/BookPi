"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiClient, saveToken } from "../../lib/api";

export default function OnboardingPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [lastRead, setLastRead] = useState("");
  const [favoriteGenres, setFavoriteGenres] = useState("Fantasy,Science Fiction");
  const [favoriteBooks, setFavoriteBooks] = useState("Dune,The Hobbit");
  const [dislikedBooks, setDislikedBooks] = useState("");
  const [allowMatureContent, setAllowMatureContent] = useState(false);
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);

  const onSubmit = async () => {
    setSending(true);
    setStatus("Creating your reader profile...");
    try {
      const auth = await apiClient.signup({ email, password });
      saveToken(auth.token);
      await apiClient.updatePreferences({
        lastRead,
        favoriteGenres: splitCsv(favoriteGenres),
        favoriteBooks: splitCsv(favoriteBooks),
        dislikedBooks: splitCsv(dislikedBooks),
        allowMatureContent
      });
      setStatus("Onboarding complete. Redirecting to your personalized shelf...");
      router.push("/recommendations");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to onboard");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="card grid" style={{ gap: 14 }}>
      <span className="feature-pill">Step 1: Reader DNA</span>
      <h1 className="page-title" style={{ margin: 0 }}>
        Build your bookish profile
      </h1>
      <p className="soft-text" style={{ margin: 0 }}>
        Add your reading taste once. We use it immediately to rank recommendations.
      </p>
      <p className="soft-text" style={{ margin: 0 }}>
        Already have an account?{" "}
        <Link href="/login" style={{ textDecoration: "underline" }}>
          Login here
        </Link>
      </p>
      <label>
        Email
        <input className="input" value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label>
        Password
        <input
          className="input"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <label>
        Last Read
        <input className="input" value={lastRead} onChange={(event) => setLastRead(event.target.value)} />
      </label>
      <label>
        Favorite Genres (comma separated)
        <input className="input" value={favoriteGenres} onChange={(event) => setFavoriteGenres(event.target.value)} />
        <div className="choice-row" style={{ marginTop: 8 }}>
          {[
            "Fantasy",
            "Thriller",
            "Romance",
            "Sci-Fi",
            "Mystery",
            "Non-fiction",
            "Self-help",
            "Biography",
            "History",
            "Business",
            "Psychology",
            "Philosophy"
          ].map((genre) => (
            <button
              type="button"
              key={genre}
              className="choice-chip"
              onClick={() => setFavoriteGenres((prev) => mergeCsv(prev, genre))}
            >
              + {genre}
            </button>
          ))}
        </div>
      </label>
      <label>
        Favorite Books (comma separated)
        <input className="input" value={favoriteBooks} onChange={(event) => setFavoriteBooks(event.target.value)} />
      </label>
      <label>
        Disliked Books (comma separated)
        <input className="input" value={dislikedBooks} onChange={(event) => setDislikedBooks(event.target.value)} />
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={allowMatureContent}
          onChange={(event) => setAllowMatureContent(event.target.checked)}
        />
        Allow mature content
      </label>
      <button className="button" onClick={onSubmit} disabled={sending}>
        {sending ? "Saving..." : "Complete Onboarding"}
      </button>
      <small className="soft-text">{status}</small>
    </section>
  );
}

function splitCsv(raw: string): string[] {
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function mergeCsv(csv: string, value: string): string {
  const normalized = splitCsv(csv);
  if (normalized.some((entry) => entry.toLowerCase() === value.toLowerCase())) {
    return csv;
  }
  return [...normalized, value].join(", ");
}
