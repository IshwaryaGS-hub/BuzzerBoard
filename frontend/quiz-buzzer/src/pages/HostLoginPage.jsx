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
    socket.connect();
    socket.emit("join-host", { password: adminPass });

    socket.once("joined-host", ({ success }) => {
      if (!success) {
        setError("Wrong password");
        setLoading(false);
        return;
      }

      sessionStorage.setItem("hostAuth", adminPass);
      navigateTo("/admin");
    });

    socket.once("error", ({ message }) => {
      setError(message);
      setLoading(false);
    });
  };

  return (
    <div className="quiz-shell quiz-stage-shell auth-shell">
      <div className="auth-card-wrap">
        <div style={{ marginBottom: "28px" }}>
          <button
            onClick={() => navigateTo("/")}
            style={{ background: "transparent", border: "none", color: "var(--muted)", letterSpacing: "0.08em" }}
          >
            BACK
          </button>
        </div>

        <div className="glass-panel auth-card">
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
        </div>
      </div>
    </div>
  );
}
