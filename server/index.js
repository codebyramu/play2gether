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

const rooms = {};

const INACTIVE_TIMEOUT = 60 * 60 * 1000; // 1 hour
setInterval(() => {
  const now = Date.now();
  for (const code in rooms) {
    if (now - rooms[code].lastActivity > INACTIVE_TIMEOUT) {
      io.to(code).emit('room_closed');
      delete rooms[code];
      console.log(`Room ${code} closed due to inactivity`);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// In-memory store
// rooms[code] = { displayId: socket.id, players: [{id, name, isHost, avatar}], gameState: 'LOBBY', gameId: null, lastActivity: Date.now() }

function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for(let i=0; i<4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Big Screen creates a room
  socket.on('create_room', (callback) => {
    let code = generateCode();
    while(rooms[code]) code = generateCode(); // ensure uniqueness
    
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
  });

  // Phone joins a room
  socket.on('join_room', ({ code, name, avatar }, callback) => {
    code = code.toUpperCase();
    if (!rooms[code]) {
      return callback({ success: false, error: 'Room not found' });
    }

    const room = rooms[code];
    room.lastActivity = Date.now();
    const playerName = name || 'Player';

    // Fix duplicate handling & race condition on double join
    let player = room.players.find(p => p.id === socket.id);
    if (!player && playerName !== 'Player') {
      player = room.players.find(p => p.name === playerName);
    }

    if (player) {
      player.id = socket.id;
      player.name = playerName;
      player.avatar = avatar;
    } else {
      const isHost = room.players.length === 0; // first player is host
      player = { id: socket.id, name: playerName, avatar, isHost };
      room.players.push(player);
    }

    socket.join(code);

    // Notify Big Screen and others
    io.to(code).emit('players_update', room.players);
    
    console.log(`${player.name} joined ${code}. Host: ${player.isHost}`);
    callback({ success: true, player, gameState: room.gameState, gameId: room.gameId });
  });

  // Host navigates game carousel
  socket.on('change_game', ({ code, dir }) => {
    if (rooms[code]) {
      rooms[code].lastActivity = Date.now();
      io.to(code).emit('game_changed', dir);
    }
  });

  // Host selects a game (legacy)
  socket.on('select_game', ({ code, gameId }) => {
    if (rooms[code]) {
      rooms[code].lastActivity = Date.now();
      rooms[code].gameId = gameId;
      io.to(code).emit('game_selected', gameId);
    }
  });

  // Host starts the game
  socket.on('start_game', ({ code }) => {
    if (rooms[code]) {
      rooms[code].lastActivity = Date.now();
      rooms[code].gameState = 'PLAYING';
      io.to(code).emit('game_started', rooms[code].gameId);
    }
  });

  // Phone sends controller input (forward to Big Screen)
  socket.on('controller_input', ({ code, action, state }) => {
    if (rooms[code]) {
      rooms[code].lastActivity = Date.now();
      // Forward to display only
      io.to(rooms[code].displayId).emit('player_input', {
        playerId: socket.id,
        action,
        state
      });
    }
  });

  socket.on('disconnect', () => {
    // Find and remove player from rooms
    for (const code in rooms) {
      const room = rooms[code];
      
      if (room.displayId === socket.id) {
        // Display disconnected, destroy room
        io.to(code).emit('room_closed');
        delete rooms[code];
        console.log(`Room ${code} closed because display disconnected`);
        continue;
      }

      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        const wasHost = room.players[playerIndex].isHost;
        room.players.splice(playerIndex, 1);
        
        // Reassign host if needed
        if (wasHost && room.players.length > 0) {
          room.players[0].isHost = true;
          io.to(room.players[0].id).emit('host_assigned');
        }

        io.to(code).emit('players_update', room.players);
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Socket.io server running on port ${PORT}`);
});
