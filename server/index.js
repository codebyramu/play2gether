const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// rooms[code] = {
//   displayId: socket.id,
//   players: [{ id, name, isHost, avatar, ready }],
//   gameState: 'LOBBY' | 'PLAYING',
//   gameId: null,
//   lastActivity: Date.now()
// }
const rooms = {};

const INACTIVE_TIMEOUT = 60 * 60 * 1000; // 1 hour
const MAX_CODE_ATTEMPTS = 100; // prevent infinite loop in generateCode

// Cleanup inactive rooms every 5 minutes
setInterval(() => {
  const now = Date.now();
  // Collect codes to delete first to avoid mutation-during-iteration issues
  const toDelete = [];
  for (const code in rooms) {
    if (now - rooms[code].lastActivity > INACTIVE_TIMEOUT) {
      toDelete.push(code);
    }
  }
  for (const code of toDelete) {
    try {
      io.to(code).emit('room_closed', { reason: 'inactivity' });
      // Force all sockets out of the socket.io room
      io.in(code).socketsLeave(code);
      delete rooms[code];
      console.log(`Room ${code} closed due to inactivity`);
    } catch (err) {
      console.error(`Error closing inactive room ${code}:`, err);
    }
  }
}, 5 * 60 * 1000);

/**
 * Generate a random 4-letter room code.
 * Returns null if no unique code can be found within MAX_CODE_ATTEMPTS.
 */
function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (!rooms[code]) return code;
  }
  return null; // all attempts exhausted
}

/**
 * Check whether all players in a room have ready === true.
 * Returns false for empty rooms.
 */
function allPlayersReady(room) {
  return room.players.length > 0 && room.players.every(p => p.ready === true);
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // ── Big Screen creates a room ────────────────────────────────────────────
  socket.on('create_room', (callback) => {
    try {
      if (typeof callback !== 'function') return;

      const code = generateCode();
      if (!code) {
        return callback({ success: false, error: 'Server full – no room codes available' });
      }

      rooms[code] = {
        displayId: socket.id,
        players: [],
        gameState: 'LOBBY',
        gameId: null,
        lastActivity: Date.now()
      };

      socket.join(code);
      console.log(`Room created: ${code}`);
      callback({ success: true, code });
    } catch (err) {
      console.error('create_room error:', err);
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Internal server error' });
      }
    }
  });

  // ── Phone joins a room ───────────────────────────────────────────────────
  socket.on('join_room', (payload, callback) => {
    const { code, name, avatar } = (payload && typeof payload === 'object') ? payload : {};
    try {
      if (typeof callback !== 'function') return;
      if (!code || typeof code !== 'string') {
        return callback({ success: false, error: 'Invalid room code' });
      }

      code = code.toUpperCase().trim();
      if (!rooms[code]) {
        return callback({ success: false, error: 'Room not found' });
      }

      const room = rooms[code];
      room.lastActivity = Date.now();

      // Block joining a game already in progress
      if (room.gameState === 'PLAYING') {
        return callback({ success: false, error: 'Game already in progress' });
      }

      const playerName = (name && typeof name === 'string' && name.trim()) ? name.trim() : 'Player';

      // Rejoin detection: match by socket id first, then by name
      let player = room.players.find(p => p.id === socket.id);
      if (!player) {
        player = room.players.find(p => p.name === playerName);
      }

      if (player) {
        // Reconnecting player – update socket id but preserve host status
        player.id = socket.id;
        player.avatar = avatar;
        player.ready = false; // reset ready on rejoin
      } else {
        const isHost = room.players.length === 0;
        player = { id: socket.id, name: playerName, avatar, isHost, ready: false };
        room.players.push(player);
      }

      socket.join(code);

      // Notify everyone in the room
      io.to(code).emit('players_update', room.players);

      console.log(`${player.name} joined ${code}. Host: ${player.isHost}`);
      callback({ success: true, player, gameState: room.gameState, gameId: room.gameId });
    } catch (err) {
      console.error('join_room error:', err);
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Internal server error' });
      }
    }
  });

  // ── Host navigates game carousel ─────────────────────────────────────────
  socket.on('change_game', ({ code, dir } = {}) => {
    try {
      if (!code || !rooms[code]) return;
      const room = rooms[code];
      const player = room.players.find(p => p.id === socket.id);
      if (!player || !player.isHost) return; // host-only
      room.lastActivity = Date.now();
      io.to(code).emit('game_changed', dir);
    } catch (err) {
      console.error('change_game error:', err);
    }
  });

  // ── Host selects a game ───────────────────────────────────────────────────
  socket.on('select_game', ({ code, gameId } = {}) => {
    try {
      if (!code || !rooms[code]) return;
      const room = rooms[code];
      const player = room.players.find(p => p.id === socket.id);
      if (!player || !player.isHost) return; // host-only
      room.lastActivity = Date.now();
      room.gameId = gameId;
      io.to(code).emit('game_selected', gameId);
    } catch (err) {
      console.error('select_game error:', err);
    }
  });

  // ── Host confirms game selection; resets all ready states ────────────────
  socket.on('confirm_game', ({ code, gameId } = {}, callback) => {
    try {
      if (!code || !rooms[code]) {
        if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
        return;
      }
      const room = rooms[code];
      const player = room.players.find(p => p.id === socket.id);
      if (!player || !player.isHost) {
        if (typeof callback === 'function') callback({ success: false, error: 'Not the host' });
        return;
      }
      room.lastActivity = Date.now();
      if (gameId !== undefined) room.gameId = gameId;

      // Reset every player's ready state and return room to LOBBY for the new game
      room.players.forEach(p => { p.ready = false; });
      room.gameState = 'LOBBY';

      io.to(code).emit('game_confirmed', { gameId: room.gameId });
      io.to(code).emit('players_update', room.players);

      console.log(`Game confirmed in ${code}: ${room.gameId}`);
      if (typeof callback === 'function') callback({ success: true, gameId: room.gameId });
    } catch (err) {
      console.error('confirm_game error:', err);
      if (typeof callback === 'function') callback({ success: false, error: 'Internal server error' });
    }
  });

  // ── Player signals they are ready ────────────────────────────────────────
  socket.on('player_ready', ({ code } = {}, callback) => {
    try {
      if (!code || !rooms[code]) {
        if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
        return;
      }
      const room = rooms[code];
      const player = room.players.find(p => p.id === socket.id);
      if (!player) {
        if (typeof callback === 'function') callback({ success: false, error: 'Player not in room' });
        return;
      }
      room.lastActivity = Date.now();
      player.ready = true;

      io.to(code).emit('players_update', room.players);

      if (allPlayersReady(room)) {
        io.to(code).emit('all_ready', { gameId: room.gameId });
        console.log(`All players ready in ${code}`);
      }

      if (typeof callback === 'function') callback({ success: true, ready: player.ready });
    } catch (err) {
      console.error('player_ready error:', err);
      if (typeof callback === 'function') callback({ success: false, error: 'Internal server error' });
    }
  });

  // ── Host starts the game (requires all players ready) ────────────────────
  socket.on('start_game', ({ code } = {}, callback) => {
    try {
      if (!code || !rooms[code]) {
        if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
        return;
      }
      const room = rooms[code];
      const player = room.players.find(p => p.id === socket.id);
      if (!player || !player.isHost) {
        if (typeof callback === 'function') callback({ success: false, error: 'Not the host' });
        return;
      }
      if (!allPlayersReady(room)) {
        if (typeof callback === 'function') callback({ success: false, error: 'Not all players are ready' });
        return;
      }
      room.lastActivity = Date.now();
      room.gameState = 'PLAYING';
      io.to(code).emit('game_started', room.gameId);

      console.log(`Game started in ${code}: ${room.gameId}`);
      if (typeof callback === 'function') callback({ success: true });
    } catch (err) {
      console.error('start_game error:', err);
      if (typeof callback === 'function') callback({ success: false, error: 'Internal server error' });
    }
  });

  // ── Phone sends controller input → Big Screen ────────────────────────────
  socket.on('controller_input', ({ code, action, state } = {}) => {
    try {
      if (!code || !rooms[code]) return;
      const room = rooms[code];
      if (!room.displayId) return;
      room.lastActivity = Date.now();
      // Forward only to the Big Screen display socket
      io.to(room.displayId).emit('player_input', {
        playerId: socket.id,
        action,
        state
      });
    } catch (err) {
      console.error('controller_input error:', err);
    }
  });

  // ── Disconnect cleanup ────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    try {
      console.log('User disconnected:', socket.id);
      const codesToDelete = [];

      for (const code in rooms) {
        const room = rooms[code];

        if (room.displayId === socket.id) {
          // Big Screen disconnected – destroy room
          codesToDelete.push(code);
          continue;
        }

        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex === -1) continue;

        const wasHost = room.players[playerIndex].isHost;
        const playerName = room.players[playerIndex].name;
        room.players.splice(playerIndex, 1);

        // Reassign host if the host left and others remain
        if (wasHost && room.players.length > 0) {
          room.players[0].isHost = true;
          io.to(room.players[0].id).emit('host_assigned');
        }

        // Notify remaining players; room stays alive as long as display is connected
        io.to(code).emit('players_update', room.players);
        console.log(`${playerName} left ${code}. Players remaining: ${room.players.length}`);
      }

      // Delete rooms outside the loop to avoid mutation-during-iteration
      for (const code of codesToDelete) {
        if (rooms[code]) {
          io.to(code).emit('room_closed', { reason: 'display_disconnected' });
          io.in(code).socketsLeave(code);
          delete rooms[code];
          console.log(`Room ${code} closed (display disconnected)`);
        }
      }
    } catch (err) {
      console.error('disconnect handler error:', err);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Socket.io server running on port ${PORT}`);
});
