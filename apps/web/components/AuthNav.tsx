"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { authStateEventName, clearToken, hasToken } from "../lib/api";

export function AuthNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const sync = () => setLoggedIn(hasToken());
    sync();
    window.addEventListener(authStateEventName(), sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(authStateEventName(), sync);
      window.removeEventListener("storage", sync);
    };
  }, [pathname]);

  const onLogout = () => {
    clearToken();
    setLoggedIn(false);
    router.push("/login");
  };

  return (
    <div className="topbar-links">
      {loggedIn ? (
        <button type="button" className="link-button" onClick={onLogout}>
          Logout
        </button>
      ) : (
        <Link href="/login">Login</Link>
      )}
      {!loggedIn ? <Link href="/onboarding">Onboarding</Link> : null}
      <Link href="/recommendations">Recommendations</Link>
      <Link href="/profile">Profile</Link>
    </div>
  );
}
