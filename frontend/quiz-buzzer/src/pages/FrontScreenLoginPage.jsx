import { useState } from "react";
import { socket } from "../socket";

export default function FrontScreenLoginPage() {
  const [screenPass, setScreenPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigateTo = (path) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new Event("quiz:navigate"));
  };

  const handleScreenJoin = () => {
    setLoading(true);
    setError("");
    const onJoinedSpectator = ({ success }) => {
      if (!success) {
        setError("Wrong password");
        setLoading(false);
        return;
      }

      sessionStorage.setItem("frontScreenAuth", screenPass);
      cleanup();
      navigateTo("/leaderboard");
    };
    const onError = ({ message }) => {
      setError(message);
      setLoading(false);
      cleanup();
    };
    const cleanup = () => {
      socket.off("joined-spectator", onJoinedSpectator);
      socket.off("error", onError);
    };

    cleanup();
    socket.on("joined-spectator", onJoinedSpectator);
    socket.on("error", onError);
    if (!socket.connected) socket.connect();
    socket.emit("join-spectator", { password: screenPass });
  };

  return (
    <div className="quiz-shell quiz-stage-shell auth-shell">
      <div className="auth-card-wrap">
        <div style={{ marginBottom: "18px" }}>
          <button
            onClick={() => navigateTo("/")}
            className="auth-back-button"
          >
            <span>{"<"}</span>
            <span>Back</span>
          </button>
        </div>

        <div className="glass-panel auth-card">
          <div className="auth-badge-row">
            <div className="auth-chip">Projector View</div>
            <div className="auth-chip">Round Dashboard</div>
            <div className="auth-chip">Audience Ready</div>
          </div>
          <div style={{ color: "var(--amber)", letterSpacing: "0.26em", textTransform: "uppercase", marginBottom: "12px" }}>
            Front Screen Login
          </div>
          <h1 className="auth-title">Open projector display</h1>
          <p className="auth-copy">
            Enter the front screen password to show the live quiz board for the audience.
          </p>

          {error && (
            <div className="auth-error">
              {error}
            </div>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleScreenJoin();
            }}
          >
            <input
              type="password"
              placeholder="Front Screen Password"
              value={screenPass}
              onChange={(event) => setScreenPass(event.target.value)}
              className="auth-input"
            />
            <button
              type="submit"
              disabled={loading}
              className="auth-submit"
            >
              {loading ? "Opening..." : "Open Front Screen"}
            </button>
          </form>

          <div className="auth-note">
            This mode is designed for TVs and projectors, showing the live quiz board, timers, scoreboard breaks, and winner reveals.
          </div>
        </div>
      </div>
    </div>
  );
}
