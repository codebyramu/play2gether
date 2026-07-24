function switchState(stateId) {
    document.querySelectorAll('.state-container').forEach(el => el.classList.remove('active'));
    document.getElementById(stateId).classList.add('active');
}

function startCountdown() {
    switchState('countdown-state');
    let count = 3;
    const textEl = document.getElementById('countdown-text');
    textEl.innerText = count;
    textEl.style.color = "var(--accent)";
    
    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            textEl.innerText = count;
            // Force reflow for animation restart
            textEl.style.animation = 'none';
            textEl.offsetHeight; 
            textEl.style.animation = 'popIn 1s';
        } else if (count === 0) {
            textEl.innerText = "GO!";
            textEl.style.color = "var(--success)";
            textEl.style.animation = 'none';
            textEl.offsetHeight; 
            textEl.style.animation = 'popIn 0.5s forwards';
        } else {
            clearInterval(interval);
            switchState('game-state');
            
            // Re-trigger GO banner in game state
            const banner = document.querySelector('.alert-banner');
            banner.style.animation = 'none';
            banner.offsetHeight;
            banner.style.animation = 'popIn 1s forwards';
            setTimeout(() => {
                banner.style.opacity = '0';
            }, 1500);
        }
    }, 1000);
}

function showResults() {
    switchState('results-state');
}

function nextRound() {
    switchState('lobby-state');
}
