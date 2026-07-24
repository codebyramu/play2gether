function switchState(stateId) {
    document.querySelectorAll('.phone-state').forEach(el => el.classList.remove('active'));
    document.getElementById(stateId).classList.add('active');
}

function goToAvatar() {
    const code = document.getElementById('join-code').value;
    if(code.length === 4) {
        switchState('avatar-state');
    } else {
        alert("Hmm, that code's not it — try again! (Need 4 letters)");
    }
}

function goToWaiting() {
    switchState('waiting-state');
}

function goToController() {
    switchState('controller-state');
}

function pulseBtn(btn) {
    btn.classList.remove('ripple');
    // trigger reflow
    void btn.offsetWidth;
    btn.classList.add('ripple');
}

function activeBtn(btn) {
    btn.classList.add('active');
}

function deactiveBtn(btn) {
    btn.classList.remove('active');
}

// Add random emojis to avatar picker for demo
const emojis = ['🦊', '🐼', '🐸', '🐰', '🐯', '🦄', '🐙', '🦖'];
let currentEmoji = 0;

document.querySelectorAll('.nav-btn').forEach((btn, index) => {
    btn.addEventListener('pointerdown', () => {
        if(index === 0) {
            currentEmoji = (currentEmoji - 1 + emojis.length) % emojis.length;
        } else {
            currentEmoji = (currentEmoji + 1) % emojis.length;
        }
        document.querySelector('.avatar-preview').innerText = emojis[currentEmoji];
        document.querySelector('.jumping-avatar').innerText = emojis[currentEmoji];
    });
});
