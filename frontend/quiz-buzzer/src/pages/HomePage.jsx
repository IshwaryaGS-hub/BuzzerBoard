import { useEffect, useState } from "react";
import BrandMark from "../components/BrandMark";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4001";

const DEFAULT_STATS = {
  totalCount: 43,
  sampleCount: 3,
  scoredCount: 40,
  roundCount: 4,
};

export default function HomePage() {
  const [stats, setStats] = useState(DEFAULT_STATS);

  const navigateTo = (path) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new Event("quiz:navigate"));
  };

  useEffect(() => {
    let ignore = false;

    fetch(`${API_BASE_URL}/api/questions-count`)
      .then((response) => response.json())
      .then((data) => {
        if (ignore) return;

        setStats({
          totalCount: Number.isFinite(data.totalCount) ? data.totalCount : DEFAULT_STATS.totalCount,
          sampleCount: Number.isFinite(data.sampleCount) ? data.sampleCount : DEFAULT_STATS.sampleCount,
          scoredCount: Number.isFinite(data.scoredCount) ? data.scoredCount : DEFAULT_STATS.scoredCount,
          roundCount: Number.isFinite(data.roundCount) ? data.roundCount : DEFAULT_STATS.roundCount,
        });
      })
      .catch(() => {});

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div
      className="quiz-shell quiz-stage-shell"
      style={{
        "--page-pad": "clamp(12px, 2vw, 26px)",
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "var(--page-pad)",
      }}
    >
      <div style={{ width: "min(100%, 1480px)" }}>
        <div className="hero-grid home-hero-grid">
          <section className="championship-hero home-highlight home-main-hero">
            <div className="home-stage">
              <BrandMark variant="udaan" className="brand-mark-home" />
              <div className="home-pill">
                <span className="status-dot" />
                Live Event Experience
              </div>
              <div className="championship-eyebrow">Udaan 2026</div>
              <div className="championship-divider" />

              <div className="championship-stack home-title-stack">
                <div className="championship-kicker home-kicker">Quiz</div>
                <div className="championship-headline home-headline">Championship</div>
              </div>

              <p className="championship-subline home-hero-copy">
                A polished live buzzer experience for APAR Cable Solutions.
              </p>

              <div className="championship-stats home-stats">
                <div className="championship-stat">
                  <div className="value">{stats.scoredCount}</div>
                  <div className="label">Round Questions</div>
                </div>
                <div className="championship-stat">
                  <div className="value">{stats.sampleCount}</div>
                  <div className="label">Sample Questions</div>
                </div>
                <div className="championship-stat">
                  <div className="value">{stats.roundCount}</div>
                  <div className="label">Live Rounds</div>
                </div>
              </div>

              <div className="championship-actions">
                <button className="championship-button primary home-primary-cta" onClick={() => navigateTo("/join")}>
                  <span className="icon">{">"}</span>
                  <span>Join Team</span>
                </button>
              </div>

              <div className="championship-footer-hint">
                {stats.totalCount} total questions including sample round, controlled live by the host panel.
              </div>
            </div>
          </section>

          <div className="home-actions-grid">
            <div className="glass-panel nav-card">
              <div className="home-card-label">Player Access</div>
              <div className="home-card-title">Team Join Portal</div>
              <div className="home-card-copy">
                Players can sign in with their assigned team and password, then wait for the live buzzer flow to begin.
              </div>
              <button className="championship-button secondary home-secondary-cta" onClick={() => navigateTo("/join")}>
                Open Join Screen
              </button>
            </div>

            <div className="glass-panel nav-card">
              <div className="home-card-label">Host Operations</div>
              <div className="home-card-title">Control Room</div>
              <div className="home-card-copy">
                Manage question flow, unlock buzzers, reveal answers, and monitor live team standings in one place.
              </div>
              <button className="championship-button secondary home-secondary-cta" onClick={() => navigateTo("/host-login")}>
                Open Host Panel
              </button>
            </div>

            <div className="glass-panel nav-card">
              <div className="home-card-label">Audience Display</div>
              <div className="home-card-title">Front Screen</div>
              <div className="home-card-copy">
                Show the quiz board, animated timers, buzzer order, winner reveals, and round dashboards on the main screen.
              </div>
              <button className="championship-button secondary home-secondary-cta" onClick={() => navigateTo("/screen-login")}>
                Open Display
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
