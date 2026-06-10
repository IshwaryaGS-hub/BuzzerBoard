const express = require("express");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const cors = require("cors");
const QUESTIONS = require("./data/questions");

const FIXED_TEAMS = [
  { id: "t1", name: "APAR SHAKTI", password: "shakti2026" },
  { id: "t2", name: "APAR ANUSHAKTI", password: "anushakti2026" },
  { id: "t3", name: "APAT FIRE PROTEKT", password: "firepro2026" },
  { id: "t4", name: "APAR GREEN WIRE", password: "greenwire2026" },
  { id: "t5", name: "APAR ALUM ANUSHAKTI", password: "alumanu2026" },
  { id: "t6", name: "APAR FLEXIBLE", password: "flexible2026" },
  { id: "t7", name: "APAR E- BEAM", password: "ebeam2026" },
  { id: "t8", name: "APAR RUBBER", password: "rubber2026" },
];

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "storage");
const LEGACY_SETTINGS_PATH = path.join(__dirname, "data", "settings.json");
const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");
const IDLE_GAME_RESET_MS = Number(process.env.IDLE_GAME_RESET_MS) || 5000;
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
let idleResetTimeout = null;
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
    answerRevealed: false,
    timerStartedAt: null,
    timeLimit: 20,
    buzzerLocked: true,
    buzzedBy: null,
    scores: {},
    playerStats: {},
    buzzerHistory: [],
    rejectedBuzzIds: [],
    activeBuzzIndex: null,
    questionResults: [],
    nextBuzzId: 1,
  };
}

function createDefaultSettings() {
  return {
    hostPassword: process.env.HOST_PASSWORD || "apar2026",
    displayPassword: process.env.DISPLAY_PASSWORD || "screen2026",
    teams: FIXED_TEAMS.map((team) => ({ ...team })),
  };
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function sanitizeTeams(teams) {
  const providedById = new Map(
    Array.isArray(teams)
      ? teams
          .map((team) => ({
            id: `${team?.id || ""}`.trim().toLowerCase(),
            name: `${team?.name || ""}`.trim(),
            password: `${team?.password || ""}`.trim(),
          }))
          .filter((team) => team.id)
      : []
  );

  return FIXED_TEAMS.map((team, index) => {
    const provided =
      providedById.get(team.id) ||
      (Array.isArray(teams) && teams[index]
        ? {
            name: `${teams[index]?.name || ""}`.trim(),
            password: `${teams[index]?.password || ""}`.trim(),
          }
        : null);

    return {
      id: team.id,
      name: provided?.name || team.name,
      password: provided?.password || team.password,
    };
  });
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
    teams: settings.teams.map(({ id, name }) => ({ id, name })),
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

function getActivePlayerForTeam(teamId, exceptSocketId = null) {
  return (
    Object.entries(connectedUsers).find(([socketId, user]) => {
      if (socketId === exceptSocketId) return false;
      return user?.role === "player" && user.teamId === teamId;
    }) || null
  );
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
    gameState.scores[team.id].members = (gameState.scores[team.id].members || []).map((member) => ({
      ...member,
      name: team.name,
    }));
  });

  Object.keys(gameState.playerStats).forEach((playerKey) => {
    if (!allowedTeamIds.has(gameState.playerStats[playerKey].teamId)) {
      delete gameState.playerStats[playerKey];
      return;
    }

    const team = getTeamById(gameState.playerStats[playerKey].teamId);
    if (team) {
      gameState.playerStats[playerKey].teamName = team.name;
      gameState.playerStats[playerKey].memberName = team.name;
    }
  });

  Object.values(connectedUsers).forEach((user) => {
    if (user?.role !== "player" || !user.teamId) return;
    const team = getTeamById(user.teamId);
    if (!team) return;

    user.teamName = team.name;
    user.memberName = team.name;
  });

  gameState.buzzerHistory = gameState.buzzerHistory.map((entry) => {
    const team = getTeamById(entry.teamId);
    if (!team) return entry;

    return {
      ...entry,
      teamName: team.name,
      memberName: team.name,
    };
  });

  if (gameState.buzzedBy?.teamId) {
    const team = getTeamById(gameState.buzzedBy.teamId);
    if (team) {
      gameState.buzzedBy = {
        ...gameState.buzzedBy,
        teamName: team.name,
        memberName: team.name,
      };
    }
  }
}

function resetGamePreservingKnownTeams() {
  clearInterval(timerInterval);
  timerInterval = null;
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

function clearIdleReset() {
  if (!idleResetTimeout) return;
  clearTimeout(idleResetTimeout);
  idleResetTimeout = null;
}

function scheduleIdleReset() {
  clearIdleReset();

  idleResetTimeout = setTimeout(() => {
    idleResetTimeout = null;

    if (Object.keys(connectedUsers).length > 0) {
      return;
    }

    resetGamePreservingKnownTeams();
    console.log(`Game reset after ${IDLE_GAME_RESET_MS}ms of inactivity.`);
  }, IDLE_GAME_RESET_MS);
}

function getCurrentQuestionResult() {
  if (!gameState.currentQuestion) return null;

  return (
    [...gameState.questionResults]
      .reverse()
      .find((result) => result.question === gameState.currentQuestion.text) || null
  );
}

function getCurrentActiveBuzz() {
  if (
    typeof gameState.activeBuzzIndex !== "number" ||
    gameState.activeBuzzIndex < 0 ||
    gameState.activeBuzzIndex >= gameState.buzzerHistory.length
  ) {
    return null;
  }

  return gameState.buzzerHistory[gameState.activeBuzzIndex] || null;
}

function getQuestionPoints(question) {
  if (!question) return 10;
  return Number.isFinite(question.points) ? question.points : 10;
}

function isScoredQuestion(question) {
  return getQuestionPoints(question) > 0;
}

function getQuestionPenalty(question) {
  return isScoredQuestion(question) ? 10 : 0;
}

function buildQuestionResult(question, overrides = {}) {
  return {
    questionId: question?.id ?? null,
    question: question?.text ?? null,
    category: question?.category ?? null,
    roundName: question?.roundName ?? null,
    isSample: Boolean(question?.isSample),
    dashboardAfter: Boolean(question?.dashboardAfter),
    dashboardTitle: question?.dashboardTitle || null,
    dashboardSubtitle: question?.dashboardSubtitle || null,
    awardedPoints: getQuestionPoints(question),
    ...overrides,
  };
}

function broadcastState() {
  io.to("host").emit("game-state", {
    ...gameState,
    activeBuzz: getCurrentActiveBuzz(),
    totalQuestions: QUESTIONS.length,
  });
  io.to("host").emit("quiz-config", getAdminConfig());

  io.to("spectators").emit("game-state", {
    ...gameState,
    activeBuzz: getCurrentActiveBuzz(),
    totalQuestions: QUESTIONS.length,
  });

  io.to("players").emit("game-state", {
    phase: gameState.phase,
    currentQuestion:
      !gameState.answerRevealed
        ? gameState.currentQuestion
          ? {
              id: gameState.currentQuestion.id,
              text: gameState.currentQuestion.text,
              options: gameState.currentQuestion.options,
              category: gameState.currentQuestion.category,
              timeLimit: gameState.timeLimit,
            }
          : null
        : gameState.currentQuestion,
    timerStartedAt: gameState.timerStartedAt,
    timeLimit: gameState.timeLimit,
    buzzerLocked: gameState.buzzerLocked,
    buzzedBy: gameState.buzzedBy,
    buzzerHistory: gameState.buzzerHistory,
    rejectedBuzzIds: gameState.rejectedBuzzIds,
    activeBuzzIndex: gameState.activeBuzzIndex,
    activeBuzz: getCurrentActiveBuzz(),
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
    timerInterval = null;
    if (gameState.phase === "question" || gameState.phase === "buzzed") {
      gameState.buzzerLocked = true;
      gameState.phase = "timeup";
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
  const sampleCount = QUESTIONS.filter((question) => question.isSample).length;
  const scoredCount = QUESTIONS.length - sampleCount;
  const rounds = [...new Set(QUESTIONS.filter((question) => !question.isSample).map((question) => question.roundName || question.category))];

  res.json({
    count: QUESTIONS.length,
    totalCount: QUESTIONS.length,
    sampleCount,
    scoredCount,
    roundCount: rounds.length,
  });
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
  clearIdleReset();

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

  socket.on("join-player", ({ teamId, teamPassword }) => {
    const team = getTeamById(teamId);
    const normalizedPassword = `${teamPassword || ""}`.trim();
    const playerLabel = team?.name || "";

    if (!team || !normalizedPassword) {
      socket.emit("error", { message: "Select a valid team and enter the team password" });
      return;
    }

    if (normalizedPassword !== team.password) {
      socket.emit("error", { message: "Invalid team password" });
      return;
    }

    if (getActivePlayerForTeam(team.id, socket.id)) {
      socket.emit("error", { message: "This team login is already in use. Only one player can join per team." });
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
      memberName: playerLabel,
      role: "player",
    };

    ensureTeamScore(team.id, team.name);
    ensurePlayerStats(team.id, team.name, playerLabel);
    const scoreRow = gameState.scores[team.id];
    if (!scoreRow.members.find((member) => member.name === playerLabel)) {
      scoreRow.members.push({ name: playerLabel, socketId: socket.id });
    }

    socket.emit("joined-player", {
      success: true,
      teamId: team.id,
      teamName: team.name,
      memberName: playerLabel,
      teamPassword: team.password,
    });
    broadcastState();
    console.log(`${playerLabel} joined`);
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
    timerInterval = null;

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
    gameState.answerRevealed = false;
    gameState.timerStartedAt = null;
    gameState.timeLimit = question.timeLimit || 20;
    gameState.buzzerHistory = [];
    gameState.rejectedBuzzIds = [];
    gameState.activeBuzzIndex = null;
    gameState.nextBuzzId = 1;
    broadcastState();
  });

  socket.on("host-unlock-buzzers", () => {
    if (connectedUsers[socket.id]?.role !== "host") return;
    if (!gameState.currentQuestion || gameState.phase !== "question") return;
    gameState.buzzerLocked = false;
    startTimer();
    broadcastState();
    io.emit("buzzers-unlocked");
  });

  socket.on("host-lock-buzzers", () => {
    if (connectedUsers[socket.id]?.role !== "host") return;
    if (!gameState.currentQuestion || gameState.phase !== "question") return;
    clearInterval(timerInterval);
    timerInterval = null;
    gameState.buzzerLocked = true;
    if (gameState.buzzerHistory.length > 0) {
      gameState.phase = "buzzed";
    }
    broadcastState();
  });

  socket.on("host-reveal-answer", () => {
    if (connectedUsers[socket.id]?.role !== "host") return;
    clearInterval(timerInterval);
    timerInterval = null;
    gameState.answerRevealed = true;
    broadcastState();
  });

  socket.on("host-mark-correct", ({ teamId, buzzerId }) => {
    if (connectedUsers[socket.id]?.role !== "host") return;
    if (!gameState.currentQuestion) return;
    if (!gameState.buzzerHistory.length) return;

    const activeBuzz = getCurrentActiveBuzz();
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

    if (!activeBuzz || winningBuzz.id !== activeBuzz.id) {
      socket.emit("error", { message: "Only the current active buzzer can be marked right." });
      return;
    }

    if (existingResult) {
      socket.emit("error", { message: "This round has already been marked." });
      return;
    }

    clearInterval(timerInterval);
    timerInterval = null;
    const awardedPoints = getQuestionPoints(gameState.currentQuestion);
    const playerStat = ensurePlayerStats(
      winningBuzz.teamId,
      winningBuzz.teamName,
      winningBuzz.memberName
    );

    if (isScoredQuestion(gameState.currentQuestion)) {
      teamScore.score += awardedPoints;
      teamScore.correctAnswers = (teamScore.correctAnswers || 0) + 1;
      playerStat.wins += 1;
      playerStat.awardedPoints += awardedPoints;
    }

    gameState.phase = "answer";
    gameState.buzzerLocked = true;
    gameState.activeBuzzIndex = null;
    gameState.questionResults.push({
      ...buildQuestionResult(gameState.currentQuestion, {
        winner: teamScore.teamName,
        winnerPlayer: winningBuzz?.memberName || null,
        winningTimeMs: winningBuzz?.timeMs || null,
        correct: true,
        awardedPoints,
      }),
    });

    broadcastState();
    io.emit("answer-correct", {
      teamId: resolvedTeamId,
      teamName: teamScore.teamName,
      memberName: winningBuzz?.memberName || null,
      timeMs: winningBuzz?.timeMs || null,
    });
  });

  socket.on("host-mark-wrong", ({ teamId, buzzerId }) => {
    if (connectedUsers[socket.id]?.role !== "host") return;
    if (!gameState.currentQuestion) return;
    if (!gameState.buzzerHistory.length) return;

    const activeBuzz = getCurrentActiveBuzz();
    const targetBuzz =
      gameState.buzzerHistory.find((entry) => entry.id === buzzerId) ||
      gameState.buzzerHistory.find((entry) => entry.teamId === teamId);
    const existingResult = getCurrentQuestionResult();

    if (!activeBuzz || !targetBuzz || targetBuzz.id !== activeBuzz.id) {
      socket.emit("error", { message: "Only the current active buzzer can be marked wrong." });
      return;
    }

    if (existingResult) {
      socket.emit("error", { message: "This round has already been marked." });
      return;
    }

    const penaltyPoints = getQuestionPenalty(gameState.currentQuestion);
    const penalizedTeam = targetBuzz?.teamId ? gameState.scores[targetBuzz.teamId] : null;
    const penalizedPlayer =
      targetBuzz?.teamId && targetBuzz?.teamName && targetBuzz?.memberName
        ? ensurePlayerStats(targetBuzz.teamId, targetBuzz.teamName, targetBuzz.memberName)
        : null;

    if (penaltyPoints > 0 && penalizedTeam) {
      penalizedTeam.score -= penaltyPoints;
      if (penalizedPlayer) {
        penalizedPlayer.awardedPoints -= penaltyPoints;
      }
    }

    if (!gameState.rejectedBuzzIds.includes(targetBuzz.id)) {
      gameState.rejectedBuzzIds.push(targetBuzz.id);
    }

    const nextIndex = gameState.buzzerHistory.findIndex((entry) => !gameState.rejectedBuzzIds.includes(entry.id));

    if (nextIndex >= 0) {
      gameState.buzzerLocked = true;
      gameState.phase = "buzzed";
      gameState.activeBuzzIndex = nextIndex;
      broadcastState();
      io.emit("answer-wrong", { teamId: targetBuzz.teamId, buzzerId: targetBuzz.id, hasNext: true });
      return;
    }

    const remainingEligibleTeams = settings.teams.filter(
      (team) => !gameState.buzzerHistory.some((entry) => entry.teamId === team.id)
    );

    if (remainingEligibleTeams.length > 0) {
      gameState.phase = "question";
      gameState.buzzerLocked = false;
      gameState.activeBuzzIndex = null;
      gameState.buzzedBy = null;
      startTimer();
      broadcastState();
      io.emit("buzzers-unlocked");
      io.emit("answer-wrong", { teamId: targetBuzz.teamId, buzzerId: targetBuzz.id, hasNext: true });
      return;
    }

    clearInterval(timerInterval);
    timerInterval = null;
    gameState.buzzerLocked = true;
    gameState.phase = "answer";
    gameState.activeBuzzIndex = null;
    gameState.questionResults.push(
      buildQuestionResult(gameState.currentQuestion, {
        winner: null,
        winnerPlayer: null,
        winningTimeMs: null,
        correct: false,
        awardedPoints: -penaltyPoints,
      })
    );
    broadcastState();
    io.emit("answer-wrong", { teamId: targetBuzz.teamId, buzzerId: targetBuzz.id, hasNext: false });
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
    if (gameState.activeBuzzIndex === null) {
      gameState.activeBuzzIndex = 0;
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
    if (Object.keys(connectedUsers).length === 0) {
      scheduleIdleReset();
    }
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
