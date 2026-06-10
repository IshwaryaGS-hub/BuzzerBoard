import { useState, useEffect, useCallback, useRef } from "react";
import { socket } from "../socket";
import { playTimesUpAlarm } from "../utils/alarm";
import BrandMark from "../components/BrandMark";
import useSocketConnection from "../hooks/useSocketConnection";

export default function PlayerPage() {
  const [gameState, setGameState] = useState(null);
  const [buzzing, setBuzzing] = useState(false);
  const [notification, setNotification] = useState(null);
  const [now, setNow] = useState(Date.now());
  const timeUpHandledRef = useRef(false);
  const player = JSON.parse(sessionStorage.getItem("player") || "{}");
  const { connectionState, isConnected, isRecovering } = useSocketConnection();

  const navigateTo = useCallback((path) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new Event("quiz:navigate"));
  }, []);

  const showNotification = useCallback((msg, color) => {
    setNotification({ msg, color });
    window.setTimeout(() => setNotification(null), 3000);
  }, []);

  useEffect(() => {
    if (!player.teamId) {
      navigateTo("/");
      return;
    }

    const joinPlayer = () => {
      socket.emit("join-player", {
        teamId: player.teamId,
        teamPassword: player.teamPassword,
      });
    };

    const onJoinedPlayer = ({ success, teamId, teamName, memberName }) => {
      if (!success) {
        sessionStorage.removeItem("player");
        navigateTo("/");
        return;
      }

      sessionStorage.setItem(
        "player",
        JSON.stringify({
          teamId,
          teamName,
          memberName,
          teamPassword: player.teamPassword,
        })
      );
    };

    if (!socket.connected) socket.connect();
    socket.on("connect", joinPlayer);
    socket.on("game-state", setGameState);
    socket.on("joined-player", onJoinedPlayer);
    socket.on("buzzer-hit", ({ teamId, memberName, timeMs, teamName }) => {
      if (teamId === player.teamId && memberName === player.memberName) {
        showNotification(`You buzzed in ${(timeMs / 1000).toFixed(2)}s`, "green");
      }
      setBuzzing(false);
    });
    socket.on("buzz-rejected", ({ reason }) => {
      showNotification(reason, "red");
      setBuzzing(false);
    });
    socket.on("buzzers-unlocked", () => {
      setBuzzing(false);
    });
    socket.on("answer-correct", ({ teamId, memberName }) => {
      if (teamId === player.teamId) {
        showNotification(`${memberName || player.memberName} won the round for ${player.teamName}`, "green");
      }
    });
    socket.on("answer-wrong", ({ hasNext } = {}) => {
      showNotification(
        hasNext ? "That team was wrong. Waiting for the next team." : "No correct verbal answer was awarded.",
        "red"
      );
    });
    socket.on("times-up", () => {
      setBuzzing(false);
    });
    socket.on("error", ({ message }) => {
      if (message.includes("valid team") || message.includes("team password") || message.includes("already in use")) {
        sessionStorage.removeItem("player");
        navigateTo("/");
        return;
      }

      showNotification(message, "red");
    });

    if (socket.connected) {
      joinPlayer();
    }

    return () => {
      socket.off("connect", joinPlayer);
      socket.off("game-state");
      socket.off("joined-player", onJoinedPlayer);
      socket.off("buzzer-hit");
      socket.off("buzz-rejected");
      socket.off("buzzers-unlocked");
      socket.off("answer-correct");
      socket.off("answer-wrong");
      socket.off("times-up");
      socket.off("error");
    };
  }, [navigateTo, player.memberName, player.teamId, player.teamName, player.teamPassword, showNotification]);

  useEffect(() => {
    if (gameState?.phase === "timeup" && !timeUpHandledRef.current) {
      timeUpHandledRef.current = true;
      setBuzzing(false);
      showNotification("Time is up. Wait for the host.", "amber");
      playTimesUpAlarm();
      return;
    }

    if (gameState?.phase !== "timeup") {
      timeUpHandledRef.current = false;
    }
  }, [gameState?.phase, showNotification]);

  const isTimerActive = gameState?.phase === "question" || gameState?.phase === "buzzed";

  useEffect(() => {
    if (!isTimerActive || !gameState?.timerStartedAt) return undefined;

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [gameState?.timerStartedAt, isTimerActive]);

  const handleBuzz = useCallback(() => {
    if (!isConnected || buzzing || gameState?.buzzerLocked || gameState?.phase !== "question" || hasBuzzedRef.current) return;
    setBuzzing(true);
    socket.emit("player-buzz");
  }, [buzzing, gameState?.buzzerLocked, gameState?.phase, isConnected]);

  const hasBuzzedRef = useRef(false);

  useEffect(() => {
    const onKey = (event) => {
      if (event.code === "Space") {
        event.preventDefault();
        handleBuzz();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleBuzz]);

  if (!gameState) {
    return (
      <div className="quiz-shell quiz-stage-shell" style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <p style={{ color: "var(--muted)", fontSize: "18px", letterSpacing: "0.08em" }}>Connecting...</p>
      </div>
    );
  }

  const hasBuzzed =
    (gameState.buzzerHistory || []).findIndex(
      (entry) => entry.teamId === player.teamId && entry.memberName === player.memberName
    ) >= 0;
  hasBuzzedRef.current = hasBuzzed;
  const canBuzz = isConnected && gameState?.phase === "question" && !gameState?.buzzerLocked && !hasBuzzed;
  const timeElapsed = isTimerActive && gameState.timerStartedAt
    ? Math.min((now - gameState.timerStartedAt) / 1000, gameState.timeLimit)
    : 0;
  const timeLeft = gameState?.currentQuestion
    ? Math.max(0, (gameState.timeLimit || 20) - timeElapsed)
    : 0;
  const currentScore = gameState?.scores?.[player.teamId]?.score || 0;
  const currentWins = gameState?.scores?.[player.teamId]?.correctAnswers || 0;
  const isTimeUp = gameState?.phase === "timeup";
  const notificationTone =
    notification?.color === "green"
      ? { bg: "rgba(58, 212, 138, 0.12)", border: "rgba(58, 212, 138, 0.45)", text: "var(--green)" }
      : notification?.color === "red"
        ? { bg: "rgba(255, 107, 107, 0.12)", border: "rgba(255, 107, 107, 0.45)", text: "var(--red)" }
        : { bg: "rgba(240, 171, 34, 0.12)", border: "rgba(240, 171, 34, 0.45)", text: "var(--amber)" };

  return (
    <div className="quiz-shell quiz-stage-shell player-shell">
      <div className="player-stack">
        <div
          className="glass-panel player-panel"
        >
          <div className="page-intro page-intro-centered player-intro">
            <div className="player-brand-lockup">
              <BrandMark variant="udaan" compact className="brand-mark-player" />
              <div className={`connection-pill ${connectionState}`}>
                {isConnected ? "Connected" : isRecovering ? "Reconnecting..." : "Offline"}
              </div>
            </div>
          </div>
          <div className="status-pill player-device-pill">
            <span className="status-dot" />
            Player Device
          </div>
          <div className="player-team-name">{player.teamName}</div>
          <div className="player-scoreline">Current mark: {currentScore} pts</div>
          <div className="player-metrics">
            <div className="player-metric-card">
              <div className="value" style={{ color: "var(--amber)" }}>{currentScore}</div>
              <div className="label">Points</div>
            </div>
            <div className="player-metric-card">
              <div className="value" style={{ color: "var(--green)" }}>{currentWins}</div>
              <div className="label">Wins</div>
            </div>
          </div>
        </div>

        <div
          className="surface-card accent player-panel"
        >
          <div className={`timer-mini ${((isTimerActive && timeLeft <= 8) || isTimeUp) ? "alert" : ""} player-timer`}>
            <div style={{ textAlign: "center" }}>
              <div className="value">{Math.ceil(timeLeft)}</div>
              <div className="label">Seconds</div>
            </div>
          </div>

          <div className="player-phase-label">
            {isTimeUp ? "verbal answer round" : gameState.phase}
          </div>
          <div className="player-phase-copy">
            {isRecovering
              ? "Connection is recovering. Your session will resume automatically."
              : "Watch the main screen for the question. Use this device only for buzzing."}
          </div>

          {isTimeUp && (
            <div
              style={{
                marginBottom: "18px",
                padding: "16px 18px",
                borderRadius: "18px",
                background: "rgba(255, 107, 107, 0.14)",
                border: "1px solid rgba(255, 107, 107, 0.4)",
                color: "#ffd1d1",
              }}
            >
              <div className="timeup-icon" aria-hidden="true" style={{ marginBottom: "12px" }}>
                <div className="alarm-clock player-alarm-clock">
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
              <div style={{ fontSize: "24px", fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Time&apos;s Up
              </div>
              <div style={{ marginTop: "6px", fontSize: "14px", color: "var(--muted)" }}>
                Wait for the host to reveal the answer.
              </div>
            </div>
          )}

          <button
            onClick={handleBuzz}
            disabled={!canBuzz}
            className={`stage-cta ${canBuzz ? "live" : "muted"}`}
            style={{ minWidth: "100%" }}
          >
            {hasBuzzed ? "Buzzed" : !canBuzz ? "Locked" : (buzzing ? "Buzzing..." : "Buzz")}
          </button>
        </div>

        {notification && (
          <div
            className="notice-card"
            style={{
              background: notificationTone.bg,
              border: `1px solid ${notificationTone.border}`,
              color: notificationTone.text,
            }}
          >
            {notification.msg}
          </div>
        )}
        {isRecovering && (
          <div className="connection-overlay player">
            Reconnecting to the live quiz. No refresh needed.
          </div>
        )}
      </div>
    </div>
  );
}
