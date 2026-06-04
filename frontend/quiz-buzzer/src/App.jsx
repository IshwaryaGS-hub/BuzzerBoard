import { useEffect, useState } from "react";
import HomePage from "./pages/HomePage";
import JoinPage from "./pages/JoinPage";
import HostLoginPage from "./pages/HostLoginPage";
import FrontScreenLoginPage from "./pages/FrontScreenLoginPage";
import PlayerPage from "./pages/PlayerPage";
import AdminPage from "./pages/AdminPage";
import LeaderboardPage from "./pages/LeaderboardPage";

export default function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const updatePath = () => setPath(window.location.pathname);

    window.addEventListener("popstate", updatePath);
    window.addEventListener("quiz:navigate", updatePath);

    return () => {
      window.removeEventListener("popstate", updatePath);
      window.removeEventListener("quiz:navigate", updatePath);
    };
  }, []);

  if (path === "/join") return <JoinPage />;
  if (path === "/host-login") return <HostLoginPage />;
  if (path === "/screen-login") return <FrontScreenLoginPage />;
  if (path === "/play") return <PlayerPage />;
  if (path === "/admin") return <AdminPage />;
  if (path === "/leaderboard") return <LeaderboardPage />;
  return <HomePage />;
}
