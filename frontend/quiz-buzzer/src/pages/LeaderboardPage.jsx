import { useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../socket";
import { playTimesUpAlarm } from "../utils/alarm";
import PlayInstructions from "../components/PlayInstructions";
import BrandMark from "../components/BrandMark";
import useSocketConnection from "../hooks/useSocketConnection";
import CrownBadge from "../components/CrownBadge";

export default function LeaderboardPage() {
  const [state, setState] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [showTimeUpOrder, setShowTimeUpOrder] = useState(false);
  const [buzzDelta, setBuzzDelta] = useState(0);
  const [buzzAnimTick, setBuzzAnimTick] = useState(0);
  const timesUpTriggeredRef = useRef(false);
  const previousBuzzCountRef = useRef(0);
  const frontScreenAuth = sessionStorage.getItem("frontScreenAuth") || "";
  const { connectionState, isConnected, isRecovering } = useSocketConnection();

  const navigateTo = (path) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new Event("quiz:navigate"));
  };

  useEffect(() => {
    if (!frontScreenAuth) {
      navigateTo("/screen-login");
      return;
    }

    const joinSpectator = () => {
      socket.emit("join-spectator", { password: frontScreenAuth });
    };
    const onError = ({ message }) => {
      if (message === "Invalid front screen password") {
        sessionStorage.removeItem("frontScreenAuth");
        navigateTo("/screen-login");
      }
    };

    if (!socket.connected) socket.connect();
    socket.on("connect", joinSpectator);
    socket.on("game-state", setState);
    socket.on("error", onError);

    if (socket.connected) {
      joinSpectator();
    }

    return () => {
      socket.off("connect", joinSpectator);
      socket.off("game-state");
      socket.off("error", onError);
    };
  }, [frontScreenAuth]);

  const isTimerActive = state?.phase === "question" || state?.phase === "buzzed";

  useEffect(() => {
    if (!isTimerActive || !state?.timerStartedAt) return undefined;

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [isTimerActive, state?.timerStartedAt]);

  const sortedTeams = useMemo(() => {
    if (!state?.scores) return [];
    return Object.entries(state.scores).sort((left, right) => right[1].score - left[1].score);
  }, [state]);

  const question = state?.currentQuestion || null;
  const currentQuestionNumber = Math.max((state?.currentQuestionIndex ?? -1) + 1, 0);
  const buzzCount = state?.buzzerHistory?.length || 0;
  const timeElapsed = isTimerActive && state?.timerStartedAt
    ? Math.min((now - state.timerStartedAt) / 1000, state.timeLimit || 0)
    : 0;
  const timeLeft = question
    ? Math.max(0, (state?.timeLimit || 20) - timeElapsed)
    : 0;
  const latestResult = state?.questionResults?.length
    ? state.questionResults[state.questionResults.length - 1]
    : null;
  const completedQuestions = state?.questionResults?.length || 0;
  const showAnswerReveal = Boolean(state?.answerRevealed && question);
  const showTimeUp = state?.phase === "timeup" && question && !state?.answerRevealed;
  const roundBreakActive = state?.phase === "answer" && Boolean(latestResult?.dashboardAfter);
  const showDashboard =
    sortedTeams.length > 0 &&
    ((roundBreakActive && completedQuestions > 0) || state?.phase === "finished");
  const showAnswerPanel = Boolean(state?.phase === "answer" && latestResult && !showDashboard);
  const showQuestionBoard =
    Boolean(question) &&
    !showDashboard &&
    !showTimeUp &&
    !showAnswerPanel &&
    (state?.phase === "question" || state?.phase === "buzzed" || state?.phase === "answer");
  const winningBuzzEntry = latestResult?.winner
    ? (state?.buzzerHistory || []).find((entry) => entry.teamName === latestResult.winner) || null
    : null;
  const dashboardTitle =
    latestResult?.dashboardTitle || (state?.phase === "finished" ? "Quiz Complete" : "Score Dashboard");
  const dashboardSubtitle =
    latestResult?.dashboardSubtitle ||
    (state?.phase === "finished"
      ? "Final team standings after the quiz."
      : "Live standings after the latest completed block.");
  const leaderScore = sortedTeams[0]?.[1]?.score || 0;
  const topThreeTeams = sortedTeams.slice(0, 3);
  const dashboardStats = [
    {
      label: "Questions Done",
      value: completedQuestions,
    },
    {
      label: "Current Leader",
      value: sortedTeams[0]?.[1]?.teamName || "Waiting",
    },
    {
      label: latestResult?.isSample ? "Sample Mode" : "Points Per Win",
      value: latestResult?.isSample ? "No Score" : `${latestResult?.awardedPoints || 10} pts`,
    },
  ];
  const getRankMedalClass = (index) => {
    if (index === 0) return "gold";
    if (index === 1) return "silver";
    if (index === 2) return "bronze";
    return "default";
  };

  useEffect(() => {
    const previous = previousBuzzCountRef.current;
    if (buzzCount > previous) {
      setBuzzDelta(buzzCount - previous);
      setBuzzAnimTick((current) => current + 1);
      const timeoutId = window.setTimeout(() => {
        setBuzzDelta(0);
      }, 1200);
      previousBuzzCountRef.current = buzzCount;
      return () => window.clearTimeout(timeoutId);
    }

    previousBuzzCountRef.current = buzzCount;
    return undefined;
  }, [buzzCount]);

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

  useEffect(() => {
    if (!showTimeUp) {
      setShowTimeUpOrder(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setShowTimeUpOrder(true);
    }, 2200);

    return () => window.clearTimeout(timeoutId);
  }, [showTimeUp]);

  const renderBuzzOrderPanel = ({ title, subtitle, winnerName = null }) => (
    <div
      style={{
        padding: "22px 24px",
        borderRadius: "20px",
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.04)",
        color: "var(--white)",
      }}
    >
      <div style={{ color: "var(--amber)", letterSpacing: "0.22em", textTransform: "uppercase", fontSize: "12px", marginBottom: "12px" }}>
        {title}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "14px",
          color: "var(--muted)",
          fontSize: "13px",
        }}
      >
        <span>{subtitle}</span>
        <span>Question {currentQuestionNumber}</span>
      </div>
      {state?.buzzerHistory?.length ? (
        <div
          style={{
            borderRadius: "16px",
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(9, 14, 28, 0.24)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "110px 1fr 180px",
              gap: "12px",
              padding: "14px 18px",
              background: "rgba(255,255,255,0.04)",
              color: "var(--muted)",
              fontSize: "12px",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            <span>Order</span>
            <span>Team</span>
            <span style={{ textAlign: "right" }}>Buzz Time</span>
          </div>

          {state.buzzerHistory.map((entry, index) => {
            const isWinner = Boolean(winnerName && entry.teamName === winnerName);
            return (
              <div
                key={entry.id || `${entry.teamId}-${index}`}
                className={isWinner ? "winner-row-blink" : ""}
                style={{
                  display: "grid",
                  gridTemplateColumns: "110px 1fr 180px",
                  gap: "12px",
                  alignItems: "center",
                  padding: "16px 18px",
                  borderTop: `1px solid ${isWinner || index === 0 ? "rgba(58,212,138,0.2)" : "rgba(255,255,255,0.06)"}`,
                  background: isWinner || index === 0 ? "rgba(58,212,138,0.08)" : "transparent",
                }}
              >
                <span style={{ fontSize: "24px", fontWeight: 900, color: isWinner || index === 0 ? "var(--green)" : "var(--amber)" }}>
                  #{index + 1}
                </span>
                <span style={{ fontSize: "clamp(20px, 1.8vw, 28px)", fontWeight: 800 }}>
                  {entry.teamName}
                </span>
                <span
                  style={{
                    textAlign: "right",
                    fontSize: "clamp(20px, 1.8vw, 28px)",
                    fontWeight: 800,
                    color: isWinner || index === 0 ? "var(--green)" : "var(--white)",
                  }}
                >
                  {(entry.timeMs / 1000).toFixed(2)}s
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ padding: "20px 18px", color: "var(--muted)", fontSize: "18px" }}>
          Waiting for the first team to buzz.
        </div>
      )}
    </div>
  );

  return (
    <div
      className={`quiz-shell quiz-stage-shell frontboard-shell ${state?.phase === "lobby" ? "frontboard-lobby-shell" : ""}`}
      style={{ minHeight: "100vh", padding: "clamp(10px, 1.6vw, 22px) clamp(10px, 1.4vw, 20px) clamp(14px, 2vh, 28px)" }}
    >
      <div className="frontboard-frame" style={{ maxWidth: "1540px", margin: "0 auto" }}>
        {isRecovering && (
          <div className="connection-overlay">
            Front screen is reconnecting and will resume automatically.
          </div>
        )}
        <div
          className="frontboard-header"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: "20px",
            alignItems: "start",
            marginBottom: "26px",
          }}
        >
          <div>
            <BrandMark variant="udaan" compact className="brand-mark-frontboard" />
            <div className={`connection-pill ${connectionState}`}>
              {isConnected ? "Screen synced" : isRecovering ? "Recovering screen..." : "Offline"}
            </div>
            <div className="championship-eyebrow" style={{ marginBottom: "10px" }}>Organizer Screen</div>
            <div className="frontboard-title" style={{ fontSize: "clamp(44px, 6vw, 84px)", fontWeight: 900, lineHeight: 0.94 }}>
              LIVE <span style={{ color: "var(--amber)" }}>QUIZ BOARD</span>
            </div>
            <p className="frontboard-subtitle" style={{ marginTop: "10px", color: "var(--muted)", fontSize: "18px", lineHeight: 1.5, maxWidth: "760px" }}>
              Welcome to the APAR Cable Solutions Quiz Championship.
            </p>
          </div>

          <div className="quiz-hud-side" style={{ justifySelf: "end" }}>
            <div className={`quiz-hud-orb timer ${isTimerActive && timeLeft <= 8 ? "alert" : ""}`}>
              <div style={{ textAlign: "center" }}>
                <div className="value">{Math.ceil(timeLeft || 0)}</div>
                <div className="label">Seconds</div>
              </div>
            </div>
            <div className={`quiz-hud-orb buzz ${buzzDelta ? "pulse" : ""}`} key={buzzAnimTick}>
              <div className="value">{buzzCount}</div>
              <div className="label">Buzzed</div>
              {buzzDelta > 0 && <div className="quiz-hud-orb-pop">+{buzzDelta}</div>}
            </div>
          </div>
        </div>

        <div
          className="frontboard-statusbar"
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
          <div><span style={{ color: "var(--muted)", fontSize: "12px" }}>Question </span><strong>{currentQuestionNumber} / {state?.totalQuestions || "-"}</strong></div>
          <div><span style={{ color: "var(--muted)", fontSize: "12px" }}>Buzzers </span><strong style={{ color: state?.buzzerLocked ? "var(--red)" : "var(--green)" }}>{state?.buzzerLocked ? "LOCKED" : "OPEN"}</strong></div>
          <div><span style={{ color: "var(--muted)", fontSize: "12px" }}>Players </span><strong>{Object.keys(state?.playerStats || {}).length}</strong></div>
        </div>

        {state?.phase === "lobby" && (
          <section className="championship-hero frontboard-lobby-hero">
            <div style={{ width: "min(100%, 1220px)" }}>
              <PlayInstructions
                compact
                title="Playing Instructions"
                subtitle="Teams can follow these steps first while waiting for the host to start the round."
              />
            </div>

            <div className="frontboard-lobby-message">
              <div className="championship-eyebrow">Ready Room</div>
              <div className="championship-stack frontboard-lobby-stack">
                <div className="championship-kicker">Front Screen</div>
                <div className="championship-headline">Quiz Will Be Started Soon</div>
              </div>
              <p className="championship-subline frontboard-lobby-subline">
                Teams are joining and the host will begin with the sample round shortly.
              </p>
            </div>
          </section>
        )}

        {showDashboard ? (
          <section className="round-dashboard">
            <div className="round-dashboard-hero">
              <div>
                <div className="championship-eyebrow" style={{ marginBottom: "10px" }}>Dashboard</div>
                <div className="round-dashboard-title">{dashboardTitle}</div>
                <p className="round-dashboard-subtitle">{dashboardSubtitle}</p>
              </div>
              <div className="round-dashboard-badge">
                {latestResult?.isSample ? "Practice Block" : state?.phase === "finished" ? "Final Standings" : latestResult?.roundName || "Round Standings"}
              </div>
            </div>

            <div className="round-dashboard-stats">
              {dashboardStats.map((item) => (
                <div key={item.label} className="round-stat-card">
                  <div className="round-stat-label">{item.label}</div>
                  <div className="round-stat-value">{item.value}</div>
                </div>
              ))}
            </div>

            <div className="round-dashboard-grid">
              <div className="podium-strip">
                {topThreeTeams.map(([teamId, team], index) => (
                  <div key={teamId} className={`podium-mini-card rank-${index + 1}`}>
                    {index === 0 && (
                      <CrownBadge
                        label={state?.phase === "finished" ? "Overall Winner" : "Round Leader"}
                        className="podium-crown"
                      />
                    )}
                    <div className={`rank-medal ${getRankMedalClass(index)}`}>{index + 1}</div>
                    <div className="podium-mini-name">{team.teamName}</div>
                    <div className="podium-mini-meta">
                      {team.correctAnswers ?? 0} correct
                    </div>
                    <div className="podium-mini-score">{team.score}</div>
                  </div>
                ))}
              </div>

              <div className="round-standings-panel">
                <div className="round-standings-head">
                  <span>Team Standings</span>
                  <span>{latestResult?.isSample ? "Sample scores remain unchanged" : "Updated after this block"}</span>
                </div>

                <div className="leaderboard-list compact">
                  {sortedTeams.map(([teamId, team], index) => (
                    <div
                      key={teamId}
                      className={`leaderboard-row ${index === 0 ? "leader" : ""}`}
                    >
                      <div className={`rank-medal ${getRankMedalClass(index)}`}>{index + 1}</div>
                      <div>
                        <div style={{ fontSize: "clamp(22px, 1.8vw, 30px)", fontWeight: 800 }}>{team.teamName}</div>
                        <div style={{ marginTop: "6px", color: "var(--muted)", fontSize: "14px" }}>
                          {team.correctAnswers ?? 0} correct answers
                        </div>
                      </div>
                      <div style={{ color: "var(--muted)", fontSize: "15px" }}>
                        {index === 0
                          ? latestResult?.isSample
                            ? "Practice leader"
                            : "Current leader"
                          : `Behind leader by ${Math.max(leaderScore - (team.score || 0), 0)} pts`}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "clamp(30px, 3vw, 44px)", fontWeight: 900, color: index === 0 ? "var(--amber)" : "var(--white)" }}>
                          {team.score}
                        </div>
                        <div style={{ color: "var(--muted)", fontSize: "12px", letterSpacing: "0.18em", textTransform: "uppercase" }}>
                          points
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : showQuestionBoard && (
          <section className="question-stage">
            <div className="question-stage-topbar">
              <div className="stage-progress-label">
                Question {currentQuestionNumber} / {state?.totalQuestions}
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

            {renderBuzzOrderPanel({
              title: "Buzzer Sequence",
              subtitle:
                state?.phase === "answer"
                  ? "Verbal answer round summary"
                  : question.category || "Live Round",
            })}
          </section>
        )}

        {showTimeUp && (
          <div className="timeup-screen">
            <div style={{ width: "min(100%, 1100px)" }}>
              <div className="timeup-icon" aria-hidden="true">
                <div className="alarm-clock">
                  <div className="alarm-bell alarm-bell-left" />
                  <div className="alarm-bell alarm-bell-right" />
                  <div className="alarm-handle" />
                  <div className="alarm-face">
                    <div className="alarm-hand alarm-hand-hour" />
                    <div className="alarm-hand alarm-hand-minute" />
                    <div className="alarm-center-dot" />
                  </div>
                  <div className="alarm-leg alarm-leg-left" />
                  <div className="alarm-leg alarm-leg-right" />
                </div>
              </div>
              <div className="timeup-title">Time&apos;s Up!</div>
              <p className="championship-subline" style={{ marginTop: "18px", marginBottom: "20px" }}>
                Verbal answer round is in progress. Waiting for the host to reveal the answer and announce the winner.
              </p>
              <div style={{ fontSize: "clamp(24px, 2.6vw, 44px)", fontWeight: 800, color: "var(--amber)" }}>
                Waiting for host reveal
              </div>
              {!showTimeUpOrder ? (
                <div className="timeup-order-hold">
                  <div className="timeup-order-hold-text">Alarm running... preparing buzzer order</div>
                </div>
              ) : (
                <div style={{ marginTop: "28px", textAlign: "left" }}>
                  {renderBuzzOrderPanel({
                    title: "Buzz Order",
                    subtitle: "First to last buzzer order",
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {showAnswerPanel && (
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
            {latestResult?.winner && (
              <div className="confetti-layer" aria-hidden="true">
                {Array.from({ length: 18 }).map((_, index) => (
                  <span
                    key={index}
                    className="confetti-piece"
                    style={{
                      left: `${6 + index * 5.2}%`,
                      background:
                        index % 4 === 0
                          ? "var(--amber)"
                          : index % 4 === 1
                            ? "var(--green)"
                            : index % 4 === 2
                              ? "#f7f3ec"
                              : "#63b5ff",
                      "--delay": `${(index % 6) * 0.18}s`,
                      "--duration": `${3.8 + (index % 5) * 0.35}s`,
                      "--drift": `${index % 2 === 0 ? 50 + index * 3 : -50 - index * 3}px`,
                    }}
                  />
                ))}
              </div>
            )}
            <div className="winner-banner" style={{ position: "relative", zIndex: 1 }}>
              <div className="eyebrow">Round Result</div>
              {latestResult?.winner ? (
                <>
                  <div className="headline winner-flash">{latestResult.winnerPlayer || "Winner"}</div>
                  <div className="subline">
                    {latestResult.winner}
                    {" | "}
                    {latestResult.isSample
                      ? "Sample Question"
                      : latestResult.roundName || "Scored Round"}
                    {latestResult.awardedPoints === 0
                      ? " | No points added"
                      : latestResult.awardedPoints < 0
                        ? ` | ${latestResult.awardedPoints} penalty on wrong attempts`
                        : ""}
                  </div>
                </>
              ) : latestResult ? (
                <>
                  <div className="headline">No Winner</div>
                  <div className="subline">
                    {latestResult.isSample
                      ? "Sample question completed. No team received points."
                      : "No team received points for this verbal answer round."}
                  </div>
                </>
              ) : (
                <>
                  <div className="headline">Answer Revealed</div>
                  <div className="subline">Waiting for the host to confirm the round result.</div>
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
              {winningBuzzEntry && (
                <div className="winner-team-card winner-flash">
                  <CrownBadge label="Round Winner" className="winner-crown" />
                  <div className="winner-team-label">Winning Team</div>
                  <div className="winner-team-name">{winningBuzzEntry.teamName}</div>
                  <div className="winner-team-meta">
                    {winningBuzzEntry.memberName || latestResult?.winnerPlayer || "Player"}
                    {" | "}
                    {(winningBuzzEntry.timeMs / 1000).toFixed(2)}s buzz time
                  </div>
                </div>
              )}

              {showAnswerReveal ? (
                <>
                  <div style={{ color: "var(--green)", letterSpacing: "0.26em", textTransform: "uppercase" }}>
                    Correct Answer
                  </div>
                  <div style={{ fontSize: "clamp(30px, 3vw, 52px)", fontWeight: 900 }}>
                    {question?.options?.[question.correct]}
                  </div>
                  <div style={{ color: "var(--muted)", fontSize: "18px" }}>
                    {latestResult?.question || question?.text}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ color: "var(--green)", letterSpacing: "0.26em", textTransform: "uppercase" }}>
                    Winner Confirmed
                  </div>
                  <div style={{ fontSize: "clamp(22px, 2vw, 34px)", fontWeight: 800, color: "var(--white)" }}>
                    Host marked the correct team. Answer board will update when revealed.
                  </div>
                </>
              )}
            </div>

            {state?.buzzerHistory?.length ? (
              <div className="winner-list-panel">
                <div className="winner-list-head">
                  <span>Buzzer Order</span>
                  <span>Winner highlighted in green</span>
                </div>
                <div className="leaderboard-list compact">
                  {state.buzzerHistory.map((entry, index) => {
                    const isWinner = latestResult?.winner && entry.teamName === latestResult.winner;

                    return (
                      <div
                        key={entry.id || `${entry.teamId}-${index}`}
                        className={`leaderboard-row winner-history-row ${isWinner ? "winner-row-blink" : ""}`}
                      >
                        <div className={`rank-medal ${isWinner ? "gold" : "default"}`}>{index + 1}</div>
                        <div>
                          <div style={{ fontSize: "clamp(22px, 1.8vw, 30px)", fontWeight: 800 }}>
                            {entry.teamName}
                          </div>
                          <div style={{ marginTop: "6px", color: "var(--muted)", fontSize: "14px" }}>
                            {entry.memberName || "Player"}
                          </div>
                        </div>
                        <div style={{ color: isWinner ? "#d7ffe9" : "var(--muted)", fontSize: "15px", fontWeight: isWinner ? 800 : 600 }}>
                          {isWinner ? "Right answer awarded" : "Participated in verbal round"}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "clamp(28px, 2.6vw, 40px)", fontWeight: 900, color: isWinner ? "var(--green)" : "var(--white)" }}>
                            {(entry.timeMs / 1000).toFixed(2)}s
                          </div>
                          <div style={{ color: "var(--muted)", fontSize: "12px", letterSpacing: "0.18em", textTransform: "uppercase" }}>
                            buzz time
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>
        )}

      </div>
    </div>
  );
}
