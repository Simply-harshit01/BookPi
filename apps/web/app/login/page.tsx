"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiClient, saveToken } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const onLogin = async () => {
    setLoading(true);
    setStatus("Signing you in...");
    try {
      const auth = await apiClient.login({ email, password });
      saveToken(auth.token);
      setStatus("Login successful. Redirecting to your recommendations...");
      router.push("/recommendations");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card grid" style={{ gap: 14, maxWidth: 540 }}>
      <span className="feature-pill">Welcome Back</span>
      <h1 className="page-title" style={{ margin: 0 }}>
        Login
      </h1>
      <p className="soft-text" style={{ margin: 0 }}>
        Use your existing account to continue your reading journey.
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
      <button className="button" disabled={loading} onClick={onLogin}>
        {loading ? "Signing in..." : "Login"}
      </button>
      <small className="soft-text">{status}</small>
      <small className="soft-text">
        New here?{" "}
        <Link href="/onboarding" style={{ textDecoration: "underline" }}>
          Create account
        </Link>
      </small>
    </section>
  );
}
