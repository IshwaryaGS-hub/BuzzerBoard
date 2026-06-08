import { useEffect, useMemo, useState } from "react";
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
  const [now, setNow] = useState(Date.now());
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

  useEffect(() => {
    if (state?.phase !== "question" && state?.phase !== "buzzed" && state?.phase !== "timeup") return undefined;

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [state?.phase, state?.timerStartedAt]);

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
    if (!state?.timerStartedAt) return state?.timeLimit || 0;
    const elapsed = Math.min((now - state.timerStartedAt) / 1000, state.timeLimit || 0);
    return Math.max(0, (state.timeLimit || 0) - elapsed);
  }, [now, state?.timerStartedAt, state?.timeLimit]);

  if (!state) {
    return <div style={{ padding: "40px", color: "var(--muted)" }}>Connecting...</div>;
  }

  const question = state.currentQuestion;
  const connectedTeamsCount = Object.values(state.scores || {}).filter(
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
  const canMarkWinner = (state.buzzerHistory?.length || 0) > 0 && !currentQuestionResult;
  const activeBuzz = state.activeBuzz || null;
  const rejectedBuzzIds = state.rejectedBuzzIds || [];
  const buzzCount = state.buzzerHistory?.length || 0;
  const isAnswerRevealed = Boolean(state.answerRevealed);
  const activeBuzzId =
    activeBuzz?.id ||
    (typeof state.activeBuzzIndex === "number" && state.activeBuzzIndex >= 0
      ? state.buzzerHistory?.[state.activeBuzzIndex]?.id
      : null);

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
        className="admin-setup-panel"
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "18px",
          padding: "24px",
          marginBottom: "24px",
        }}
      >
        <div style={{ fontSize: "12px", letterSpacing: "3px", color: "var(--amber)", marginBottom: "16px" }}>SETUP</div>

        {configError && (
          <div style={{ color: "var(--red)", marginBottom: "14px", fontSize: "14px" }}>{configError}</div>
        )}
        {configStatus && (
          <div style={{ color: "var(--green)", marginBottom: "14px", fontSize: "14px" }}>{configStatus}</div>
        )}

        <div style={{ marginBottom: "18px" }}>
          <label style={{ display: "block", color: "var(--muted)", fontSize: "12px", marginBottom: "8px" }}>
            Host Password
          </label>
          <input
            type="text"
            value={config.hostPassword}
            onChange={(event) => setConfig((current) => ({ ...current, hostPassword: event.target.value }))}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: "12px",
              border: "1px solid var(--border)",
              background: "rgba(255,255,255,0.04)",
              color: "var(--white)",
            }}
          />
        </div>

        <div style={{ marginBottom: "18px" }}>
          <label style={{ display: "block", color: "var(--muted)", fontSize: "12px", marginBottom: "8px" }}>
            Front Screen Password
          </label>
          <input
            type="text"
            value={config.displayPassword}
            onChange={(event) => setConfig((current) => ({ ...current, displayPassword: event.target.value }))}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: "12px",
              border: "1px solid var(--border)",
              background: "rgba(255,255,255,0.04)",
              color: "var(--white)",
            }}
          />
        </div>

        <div style={{ color: "var(--muted)", fontSize: "13px", marginBottom: "14px" }}>
          Fixed quiz setup for 8 teams. You can change only the passwords you want to give each team.
        </div>

        <div style={{ display: "grid", gap: "10px", marginBottom: "16px" }}>
          {config.teams.map((team, index) => (
            <div key={`${team.id}-${index}`} className="admin-team-row" style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 1fr", gap: "10px" }}>
              <input
                type="text"
                value={team.name}
                readOnly
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  background: "rgba(255,255,255,0.02)",
                  color: "var(--white)",
                }}
              />
              <input
                type="text"
                value={team.password || ""}
                placeholder={`Password for ${team.name}`}
                onChange={(event) => updateTeamPassword(index, event.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  background: "rgba(255,255,255,0.04)",
                  color: "var(--white)",
                }}
              />
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button
            onClick={saveConfig}
            type="button"
            disabled={savingConfig}
            style={{
              padding: "12px 18px",
              borderRadius: "12px",
              border: "none",
              background: "linear-gradient(135deg,var(--amber),var(--amber2))",
              color: "#111",
              fontWeight: "700",
            }}
          >
            {savingConfig ? "Saving..." : "Save Setup"}
          </button>
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
            <div className={`quiz-stat-circle ${timeLeft <= 8 ? "alert" : ""}`}>
              <div style={{ textAlign: "center" }}>
                <div className="value">{Math.ceil(timeLeft)}</div>
                <div className="label">Seconds Left</div>
              </div>
            </div>
            <div className="quiz-count-card">
              <div className="value">{buzzCount}</div>
              <div className="label">Buzzed</div>
            </div>
          </div>
        </div>
      </div>

      <div className="admin-main-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "28px" }}>
        <div className="admin-panel" style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "16px", padding: "24px" }}>
          <div style={{ fontSize: "12px", letterSpacing: "3px", color: "var(--amber)", marginBottom: "14px" }}>QUESTION</div>
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
              {question.options?.map((option, index) => {
                const isCorrect = index === question.correct;

                return (
                  <div
                    key={index}
                    style={{
                      display: "flex",
                      gap: "10px",
                      alignItems: "center",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      marginBottom: "6px",
                      background: isAnswerRevealed && isCorrect
                          ? "rgba(16,201,122,0.1)"
                          : "rgba(255,255,255,0.03)",
                      border: "1px solid",
                      borderColor: isAnswerRevealed && isCorrect
                          ? "var(--green)"
                          : "var(--border)",
                      fontSize: "14px",
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
            </>
          ) : (
            <p style={{ color: "var(--muted)" }}>No question loaded yet</p>
          )}
        </div>

        <div
          className="admin-panel"
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "16px",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <div style={{ fontSize: "12px", letterSpacing: "3px", color: "var(--amber)", marginBottom: "6px" }}>CONTROLS</div>
          <button
            onClick={() => emit("host-next-question")}
            style={{ padding: "14px", borderRadius: "12px", border: "none", background: "linear-gradient(135deg,var(--amber),var(--amber2))", color: "#111", fontWeight: "700", fontSize: "14px", letterSpacing: "2px" }}
          >
            NEXT QUESTION
          </button>
          <button
            onClick={() => emit("host-unlock-buzzers")}
            disabled={!state.buzzerLocked}
            style={{ padding: "14px", borderRadius: "12px", border: "1.5px solid var(--green)", background: state.buzzerLocked ? "rgba(16,201,122,0.1)" : "rgba(255,255,255,0.03)", color: state.buzzerLocked ? "var(--green)" : "var(--muted)", fontWeight: "700", fontSize: "14px", letterSpacing: "2px" }}
          >
            UNLOCK BUZZERS
          </button>
          <button
            onClick={() => emit("host-lock-buzzers")}
            disabled={state.buzzerLocked}
            style={{ padding: "14px", borderRadius: "12px", border: "1.5px solid var(--red)", background: !state.buzzerLocked ? "rgba(232,69,69,0.1)" : "rgba(255,255,255,0.03)", color: !state.buzzerLocked ? "var(--red)" : "var(--muted)", fontWeight: "700", fontSize: "14px", letterSpacing: "2px" }}
          >
            LOCK BUZZERS
          </button>
          <button
            onClick={() => emit("host-reveal-answer")}
            style={{ padding: "14px", borderRadius: "12px", border: "1.5px solid var(--border)", background: "rgba(255,255,255,0.04)", color: "var(--white)", fontWeight: "600", fontSize: "14px" }}
          >
            REVEAL ANSWER
          </button>
        </div>
      </div>

      {state.buzzedBy && (
        <div
          className="admin-buzz-panel"
          style={{
            background: "rgba(16,201,122,0.08)",
            border: "2px solid var(--green)",
            borderRadius: "16px",
            padding: "20px 28px",
            marginBottom: "24px",
          }}
        >
          <div style={{ fontSize: "12px", letterSpacing: "3px", color: "var(--green)", marginBottom: "8px" }}>BUZZED IN</div>
          <div style={{ color: "var(--white)", fontSize: "15px", marginBottom: "16px" }}>
            {canMarkWinner
              ? "Ask teams in buzzer order. Only the current active team can be marked right or wrong."
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
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    gap: "16px",
                    alignItems: "center",
                    padding: "14px 16px",
                    borderRadius: "12px",
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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", minWidth: "300px" }}>
                    <button
                      onClick={() => emit("host-mark-correct", { teamId: entry.teamId, buzzerId: entry.id })}
                      disabled={controlsDisabled}
                      style={{
                        padding: "12px 14px",
                        borderRadius: "10px",
                        border: "none",
                        background: controlsDisabled ? "rgba(255,255,255,0.08)" : "var(--green)",
                        color: controlsDisabled ? "var(--muted)" : "#fff",
                        fontWeight: "700",
                        fontSize: "14px",
                        cursor: controlsDisabled ? "not-allowed" : "pointer",
                      }}
                    >
                      RIGHT ANSWER
                    </button>
                    <button
                      onClick={() => emit("host-mark-wrong", { teamId: entry.teamId, buzzerId: entry.id })}
                      disabled={controlsDisabled}
                      style={{
                        padding: "12px 14px",
                        borderRadius: "10px",
                        border: "none",
                        background: controlsDisabled ? "rgba(255,255,255,0.08)" : "var(--red)",
                        color: controlsDisabled ? "var(--muted)" : "#fff",
                        fontWeight: "700",
                        fontSize: "14px",
                        cursor: controlsDisabled ? "not-allowed" : "pointer",
                      }}
                    >
                      WRONG ANSWER
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {state.buzzerHistory?.length > 0 && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "14px", padding: "20px", marginBottom: "24px" }}>
          <div style={{ fontSize: "12px", letterSpacing: "3px", color: "var(--amber)", marginBottom: "12px" }}>BUZZ ORDER THIS QUESTION</div>
          {state.buzzerHistory.map((entry, index) => (
            <div
              key={entry.id || index}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 0",
                borderBottom: `1px solid ${index < state.buzzerHistory.length - 1 ? "var(--border)" : "transparent"}`,
                fontSize: "14px",
              }}
            >
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

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "16px", padding: "24px" }}>
        <div style={{ fontSize: "12px", letterSpacing: "3px", color: "var(--amber)", marginBottom: "16px" }}>LIVE SCORES</div>
        {sortedTeams.map(([teamId, team], index) => (
          <div key={teamId} style={{ display: "flex", alignItems: "center", gap: "16px", padding: "12px 16px", borderRadius: "10px", marginBottom: "8px", background: index === 0 ? "rgba(232,160,32,0.08)" : "rgba(255,255,255,0.02)" }}>
            <span style={{ width: "28px", height: "28px", borderRadius: "50%", background: index === 0 ? "var(--amber)" : "var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", fontSize: "13px", color: index === 0 ? "#111" : "var(--muted)", flexShrink: 0 }}>
              {index + 1}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: "600", fontSize: "14px" }}>{team.teamName}</div>
              <div style={{ fontSize: "11px", color: "var(--muted)" }}>
                {formatCount(team.members?.length ?? 0, "member")} | {team.correctAnswers ?? 0} correct
              </div>
            </div>
            <span style={{ fontSize: "22px", fontWeight: "700", color: index === 0 ? "var(--amber)" : "var(--white)" }}>{team.score}</span>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
