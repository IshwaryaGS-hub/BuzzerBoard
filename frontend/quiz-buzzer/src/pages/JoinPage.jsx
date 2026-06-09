import { useEffect, useState } from "react";
import { socket } from "../socket";
import PlayInstructions from "../components/PlayInstructions";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4001";

export default function JoinPage() {
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [teamPassword, setTeamPassword] = useState("");
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
    if (!selectedTeam || !teamPassword.trim()) {
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
      teamPassword: teamPassword.trim(),
    });

    socket.once("joined-player", ({ success, teamId, teamName, memberName, teamPassword: confirmedPassword }) => {
      if (!success) return;

      sessionStorage.setItem(
        "player",
        JSON.stringify({
          teamId,
          teamName,
          memberName,
          teamPassword: confirmedPassword || teamPassword.trim(),
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
            className="auth-back-button"
          >
            <span>{"<"}</span>
            <span>Back</span>
          </button>
        </div>

        <div className="join-layout">
          <PlayInstructions
            compact
            title="Read This Before Joining"
            subtitle="Teams can review the buzzer flow first, then use the join panel to enter the quiz."
          />

          <div className="glass-panel auth-card">
            <div className="auth-badge-row">
              <div className="auth-chip">8 Teams</div>
              <div className="auth-chip">Secure Join</div>
              <div className="auth-chip">Fast Buzzer</div>
            </div>
            <div style={{ color: "var(--amber)", letterSpacing: "0.26em", textTransform: "uppercase", marginBottom: "12px" }}>
              Player Join
            </div>
            <h1 className="auth-title">Enter the game floor</h1>
            <p className="auth-copy">
              Select the team and enter the password given for that team.
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
              <input
                type="password"
                placeholder="Team Password"
                value={teamPassword}
                onChange={(event) => setTeamPassword(event.target.value)}
                className="auth-input"
              />
              <button
                type="submit"
                disabled={loading || loadingTeams}
                className="auth-submit"
              >
                {loading ? "Joining..." : "Join Quiz"}
              </button>
            </form>

            <div className="auth-note">
              Use the team password provided by the organizer. The quiz screen and answer reveal will stay on the main display.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
