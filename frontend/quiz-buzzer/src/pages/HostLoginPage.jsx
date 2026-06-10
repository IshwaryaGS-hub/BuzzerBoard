import { useState } from "react";
import { socket } from "../socket";

export default function HostLoginPage() {
  const [adminPass, setAdminPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigateTo = (path) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new Event("quiz:navigate"));
  };

  const handleAdminJoin = () => {
    setLoading(true);
    setError("");
    const onJoinedHost = ({ success }) => {
      if (!success) {
        setError("Wrong password");
        setLoading(false);
        return;
      }

      sessionStorage.setItem("hostAuth", adminPass);
      cleanup();
      navigateTo("/admin");
    };
    const onError = ({ message }) => {
      setError(message);
      setLoading(false);
      cleanup();
    };
    const cleanup = () => {
      socket.off("joined-host", onJoinedHost);
      socket.off("error", onError);
    };

    cleanup();
    socket.on("joined-host", onJoinedHost);
    socket.on("error", onError);
    if (!socket.connected) socket.connect();
    socket.emit("join-host", { password: adminPass });
  };

  return (
    <div className="quiz-shell quiz-stage-shell auth-shell">
      <div className="auth-card-wrap">
        <div style={{ marginBottom: "28px" }}>
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
            <div className="auth-chip">Round Control</div>
            <div className="auth-chip">Team Setup</div>
            <div className="auth-chip">Live Scoring</div>
          </div>
          <div style={{ color: "var(--amber)", letterSpacing: "0.26em", textTransform: "uppercase", marginBottom: "12px" }}>
            Host Login
          </div>
          <h1 className="auth-title">Open control room</h1>
          <p className="auth-copy">
            Sign in with the host password to manage teams, rounds, and the live buzzer board.
          </p>

          {error && (
            <div className="auth-error">
              {error}
            </div>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleAdminJoin();
            }}
          >
            <input
              type="password"
              placeholder="Host Password"
              value={adminPass}
              onChange={(event) => setAdminPass(event.target.value)}
              className="auth-input"
            />
            <button
              type="submit"
              disabled={loading}
              className="auth-submit"
            >
              {loading ? "Entering..." : "Enter Host Mode"}
            </button>
          </form>

          <div className="auth-note">
            Host mode unlocks quiz setup, buzzer control, answer reveal, and the main scoreboard flow for the event.
          </div>
        </div>
      </div>
    </div>
  );
}
