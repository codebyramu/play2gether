const app = document.getElementById('app');

// State
let currentState = 'HOME'; // HOME, JOIN, LOBBY, GAMES
let partyCode = '';
let isHost = false;
let selectedGame = null;

// Game Data (Extracted from Markdown)
const games = [
    { id: 'c1', title: 'Color Rush Arena', category: 'Flagship', players: '30-40', desc: 'Floor tiles flash random colors. Match the target color before the timer ends!' },
    { id: 'c2', title: 'Bunny Hop Rally', category: 'Race', players: '30-40', desc: 'Hop across a shrinking, obstacle-filled platform toward the finish line.' },
    { id: 'c3', title: 'King of the Zone', category: 'Zone Control', players: '30-40', desc: 'Control the glowing zone for the highest cumulative time.' },
    { id: 'g1', title: 'Chaos Arena', category: 'Survival', players: '2-50', desc: 'Survive in a small arena with rotating hazards like ice floors and rising lava.' },
    { id: 'g2', title: 'Lava Sumo Knockout', category: 'Brawler', players: '1-50', desc: 'Push rivals off a crumbling arena floating over lava.' },
    { id: 'g3', title: 'Neon Drift Racers', category: 'Racing', players: '2-8', desc: 'Top-down neon car racing circuit. Drift to build Nitro!' },
    { id: 'g4', title: 'Bomb Potato Pass', category: 'Party', players: '3-16', desc: 'Pass the ticking bomb by completing micro-challenges.' },
    { id: 'g5', title: 'Pixel Painter Arena', category: 'Strategy', players: '2-12', desc: 'Paint grid tiles your color and use power-ups to dominate.' }
];

// Mock Players
const mockPlayers = [
    { name: 'You', isHost: true, type: 'human' },
    { name: 'Alex_99', isHost: false, type: 'human' },
    { name: 'Bot_Delta', isHost: false, type: 'bot' },
    { name: 'Bot_Echo', isHost: false, type: 'bot' }
];

// Render Functions
function render() {
    app.innerHTML = '';
    
    switch(currentState) {
        case 'HOME':
            app.innerHTML = renderHome();
            break;
        case 'JOIN':
            app.innerHTML = renderJoin();
            break;
        case 'LOBBY':
            app.innerHTML = renderLobby();
            break;
        case 'GAMES':
            app.innerHTML = renderGames();
            break;
    }
}

function renderHome() {
    return `
        <div class="container">
            <h1>PlayTogether</h1>
            <p class="subtitle">Console experience, phone controller. Let's play.</p>
            <div class="btn-group">
                <button class="btn-primary" onclick="createParty()">Create Party</button>
                <button class="btn-secondary" onclick="navigate('JOIN')">Join Party</button>
            </div>
        </div>
    `;
}

function renderJoin() {
    return `
        <div class="container" style="margin-top: 4rem;">
            <button class="back-btn" onclick="navigate('HOME')">← Back</button>
            <h1>Join Party</h1>
            <p class="subtitle">Enter the 4-letter code on the big screen</p>
            <div class="input-group">
                <input type="text" id="partyCodeInput" maxlength="4" placeholder="ABCD" autocomplete="off" oninput="this.value = this.value.toUpperCase()">
            </div>
            <button class="btn-primary" style="width: 100%" onclick="joinParty()">Join Now</button>
        </div>
    `;
}

function renderLobby() {
    const playersHtml = mockPlayers.map(p => `
        <div class="player-item">
            <div class="player-avatar ${p.isHost ? 'host' : ''} ${p.type === 'bot' ? 'bot' : ''}"></div>
            <div class="player-name">${p.name}</div>
            ${p.isHost ? '<span class="player-badge">Host</span>' : ''}
            ${p.type === 'bot' ? '<span class="player-badge" style="background: transparent; color: var(--text-muted)">Bot</span>' : ''}
        </div>
    `).join('');

    return `
        <div class="container" style="margin-top: 4rem;">
            <button class="back-btn" onclick="navigate('HOME')">← Leave Party</button>
            <div class="party-header">
                <p class="subtitle" style="margin-bottom: 0.5rem">Party Code</p>
                <div class="party-code-display">${partyCode}</div>
                <p class="subtitle">Waiting for host to select a game...</p>
            </div>
            
            <div class="player-list">
                ${playersHtml}
            </div>

            ${isHost ? `<button class="btn-primary" style="width: 100%" onclick="navigate('GAMES')">Select Game</button>` : `<button class="btn-secondary" style="width: 100%" disabled>Waiting for Host...</button>`}
        </div>
    `;
}

function renderGames() {
    const gamesHtml = games.map(g => `
        <div class="game-card ${selectedGame === g.id ? 'selected' : ''}" onclick="selectGame('${g.id}')">
            <div class="game-title">${g.title}</div>
            <div class="game-meta">${g.category} • ${g.players} Players</div>
            <div class="game-desc">${g.desc}</div>
        </div>
    `).join('');

    return `
        <div class="container container-wide" style="margin-top: 4rem;">
            <button class="back-btn" onclick="navigate('LOBBY')">← Back to Lobby</button>
            <h1>Select a Game</h1>
            <p class="subtitle">Choose the next adventure for Party ${partyCode}</p>
            
            <div class="games-grid">
                ${gamesHtml}
            </div>

            <div style="margin-top: 2rem; display: flex; justify-content: flex-end;">
                <button class="btn-primary" id="startGameBtn" ${selectedGame ? '' : 'disabled'} onclick="startGame()">Start Game</button>
            </div>
        </div>
    `;
}

// Actions
function navigate(state) {
    currentState = state;
    render();
}

// Ensure navigate is accessible globally
window.navigate = navigate;

function createParty() {
    // Generate random 4 letter code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    partyCode = '';
    for(let i=0; i<4; i++) {
        partyCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    isHost = true;
    mockPlayers[0].isHost = true;
    navigate('LOBBY');
}
window.createParty = createParty;

function joinParty() {
    const input = document.getElementById('partyCodeInput').value;
    if(input.length === 4) {
        partyCode = input;
        isHost = false;
        mockPlayers[0].isHost = false;
        navigate('LOBBY');
    } else {
        alert('Please enter a 4-letter party code');
    }
}
window.joinParty = joinParty;

function selectGame(id) {
    selectedGame = id;
    render(); // Re-render to update selected state
}
window.selectGame = selectGame;

function startGame() {
    if(selectedGame) {
        const game = games.find(g => g.id === selectedGame);
        alert(\`Starting \${game.title} on the big screen! Get your thumbs ready!\`);
        // In a real app, this would send a WebSocket event to the server/console
    }
}
window.startGame = startGame;

// Initial render
render();
