# BuzzerBoard - Quiz Buzzer Game for APAAR SOLUTIONS

A real-time interactive quiz buzzer game application built with Node.js backend and React frontend. Perfect for team competitions, game shows, and interactive learning sessions.

## Features

### Core Functionality
- **Real-time Buzzer System**: Instant buzz-in detection with socket communication
- **Multi-role Support**: Admin, Host, and Player interfaces
- **Live Leaderboard**: Real-time score tracking and rankings
- **Question Management**: Dynamic question display and timing
- **Score Tracking**: Persistent scoring system with winner crowning
- **Responsive Design**: Works seamlessly on desktop and mobile devices

### UI Components
- Brand customization with team logos
- Crown badge for winners
- Timer ring for countdown display
- Player instruction guides
- Leaderboard with live updates
- Score dashboard for hosts/admins

## Project Structure

```
BuzzerBoard/
├── backend/              # Node.js Express server
│   ├── server.js        # Main server file with Socket.io
│   ├── package.json     # Backend dependencies
│   └── data/
│       ├── questions.js # Question database
│       └── settings.json # Game settings
│
└── frontend/            # React application
    └── quiz-buzzer/
        ├── src/
        │   ├── pages/              # Page components
        │   │   ├── AdminPage.jsx
        │   │   ├── HostLoginPage.jsx
        │   │   ├── PlayerPage.jsx
        │   │   ├── LeaderboardPage.jsx
        │   │   └── ...
        │   ├── components/         # Reusable components
        │   │   ├── BuzzerButton.jsx
        │   │   ├── ScoreBoard.jsx
        │   │   ├── TimerRing.jsx
        │   │   └── ...
        │   ├── hooks/
        │   │   └── useSocketConnection.js
        │   ├── utils/
        │   │   └── alarm.js
        │   └── socket.js           # Socket.io client config
        ├── package.json
        ├── vite.config.js
        └── index.html
```

## Prerequisites

- **Node.js** (v14 or higher)
- **npm** or **yarn**
- Modern web browser

## Installation

### Backend Setup

```bash
cd backend
npm install
```

### Frontend Setup

```bash
cd frontend/quiz-buzzer
npm install
```

## Running the Application

### Start Backend Server

```bash
cd backend
npm start
# Server runs on http://localhost:3000 (or configured port)
```

### Start Frontend Development Server

```bash
cd frontend/quiz-buzzer
npm run dev
# Frontend runs on http://localhost:5173 (default Vite port)
```

## Usage

### Admin Interface
- Access via `/admin` route
- Manage game settings and questions
- View live participant scores
- Control game flow and timers

### Host Interface
- Access via `/host` route
- Manage player connections
- Display leaderboard and questions
- Monitor real-time buzz-ins

### Player Interface
- Join game with room code
- Click buzzer button to participate
- View personal score and rankings
- Real-time feedback on buzz-in status

## Technology Stack

### Backend
- **Node.js** with Express
- **Socket.io** for real-time communication
- **JSON** for data storage

### Frontend
- **React** for UI components
- **Vite** for fast build tooling
- **Socket.io Client** for real-time connection
- **CSS3** for responsive styling

## Configuration

### Server Settings
Edit `backend/data/settings.json` to configure:
- Game timing and delays
- Question pool
- Player limits
- Scoring rules

### Frontend Environment
Configure API connection in `frontend/quiz-buzzer/src/socket.js`:
- Server URL
- Socket connection options

## Features in Detail

### Real-time Buzzer Detection
- Instant response to button clicks
- Prevention of multiple buzzes
- Fair queue management

### Leaderboard System
- Live score updates
- Player rankings
- Winner detection

### Responsive Timer
- Visual countdown ring
- Multi-device compatibility
- Synchronized across all clients

### Question Display
- Dynamic question loading
- Formatted display options
- Timer integration

## Recent Updates

- Removed APAR branding logos & updated team names
- Modified UI for better clarity
- Enhanced admin, organizer, and player header alignment
- Improved responsive design
- Fixed live buzzer recovery

## Troubleshooting

### Connection Issues
- Ensure backend server is running
- Check Socket.io port configuration
- Verify frontend is pointing to correct server URL

### Button Not Responding
- Check browser console for errors
- Verify Socket.io connection is active
- Try refreshing the page

### Score Not Updating
- Ensure all clients have active socket connections
- Check server logs for broadcast issues
- Verify data persistence settings

## Development

### Build for Production

**Backend:**
```bash
cd backend
npm run build  # if applicable
```

**Frontend:**
```bash
cd frontend/quiz-buzzer
npm run build
```

### Code Structure

- Components are modular and reusable
- Hooks manage socket connection state
- Socket.io for event-driven architecture
- CSS modules for styling isolation

----

**Happy Gaming! 🎉**
