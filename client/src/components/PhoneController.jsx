import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

// ─── Socket singleton with lazy init ──────────────────────────────────────
// Moved into a getter so it can be re-used safely without being re-created on
// every module reload (HMR) while still living outside the component tree.
let _socket = null;
function getSocket() {
  if (!_socket) {
    _socket = io(`http://${window.location.hostname}:3001`, {
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
  }
  return _socket;
}

const EMOJIS = ['🦊', '🐼', '🐸', '🐰', '🐯', '🦄', '🐙', '🦖'];

const GAMES = [
  { id: 'color_rush',    title: 'Color Rush Arena',    emoji: '🎨', desc: 'Match the floor color!',         color: '#FF3366' },
  { id: 'chaos_arena',   title: 'Chaos Arena',          emoji: '🌋', desc: 'Survive the chaos!',             color: '#FF6B35' },
  { id: 'bunny_hop',     title: 'Bunny Hop Rally',      emoji: '🐰', desc: 'Race to the finish!',            color: '#38B000' },
  { id: 'king_zone',     title: 'King of the Zone',     emoji: '👑', desc: 'Hold the zone longest!',         color: '#8338EC' },
  { id: 'lava_sumo',     title: 'Lava Sumo Knockout',   emoji: '🔥', desc: 'Last one on platform wins!',     color: '#FB5607' },
  { id: 'neon_drift',    title: 'Neon Drift Racers',    emoji: '🏎️', desc: 'Drift and boost to victory!',   color: '#00C4FF' },
  { id: 'bomb_potato',   title: 'Bomb Potato Pass',     emoji: '💣', desc: "Don't hold the bomb!",           color: '#FFCC00' },
  { id: 'pixel_painter', title: 'Pixel Painter Arena',  emoji: '🖌️', desc: 'Paint the most tiles!',         color: '#FF006E' },
  { id: 'egg_survivor',  title: 'Egg Survivor',         emoji: '🥚', desc: "Don't crack!",                  color: '#FFBE0B' },
];

function vibrate(ms = 30) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

// ─── OTP Code Input ───────────────────────────────────────────────
function OtpInput({ value, onChange }) {
  const inputs = useRef([]);
  // Pad to 4 chars with spaces for display
  const chars = (value + '    ').slice(0, 4).split('');

  // FIX: handle backspace explicitly so mobile browsers (especially iOS Safari)
  // that don't fire onChange on an empty field still navigate backward.
  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (chars[i].trim()) {
        // clear current cell
        const next = (value + '    ').slice(0, 4).split('');
        next[i] = ' ';
        onChange(next.join('').trimEnd());
      } else if (i > 0) {
        // cell is already empty → clear previous cell and move focus
        const next = (value + '    ').slice(0, 4).split('');
        next[i - 1] = ' ';
        onChange(next.join('').trimEnd());
        inputs.current[i - 1]?.focus();
      }
    }
  };

  const handleChange = (i, e) => {
    // Allow only A-Z letters
    const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!v) {
      // Empty → handled by keyDown, but clear just in case
      const next = (value + '    ').slice(0, 4).split('');
      next[i] = ' ';
      onChange(next.join('').trimEnd());
      return;
    }
    const next = (value + '    ').slice(0, 4).split('');
    next[i] = v[0];
    onChange(next.join('').trimEnd());
    if (i < 3) inputs.current[i + 1]?.focus();
  };

  // FIX: support paste of a full 4-character code
  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData('text')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 4);
    if (!pasted) return;
    const next = (pasted + '    ').slice(0, 4);
    onChange(next.trimEnd());
    const focusIdx = Math.min(pasted.length, 3);
    inputs.current[focusIdx]?.focus();
  };

  return (
    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '2rem' }}>
      {chars.map((ch, i) => (
        <input
          key={i}
          ref={el => inputs.current[i] = el}
          // FIX: inputMode="text" ensures virtual keyboard shows letters on
          // Android/iOS. autocomplete helps some mobile browsers autofill OTPs.
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          autoCorrect="off"
          spellCheck={false}
          maxLength={1}
          value={ch.trim()}
          onChange={e => handleChange(i, e)}
          onKeyDown={e => handleKeyDown(i, e)}
          onFocus={e => e.target.select()}
          onPaste={handlePaste}
          style={{
            width: '60px', height: '70px', textAlign: 'center',
            fontSize: '2.2rem', fontFamily: "'Fredoka One', cursive",
            background: 'rgba(255,255,255,0.12)',
            border: `3px solid ${ch.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.3)'}`,
            borderRadius: '16px', color: 'white',
            boxShadow: ch.trim() ? '0 0 16px var(--accent)' : 'none',
            outline: 'none', caretColor: 'var(--accent)',
            transition: 'all 0.2s',
          }}
        />
      ))}
    </div>
  );
}

// ─── D-Pad Button ─────────────────────────────────────────────────
function DBtn({ dir, onDown, onUp, children, style = {} }) {
  // FIX: track whether this button is currently pressed so that
  // onPointerLeave only fires onUp() when a press is actually active.
  const isPressed = useRef(false);

  const handleDown = (e) => {
    e.preventDefault();
    if (isPressed.current) return; // guard double-fires
    isPressed.current = true;
    vibrate(20);
    onDown();
    e.currentTarget.style.background = 'rgba(255,255,255,0.4)';
    e.currentTarget.style.transform = 'scale(0.9)';
    // FIX: capture pointer so events fire even if pointer moves off button
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleUp = (e) => {
    e.preventDefault();
    if (!isPressed.current) return; // guard spurious fires
    isPressed.current = false;
    onUp();
    e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
    e.currentTarget.style.transform = 'scale(1)';
  };

  // FIX: only cancel if pressed, and release pointer capture
  const handleLeave = (e) => {
    if (!isPressed.current) return;
    isPressed.current = false;
    onUp();
    e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
    e.currentTarget.style.transform = 'scale(1)';
  };

  return (
    <button
      style={{
        position: 'absolute', width: '64px', height: '64px',
        background: 'rgba(255,255,255,0.15)',
        border: '3px solid rgba(255,255,255,0.3)',
        borderRadius: '12px', color: 'white',
        fontSize: '1.6rem', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
        transition: 'background 0.1s, transform 0.1s',
        WebkitTapHighlightColor: 'transparent',
        ...style,
      }}
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerLeave={handleLeave}
      onPointerCancel={handleLeave}
    >
      {children}
    </button>
  );
}

// ─── Action Button ────────────────────────────────────────────────
function ActionBtn({ label, color, onDown, onUp }) {
  // FIX: same pressed-state guard as DBtn
  const isPressed = useRef(false);

  const handleDown = (e) => {
    e.preventDefault();
    if (isPressed.current) return;
    isPressed.current = true;
    vibrate(30);
    if (onDown) onDown();
    e.currentTarget.style.transform = 'translateY(6px)';
    e.currentTarget.style.boxShadow = `0 2px 0 rgba(0,0,0,0.4), 0 0 10px ${color}88`;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleUp = (e) => {
    e.preventDefault();
    if (!isPressed.current) return;
    isPressed.current = false;
    if (onUp) onUp();
    e.currentTarget.style.transform = 'translateY(0)';
    e.currentTarget.style.boxShadow = `0 8px 0 rgba(0,0,0,0.4), 0 0 20px ${color}88`;
  };

  const handleLeave = (e) => {
    if (!isPressed.current) return;
    isPressed.current = false;
    if (onUp) onUp();
    e.currentTarget.style.transform = 'translateY(0)';
    e.currentTarget.style.boxShadow = `0 8px 0 rgba(0,0,0,0.4), 0 0 20px ${color}88`;
  };

  return (
    <button
      style={{
        width: '90px', height: '90px', borderRadius: '50%',
        background: color, border: '4px solid rgba(0,0,0,0.4)',
        color: 'white', fontFamily: "'Fredoka One', cursive",
        fontSize: '1.1rem', cursor: 'pointer',
        boxShadow: `0 8px 0 rgba(0,0,0,0.4), 0 0 20px ${color}88`,
        touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        transition: 'transform 0.1s, box-shadow 0.1s',
      }}
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerLeave={handleLeave}
      onPointerCancel={handleLeave}
    >
      {label}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────
export default function PhoneController() {
  const [phase, setPhase]         = useState('JOIN');
  const [code, setCode]           = useState('');
  const [name, setName]           = useState('');
  const [avatarIdx, setAvatarIdx] = useState(0);
  const [isHost, setIsHost]       = useState(false);
  const [players, setPlayers]     = useState([]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [confirmedGame, setConfirmedGame] = useState(null);
  const [isReady, setIsReady]     = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [error, setError]         = useState('');
  const [socketConnected, setSocketConnected] = useState(true);

  const timerRef  = useRef(null);
  // FIX: keep a stable trimmed-code ref so callbacks always use the latest
  // value without needing code in their dependency arrays.
  const codeRef   = useRef('');

  const showError = useCallback((msg) => {
    setError(msg);
    vibrate([50, 30, 50]);
    setTimeout(() => setError(''), 3000);
  }, []);

  // FIX: wrap startCountdown in useCallback so the reference is stable and
  // the function can safely be called from socket listeners registered in the
  // effect without capturing a stale closure.
  const startCountdown = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    let c = 3;
    setCountdown(c);
    timerRef.current = setInterval(() => {
      c--;
      if (c > 0) {
        setCountdown(c);
        vibrate(40);
      } else if (c === 0) {
        setCountdown('GO!');
        vibrate([100, 50, 100]);
      } else {
        clearInterval(timerRef.current);
        timerRef.current = null;
        setPhase('PLAYING');
      }
    }, 1000);
  }, []); // no deps – uses only refs and stable setters

  useEffect(() => {
    const socket = getSocket();

    // ── Connection health listeners ──────────────────────────────
    const onConnect    = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);

    // ── Named handler refs so socket.off() only removes THIS component's
    //    handler and not any other listener on the same event. ───────────
    const onPlayersUpdate = (data) => setPlayers(Array.isArray(data) ? data : []);

    const onGameConfirmed = (game) => {
      // FIX: guard against missing/malformed payload
      if (!game) return;
      setConfirmedGame(game);
      setIsReady(false);
      setPhase('READY');
      vibrate([30, 20, 30]);
    };

    const onAllReady = () => {
      vibrate([50, 30, 50, 30, 100]);
      setPhase('COUNTDOWN');
      startCountdown();
    };

    // FIX: game_started and all_ready both lead to COUNTDOWN. Guard against
    // double-triggering: if we're already in COUNTDOWN or PLAYING, ignore.
    const onGameStarted = () => {
      setPhase(prev => {
        if (prev === 'COUNTDOWN' || prev === 'PLAYING') return prev;
        startCountdown();
        return 'COUNTDOWN';
      });
    };

    const onHostAssigned = () => {
      setIsHost(true);
      setPhase('HOST_SELECT');
    };

    const onRoomClosed = () => {
      showError('Room was closed!');
      // FIX: also reset all room-related state to prevent stale data
      setPlayers([]);
      setSelectedGame(null);
      setConfirmedGame(null);
      setIsReady(false);
      setIsHost(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setPhase('JOIN');
    };

    socket.on('connect',       onConnect);
    socket.on('disconnect',    onDisconnect);
    socket.on('players_update', onPlayersUpdate);
    socket.on('game_confirmed', onGameConfirmed);
    socket.on('all_ready',     onAllReady);
    socket.on('game_started',  onGameStarted);
    socket.on('host_assigned', onHostAssigned);
    socket.on('room_closed',   onRoomClosed);

    return () => {
      // FIX: remove specific handler refs, not all listeners for the event
      socket.off('connect',        onConnect);
      socket.off('disconnect',     onDisconnect);
      socket.off('players_update', onPlayersUpdate);
      socket.off('game_confirmed', onGameConfirmed);
      socket.off('all_ready',      onAllReady);
      socket.off('game_started',   onGameStarted);
      socket.off('host_assigned',  onHostAssigned);
      socket.off('room_closed',    onRoomClosed);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [startCountdown, showError]);

  // Keep codeRef in sync with state so callbacks always have the latest value
  useEffect(() => {
    codeRef.current = code.trim();
  }, [code]);

  const handleJoin = () => {
    if (code.trim().length !== 4) { showError('Enter a 4-letter code!'); return; }
    setPhase('AVATAR');
  };

  const handleEnterRoom = () => {
    const socket = getSocket();
    const trimmedCode = code.trim();
    const trimmedName = name.trim() || 'Player';

    // FIX: reset ready state and other room state before joining
    setIsReady(false);
    setPlayers([]);
    setSelectedGame(null);
    setConfirmedGame(null);

    socket.emit('join_room', { code: trimmedCode, name: trimmedName, avatar: EMOJIS[avatarIdx] }, (res) => {
      if (!res) {
        // FIX: guard against missing/null callback response (server error)
        showError('No response from server!');
        setPhase('JOIN');
        return;
      }
      if (res.success) {
        const player = res.player ?? {};
        setIsHost(!!player.isHost);
        // FIX: check for mid-game join BEFORE setting normal phase
        if (res.gameState === 'PLAYING') {
          setPhase('PLAYING');
        } else if (res.gameState === 'COUNTDOWN') {
          setPhase('COUNTDOWN');
          startCountdown();
        } else {
          setPhase(player.isHost ? 'HOST_SELECT' : 'WAITING');
        }
      } else {
        showError(res.error || 'Failed to join!');
        setPhase('JOIN');
      }
    });
  };

  const handleConfirmGame = () => {
    if (!selectedGame) { showError('Pick a game first!'); return; }
    vibrate(50);
    const socket = getSocket();
    socket.emit('confirm_game', {
      code: codeRef.current,
      gameId: selectedGame.id,
      gameTitle: selectedGame.title,
      gameEmoji: selectedGame.emoji,
    });
  };

  const handleReadyUp = () => {
    if (isReady) return;
    setIsReady(true);
    vibrate([50, 30, 80]);
    const socket = getSocket();
    socket.emit('player_ready', { code: codeRef.current });
  };

  // FIX: sendInput uses codeRef so it always has the latest trimmed code
  // even if the `code` state hasn't propagated yet.
  const sendInput = useCallback((action, state) => {
    const socket = getSocket();
    socket.emit('controller_input', { code: codeRef.current, action, state });
  }, []); // stable – reads from ref, not state

  const bgStyle = {
    position: 'fixed', inset: 0,
    background: 'linear-gradient(135deg, #1a0533 0%, #0d1b4b 50%, #0a2a1a 100%)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    fontFamily: "'Nunito', sans-serif", color: 'white',
    overflow: 'hidden', padding: '1.5rem', boxSizing: 'border-box',
  };

  // ── Disconnected overlay ──────────────────────────────────────────
  const DisconnectedBanner = () => !socketConnected ? (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: 'rgba(255,0,80,0.92)', backdropFilter: 'blur(8px)',
      textAlign: 'center', padding: '0.5rem',
      fontFamily: "'Fredoka One', cursive", fontSize: '0.95rem',
      boxShadow: '0 2px 12px rgba(255,0,80,0.5)',
    }}>
      ⚠️ Reconnecting to server…
    </div>
  ) : null;

  // ── JOIN ──────────────────────────────────────────────────────────
  if (phase === 'JOIN') return (
    <div style={bgStyle}>
      <DisconnectedBanner />
      <h1 style={{ fontFamily: "'Fredoka One', cursive", fontSize: '3rem', margin: '0 0 0.5rem', background: 'linear-gradient(90deg,#FF3366,#FFCC00)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        PlayTogether
      </h1>
      <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '2rem', fontSize: '1rem' }}>Enter the code from the big screen</p>

      <OtpInput value={code} onChange={setCode} />

      <button
        onClick={() => { vibrate(20); handleJoin(); }}
        style={{
          background: 'linear-gradient(135deg, #FF3366, #FF6B35)',
          border: 'none', borderRadius: '16px', color: 'white',
          fontFamily: "'Fredoka One', cursive", fontSize: '1.6rem',
          padding: '1rem 3rem', cursor: 'pointer',
          boxShadow: '0 8px 0 rgba(0,0,0,0.3), 0 0 30px #FF336688',
          width: '100%', maxWidth: '300px',
        }}
      >
        JOIN! 🚀
      </button>

      {error && (
        <div style={{
          position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(255,0,80,0.9)', backdropFilter: 'blur(10px)',
          borderRadius: '12px', padding: '0.8rem 1.5rem', fontSize: '1rem', fontWeight: 900,
          boxShadow: '0 4px 20px rgba(255,0,80,0.4)',
        }}>
          ⚠️ {error}
        </div>
      )}
    </div>
  );

  // ── AVATAR ────────────────────────────────────────────────────────
  if (phase === 'AVATAR') return (
    <div style={bgStyle}>
      <DisconnectedBanner />
      <h2 style={{ fontFamily: "'Fredoka One', cursive", fontSize: '2.2rem', marginBottom: '0.5rem', color: 'var(--accent)' }}>Pick Your Look</h2>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', margin: '1.5rem 0' }}>
        <button onClick={() => { vibrate(15); setAvatarIdx(i => (i - 1 + EMOJIS.length) % EMOJIS.length); }}
          style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.3)', color: 'white', fontSize: '1.4rem', cursor: 'pointer' }}>◀</button>

        <div style={{
          width: '120px', height: '120px', borderRadius: '50%', fontSize: '4rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'conic-gradient(#FF3366,#FFCC00,#00C4FF,#38B000,#FF3366)',
          padding: '4px',
        }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#1a0533', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {EMOJIS[avatarIdx]}
          </div>
        </div>

        <button onClick={() => { vibrate(15); setAvatarIdx(i => (i + 1) % EMOJIS.length); }}
          style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.3)', color: 'white', fontSize: '1.4rem', cursor: 'pointer' }}>▶</button>
      </div>

      <input
        placeholder="Your nickname"
        value={name}
        onChange={e => setName(e.target.value)}
        style={{
          width: '100%', maxWidth: '280px', padding: '0.9rem 1rem',
          background: 'rgba(255,255,255,0.1)', border: '2px solid rgba(255,255,255,0.3)',
          borderRadius: '14px', color: 'white', fontSize: '1.3rem',
          fontFamily: "'Fredoka One', cursive", textAlign: 'center',
          marginBottom: '1.5rem', outline: 'none', boxSizing: 'border-box',
        }}
      />

      <button onClick={() => { vibrate(30); handleEnterRoom(); }}
        style={{
          width: '100%', maxWidth: '280px', padding: '1rem',
          background: 'linear-gradient(135deg, #38B000, #00C4FF)',
          border: 'none', borderRadius: '16px', color: 'white',
          fontFamily: "'Fredoka One', cursive", fontSize: '1.6rem',
          cursor: 'pointer', boxShadow: '0 8px 0 rgba(0,0,0,0.3)',
        }}>
        LET'S GO! ✅
      </button>
    </div>
  );

  // ── WAITING (non-host) ────────────────────────────────────────────
  if (phase === 'WAITING') return (
    <div style={bgStyle}>
      <DisconnectedBanner />
      <div style={{ fontSize: '6rem', animation: 'bounce 1s infinite ease-in-out' }}>{EMOJIS[avatarIdx]}</div>
      <h2 style={{ fontFamily: "'Fredoka One', cursive", fontSize: '2rem', margin: '1.5rem 0 0.5rem', color: 'var(--accent)' }}>You're In! 🎉</h2>
      <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1.1rem', textAlign: 'center' }}>Host is picking a game...</p>
      <div style={{ display: 'flex', gap: '6px', marginTop: '1rem' }}>
        {[0,1,2].map(i => <div key={i} style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent)', animation: `bounce ${0.8 + i*0.15}s infinite ease-in-out` }} />)}
      </div>
    </div>
  );

  // ── HOST_SELECT ───────────────────────────────────────────────────
  if (phase === 'HOST_SELECT') return (
    <div style={{ ...bgStyle, justifyContent: 'flex-start', padding: '1rem', overflowY: 'auto' }}>
      <DisconnectedBanner />
      <h2 style={{ fontFamily: "'Fredoka One', cursive", fontSize: '1.8rem', margin: '0.5rem 0', color: 'var(--accent)' }}>👑 Pick a Game</h2>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', marginBottom: '1rem' }}>Only you can choose!</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', width: '100%', marginBottom: '1rem' }}>
        {GAMES.map(g => (
          <div key={g.id} onClick={() => { vibrate(20); setSelectedGame(g); }}
            style={{
              background: selectedGame?.id === g.id ? `${g.color}33` : 'rgba(255,255,255,0.07)',
              border: `2px solid ${selectedGame?.id === g.id ? g.color : 'rgba(255,255,255,0.15)'}`,
              borderRadius: '14px', padding: '0.9rem 0.7rem', textAlign: 'center', cursor: 'pointer',
              boxShadow: selectedGame?.id === g.id ? `0 0 20px ${g.color}66` : 'none',
              transition: 'all 0.2s',
            }}>
            <div style={{ fontSize: '2rem' }}>{g.emoji}</div>
            <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: '0.85rem', color: selectedGame?.id === g.id ? g.color : 'white', marginTop: '4px' }}>{g.title}</div>
          </div>
        ))}
      </div>

      <button onClick={handleConfirmGame}
        disabled={!selectedGame}
        style={{
          width: '100%', padding: '1rem',
          background: selectedGame ? 'linear-gradient(135deg, #FF3366, #FFCC00)' : 'rgba(255,255,255,0.1)',
          border: 'none', borderRadius: '16px', color: 'white',
          fontFamily: "'Fredoka One', cursive", fontSize: '1.5rem',
          cursor: selectedGame ? 'pointer' : 'not-allowed',
          boxShadow: selectedGame ? '0 6px 0 rgba(0,0,0,0.3)' : 'none',
          marginBottom: '1rem', position: 'sticky', bottom: '0.5rem',
        }}>
        {selectedGame ? `✅ Confirm: ${selectedGame.emoji} ${selectedGame.title}` : 'Select a Game First'}
      </button>
    </div>
  );

  // ── READY ─────────────────────────────────────────────────────────
  if (phase === 'READY') return (
    <div style={{ ...bgStyle, flexDirection: 'row', padding: '1rem', gap: '1rem' }}>
      <DisconnectedBanner />
      {/* Left: player list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
        <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: '1rem', color: 'var(--accent)', marginBottom: '4px' }}>
          {/* FIX: guard against null confirmedGame (READY reached without game data) */}
          {confirmedGame
            ? `${confirmedGame.gameEmoji ?? ''} ${confirmedGame.gameTitle ?? 'Game Selected'}`
            : '🎮 Get Ready!'}
        </div>
        {/* FIX: show placeholder if players list is empty (no players_update yet) */}
        {players.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', fontStyle: 'italic' }}>
            Loading players…
          </div>
        ) : players.map(p => (
          <div key={p.id} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'rgba(255,255,255,0.08)', borderRadius: '12px', padding: '8px 10px',
          }}>
            <span style={{ fontSize: '1.5rem' }}>{p.avatar ?? '❓'}</span>
            <span style={{ fontWeight: 900, fontSize: '0.95rem', flex: 1 }}>{p.name ?? 'Player'}</span>
            <span style={{
              fontSize: '0.75rem', fontWeight: 900, padding: '3px 10px', borderRadius: '20px',
              background: p.ready ? '#38B00044' : 'rgba(255,255,255,0.1)',
              color: p.ready ? '#38B000' : 'rgba(255,255,255,0.5)',
              border: `1px solid ${p.ready ? '#38B000' : 'rgba(255,255,255,0.2)'}`,
              boxShadow: p.ready ? '0 0 10px #38B00066' : 'none',
            }}>
              {p.ready ? '✅ READY' : '⏳'}
            </span>
          </div>
        ))}
      </div>

      {/* Right: Ready button */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
        <button
          onClick={handleReadyUp}
          disabled={isReady}
          style={{
            width: '130px', height: '130px', borderRadius: '50%',
            background: isReady
              ? 'radial-gradient(circle, #38B000, #1a6600)'
              : 'radial-gradient(circle, #FF3366, #aa0033)',
            border: `5px solid ${isReady ? '#38B000' : '#FF3366'}`,
            color: 'white', fontFamily: "'Fredoka One', cursive",
            fontSize: '1.1rem', cursor: isReady ? 'default' : 'pointer',
            boxShadow: isReady
              ? '0 0 40px #38B00099, 0 8px 0 rgba(0,0,0,0.4)'
              : '0 0 30px #FF336699, 0 8px 0 rgba(0,0,0,0.4)',
            transition: 'all 0.4s cubic-bezier(0.175,0.885,0.32,1.275)',
            animation: isReady ? 'pulse 1.5s infinite' : 'none',
            touchAction: 'none',
          }}>
          {isReady ? '✅ READY!' : 'TAP TO\nREADY'}
        </button>
        <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
          {isReady ? 'Waiting for others...' : 'Ready up to start!'}
        </p>
      </div>
    </div>
  );

  // ── COUNTDOWN ─────────────────────────────────────────────────────
  if (phase === 'COUNTDOWN') {
    const colors = { 3: '#FF3366', 2: '#FFCC00', 1: '#38B000', 'GO!': '#00C4FF' };
    return (
      <div style={{ ...bgStyle, background: `radial-gradient(circle, ${colors[countdown] ?? '#1a0533'}44, #0d1b4b)` }}>
        <div style={{
          fontFamily: "'Fredoka One', cursive",
          fontSize: countdown === 'GO!' ? '5rem' : '12rem',
          color: colors[countdown] ?? 'white',
          textShadow: `0 0 60px ${colors[countdown] ?? 'white'}`,
          animation: 'popIn 0.4s cubic-bezier(0.175,0.885,0.32,1.275)',
        }}>
          {countdown}
        </div>
      </div>
    );
  }

  // ── PLAYING ───────────────────────────────────────────────────────
  if (phase === 'PLAYING') return (
    <div
      className="controller-layout"
      style={{
        background: 'linear-gradient(135deg, #0d0d1a, #1a0d33)',
        display: 'flex', flexDirection: 'row',
        alignItems: 'center', justifyContent: 'space-between',
        padding: '1rem 1.5rem', boxSizing: 'border-box',
        touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
      }}>
      <DisconnectedBanner />
      {/* Status bar */}
      <div style={{
        position: 'absolute', top: '0.6rem', left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: '8px',
        background: 'rgba(0,0,0,0.5)', borderRadius: '20px',
        padding: '4px 14px', fontSize: '0.85rem', fontWeight: 900,
        border: '1px solid rgba(255,255,255,0.15)',
      }}>
        <span>{EMOJIS[avatarIdx]}</span>
        <span>{name || 'Player'}</span>
        <span style={{ color: '#38B000' }}>● ALIVE</span>
      </div>

      {/* D-Pad */}
      <div style={{ position: 'relative', width: '200px', height: '200px', flexShrink: 0 }}>
        {/* Cross arms */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '64px', height: '200px', background: 'rgba(255,255,255,0.08)', borderRadius: '8px' }} />
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '200px', height: '64px', background: 'rgba(255,255,255,0.08)', borderRadius: '8px' }} />
        <DBtn dir="up"    onDown={() => sendInput('up',true)}    onUp={() => sendInput('up',false)}    style={{ top: '10px',   left: '68px'  }}>▲</DBtn>
        <DBtn dir="down"  onDown={() => sendInput('down',true)}  onUp={() => sendInput('down',false)}  style={{ bottom: '10px',left: '68px'  }}>▼</DBtn>
        <DBtn dir="left"  onDown={() => sendInput('left',true)}  onUp={() => sendInput('left',false)}  style={{ top: '68px',  left: '10px'  }}>◀</DBtn>
        <DBtn dir="right" onDown={() => sendInput('right',true)} onUp={() => sendInput('right',false)} style={{ top: '68px',  right: '10px' }}>▶</DBtn>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '2px solid rgba(255,255,255,0.1)' }} />
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
        <ActionBtn label="JUMP" color="#00C4FF" onDown={() => sendInput('jump', true)} onUp={() => sendInput('jump', false)} />
        <ActionBtn label="DASH" color="#FF3366" onDown={() => sendInput('dash', true)} onUp={() => sendInput('dash', false)} />
      </div>
    </div>
  );

  return null;
}
