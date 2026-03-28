import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Playfair_Display, Source_Sans_3 } from "next/font/google";
import { AuthNav } from "../components/AuthNav";

const displayFont = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700", "800"]
});

const bodyFont = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"]
});

export const metadata: Metadata = {
  title: "BookPi",
  description: "Personalized book recommendations"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${bodyFont.variable}`}>
        <div className="page-shell">
          <div className="grain" />
          <main className="container">
            <header className="topbar fade-in">
              <nav className="topbar-nav">
                <Link href="/" className="brand">
                  <span className="brand-mark">B</span>
                  <span>BookPi</span>
                </Link>
                <AuthNav />
              </nav>
            </header>
            <div className="fade-in">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
