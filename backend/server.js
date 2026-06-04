const express = require("express");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const cors = require("cors");
const QUESTIONS = require("./data/questions");

const DEFAULT_TEAMS = [
  { id: "t1", name: "Team Alpha" },
  { id: "t2", name: "Team Bravo" },
  { id: "t3", name: "Team Charlie" },
  { id: "t4", name: "Team Delta" },
  { id: "t5", name: "Team Echo" },
  { id: "t6", name: "Team Foxtrot" },
  { id: "t7", name: "Team Golf" },
  { id: "t8", name: "Team Hotel" },
  { id: "t9", name: "Team India" },
  { id: "t10", name: "Team Juliet" },
];

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "storage");
const LEGACY_SETTINGS_PATH = path.join(__dirname, "data", "settings.json");
const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");
loadEnvFile(path.join(__dirname, ".env"));

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

let settings = loadSettings();
let gameState = createInitialGameState();
let timerInterval = null;
let connectedUsers = {};
initializeScoresFromSettings();

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const envLines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  envLines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^"(.*)"$/, "$1");

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
}

function createInitialGameState() {
  return {
    phase: "lobby",
    currentQuestionIndex: -1,
    currentQuestion: null,
    timerStartedAt: null,
    timeLimit: 30,
    buzzerLocked: true,
    buzzedBy: null,
    scores: {},
    playerStats: {},
    buzzerHistory: [],
    questionResults: [],
    nextBuzzId: 1,
  };
}

function createDefaultSettings() {
  return {
    hostPassword: process.env.HOST_PASSWORD || "apar2026",
    displayPassword: process.env.DISPLAY_PASSWORD || "screen2026",
    teams: DEFAULT_TEAMS,
  };
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function sanitizeTeams(teams) {
  if (!Array.isArray(teams)) return DEFAULT_TEAMS;

  const seen = new Set();
  const sanitized = teams
    .map((team, index) => {
      const name = `${team?.name || ""}`.trim();
      if (!name) return null;

      const requestedId = `${team?.id || ""}`.trim();
      const fallbackId = `team_${index + 1}`;
      let id = (requestedId || fallbackId).replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
      if (!id) id = fallbackId;

      while (seen.has(id)) {
        id = `${id}_${index + 1}`;
      }

      seen.add(id);
      return { id, name };
    })
    .filter(Boolean);

  return sanitized.length > 0 ? sanitized : DEFAULT_TEAMS;
}

function loadSettings() {
  const defaults = createDefaultSettings();
  const sourcePath = fs.existsSync(SETTINGS_PATH)
    ? SETTINGS_PATH
    : fs.existsSync(LEGACY_SETTINGS_PATH)
      ? LEGACY_SETTINGS_PATH
      : null;

  if (!sourcePath) {
    return defaults;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
    return {
      hostPassword: `${raw.hostPassword || defaults.hostPassword}`.trim() || defaults.hostPassword,
      displayPassword: `${raw.displayPassword || defaults.displayPassword}`.trim() || defaults.displayPassword,
      teams: sanitizeTeams(raw.teams),
    };
  } catch (error) {
    console.error("Failed to read settings.json, falling back to defaults.", error);
    return defaults;
  }
}

function saveSettings(nextSettings) {
  settings = {
    hostPassword: `${nextSettings.hostPassword || settings.hostPassword}`.trim() || settings.hostPassword,
    displayPassword: `${nextSettings.displayPassword || settings.displayPassword}`.trim() || settings.displayPassword,
    teams: sanitizeTeams(nextSettings.teams),
  };

  ensureDataDir();
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function getPublicConfig() {
  return {
    teams: settings.teams,
    hostPasswordConfigured: Boolean(settings.hostPassword),
    displayPasswordConfigured: Boolean(settings.displayPassword),
  };
}

function getAdminConfig() {
  return {
    hostPassword: settings.hostPassword,
    displayPassword: settings.displayPassword,
    teams: settings.teams,
  };
}

function getCurrentHostPassword() {
  return settings.hostPassword || process.env.HOST_PASSWORD || "apar2026";
}

function getCurrentDisplayPassword() {
  return settings.displayPassword || process.env.DISPLAY_PASSWORD || "screen2026";
}

function getTeamById(teamId) {
  return settings.teams.find((team) => team.id === teamId) || null;
}

function ensureTeamScore(teamId, teamName) {
  if (!gameState.scores[teamId]) {
    gameState.scores[teamId] = {
      teamName,
      score: 0,
      members: [],
      correctAnswers: 0,
    };
    return;
  }

  gameState.scores[teamId].teamName = teamName;
}

function createPlayerStatKey(teamId, memberName) {
  return `${teamId}::${memberName.trim().toLowerCase()}`;
}

function ensurePlayerStats(teamId, teamName, memberName) {
  const key = createPlayerStatKey(teamId, memberName);
  if (!gameState.playerStats[key]) {
    gameState.playerStats[key] = {
      key,
      teamId,
      teamName,
      memberName,
      wins: 0,
      awardedPoints: 0,
      buzzCount: 0,
      fastestBuzzMs: null,
    };
    return gameState.playerStats[key];
  }

  gameState.playerStats[key].teamName = teamName;
  gameState.playerStats[key].memberName = memberName;
  return gameState.playerStats[key];
}

function initializeScoresFromSettings() {
  settings.teams.forEach((team) => {
    ensureTeamScore(team.id, team.name);
  });
}

function syncScoresWithTeams() {
  const allowedTeamIds = new Set(settings.teams.map((team) => team.id));
  Object.keys(gameState.scores).forEach((teamId) => {
    if (!allowedTeamIds.has(teamId)) {
      delete gameState.scores[teamId];
    }
  });

  settings.teams.forEach((team) => {
    ensureTeamScore(team.id, team.name);
    gameState.scores[team.id].teamName = team.name;
  });

  Object.keys(gameState.playerStats).forEach((playerKey) => {
    if (!allowedTeamIds.has(gameState.playerStats[playerKey].teamId)) {
      delete gameState.playerStats[playerKey];
    }
  });
}

function resetGamePreservingKnownTeams() {
  clearInterval(timerInterval);
  const nextScores = {};

  settings.teams.forEach((team) => {
    const existing = gameState.scores[team.id];
    nextScores[team.id] = {
      teamName: team.name,
      score: 0,
      correctAnswers: 0,
      members: existing?.members || [],
    };
  });

  gameState = {
    ...createInitialGameState(),
    scores: nextScores,
  };

  Object.values(connectedUsers)
    .filter((user) => user.role === "player")
    .forEach((user) => {
      ensurePlayerStats(user.teamId, user.teamName, user.memberName);
    });
}

function getCurrentQuestionResult() {
  if (!gameState.currentQuestion) return null;

  return (
    [...gameState.questionResults]
      .reverse()
      .find((result) => result.question === gameState.currentQuestion.text) || null
  );
}

function broadcastState() {
  io.to("host").emit("game-state", {
    ...gameState,
    totalQuestions: QUESTIONS.length,
  });
  io.to("host").emit("quiz-config", getAdminConfig());

  io.to("spectators").emit("game-state", {
    ...gameState,
    totalQuestions: QUESTIONS.length,
  });

  io.to("players").emit("game-state", {
    phase: gameState.phase,
    currentQuestion:
      gameState.phase !== "answer"
        ? gameState.currentQuestion
          ? {
              id: gameState.currentQuestion.id,
              text: gameState.currentQuestion.text,
              options: gameState.currentQuestion.options,
              category: gameState.currentQuestion.category,
              timeLimit: gameState.currentQuestion.timeLimit,
            }
          : null
        : gameState.currentQuestion,
    timerStartedAt: gameState.timerStartedAt,
    timeLimit: gameState.timeLimit,
    buzzerLocked: gameState.buzzerLocked,
    buzzedBy: gameState.buzzedBy,
    buzzerHistory: gameState.buzzerHistory,
    scores: gameState.scores,
    playerStats: gameState.playerStats,
    questionResults: gameState.questionResults,
    totalQuestions: QUESTIONS.length,
    currentQuestionIndex: gameState.currentQuestionIndex,
  });
}

function startTimer() {
  clearInterval(timerInterval);
  gameState.timerStartedAt = Date.now();

  timerInterval = setInterval(() => {
    const elapsed = (Date.now() - gameState.timerStartedAt) / 1000;
    if (elapsed < gameState.timeLimit) return;

    clearInterval(timerInterval);
    if (gameState.phase === "question" || gameState.phase === "buzzed") {
      gameState.buzzerLocked = true;
      gameState.phase = gameState.buzzerHistory.length > 0 ? "buzzed" : "answer";
      broadcastState();
      io.emit("times-up");
    }
  }, 500);
}

function requireHostPassword(req, res, next) {
  const password = req.header("x-host-password");
  if (password !== getCurrentHostPassword()) {
    res.status(401).json({ error: "Invalid host password" });
    return;
  }

  next();
}

app.get("/api/questions-count", (req, res) => {
  res.json({ count: QUESTIONS.length });
});

app.get("/api/config", (req, res) => {
  res.json(getPublicConfig());
});

app.get("/api/admin/config", requireHostPassword, (req, res) => {
  res.json(getAdminConfig());
});

app.post("/api/admin/config", requireHostPassword, (req, res) => {
  const hostPassword = `${req.body?.hostPassword || ""}`.trim();
  const displayPassword = `${req.body?.displayPassword || ""}`.trim();
  const teams = sanitizeTeams(req.body?.teams);

  if (!hostPassword) {
    res.status(400).json({ error: "Host password is required" });
    return;
  }

  if (!displayPassword) {
    res.status(400).json({ error: "Front screen password is required" });
    return;
  }

  saveSettings({ hostPassword, displayPassword, teams });
  syncScoresWithTeams();
  broadcastState();
  res.json(getAdminConfig());
});

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("join-host", ({ password }) => {
    if (password !== getCurrentHostPassword()) {
      socket.emit("error", { message: "Invalid host password" });
      return;
    }

    socket.join("host");
    connectedUsers[socket.id] = { role: "host" };
    socket.emit("joined-host", { success: true, config: getAdminConfig() });
    broadcastState();
  });

  socket.on("join-player", ({ teamId, memberName }) => {
    const team = getTeamById(teamId);
    const normalizedName = `${memberName || ""}`.trim();

    if (!team || !normalizedName) {
      socket.emit("error", { message: "Select a valid team and enter your name" });
      return;
    }

    socket.join("players");
    socket.join(`team-${team.id}`);

    const previousUser = connectedUsers[socket.id];
    if (previousUser?.role === "player" && previousUser.teamId && gameState.scores[previousUser.teamId]) {
      gameState.scores[previousUser.teamId].members = gameState.scores[previousUser.teamId].members.filter(
        (member) => member.socketId !== socket.id
      );
    }

    connectedUsers[socket.id] = {
      teamId: team.id,
      teamName: team.name,
      memberName: normalizedName,
      role: "player",
    };

    ensureTeamScore(team.id, team.name);
    ensurePlayerStats(team.id, team.name, normalizedName);
    const scoreRow = gameState.scores[team.id];
    if (!scoreRow.members.find((member) => member.name === normalizedName)) {
      scoreRow.members.push({ name: normalizedName, socketId: socket.id });
    }

    socket.emit("joined-player", {
      success: true,
      teamId: team.id,
      teamName: team.name,
      memberName: normalizedName,
    });
    broadcastState();
    console.log(`${normalizedName} (${team.name}) joined`);
  });

  socket.on("join-spectator", ({ password } = {}) => {
    if (password !== getCurrentDisplayPassword()) {
      socket.emit("error", { message: "Invalid front screen password" });
      return;
    }

    socket.join("spectators");
    connectedUsers[socket.id] = { role: "spectator" };
    socket.emit("joined-spectator", { success: true });
    socket.emit("game-state", {
      ...gameState,
      totalQuestions: QUESTIONS.length,
    });
  });

  socket.on("host-next-question", () => {
    if (connectedUsers[socket.id]?.role !== "host") return;
    clearInterval(timerInterval);

    const nextIndex = gameState.currentQuestionIndex + 1;
    if (nextIndex >= QUESTIONS.length) {
      gameState.phase = "finished";
      broadcastState();
      return;
    }

    const question = QUESTIONS[nextIndex];
    gameState.currentQuestionIndex = nextIndex;
    gameState.currentQuestion = question;
    gameState.phase = "question";
    gameState.buzzerLocked = true;
    gameState.buzzedBy = null;
    gameState.timerStartedAt = null;
    gameState.timeLimit = question.timeLimit;
    gameState.buzzerHistory = [];
    gameState.nextBuzzId = 1;
    broadcastState();
  });

  socket.on("host-unlock-buzzers", () => {
    if (connectedUsers[socket.id]?.role !== "host") return;
    gameState.buzzerLocked = false;
    startTimer();
    broadcastState();
    io.emit("buzzers-unlocked");
  });

  socket.on("host-lock-buzzers", () => {
    if (connectedUsers[socket.id]?.role !== "host") return;
    clearInterval(timerInterval);
    gameState.buzzerLocked = true;
    broadcastState();
  });

  socket.on("host-reveal-answer", () => {
    if (connectedUsers[socket.id]?.role !== "host") return;
    clearInterval(timerInterval);
    gameState.phase = "answer";
    gameState.buzzerLocked = true;
    broadcastState();
  });

  socket.on("host-mark-correct", ({ teamId, buzzerId }) => {
    if (connectedUsers[socket.id]?.role !== "host") return;
    if (!gameState.currentQuestion) return;

    const winningBuzz =
      gameState.buzzerHistory.find((entry) => entry.id === buzzerId) ||
      gameState.buzzerHistory.find((entry) => entry.teamId === teamId);
    const resolvedTeamId = winningBuzz?.teamId || teamId;
    const teamScore = resolvedTeamId ? gameState.scores[resolvedTeamId] : null;
    const existingResult = getCurrentQuestionResult();

    if (!winningBuzz || !teamScore) {
      socket.emit("error", { message: "Could not award this round. No matching buzz record found." });
      return;
    }

    if (existingResult) {
      socket.emit("error", { message: "This round has already been marked." });
      return;
    }

    clearInterval(timerInterval);
    teamScore.score += 10;
    teamScore.correctAnswers = (teamScore.correctAnswers || 0) + 1;
    const playerStat = ensurePlayerStats(
      winningBuzz.teamId,
      winningBuzz.teamName,
      winningBuzz.memberName
    );
    playerStat.wins += 1;
    playerStat.awardedPoints += 10;

    gameState.phase = "answer";
    gameState.buzzerLocked = true;
    gameState.questionResults.push({
      question: gameState.currentQuestion?.text,
      winner: teamScore.teamName,
      winnerPlayer: winningBuzz?.memberName || null,
      winningTimeMs: winningBuzz?.timeMs || null,
      correct: true,
    });

    broadcastState();
    io.emit("answer-correct", {
      teamId: resolvedTeamId,
      teamName: teamScore.teamName,
      memberName: winningBuzz?.memberName || null,
      timeMs: winningBuzz?.timeMs || null,
    });
  });

  socket.on("host-mark-wrong", ({ teamId }) => {
    if (connectedUsers[socket.id]?.role !== "host") return;
    if (!gameState.currentQuestion) return;

    const existingResult = getCurrentQuestionResult();
    if (existingResult) {
      socket.emit("error", { message: "This round has already been marked." });
      return;
    }

    clearInterval(timerInterval);
    gameState.buzzerLocked = true;
    gameState.phase = "answer";
    gameState.questionResults.push({
      question: gameState.currentQuestion?.text,
      winner: null,
      winnerPlayer: null,
      winningTimeMs: null,
      correct: false,
    });
    broadcastState();
    io.emit("answer-wrong", { teamId });
  });

  socket.on("host-reset-game", () => {
    if (connectedUsers[socket.id]?.role !== "host") return;
    resetGamePreservingKnownTeams();
    broadcastState();
  });

  socket.on("player-buzz", () => {
    const user = connectedUsers[socket.id];
    if (!user || user.role !== "player") return;

    if (gameState.buzzerLocked) {
      socket.emit("buzz-rejected", { reason: "Buzzers are locked" });
      return;
    }

    if (gameState.phase !== "question") {
      socket.emit("buzz-rejected", { reason: "Not in question phase" });
      return;
    }

    const timeMs = gameState.timerStartedAt ? Date.now() - gameState.timerStartedAt : 0;
    const alreadyBuzzed = gameState.buzzerHistory.some(
      (entry) => entry.socketId === socket.id
    );
    if (alreadyBuzzed) {
      socket.emit("buzz-rejected", { reason: "You already buzzed for this question" });
      return;
    }

    const playerStat = ensurePlayerStats(user.teamId, user.teamName, user.memberName);
    playerStat.buzzCount += 1;
    playerStat.fastestBuzzMs =
      playerStat.fastestBuzzMs === null
        ? timeMs
        : Math.min(playerStat.fastestBuzzMs, timeMs);

    gameState.buzzerHistory.push({
      id: `buzz_${gameState.currentQuestionIndex + 1}_${gameState.nextBuzzId++}`,
      teamId: user.teamId,
      teamName: user.teamName,
      memberName: user.memberName,
      socketId: socket.id,
      timeMs,
    });
    gameState.buzzerHistory.sort((left, right) => left.timeMs - right.timeMs);
    gameState.buzzedBy = gameState.buzzerHistory[0] || null;

    if (gameState.buzzerHistory.length >= 3) {
      gameState.buzzerLocked = true;
      gameState.phase = "buzzed";
      clearInterval(timerInterval);
    }

    broadcastState();
    io.emit("buzzer-hit", {
      teamId: user.teamId,
      teamName: user.teamName,
      memberName: user.memberName,
      timeMs,
      rank: gameState.buzzerHistory.findIndex((entry) => entry.socketId === socket.id) + 1,
    });
    console.log(`BUZZ: ${user.memberName} (${user.teamName}) at ${timeMs}ms`);
  });

  socket.on("disconnect", () => {
    const user = connectedUsers[socket.id];
    if (user?.role === "player" && user.teamId) {
      const team = gameState.scores[user.teamId];
      if (team) {
        team.members = team.members.filter((member) => member.socketId !== socket.id);
      }
    }

    delete connectedUsers[socket.id];
    broadcastState();
    console.log("Disconnected:", socket.id);
  });
});

const PORT = Number(process.env.PORT) || 4001;

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use. Close the other process or run with a different PORT value.`
    );
    return;
  }

  console.error("Server failed to start:", error);
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
