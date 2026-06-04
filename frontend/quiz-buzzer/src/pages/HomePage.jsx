export default function HomePage() {
  const navigateTo = (path) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new Event("quiz:navigate"));
  };

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
        <section className="championship-hero">
          <div className="championship-eyebrow">Udaan 2026</div>
          <div className="championship-divider" />

          <div className="championship-stack">
            <div className="championship-kicker">Quiz</div>
            <div className="championship-headline">Championship</div>
          </div>

          <div className="championship-stats">
            <div className="championship-stat">
              <div className="value">33</div>
              <div className="label">Questions</div>
            </div>
            <div className="championship-stat">
              <div className="value">30s</div>
              <div className="label">Per Question</div>
            </div>
            <div className="championship-stat">
              <div className="value">4</div>
              <div className="label">Rounds</div>
            </div>
          </div>

          <p className="championship-subline">
            Welcome to the APAR Cable Solutions Quiz Championship. Technical and business knowledge for distributors, engineers, and fastest-buzzer teams.
          </p>

          <div className="championship-actions">
            <button className="championship-button primary" onClick={() => navigateTo("/join")}>
              <span className="icon">{">"}</span>
              <span>Start Quiz</span>
            </button>
            <button className="championship-button secondary" onClick={() => navigateTo("/host-login")}>
              Host Control
            </button>
            <button className="championship-button secondary" onClick={() => navigateTo("/screen-login")}>
              Front Screen
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
