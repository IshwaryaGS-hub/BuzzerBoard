import { useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../socket";

function formatCount(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function playTimesUpAlarm() {
  if (typeof window === "undefined") return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  const pattern = [0, 180, 360];

  pattern.forEach((offset, index) => {
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    const startAt = context.currentTime + offset / 1000;
    const duration = 0.14;

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(index % 2 === 0 ? 880 : 740, startAt);

    gainNode.gain.setValueAtTime(0.0001, startAt);
    gainNode.gain.exponentialRampToValueAtTime(0.18, startAt + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration);
  });

  window.setTimeout(() => {
    context.close().catch(() => {});
  }, 900);
}

export default function LeaderboardPage() {
  const [state, setState] = useState(null);
  const [now, setNow] = useState(Date.now());
  const timesUpTriggeredRef = useRef(false);
  const frontScreenAuth = sessionStorage.getItem("frontScreenAuth") || "";

  const navigateTo = (path) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new Event("quiz:navigate"));
  };

  useEffect(() => {
    if (!frontScreenAuth) {
      navigateTo("/screen-login");
      return;
    }

    if (!socket.connected) socket.connect();
    socket.emit("join-spectator", { password: frontScreenAuth });
    socket.on("game-state", setState);
    socket.on("error", ({ message }) => {
      if (message === "Invalid front screen password") {
        sessionStorage.removeItem("frontScreenAuth");
        navigateTo("/screen-login");
      }
    });

    return () => {
      socket.off("game-state");
      socket.off("error");
    };
  }, [frontScreenAuth]);

  useEffect(() => {
    if (state?.phase !== "question" && state?.phase !== "buzzed") return undefined;

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [state?.phase, state?.timerStartedAt]);

  const sortedTeams = useMemo(() => {
    if (!state?.scores) return [];
    return Object.entries(state.scores).sort((left, right) => right[1].score - left[1].score);
  }, [state]);

  const question = state?.currentQuestion || null;
  const buzzCount = state?.buzzerHistory?.length || 0;
  const timeElapsed = state?.timerStartedAt
    ? Math.min((now - state.timerStartedAt) / 1000, state.timeLimit || 0)
    : 0;
  const timeLeft = Math.max(0, (state?.timeLimit || 0) - timeElapsed);
  const latestResult = state?.questionResults?.length
    ? state.questionResults[state.questionResults.length - 1]
    : null;
  const showAnswerReveal = state?.phase === "answer" && question;
  const showTimeUp = showAnswerReveal && !latestResult;

  useEffect(() => {
    if (showTimeUp && !timesUpTriggeredRef.current) {
      playTimesUpAlarm();
      timesUpTriggeredRef.current = true;
      return;
    }

    if (!showTimeUp) {
      timesUpTriggeredRef.current = false;
    }
  }, [showTimeUp]);

  return (
    <div className="quiz-shell quiz-stage-shell" style={{ minHeight: "100vh", padding: "28px 22px 40px" }}>
      <div style={{ maxWidth: "1540px", margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: "20px",
            alignItems: "start",
            marginBottom: "26px",
          }}
        >
          <div>
            <div className="championship-eyebrow" style={{ marginBottom: "10px" }}>Organizer Screen</div>
            <div style={{ fontSize: "clamp(44px, 6vw, 84px)", fontWeight: 900, lineHeight: 0.94 }}>
              LIVE <span style={{ color: "var(--amber)" }}>QUIZ BOARD</span>
            </div>
            <p style={{ marginTop: "10px", color: "var(--muted)", fontSize: "18px", lineHeight: 1.5, maxWidth: "760px" }}>
              Welcome to the APAR Cable Solutions Quiz Championship.
            </p>
          </div>

          <div className="quiz-hud-side" style={{ justifySelf: "end" }}>
            <div className={`timer-mini ${timeLeft <= 8 && (state?.phase === "question" || state?.phase === "buzzed") ? "alert" : ""}`}>
              <div style={{ textAlign: "center" }}>
                <div className="value">{Math.ceil(timeLeft || 0)}</div>
                <div className="label">Seconds</div>
              </div>
            </div>
            <div className="quiz-count-card">
              <div className="value">{buzzCount}</div>
              <div className="label">Buzzed</div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "18px",
            flexWrap: "wrap",
            marginBottom: "24px",
            padding: "18px 24px",
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "20px",
            boxShadow: "var(--shadow)",
          }}
        >
          <div><span style={{ color: "var(--muted)", fontSize: "12px" }}>Phase </span><strong style={{ color: "var(--amber)", textTransform: "uppercase" }}>{state?.phase || "lobby"}</strong></div>
          <div><span style={{ color: "var(--muted)", fontSize: "12px" }}>Question </span><strong>{Math.max((state?.currentQuestionIndex ?? -1) + 1, 0)} / {state?.totalQuestions || "-"}</strong></div>
          <div><span style={{ color: "var(--muted)", fontSize: "12px" }}>Buzzers </span><strong style={{ color: state?.buzzerLocked ? "var(--red)" : "var(--green)" }}>{state?.buzzerLocked ? "LOCKED" : "OPEN"}</strong></div>
          <div><span style={{ color: "var(--muted)", fontSize: "12px" }}>Players </span><strong>{Object.keys(state?.playerStats || {}).length}</strong></div>
        </div>

        {state?.phase === "lobby" && (
          <section className="championship-hero" style={{ minHeight: "70vh" }}>
            <div className="championship-eyebrow">Ready Room</div>
            <div className="championship-stack">
              <div className="championship-kicker">Quiz</div>
              <div className="championship-headline">Starting Soon</div>
            </div>
            <p className="championship-subline">
              Teams are joining. The host will start the first question shortly.
            </p>
          </section>
        )}

        {(state?.phase === "question" || state?.phase === "buzzed") && question && (
          <section className="question-stage">
            <div className="question-stage-topbar">
              <div className="stage-progress-label">
                Question {Math.max((state?.currentQuestionIndex ?? -1) + 1, 0)} / {state?.totalQuestions}
              </div>
              <div className="stage-category-pill">{question.category || "Live Round"}</div>
            </div>

            <div
              style={{
                height: "8px",
                background: "rgba(255,255,255,0.06)",
                borderRadius: "999px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${state?.timeLimit ? (timeLeft / state.timeLimit) * 100 : 0}%`,
                  background: timeLeft <= 8 ? "var(--red)" : "linear-gradient(90deg, var(--amber), #ffca5f)",
                  transition: "width 0.2s linear",
                }}
              />
            </div>

            <div className="question-stage-card">
              <p className="question-stage-text">{question.text}</p>
            </div>

            <div className="question-options-grid">
              {question.options?.map((option, index) => (
                <div key={index} className="question-option-card">
                  <span className="question-option-badge">{["A", "B", "C", "D"][index]}</span>
                  <span className="question-option-text">{option}</span>
                </div>
              ))}
            </div>

            {state?.buzzedBy && (
              <div
                style={{
                  padding: "20px 24px",
                  borderRadius: "20px",
                  border: "1px solid rgba(58,212,138,0.35)",
                  background: "rgba(58,212,138,0.08)",
                  color: "var(--white)",
                }}
              >
                <div style={{ color: "var(--green)", letterSpacing: "0.22em", textTransform: "uppercase", fontSize: "12px", marginBottom: "8px" }}>
                  Fastest Current Buzzer
                </div>
                <div style={{ fontSize: "clamp(28px, 3vw, 46px)", fontWeight: 900 }}>
                  {state.buzzedBy.memberName}
                </div>
                <div style={{ marginTop: "6px", color: "var(--muted)", fontSize: "18px" }}>
                  {state.buzzedBy.teamName} | {(state.buzzedBy.timeMs / 1000).toFixed(2)}s
                </div>
              </div>
            )}
          </section>
        )}

        {showTimeUp && (
          <div className="timeup-screen">
            <div>
              <div className="timeup-icon">!</div>
              <div className="timeup-title">Time&apos;s Up!</div>
              <p className="championship-subline" style={{ marginTop: "18px", marginBottom: "20px" }}>
                Verbal answer round is in progress. Waiting for the host to reveal the answer and announce the winner.
              </p>
              <div style={{ fontSize: "clamp(24px, 2.6vw, 44px)", fontWeight: 800, color: "var(--amber)" }}>
                Correct answer: {question?.options?.[question.correct]}
              </div>
            </div>
          </div>
        )}

        {showAnswerReveal && latestResult && (
          <section
            className="winner-spotlight"
            style={{
              background: "var(--card-strong)",
              border: "1px solid rgba(58, 212, 138, 0.28)",
              borderRadius: "28px",
              padding: "40px",
              boxShadow: "var(--shadow)",
              position: "relative",
              overflow: "hidden",
              marginBottom: "26px",
            }}
          >
            <div className="winner-banner" style={{ position: "relative", zIndex: 1 }}>
              <div className="eyebrow">Round Result</div>
              {latestResult.winner ? (
                <>
                  <div className="headline">{latestResult.winnerPlayer || "Winner"}</div>
                  <div className="subline">
                    {latestResult.winner} | Round {Math.max((state?.currentQuestionIndex ?? -1) + 1, 0)}
                  </div>
                </>
              ) : (
                <>
                  <div className="headline">No Winner</div>
                  <div className="subline">No team received points for this verbal answer round.</div>
                </>
              )}
            </div>

            <div
              style={{
                position: "relative",
                zIndex: 1,
                display: "grid",
                gap: "14px",
                marginTop: "28px",
                textAlign: "center",
              }}
            >
              <div style={{ color: "var(--green)", letterSpacing: "0.26em", textTransform: "uppercase" }}>
                Correct Answer
              </div>
              <div style={{ fontSize: "clamp(30px, 3vw, 52px)", fontWeight: 900 }}>
                {question?.options?.[question.correct]}
              </div>
              <div style={{ color: "var(--muted)", fontSize: "18px" }}>
                {latestResult.question}
              </div>
            </div>
          </section>
        )}

        <section style={{ marginTop: "28px" }}>
          <div style={{ fontSize: "12px", letterSpacing: "0.26em", color: "var(--amber)", textTransform: "uppercase", marginBottom: "14px" }}>
            Live Scores
          </div>
          <div className="leaderboard-list">
            {sortedTeams.map(([teamId, team], index) => (
              <div
                key={teamId}
                className="leaderboard-row"
                style={{
                  background:
                    index === 0
                      ? "linear-gradient(90deg, rgba(240,171,34,0.14), rgba(255,255,255,0.05))"
                      : "linear-gradient(90deg, rgba(255,255,255,0.045), rgba(255,255,255,0.025))",
                }}
              >
                <div className="rank-medal default">{index + 1}</div>
                <div>
                  <div style={{ fontSize: "clamp(24px, 2vw, 34px)", fontWeight: 800 }}>{team.teamName}</div>
                  <div style={{ marginTop: "6px", color: "var(--muted)", fontSize: "14px" }}>
                    {formatCount(team.members?.length ?? 0, "connected player")} | {team.correctAnswers ?? 0} round wins
                  </div>
                </div>
                <div style={{ color: "var(--muted)", fontSize: "15px" }}>
                  {latestResult?.winner === team.teamName ? `Latest winner: ${latestResult.winnerPlayer || "Team"}` : "Waiting for next update"}
                </div>
                <div style={{ textAlign: "right", fontSize: "clamp(30px, 3vw, 46px)", fontWeight: 900, color: index === 0 ? "var(--amber)" : "var(--white)" }}>
                  {team.score}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
