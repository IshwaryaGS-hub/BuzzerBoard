import { useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../socket";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4001";

function formatCount(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export default function AdminPage() {
  const [state, setState] = useState(null);
  const [config, setConfig] = useState({ hostPassword: "", displayPassword: "", teams: [] });
  const [configStatus, setConfigStatus] = useState("");
  const [configError, setConfigError] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [setupCollapsed, setSetupCollapsed] = useState(true);
  const [liveScoresCollapsed, setLiveScoresCollapsed] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [buzzDelta, setBuzzDelta] = useState(0);
  const [buzzAnimTick, setBuzzAnimTick] = useState(0);
  const previousBuzzCountRef = useRef(0);
  const hostAuth = sessionStorage.getItem("hostAuth") || "";

  const navigateTo = (path) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new Event("quiz:navigate"));
  };

  useEffect(() => {
    if (!hostAuth) {
      navigateTo("/");
      return;
    }

    if (!socket.connected) socket.connect();
    socket.emit("join-host", { password: hostAuth });

    socket.on("game-state", setState);
    socket.on("quiz-config", (nextConfig) => {
      setConfig({
        hostPassword: nextConfig.hostPassword || "",
        displayPassword: nextConfig.displayPassword || "",
        teams: Array.isArray(nextConfig.teams) ? nextConfig.teams : [],
      });
    });
    socket.on("joined-host", ({ success, config: hostConfig }) => {
      if (!success) {
        sessionStorage.removeItem("hostAuth");
        navigateTo("/");
        return;
      }

      if (hostConfig) {
        setConfig({
          hostPassword: hostConfig.hostPassword || "",
          displayPassword: hostConfig.displayPassword || "",
          teams: Array.isArray(hostConfig.teams) ? hostConfig.teams : [],
        });
      }
    });
    socket.on("error", ({ message }) => {
      if (message === "Invalid host password") {
        sessionStorage.removeItem("hostAuth");
        navigateTo("/");
        return;
      }

      setConfigError(message);
    });

    fetch(`${API_BASE_URL}/api/admin/config`, {
      headers: { "x-host-password": hostAuth },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Could not load admin settings");
        }
        return response.json();
      })
      .then((data) => {
        setConfig({
          hostPassword: data.hostPassword || "",
          displayPassword: data.displayPassword || "",
          teams: Array.isArray(data.teams) ? data.teams : [],
        });
      })
      .catch((error) => {
        setConfigError(error.message);
      });

    return () => {
      socket.off("game-state");
      socket.off("quiz-config");
      socket.off("joined-host");
      socket.off("error");
    };
  }, [hostAuth]);

  const isTimerActive = state?.phase === "question" || state?.phase === "buzzed";

  useEffect(() => {
    if (!isTimerActive || !state?.timerStartedAt) return undefined;

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [isTimerActive, state?.timerStartedAt]);

  const emit = (event, data) => socket.emit(event, data);
  const sortedTeams = state
    ? Object.entries(state.scores).sort((left, right) => right[1].score - left[1].score)
    : [];
  const sortedPlayers = state
    ? Object.values(state.playerStats || {}).sort((left, right) => {
        if ((right.awardedPoints || 0) !== (left.awardedPoints || 0)) {
          return (right.awardedPoints || 0) - (left.awardedPoints || 0);
        }
        if ((right.wins || 0) !== (left.wins || 0)) {
          return (right.wins || 0) - (left.wins || 0);
        }
        if ((left.fastestBuzzMs ?? Number.POSITIVE_INFINITY) !== (right.fastestBuzzMs ?? Number.POSITIVE_INFINITY)) {
          return (left.fastestBuzzMs ?? Number.POSITIVE_INFINITY) - (right.fastestBuzzMs ?? Number.POSITIVE_INFINITY);
        }
        return (right.buzzCount || 0) - (left.buzzCount || 0);
      })
    : [];

  const updateTeamPassword = (index, password) => {
    setConfig((current) => ({
      ...current,
      teams: current.teams.map((team, teamIndex) =>
        teamIndex === index ? { ...team, password } : team
      ),
    }));
  };

  const updateTeamName = (index, name) => {
    setConfig((current) => ({
      ...current,
      teams: current.teams.map((team, teamIndex) =>
        teamIndex === index ? { ...team, name } : team
      ),
    }));
  };

  const saveConfig = async () => {
    const normalizedTeams = config.teams
      .map((team) => ({
        id: team.id,
        name: team.name.trim(),
        password: `${team.password || ""}`.trim(),
      }))
      .filter((team) => team.name);

    if (!config.hostPassword.trim()) {
      setConfigError("Host password cannot be empty");
      return;
    }

    if (normalizedTeams.length === 0) {
      setConfigError("Add at least one team");
      return;
    }

    if (!config.displayPassword.trim()) {
      setConfigError("Front screen password cannot be empty");
      return;
    }

    if (normalizedTeams.some((team) => !team.password)) {
      setConfigError("Every team must have a password");
      return;
    }

    setSavingConfig(true);
    setConfigError("");
    setConfigStatus("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-host-password": hostAuth,
        },
        body: JSON.stringify({
          hostPassword: config.hostPassword.trim(),
          displayPassword: config.displayPassword.trim(),
          teams: normalizedTeams,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not save settings");
      }

      sessionStorage.setItem("hostAuth", data.hostPassword);
      setConfig({
        hostPassword: data.hostPassword,
        displayPassword: data.displayPassword || "",
        teams: data.teams,
      });
      setConfigStatus("Settings saved");
    } catch (error) {
      setConfigError(error.message);
    } finally {
      setSavingConfig(false);
    }
  };

  const timeLeft = useMemo(() => {
    if (!state?.currentQuestion) return 0;
    if (!isTimerActive || !state?.timerStartedAt) return state?.timeLimit || 20;
    const elapsed = Math.min((now - state.timerStartedAt) / 1000, state.timeLimit || 0);
    return Math.max(0, (state.timeLimit || 0) - elapsed);
  }, [isTimerActive, now, state?.currentQuestion, state?.timerStartedAt, state?.timeLimit]);

  const question = state?.currentQuestion || null;
  const connectedTeamsCount = Object.values(state?.scores || {}).filter(
    (team) => (team.members?.length || 0) > 0
  ).length;
  const overallTeamLeader =
    sortedTeams.find(([, team]) => (team.score || 0) > 0 || (team.correctAnswers || 0) > 0)?.[1] || null;
  const overallPlayerLeader =
    sortedPlayers.find(
      (player) =>
        (player.awardedPoints || 0) > 0 ||
        (player.wins || 0) > 0 ||
        (player.buzzCount || 0) > 0 ||
        typeof player.fastestBuzzMs === "number"
    ) || null;
  const overallPlayerFastest =
    typeof overallPlayerLeader?.fastestBuzzMs === "number"
      ? `${(overallPlayerLeader.fastestBuzzMs / 1000).toFixed(2)}s`
      : "No buzz yet";
  const currentQuestionResult =
    question && state.questionResults?.length
      ? [...state.questionResults]
          .reverse()
          .find((result) => result.question === question.text) || null
      : null;
  const canMarkWinner = (state?.buzzerHistory?.length || 0) > 0 && !currentQuestionResult;
  const activeBuzz = state?.activeBuzz || null;
  const rejectedBuzzIds = state?.rejectedBuzzIds || [];
  const buzzCount = state?.buzzerHistory?.length || 0;
  const isAnswerRevealed = Boolean(state?.answerRevealed);
  const activeBuzzId =
    activeBuzz?.id ||
    (typeof state?.activeBuzzIndex === "number" && state.activeBuzzIndex >= 0
      ? state?.buzzerHistory?.[state.activeBuzzIndex]?.id
      : null);

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

  if (!state) {
    return <div style={{ padding: "40px", color: "var(--muted)" }}>Connecting...</div>;
  }

  return (
    <div className="quiz-shell quiz-stage-shell host-shell">
      <div className="host-frame">
      <div className="glass-panel host-topbar">
        <div>
          <div style={{ fontSize: "12px", letterSpacing: "4px", color: "var(--amber)" }}>HOST PANEL</div>
          <h1 className="host-topbar-title">Quiz Control</h1>
        </div>
        <div className="host-topbar-actions">
          <a
            href="/leaderboard"
            target="_blank"
            rel="noreferrer"
            className="host-action-link"
          >
            Front Screen
          </a>
          <button
            onClick={() => emit("host-reset-game")}
            className="host-action-button"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="quiz-overview-grid">
        <div className="quiz-overview-card">
          <div className="eyebrow">Overall Team Leader</div>
          <div className="title">{overallTeamLeader?.teamName || "Waiting for scores"}</div>
            <div className="meta">
              {overallTeamLeader
              ? `${overallTeamLeader.score} pts | ${overallTeamLeader.correctAnswers || 0} wins | ${formatCount(
                  overallTeamLeader.members?.length || 0,
                  "player"
                )} connected`
              : "The top team appears here once points start moving."}
            </div>
        </div>
        <div className="quiz-overview-card">
          <div className="eyebrow">Top Player</div>
            <div className="title">
              {overallPlayerLeader ? `${overallPlayerLeader.memberName} - ${overallPlayerLeader.teamName}` : "Waiting for buzzes"}
            </div>
            <div className="meta">
              {overallPlayerLeader
              ? `${overallPlayerLeader.awardedPoints || 0} pts | ${overallPlayerLeader.wins || 0} round wins | fastest ${overallPlayerFastest}`
              : "Once players buzz and win rounds, the overall player leader will appear here."}
            </div>
          </div>
        </div>

      <div
        className="admin-statusbar"
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "14px",
          padding: "16px 24px",
          marginBottom: "24px",
          display: "flex",
          gap: "24px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div><span style={{ color: "var(--muted)", fontSize: "12px" }}>Phase </span><strong style={{ color: "var(--amber)", textTransform: "uppercase" }}>{state.phase}</strong></div>
        <div><span style={{ color: "var(--muted)", fontSize: "12px" }}>Question </span><strong>{state.currentQuestionIndex + 1} / {state.totalQuestions || "-"}</strong></div>
        <div><span style={{ color: "var(--muted)", fontSize: "12px" }}>Teams online </span><strong style={{ color: "var(--green)" }}>{connectedTeamsCount} / 8</strong></div>
        <div><span style={{ color: "var(--muted)", fontSize: "12px" }}>Buzzers </span><strong style={{ color: state.buzzerLocked ? "var(--red)" : "var(--green)" }}>{state.buzzerLocked ? "LOCKED" : "OPEN"}</strong></div>
        <div style={{ marginLeft: "auto" }}>
          <div className="quiz-hud-side">
            <div className={`quiz-hud-orb timer ${isTimerActive && timeLeft <= 8 ? "alert" : ""}`}>
              <div style={{ textAlign: "center" }}>
                <div className="value">{Math.ceil(timeLeft)}</div>
                <div className="label">Seconds Left</div>
              </div>
            </div>
            <div className={`quiz-hud-orb buzz ${buzzDelta ? "pulse" : ""}`} key={buzzAnimTick}>
              <div className="value">{buzzCount}</div>
              <div className="label">Buzzed</div>
              {buzzDelta > 0 && <div className="quiz-hud-orb-pop">+{buzzDelta}</div>}
            </div>
          </div>
        </div>
      </div>

      <div className="admin-workspace">
        <div className="admin-left-rail">
          <section className="admin-setup-panel admin-surface-card">
            <button
              type="button"
              className="admin-section-toggle"
              onClick={() => setSetupCollapsed((current) => !current)}
              aria-expanded={!setupCollapsed}
            >
              <div>
                <div className="admin-section-eyebrow">Setup</div>
                <div className="admin-section-title">Game Setup</div>
                <div className="admin-section-meta">
                  Host password, front screen access, and team setup.
                </div>
              </div>
              <span className={`admin-toggle-icon ${setupCollapsed ? "collapsed" : ""}`}>⌃</span>
            </button>

            {!setupCollapsed && (
              <div className="admin-section-body">
                {configError && (
                  <div className="admin-message error">{configError}</div>
                )}
                {configStatus && (
                  <div className="admin-message success">{configStatus}</div>
                )}

                <div className="admin-form-field">
                  <label className="admin-field-label">Host Password</label>
                  <input
                    type="text"
                    value={config.hostPassword}
                    onChange={(event) => setConfig((current) => ({ ...current, hostPassword: event.target.value }))}
                    className="admin-text-input"
                  />
                </div>

                <div className="admin-form-field">
                  <label className="admin-field-label">Front Screen Password</label>
                  <input
                    type="text"
                    value={config.displayPassword}
                    onChange={(event) => setConfig((current) => ({ ...current, displayPassword: event.target.value }))}
                    className="admin-text-input"
                  />
                </div>

                <div className="admin-helper-copy">
                  Configure up to 8 teams here. Rename teams and update each password before starting a new game.
                </div>

                <div className="admin-team-grid">
                  {config.teams.map((team, index) => (
                    <div key={`${team.id}-${index}`} className="admin-team-row">
                      <input
                        type="text"
                        value={team.name}
                        placeholder={`Team ${index + 1} name`}
                        onChange={(event) => updateTeamName(index, event.target.value)}
                        className="admin-text-input"
                      />
                      <input
                        type="text"
                        value={team.password || ""}
                        placeholder={`Password for ${team.name || `Team ${index + 1}`}`}
                        onChange={(event) => updateTeamPassword(index, event.target.value)}
                        className="admin-text-input"
                      />
                    </div>
                  ))}
                </div>

                <div className="admin-setup-actions">
                  <button
                    onClick={saveConfig}
                    type="button"
                    disabled={savingConfig}
                    className="admin-primary-button"
                  >
                    {savingConfig ? "Saving..." : "Save Setup"}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="admin-panel admin-surface-card">
            <div className="admin-section-eyebrow">Question Handling</div>
            <div className="admin-question-card">
              {question ? (
                <>
                  <div
                    style={{
                      marginBottom: "16px",
                      padding: "12px 14px",
                      borderRadius: "12px",
                      background: isAnswerRevealed ? "rgba(16,201,122,0.12)" : "rgba(255,255,255,0.04)",
                      border: isAnswerRevealed ? "1px solid rgba(16,201,122,0.38)" : "1px solid var(--border)",
                    }}
                  >
                    <div style={{ color: isAnswerRevealed ? "var(--green)" : "var(--amber)", fontSize: "11px", fontWeight: "800", letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: "6px" }}>
                      {isAnswerRevealed ? "Host Key" : "Answer Status"}
                    </div>
                    <div style={{ color: "var(--white)", fontSize: "15px", fontWeight: "700", lineHeight: 1.5 }}>
                      {isAnswerRevealed
                        ? `Correct answer: ${["A", "B", "C", "D"][question.correct]}. ${question.options?.[question.correct]}`
                        : "Answer hidden until host reveals it"}
                    </div>
                  </div>
                  <p style={{ fontSize: "16px", fontWeight: "600", marginBottom: "16px", lineHeight: "1.5" }}>{question.text}</p>
                  <div className="admin-question-options">
                    {question.options?.map((option, index) => {
                      const isCorrect = index === question.correct;

                      return (
                        <div
                          key={index}
                          className="admin-question-option"
                          style={{
                            background: isAnswerRevealed && isCorrect
                              ? "rgba(16,201,122,0.1)"
                              : "rgba(255,255,255,0.03)",
                            borderColor: isAnswerRevealed && isCorrect
                              ? "var(--green)"
                              : "var(--border)",
                          }}
                        >
                          <span style={{ color: isAnswerRevealed && isCorrect ? "var(--green)" : "var(--muted)", fontWeight: "700" }}>
                            {["A", "B", "C", "D"][index]}
                          </span>
                          <span>{option}</span>
                          {isAnswerRevealed && isCorrect && (
                            <span style={{ marginLeft: "auto", color: "var(--green)", fontSize: "12px", fontWeight: "700" }}>
                              HOST ANSWER
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p style={{ color: "var(--muted)" }}>No question loaded yet</p>
              )}
            </div>

            <div className="admin-controls-grid">
              <button
                onClick={() => emit("host-next-question")}
                className="admin-primary-button"
              >
                Next Question
              </button>
              <button
                onClick={() => emit("host-unlock-buzzers")}
                disabled={!state.buzzerLocked}
                className="admin-secondary-button success"
              >
                Unlock Buzzers
              </button>
              <button
                onClick={() => emit("host-lock-buzzers")}
                disabled={state.buzzerLocked}
                className="admin-secondary-button danger"
              >
                Lock Buzzers
              </button>
              <button
                onClick={() => emit("host-reveal-answer")}
                className="admin-secondary-button neutral"
              >
                Reveal Answer
              </button>
            </div>

            {state.buzzerHistory?.length > 0 && (
              <div className="admin-subsection">
                <div className="admin-section-eyebrow">Buzz Order This Question</div>
                {state.buzzerHistory.map((entry, index) => (
                  <div key={entry.id || index} className="admin-buzz-order-row">
                    <span>
                      <strong style={{ color: "var(--amber)" }}>#{index + 1}</strong> {entry.teamName}
                      <span style={{ color: "var(--muted)" }}>
                        {rejectedBuzzIds.includes(entry.id) ? " | Wrong answer" : activeBuzz?.id === entry.id ? " | Active" : ""}
                      </span>
                    </span>
                    <span style={{ color: "var(--amber)", fontWeight: "600" }}>{(entry.timeMs / 1000).toFixed(2)}s</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="admin-right-rail">
          <section className="admin-panel admin-surface-card">
            <button
              type="button"
              className="admin-section-toggle"
              onClick={() => setLiveScoresCollapsed((current) => !current)}
              aria-expanded={!liveScoresCollapsed}
            >
              <div>
                <div className="admin-section-eyebrow">Live Scores</div>
                <div className="admin-section-title">Scoreboard</div>
                <div className="admin-section-meta">
                  Starts collapsed so the host can expand it only when needed.
                </div>
              </div>
              <span className={`admin-toggle-icon ${liveScoresCollapsed ? "collapsed" : ""}`}>⌃</span>
            </button>

            {!liveScoresCollapsed && (
              <div className="admin-section-body">
                <div className="admin-scoreboard-list">
                  {sortedTeams.map(([teamId, team], index) => (
                    <div key={teamId} className={`admin-score-row ${index === 0 ? "leader" : ""}`}>
                      <span className="admin-score-rank">{index + 1}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: "700", fontSize: "15px" }}>{team.teamName}</div>
                        <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                          {formatCount(team.members?.length ?? 0, "member")} | {team.correctAnswers ?? 0} correct
                        </div>
                      </div>
                      <span className="admin-score-value">{team.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {state.buzzerHistory?.length > 0 && (
            <section
              className="admin-buzz-panel admin-surface-card"
              style={{
                background: "rgba(16,201,122,0.08)",
                border: "2px solid var(--green)",
              }}
            >
              <div className="admin-section-eyebrow" style={{ color: "var(--green)" }}>Live Answer Queue</div>
              <div style={{ color: "var(--white)", fontSize: "15px", marginBottom: "16px" }}>
                {canMarkWinner
                  ? "Ask teams in buzzer order. Only the active team can be marked right or wrong."
                  : currentQuestionResult?.winner
                    ? `${currentQuestionResult.winnerPlayer || "A player"} from ${currentQuestionResult.winner} received the points.`
                    : "No team received points for this round."}
              </div>

              <div style={{ display: "grid", gap: "10px" }}>
                {state.buzzerHistory.map((entry, index) => {
                  const isActive = canMarkWinner && activeBuzzId === entry.id;
                  const isRejected = rejectedBuzzIds.includes(entry.id);
                  const controlsDisabled = !canMarkWinner || !isActive || isRejected;

                  return (
                    <div
                      key={entry.id || `${entry.teamId}-${entry.memberName}-${index}`}
                      className="admin-answer-row"
                      style={{
                        border: `1px solid ${isActive ? "rgba(58,212,138,0.35)" : "var(--border)"}`,
                        background: isRejected
                          ? "rgba(255,107,107,0.08)"
                          : isActive
                            ? "rgba(58,212,138,0.08)"
                            : "rgba(255,255,255,0.04)",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: "800", fontSize: "15px" }}>
                          #{index + 1} {entry.teamName}
                        </div>
                        <div style={{ color: "var(--muted)", fontSize: "13px", marginTop: "4px" }}>
                          {(entry.timeMs / 1000).toFixed(2)}s
                          {isRejected ? " | Marked wrong" : isActive ? " | Active now" : ""}
                        </div>
                      </div>
                      <div className="admin-answer-actions">
                        <button
                          onClick={() => emit("host-mark-correct", { teamId: entry.teamId, buzzerId: entry.id })}
                          disabled={controlsDisabled}
                          className="admin-judgement-button success"
                        >
                          Right Answer
                        </button>
                        <button
                          onClick={() => emit("host-mark-wrong", { teamId: entry.teamId, buzzerId: entry.id })}
                          disabled={controlsDisabled}
                          className="admin-judgement-button danger"
                        >
                          Wrong Answer
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
