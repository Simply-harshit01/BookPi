import Link from "next/link";

export default function HomePage() {
  return (
    <section className="grid" style={{ gap: 14 }}>
      <article className="card hero">
        <div className="grid" style={{ gap: 14 }}>
          <span className="feature-pill">Personalized Discovery Engine</span>
          <h1>Find your next unforgettable read with a modern, taste-aware feed.</h1>
          <p>
            Tell us your last read, favorite genres, and preferred vibe. BookPi ranks books using your profile and
            feedback, then explains every recommendation.
          </p>
          <div className="hero-actions">
            <Link href="/onboarding" className="button">
              Build My Profile
            </Link>
            <Link href="/login" className="button secondary">
              Existing User Login
            </Link>
            <Link href="/recommendations" className="button secondary">
              Explore Feed
            </Link>
          </div>
        </div>
        <div className="card">
          <h3 className="page-title" style={{ marginTop: 0 }}>
            Reading Pulse
          </h3>
          <div className="stat-strip">
            <div className="stat-box">
              <strong>2.5s</strong>
              <span className="soft-text">feed target</span>
            </div>
            <div className="stat-box">
              <strong>5</strong>
              <span className="soft-text">feedback actions</span>
            </div>
            <div className="stat-box">
              <strong>Hybrid</strong>
              <span className="soft-text">rule + re-rank</span>
            </div>
          </div>
        </div>
      </article>

      <article className="feature-grid">
        <div className="card">
          <h3 className="page-title" style={{ marginTop: 0 }}>
            Taste-first
          </h3>
          <p className="soft-text">Genre and title affinity scoring that adapts to your latest signals.</p>
        </div>
        <div className="card">
          <h3 className="page-title" style={{ marginTop: 0 }}>
            Transparent
          </h3>
          <p className="soft-text">Every card includes a reason badge so recommendations are explainable.</p>
        </div>
        <div className="card">
          <h3 className="page-title" style={{ marginTop: 0 }}>
            Interactive
          </h3>
          <p className="soft-text">Like, dislike, save, and mark-read actions directly tune your ranking feed.</p>
        </div>
      </article>

      <footer className="card landing-footer">
        <div className="landing-footer-top">
          <div className="landing-footer-brand">
            <h3 className="page-title" style={{ margin: "0 0 6px 0" }}>
              BookPi
            </h3>
            <p className="soft-text" style={{ margin: 0 }}>
              Personalized recommendations powered by your reading taste, feedback, and discovery goals.
            </p>
          </div>
          <div className="landing-footer-grid">
            <div>
              <h4>Product</h4>
              <div className="landing-footer-links">
                <Link href="/recommendations">Recommendations</Link>
                <Link href="/profile">My Profile</Link>
                <Link href="/onboarding">Personalization Setup</Link>
              </div>
            </div>
            <div>
              <h4>Account</h4>
              <div className="landing-footer-links">
                <Link href="/login">Login</Link>
                <Link href="/onboarding">Create Account</Link>
                <Link href="/profile">Saved & My Shelf</Link>
              </div>
            </div>
            <div>
              <h4>Support</h4>
              <div className="landing-footer-links">
                <a href="mailto:support@bookpi.app">support@bookpi.app</a>
                <a href="#">Help Center</a>
                <a href="#">Feedback</a>
              </div>
            </div>
          </div>
        </div>

        <div className="landing-footer-bottom">
          <small className="soft-text">© {new Date().getFullYear()} BookPi. All rights reserved.</small>
          <div className="landing-footer-meta-links">
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">Cookies</a>
            <a href="#">Instagram</a>
            <a href="#">X</a>
          </div>
        </div>
      </footer>
    </section>
  );
}
