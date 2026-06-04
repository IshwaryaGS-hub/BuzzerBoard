import { useEffect, useState } from "react";
import { socket } from "../socket";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4001";

export default function JoinPage() {
  const [teams, setTeams] = useState([]);
  const [memberName, setMemberName] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(true);

  useEffect(() => {
    let ignore = false;

    fetch(`${API_BASE_URL}/api/config`)
      .then((response) => response.json())
      .then((data) => {
        if (ignore) return;
        setTeams(Array.isArray(data.teams) ? data.teams : []);
      })
      .catch(() => {
        if (ignore) return;
        setError("Could not load quiz settings. Make sure the backend is running.");
      })
      .finally(() => {
        if (!ignore) setLoadingTeams(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const navigateTo = (path) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new Event("quiz:navigate"));
  };

  const handleJoin = () => {
    if (!memberName.trim() || !selectedTeam) {
      setError("Please fill in all fields");
      return;
    }

    const team = teams.find((entry) => entry.id === selectedTeam);
    if (!team) {
      setError("Please select a valid team");
      return;
    }

    setLoading(true);
    setError("");
    socket.connect();
    socket.emit("join-player", {
      teamId: team.id,
      memberName: memberName.trim(),
    });

    socket.once("joined-player", ({ success, teamId, teamName }) => {
      if (!success) return;

      sessionStorage.setItem(
        "player",
        JSON.stringify({
          teamId,
          teamName,
          memberName: memberName.trim(),
        })
      );
      navigateTo("/play");
    });

    socket.once("error", ({ message }) => {
      setError(message);
      setLoading(false);
    });
  };

  return (
    <div className="quiz-shell quiz-stage-shell auth-shell">
      <div className="auth-card-wrap auth-card-wrap-wide">
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
            Player Join
          </div>
          <h1 className="auth-title">Enter the game floor</h1>
          <p className="auth-copy">
            Pick your team, add your name, and wait for the host to start the round.
          </p>

          {error && (
            <div className="auth-error">
              {error}
            </div>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleJoin();
            }}
          >
            <input
              placeholder="Your Name"
              value={memberName}
              onChange={(event) => setMemberName(event.target.value)}
              className="auth-input"
            />
            <select
              value={selectedTeam}
              onChange={(event) => setSelectedTeam(event.target.value)}
              disabled={loadingTeams}
              className="auth-input auth-select"
            >
              <option value="">{loadingTeams ? "Loading teams..." : "Select your team..."}</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={loading || loadingTeams}
              className="auth-submit"
            >
              {loading ? "Joining..." : "Join Quiz"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
