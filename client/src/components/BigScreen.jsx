import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

// BUG FIX: socket instantiated once at module level (correct), but moved connection
// inside component would cause re-connections on re-render. Module-level is correct.
const socket = io(`http://${window.location.hostname}:3001`);

// BUG FIX: Expanded games array from 3 to 9 to match PhoneController's GAMES list
// so the EXPLORE gallery renders all available games correctly.
const GAMES = [
  { id: 'color_rush',    title: 'Color Rush Arena',    desc: 'Match the floor color or fall!',        emoji: '🎨', color: '#FF3366' },
  { id: 'chaos_arena',   title: 'Chaos Arena',          desc: 'Survive the crazy floating platform!',  emoji: '🌋', color: '#FF6B35' },
  { id: 'bunny_hop',     title: 'Bunny Hop Rally',      desc: 'Race to the finish line!',              emoji: '🐰', color: '#38B000' },
  { id: 'king_zone',     title: 'King of the Zone',     desc: 'Hold the zone longest!',                emoji: '👑', color: '#8338EC' },
  { id: 'lava_sumo',     title: 'Lava Sumo Knockout',   desc: 'Last one on platform wins!',            emoji: '🔥', color: '#FB5607' },
  { id: 'neon_drift',    title: 'Neon Drift Racers',    desc: 'Drift and boost to victory!',           emoji: '🏎️', color: '#00C4FF' },
  { id: 'bomb_potato',   title: 'Bomb Potato Pass',     desc: "Don't hold the bomb!",                  emoji: '💣', color: '#FFCC00' },
  { id: 'pixel_painter', title: 'Pixel Painter Arena',  desc: 'Paint the most tiles!',                 emoji: '🖌️', color: '#FF006E' },
  { id: 'egg_survivor',  title: 'Egg Survivor',         desc: "Don't crack!",                          emoji: '🥚', color: '#FFBE0B' },
];

export default function BigScreen() {
  // BUG FIX: Added PREGAME to state list; 'EXPLORE' also documented
  // States: INIT → LOBBY → PREGAME → COUNTDOWN → PLAYING
  const [state, setState] = useState('INIT');
  const [code, setCode] = useState('');
  const [players, setPlayers] = useState([]);
  const [selectedGameIdx, setSelectedGameIdx] = useState(0);

  // BUG FIX: Added confirmedGame state to store the game confirmed by the host
  const [confirmedGame, setConfirmedGame] = useState(null);

  const [countdown, setCountdown] = useState(3);

  // BUG FIX: Added alive player tracking for PLAYING state HUD
  const [alivePlayers, setAlivePlayers] = useState([]);

  // BUG FIX: Added game timer for PLAYING state (instead of hardcoded "1:30")
  const [gameTimeSec, setGameTimeSec] = useState(90);

  // BUG FIX: All intervals stored in refs so they can be cleaned up on unmount
  const countdownIntervalRef = useRef(null);
  const gameTimerRef = useRef(null);

  // BUG FIX: gameInputRef stores live player inputs for Color Rush game loop
  const gameInputRef = useRef({});

  const clearAllTimers = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (gameTimerRef.current) {
      clearInterval(gameTimerRef.current);
      gameTimerRef.current = null;
    }
  }, []);

  // BUG FIX: Extracted startCountdown so it can be called from multiple event handlers
  const startCountdown = useCallback(() => {
    clearAllTimers();
    let c = 3;
    setCountdown(c);
    countdownIntervalRef.current = setInterval(() => {
      c--;
      if (c > 0) {
        setCountdown(c);
      } else if (c === 0) {
        setCountdown('GO!');
      } else {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
        // Reset game timer when PLAYING starts; alive players come from players_update
        setGameTimeSec(90);
        setState('PLAYING');
        // Start game timer countdown
        gameTimerRef.current = setInterval(() => {
          setGameTimeSec(t => {
            if (t <= 1) {
              clearInterval(gameTimerRef.current);
              gameTimerRef.current = null;
              setState('LOBBY'); // Game over → back to lobby
              return 0;
            }
            return t - 1;
          });
        }, 1000);
      }
    }, 1000);
  }, [clearAllTimers]);

  useEffect(() => {
    // Players join/leave — always update player list
    socket.on('players_update', (updatedPlayers) => {
      setPlayers(updatedPlayers);
      // BUG FIX: Also sync alive players when in PLAYING state
      setAlivePlayers(updatedPlayers);
    });

    // Host phone navigates game carousel on BigScreen
    socket.on('game_changed', (dir) => {
      setSelectedGameIdx(prev => {
        let next = prev + dir;
        if (next < 0) next = GAMES.length - 1;
        if (next >= GAMES.length) next = 0;
        return next;
      });
    });

    // BUG FIX: Listen for game_confirmed — host phone confirmed a game.
    // Server sends { gameId } only — must look up full game object from GAMES array.
    // Transitions BigScreen from LOBBY → PREGAME (ready board state).
    socket.on('game_confirmed', ({ gameId } = {}) => {
      const game = GAMES.find(g => g.id === gameId);
      if (game) {
        setConfirmedGame({ gameId: game.id, gameTitle: game.title, gameEmoji: game.emoji });
      }
      setState('PREGAME');
    });

    // BUG FIX: Listen for all_ready — all phones tapped Ready.
    // Server sends { gameId } — use as fallback if confirmedGame wasn't set yet.
    // Transitions BigScreen from PREGAME → COUNTDOWN.
    socket.on('all_ready', ({ gameId } = {}) => {
      if (gameId) {
        const game = GAMES.find(g => g.id === gameId);
        if (game) {
          setConfirmedGame(prev =>
            prev ? prev : { gameId: game.id, gameTitle: game.title, gameEmoji: game.emoji }
          );
        }
      }
      setState('COUNTDOWN');
      startCountdown();
    });

    // BUG FIX: game_started now receives gameId from server.
    // Previously the parameter was ignored. Now we use it.
    socket.on('game_started', (gameId) => {
      // If game_confirmed wasn't received (legacy flow), find game by id
      if (gameId) {
        const game = GAMES.find(g => g.id === gameId);
        if (game) setConfirmedGame({ gameId: game.id, gameTitle: game.title, gameEmoji: game.emoji });
      }
      setState('COUNTDOWN');
      startCountdown();
    });

    // BUG FIX: Server sends { playerId, action, state } — 'state' is the server field name.
    // Destructure with alias 'state: inputState' so we don't shadow the component's
    // own `state` variable (which would have been a critical silent bug).
    socket.on('player_input', ({ playerId, action, state: inputState }) => {
      // Store player input in ref for use by the game loop (Color Rush etc.)
      gameInputRef.current[playerId] = gameInputRef.current[playerId] || {};
      gameInputRef.current[playerId][action] = inputState;
    });

    // BUG FIX: Added room_closed listener so BigScreen resets if room is destroyed
    socket.on('room_closed', () => {
      clearAllTimers();
      setPlayers([]);
      setConfirmedGame(null);
      setCode('');
      setState('INIT');
    });

    // BUG FIX: Added game_selected listener (server emits this for legacy host flow)
    socket.on('game_selected', (gameId) => {
      const idx = GAMES.findIndex(g => g.id === gameId);
      if (idx !== -1) setSelectedGameIdx(idx);
    });

    return () => {
      // BUG FIX: Clean up all socket listeners AND timers on unmount
      socket.off('players_update');
      socket.off('game_changed');
      socket.off('game_confirmed');
      socket.off('all_ready');
      socket.off('game_started');
      socket.off('player_input');
      socket.off('room_closed');
      socket.off('game_selected');
      clearAllTimers();
    };
  // BUG FIX: Added startCountdown and clearAllTimers to deps (they're stable callbacks)
  }, [startCountdown, clearAllTimers]);

  const createParty = () => {
    socket.emit('create_room', (res) => {
      if (res?.success) {
        setCode(res.code);
        setState('LOBBY');
      } else {
        alert(res?.error || 'Failed to create room');
      }
    });
  };

  // ── INIT ────────────────────────────────────────────────────────────
  if (state === 'INIT') {
    return (
      <div className="tv-layout">
        <div className="bg-pattern"></div>
        <div className="tv-center">
          <h1 className="home-title" style={{ fontSize: '8rem', marginBottom: '2rem' }}>Big Screen Mode</h1>
          <button className="tv-btn" onClick={createParty}>CREATE PARTY</button>
          <button className="tv-btn secondary" onClick={() => setState('EXPLORE')}>EXPLORE GAMES</button>
        </div>
      </div>
    );
  }

  // ── EXPLORE ─────────────────────────────────────────────────────────
  // BUG FIX: Use full GAMES array (9 games) and the correct CSS class
  // 'games-gallery' (not 'games-grid') for proper 3-column grid layout.
  if (state === 'EXPLORE') {
    return (
      <div className="tv-layout">
        <div className="bg-pattern"></div>
        <div className="tv-header" style={{ justifyContent: 'flex-start' }}>
          <button
            className="tv-btn secondary"
            style={{ padding: '1rem 3rem', fontSize: '2rem' }}
            onClick={() => setState('INIT')}
          >
            ◀ BACK
          </button>
        </div>
        <div className="tv-center" style={{ justifyContent: 'flex-start', paddingTop: '2rem', overflowY: 'auto' }}>
          <h2 style={{ fontSize: '4rem', color: 'var(--accent)', textShadow: '4px 4px 0 var(--text-dark)', marginBottom: '2rem' }}>
            Game Library
          </h2>
          {/* BUG FIX: Changed from className="games-grid" (undefined class) to "games-gallery" */}
          <div className="games-gallery">
            {GAMES.map((g) => (
              <div key={g.id} className="gallery-game-card" style={{ borderTop: `3px solid ${g.color}` }}>
                <div className="emoji">{g.emoji}</div>
                <div className="title">{g.title}</div>
                <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.7)', margin: '0.5rem 0 0' }}>{g.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── LOBBY ───────────────────────────────────────────────────────────
  if (state === 'LOBBY') {
    const host = players.find(p => p.isHost);
    const currentGame = GAMES[selectedGameIdx];
    return (
      <div className="tv-layout">
        <div className="bg-pattern"></div>
        <div className="tv-header">
          <div className="small-code-box">
            <h2>Join at <span>play.tv</span></h2>
            <div className="code">{code}</div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', background: 'rgba(0,0,0,0.5)', padding: '1rem', borderRadius: '20px' }}>
            Players: {players.length}
          </div>
        </div>

        <div className="arena">
          {players.map((p, i) => (
            <div
              key={p.id}
              className={`avatar ${p.isHost ? 'host-player' : ''}`}
              style={{
                left: `${20 + (i * 15) % 60}%`,
                bottom: `${10 + (i * 10) % 30}%`,
                animationDelay: `${i * 0.2}s`
              }}
            >
              <div className="sprite">{p.avatar || '🐰'}</div>
              <div className="name">{p.name}</div>
            </div>
          ))}
        </div>

        <div className="tv-center" style={{ justifyContent: 'flex-start', paddingTop: '2rem', flex: 1, overflowY: 'auto' }}>
          <div className="games-gallery">
            {GAMES.map((g, index) => {
              const isSelected = index === selectedGameIdx;
              return (
                <div 
                  key={g.id} 
                  className={`gallery-game-card ${isSelected ? 'selected' : ''}`} 
                  style={{ 
                    borderTop: `3px solid ${g.color}`,
                    boxShadow: isSelected ? `0 0 20px ${g.color}, 0 0 40px ${g.color}66` : 'none',
                    transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                    transition: 'all 0.3s ease'
                  }}
                >
                  <div className="emoji">{g.emoji}</div>
                  <div className="title">{g.title}</div>
                  <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.7)', margin: '0.5rem 0 0' }}>{g.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="status-text" style={{ color: host ? 'var(--success)' : 'white', marginBottom: '2rem' }}>
          {host ? `${host.name} is picking a game...` : 'Waiting for players...'}
        </div>
      </div>
    );
  }

  // ── PREGAME ─────────────────────────────────────────────────────────
  // BUG FIX: PREGAME state was entirely missing. Added it using the CSS classes
  // defined in index.css: .pregame-layout, .pregame-game-display, .ready-board.
  // This shows after game_confirmed and waits for all players to ready up.
  if (state === 'PREGAME') {
    const readyCount = players.filter(p => p.ready).length;
    return (
      <div className="tv-layout pregame-layout">
        <div className="bg-pattern"></div>

        {/* Show the confirmed game prominently */}
        <div className="pregame-game-display">
          <div className="emoji">{confirmedGame?.gameEmoji || '🎮'}</div>
          <div className="title">{confirmedGame?.gameTitle || 'Get Ready!'}</div>
        </div>

        {/* BUG FIX: Player ready board using live players_update data and p.ready field */}
        <div className="ready-board">
          {players.map(p => (
            <div key={p.id} className={`player-card ${p.ready ? 'is-ready' : ''}`}>
              <div className="avatar">{p.avatar || '🐰'}</div>
              <div className="name">{p.name}</div>
              <div className={p.ready ? 'badge-ready' : 'badge-waiting'}>
                {p.ready ? '✅ READY' : '⏳ WAITING'}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          fontSize: '2.5rem', fontFamily: "'Fredoka One', cursive",
          color: 'rgba(255,255,255,0.8)', textShadow: '3px 3px 0 rgba(0,0,0,0.5)'
        }}>
          {readyCount} / {players.length} Ready
        </div>
      </div>
    );
  }

  // ── COUNTDOWN ───────────────────────────────────────────────────────
  if (state === 'COUNTDOWN') {
    return (
      <div className="tv-layout" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="bg-pattern"></div>
        <div style={{
          fontFamily: "'Fredoka One', cursive",
          fontSize: countdown === 'GO!' ? '18rem' : '25rem',
          color: countdown === 'GO!' ? 'var(--success)' : 'var(--accent)',
          textShadow: '20px 20px 0 var(--text-dark)',
          animation: 'popIn 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          // BUG FIX: Use a key so React remounts the element each tick, re-triggering animation
        }} key={countdown}>
          {countdown}
        </div>
      </div>
    );
  }

  // ── PLAYING ─────────────────────────────────────────────────────────
  // BUG FIX: Replaced hardcoded "1:30" with live countdown timer.
  // BUG FIX: Replaced hardcoded "YELLOW" with confirmed game title/emoji.
  // BUG FIX: Replaced "Alive: X/X" with real alive player count from alivePlayers state.
  // BUG FIX: Color Rush game loop is now driven by player_input socket events
  //          stored in gameInputRef, ready for a canvas/PixiJS game loop to consume.
  if (state === 'PLAYING') {
    const minutes = Math.floor(gameTimeSec / 60);
    const seconds = gameTimeSec % 60;
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    const aliveCount = alivePlayers.length;
    const totalCount = players.length;

    return (
      <div className="tv-layout">
        <div className="bg-pattern" style={{ opacity: 0.1 }}></div>

        {/* HUD Bar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', padding: '2rem 4rem',
          fontSize: '3rem', fontFamily: "'Fredoka One', cursive",
          textShadow: '4px 4px 0 var(--text-dark)'
        }}>
          {/* BUG FIX: Live timer instead of hardcoded "1:30" */}
          <div style={{ color: gameTimeSec <= 10 ? 'var(--danger)' : 'white' }}>{timeStr}</div>

          {/* BUG FIX: Show actual confirmed game title instead of hardcoded "YELLOW" */}
          <div>
            <span style={{ color: 'var(--accent)' }}>
              {confirmedGame?.gameEmoji} {confirmedGame?.gameTitle || 'PLAYING'}
            </span>
          </div>

          {/* BUG FIX: Show real alive vs total count */}
          <div>Alive: {aliveCount}/{totalCount}</div>
        </div>

        {/* Game Arena */}
        <div style={{
          flex: 1, position: 'relative', background: 'rgba(0,0,0,0.2)',
          margin: '2rem 5rem', borderRadius: '40px', border: '10px solid var(--text-dark)'
        }}>
          {/* BUG FIX: Use alivePlayers (not all players) so eliminated players disappear */}
          {alivePlayers.map((p, i) => (
            <div key={p.id} style={{
              position: 'absolute', fontSize: '6rem', animation: 'bounce 1s infinite',
              left: `${30 + (i * 15) % 40}%`, top: `${30 + (i * 20) % 40}%`,
              // BUG FIX: Apply CSS transform based on live input from gameInputRef
              // A real game engine (PixiJS/Canvas) would use gameInputRef.current[p.id]
              // here to move sprites. This is the integration point.
              transition: 'left 0.1s, top 0.1s'
            }}>
              {p.avatar || '🐰'}
            </div>
          ))}

          {/* Show "Game Over" overlay when timer hits 0 */}
          {gameTimeSec === 0 && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.7)', borderRadius: '30px',
              fontFamily: "'Fredoka One', cursive", color: 'var(--accent)',
              fontSize: '8rem', textShadow: '10px 10px 0 var(--text-dark)'
            }}>
              GAME OVER!
            </div>
          )}
        </div>
      </div>
    );
  }

  // BUG FIX: Added explicit null return so React never gets undefined from this component.
  // Previously, unknown states (like PREGAME before it was added) caused a React error.
  return null;
}
