import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const socket = io(`http://${window.location.hostname}:3001`);

const emojis = ['🦊', '🐼', '🐸', '🐰', '🐯', '🦄', '🐙', '🦖'];

export default function PhoneController() {
  const [state, setState] = useState('JOIN'); // JOIN, AVATAR, WAITING, HOST_SELECT, COUNTDOWN, PLAYING
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [avatarIdx, setAvatarIdx] = useState(0);
  const [isHost, setIsHost] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const countdownIntervalRef = useRef(null);
  
  useEffect(() => {
    socket.on('host_assigned', () => {
      setIsHost(true);
      setState('HOST_SELECT');
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
    
    socket.on('disconnect', () => {
      setState('JOIN');
      setCode('');
      setIsHost(false);
      alert('Disconnected from server!');
    });
    
    return () => {
      socket.off('host_assigned');
      socket.off('game_started');
      socket.off('disconnect');
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  const handleJoin = () => {
    if (code.length === 4) setState('AVATAR');
    else alert('Code must be 4 letters');
  };

  const handleReady = () => {
    socket.emit('join_room', { code, name: name || 'Player', avatar: emojis[avatarIdx] }, (res) => {
      if (res.success) {
        setIsHost(res.player.isHost);
        setState(res.player.isHost ? 'HOST_SELECT' : 'WAITING');
      } else {
        alert(res.error);
        setState('JOIN');
      }
    });
  };

  const startGame = () => {
    socket.emit('start_game', { code });
  };

  const sendInput = (action, inputState) => {
    socket.emit('controller_input', { code, action, state: inputState });
  };

  const changeGame = (dir) => {
    socket.emit('change_game', { code, dir });
  };

  if (state === 'JOIN') {
    return (
      <div className="phone-layout">
        <h1 className="phone-title">Join Party!</h1>
        <input 
          className="phone-input" 
          placeholder="CODE" 
          maxLength={4}
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
        />
        <button className="phone-btn" onClick={handleJoin}>LET'S GOOO!</button>
      </div>
    );
  }

  if (state === 'AVATAR') {
    return (
      <div className="phone-layout">
        <h2 className="phone-title">Pick Look</h2>
        <div className="avatar-slider">
          <button className="nav-btn" onClick={() => setAvatarIdx((avatarIdx - 1 + emojis.length) % emojis.length)}>◀</button>
          <div className="avatar-preview">{emojis[avatarIdx]}</div>
          <button className="nav-btn" onClick={() => setAvatarIdx((avatarIdx + 1) % emojis.length)}>▶</button>
        </div>
        <input 
          className="phone-input" 
          placeholder="NICKNAME" 
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <button className="phone-btn success" onClick={handleReady}>READY!</button>
      </div>
    );
  }

  if (state === 'WAITING') {
    return (
      <div className="phone-layout">
        <div className="jumping-avatar">{emojis[avatarIdx]}</div>
        <h2 className="phone-title" style={{marginTop:'20px'}}>You're in!</h2>
        <p className="phone-text">The Host is in control...</p>
        <p className="small-text">Waiting for them to start</p>
      </div>
    );
  }

  if (state === 'COUNTDOWN') {
    return (
      <div className="phone-layout" style={{justifyContent:'center', alignItems:'center'}}>
        <div style={{
          fontFamily: "'Fredoka One', cursive", fontSize: '10rem', color: 'var(--accent)', 
          textShadow: '5px 5px 0 var(--text-dark)', animation: 'popIn 1s infinite'
        }}>
          {countdown}
        </div>
      </div>
    );
  }

  if (state === 'HOST_SELECT') {
    return (
      <div className="phone-layout">
        <h2 className="phone-title">You are the Host!</h2>
        <p className="phone-text">Pick a game</p>
        <div className="avatar-slider" style={{marginTop: '2rem'}}>
          <button className="nav-btn" onClick={() => changeGame(-1)}>◀</button>
          <div className="avatar-preview" style={{fontSize: '3rem', textAlign: 'center', lineHeight: '1.2'}}>Choose<br/>Game</div>
          <button className="nav-btn" onClick={() => changeGame(1)}>▶</button>
        </div>
        <button className="phone-btn success" style={{marginTop:'2rem'}} onClick={startGame}>START GAME</button>
      </div>
    );
  }

  if (state === 'PLAYING') {
    return (
      <div className="controller-layout">
        <div className="status-bar">
          <span>{emojis[avatarIdx]} {name || 'Player'}</span>
          <span style={{color: 'var(--success)'}}>ALIVE</span>
        </div>
        
        <div className="d-pad">
          <button className="d-btn up" onPointerDown={()=>sendInput('up', true)} onPointerUp={()=>sendInput('up', false)}>▲</button>
          <button className="d-btn left" onPointerDown={()=>sendInput('left', true)} onPointerUp={()=>sendInput('left', false)}>◀</button>
          <button className="d-btn right" onPointerDown={()=>sendInput('right', true)} onPointerUp={()=>sendInput('right', false)}>▶</button>
          <button className="d-btn down" onPointerDown={()=>sendInput('down', true)} onPointerUp={()=>sendInput('down', false)}>▼</button>
          <div className="d-center"></div>
        </div>
        
        <div className="action-buttons">
          <button className="action-btn dash" onPointerDown={()=>sendInput('dash', true)}>DASH</button>
          <button className="action-btn jump" onPointerDown={()=>sendInput('jump', true)}>JUMP</button>
        </div>
      </div>
    );
  }
}
