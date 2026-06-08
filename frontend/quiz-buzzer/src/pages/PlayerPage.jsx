import { useState, useEffect, useCallback } from "react";
import { socket } from "../socket";

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

export default function PlayerPage() {
  const [gameState, setGameState] = useState(null);
  const [buzzing, setBuzzing] = useState(false);
  const [notification, setNotification] = useState(null);
  const [now, setNow] = useState(Date.now());
  const player = JSON.parse(sessionStorage.getItem("player") || "{}");

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

    if (!socket.connected) socket.connect();
    socket.emit("join-player", {
      teamId: player.teamId,
      teamPassword: player.teamPassword,
    });

    socket.on("game-state", setGameState);
    socket.on("joined-player", ({ success, teamId, teamName, memberName }) => {
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
    });
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
      showNotification("Time is up. Wait for the host.", "amber");
      setBuzzing(false);
      playTimesUpAlarm();
    });
    socket.on("error", ({ message }) => {
      if (message.includes("valid team") || message.includes("team password") || message.includes("already in use")) {
        sessionStorage.removeItem("player");
        navigateTo("/");
        return;
      }

      showNotification(message, "red");
    });

    return () => {
      socket.off("game-state");
      socket.off("joined-player");
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
    if (gameState?.phase !== "question" && gameState?.phase !== "buzzed" && gameState?.phase !== "timeup") return undefined;

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [gameState?.phase, gameState?.timerStartedAt]);

  const handleBuzz = useCallback(() => {
    if (buzzing || gameState?.buzzerLocked) return;
    setBuzzing(true);
    socket.emit("player-buzz");
  }, [buzzing, gameState?.buzzerLocked]);

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
  const timeElapsed = gameState.timerStartedAt
    ? Math.min((now - gameState.timerStartedAt) / 1000, gameState.timeLimit)
    : 0;
  const timeLeft = Math.max(0, gameState.timeLimit - timeElapsed);
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
    <div className="quiz-shell quiz-stage-shell" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "18px" }}>
      <div className="player-stack">
        <div
          className="glass-panel player-panel"
          style={{
            textAlign: "center",
          }}
        >
          <div className="status-pill" style={{ margin: "0 auto 14px", width: "fit-content" }}>
            <span className="status-dot" />
            Player Device
          </div>
          <div className="championship-eyebrow" style={{ marginBottom: "10px", letterSpacing: "0.24em" }}>Player Device</div>
          <div style={{ fontSize: "clamp(26px, 5vw, 40px)", fontWeight: 900 }}>{player.teamName}</div>
          <div style={{ color: "var(--muted)", marginTop: "4px", fontSize: "16px" }}>Current mark: {currentScore} pts</div>
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
          style={{
            textAlign: "center",
          }}
        >
          <div className={`timer-mini ${timeLeft <= 8 || isTimeUp ? "alert" : ""}`} style={{ margin: "0 auto 18px" }}>
            <div style={{ textAlign: "center" }}>
              <div className="value">{Math.ceil(timeLeft)}</div>
              <div className="label">Seconds</div>
            </div>
          </div>

          <div style={{ color: "var(--amber)", letterSpacing: "0.22em", textTransform: "uppercase", fontSize: "13px", marginBottom: "8px" }}>
            {isTimeUp ? "verbal answer round" : gameState.phase}
          </div>
          <div style={{ color: "var(--muted)", fontSize: "15px", marginBottom: "22px", lineHeight: 1.5 }}>
            Watch the main screen for the question. Use this device only for buzzing.
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
            disabled={gameState.buzzerLocked || hasBuzzed}
            className={`stage-cta ${gameState.buzzerLocked || hasBuzzed ? "muted" : "live"}`}
            style={{ minWidth: "100%" }}
          >
            {gameState.buzzerLocked ? (hasBuzzed ? "Buzzed" : "Locked") : (buzzing ? "Buzzing..." : "Buzz")}
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
      </div>
    </div>
  );
}
