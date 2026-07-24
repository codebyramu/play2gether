import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const socket = io(`http://${window.location.hostname}:3001`);

const games = [
  { id: 'color_rush', title: 'Color Rush Arena', desc: 'Match the floor color or fall!', emoji: '🎨', color: 'var(--primary)' },
  { id: 'chaos_arena', title: 'Chaos Arena', desc: 'Survive the crazy floating platform!', emoji: '🌋', color: 'var(--accent)' },
  { id: 'bunny_hop', title: 'Bunny Hop Rally', desc: 'Race to the finish line!', emoji: '🐰', color: 'var(--success)' },
];

export default function BigScreen() {
  const [state, setState] = useState('INIT'); // INIT, LOBBY, COUNTDOWN, PLAYING
  const [code, setCode] = useState('');
  const [players, setPlayers] = useState([]);
  const [selectedGameIdx, setSelectedGameIdx] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const countdownIntervalRef = useRef(null);

  useEffect(() => {
    socket.on('players_update', (updatedPlayers) => {
      setPlayers(updatedPlayers);
    });

    socket.on('game_changed', (dir) => {
      setSelectedGameIdx(prev => {
        let next = prev + dir;
        if (next < 0) next = games.length - 1;
        if (next >= games.length) next = 0;
        return next;
      });
    });

    socket.on('game_started', () => {
      setState('COUNTDOWN');
      let c = 3;
      setCountdown(c);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = setInterval(() => {
        c--;
        if (c > 0) {
          setCountdown(c);
        } else if (c === 0) {
          setCountdown('GO!');
        } else {
          clearInterval(countdownIntervalRef.current);
          setState('PLAYING');
        }
      }, 1000);
    });

    socket.on('player_input', ({ playerId, action, state }) => {
      console.log('Player input:', playerId, action, state);
      // In a real game, this modifies the PixiJS or Three.js state
    });

    return () => {
      socket.off('players_update');
      socket.off('game_changed');
      socket.off('game_started');
      socket.off('player_input');
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

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

  if (state === 'INIT') {
    return (
      <div className="tv-layout">
        <div className="bg-pattern"></div>
        <div className="tv-center">
          <h1 className="home-title" style={{fontSize:'8rem', marginBottom:'2rem'}}>Big Screen Mode</h1>
          <button className="tv-btn" onClick={createParty}>CREATE PARTY</button>
          <button className="tv-btn secondary" onClick={() => setState('EXPLORE')}>EXPLORE GAMES</button>
        </div>
      </div>
    );
  }

  if (state === 'EXPLORE') {
    return (
      <div className="tv-layout">
        <div className="bg-pattern"></div>
        <div className="tv-header" style={{justifyContent: 'flex-start'}}>
          <button className="tv-btn secondary" style={{padding: '1rem 3rem', fontSize: '2rem'}} onClick={() => setState('INIT')}>◀ BACK</button>
        </div>

        <div className="tv-center" style={{justifyContent: 'flex-start', paddingTop: '2rem'}}>
          <h2 style={{fontSize: '4rem', color: 'var(--accent)', textShadow: '4px 4px 0 var(--text-dark)', marginBottom: '2rem'}}>Game Library</h2>
          <div className="games-grid">
            {games.map((g) => (
              <div key={g.id} className="game-card" style={{transform: 'rotate(0deg)'}}>
                <div className="game-thumb" style={{background: g.color}}>
                  <span className="thumb-emoji">{g.emoji}</span>
                </div>
                <h3>{g.title}</h3>
                <p>{g.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (state === 'LOBBY') {
    const host = players.find(p => p.isHost);
    return (
      <div className="tv-layout">
        <div className="bg-pattern"></div>
        <div className="tv-header">
          <div className="small-code-box">
            <h2>Join at <span>play.tv</span></h2>
            <div className="code">{code}</div>
          </div>
          <div style={{fontSize:'2rem', fontWeight:'bold', background:'rgba(0,0,0,0.5)', padding:'1rem', borderRadius:'20px'}}>
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

        <div className="game-carousel">
          <div className="nav-btn" onClick={() => {
            setSelectedGameIdx(prev => {
              let next = prev - 1;
              if (next < 0) next = games.length - 1;
              return next;
            });
          }}>◀</div>
          <div className="game-card">
            <div className="game-thumb" style={{background: games[selectedGameIdx].color}}>
              <span className="thumb-emoji">{games[selectedGameIdx].emoji}</span>
            </div>
            <h3>{games[selectedGameIdx].title}</h3>
            <p>{games[selectedGameIdx].desc}</p>
          </div>
          <div className="nav-btn" onClick={() => {
            setSelectedGameIdx(prev => {
              let next = prev + 1;
              if (next >= games.length) next = 0;
              return next;
            });
          }}>▶</div>
        </div>
        
        <div className="status-text" style={{color: host ? 'var(--success)' : 'white'}}>
          {host ? `${host.name} is picking a game...` : 'Waiting for players...'}
        </div>
      </div>
    );
  }

  if (state === 'COUNTDOWN') {
    return (
      <div className="tv-layout" style={{justifyContent:'center', alignItems:'center'}}>
        <div className="bg-pattern"></div>
        <div style={{
          fontFamily: "'Fredoka One', cursive", fontSize: '25rem', color: 'var(--accent)', 
          textShadow: '20px 20px 0 var(--text-dark)', animation: 'popIn 1s infinite'
        }}>
          {countdown}
        </div>
      </div>
    );
  }

  if (state === 'PLAYING') {
    return (
      <div className="tv-layout">
        <div className="bg-pattern" style={{opacity: 0.1}}></div>
        <div style={{display:'flex', justifyContent:'space-between', padding:'2rem 4rem', fontSize:'3rem', fontFamily:"'Fredoka One', cursive", textShadow:'4px 4px 0 var(--text-dark)'}}>
          <div>1:30</div>
          <div><span style={{color:'var(--accent)'}}>YELLOW</span></div>
          <div>Alive: {players.length}/{players.length}</div>
        </div>
        <div style={{flex:1, position:'relative', background:'rgba(0,0,0,0.2)', margin:'2rem 5rem', borderRadius:'40px', border:'10px solid var(--text-dark)'}}>
           {players.map((p, i) => (
            <div key={p.id} style={{
              position:'absolute', fontSize:'6rem', animation:'bounce 1s infinite',
              left: `${30 + (i * 15) % 40}%`, top: `${30 + (i * 20) % 40}%`
            }}>
              {p.avatar || '🐰'}
            </div>
          ))}
        </div>
      </div>
    );
  }
}
