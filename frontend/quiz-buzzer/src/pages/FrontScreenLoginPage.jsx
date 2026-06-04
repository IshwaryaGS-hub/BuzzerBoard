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
    socket.connect();
    socket.emit("join-spectator", { password: screenPass });

    socket.once("joined-spectator", ({ success }) => {
      if (!success) {
        setError("Wrong password");
        setLoading(false);
        return;
      }

      sessionStorage.setItem("frontScreenAuth", screenPass);
      navigateTo("/leaderboard");
    });

    socket.once("error", ({ message }) => {
      setError(message);
      setLoading(false);
    });
  };

  return (
    <div className="quiz-shell quiz-stage-shell auth-shell">
      <div className="auth-card-wrap">
        <div style={{ marginBottom: "18px" }}>
          <button
            onClick={() => navigateTo("/")}
            style={{ background: "transparent", border: "none", color: "var(--muted)", letterSpacing: "0.08em" }}
          >
            BACK
          </button>
        </div>

        <div className="glass-panel auth-card">
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
        </div>
      </div>
    </div>
  );
}
