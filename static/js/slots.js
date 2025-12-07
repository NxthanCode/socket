let slotsGameActive = false;
let currentSlotsBet = 10;
let balance = 0;
let isSpinning = false;
let currentWin = 0;
let totalSpins = 0;
let slotsGameId = null;
let slotsGameRegistered = false;
let isSlotsActive = false;
const SLOT_SYMBOLS_3x3 = [
    { icon: 'fa-gem', name: 'Diamond', value: 100, color: '#4cc9f0' },
    { icon: 'fa-crown', name: 'Crown', value: 50, color: '#ffd700' },
    { icon: 'fa-coins', name: 'Coin', value: 25, color: '#f0b90b' },
    { icon: 'fa-heart', name: 'Heart', value: 15, color: '#f72585' },
    { icon: 'fa-star', name: 'Star', value: 10, color: '#4361ee' },
    { icon: 'fa-lemon', name: 'Lemon', value: 3, color: '#38b000' }
];
const SLOT_SYMBOLS_5x3 = [
    { icon: 'fa-gem', name: 'Diamond', value: 100, color: '#4cc9f0' },
    { icon: 'fa-crown', name: 'Crown', value: 50, color: '#ffd700' },
    { icon: 'fa-coins', name: 'Coin', value: 25, color: '#f0b90b' },
    { icon: 'fa-heart', name: 'Heart', value: 15, color: '#f72585' },
    { icon: 'fa-snowflake', name: 'Snowflake', value: 10, color: '#7209b7' },
    { icon: 'fa-star', name: 'Star', value: 10, color: '#4361ee' },
    { icon: 'fa-diamond', name: 'Rhombus', value: 5, color: '#4cc9f0' },
    { icon: 'fa-lemon', name: 'Lemon', value: 3, color: '#38b000' },
    { icon: 'fa-bell', name: 'Bell', value: 20, color: '#ffd700' },
    { icon: 'fa-clover', name: 'Clover', value: 7, color: '#228b22' }
];
window.loadSlotsGame = loadSlotsGame;
function loadSlotsGame() {
    registerSlotsGame();
    getCurrentUserId();
    const gamesContainer = document.getElementById('gamesContainer');
    const slotsGameContainer = document.getElementById('slotsGameContainer') || createSlotsContainer();
    const minesGameContainer = document.getElementById('minesGameContainer');
    const crashGameContainer = document.getElementById('crashGameContainer');
    if (minesGameContainer) {
        minesGameContainer.innerHTML = '';
        minesGameContainer.classList.add('hidden');
        minesGameContainer.style.display = 'none';
    }
    if (crashGameContainer) {
        crashGameContainer.innerHTML = '';
        crashGameContainer.classList.add('hidden');
        crashGameContainer.style.display = 'none';
    }
    gamesContainer.classList.add('hidden');
    gamesContainer.style.display = 'none';
    slotsGameContainer.classList.remove('hidden');
    slotsGameContainer.style.display = 'block';
    slotsGameContainer.innerHTML = '';
    slotsGameContainer.innerHTML = `
        <div class="slots-game-container">
            <h2><i class="fas fa-slot-machine"></i> slots</h2>
            <div class="game-controls">
                <div class="control-group">
                    <label><i class="fas fa-dollar-sign"></i> bet amount</label>
                    <div class="bet-buttons">
                        <button class="bet-btn" data-bet="1">$1</button>
                        <button class="bet-btn" data-bet="5">$5</button>
                        <button class="bet-btn active" data-bet="10">$10</button>
                        <button class="bet-btn" data-bet="25">$25</button>
                        <button class="bet-btn" data-bet="50">$50</button>
                        <button class="bet-btn" data-bet="100">$100</button>
                    </div>
                    <div class="custom-bet">
                        <input type="number" id="customBetInput" min="1" max="1000" value="10">
                        <button class="custom-bet-btn" id="setCustomBet">set custom</button>
                    </div>
                </div>
                <div class="control-group">
                    <label><i class="fas fa-th-large"></i> slot type</label>
                    <select id="slotType" class="control-input">
                        <option value="3x3">3x3</option>
                        <option value="5x3" selected>5x3</option>
                    </select>
                </div>
                <div class="control-group">
                    <div class="game-stats">
                        <span id="currentBetDisplay">Bet: $${currentSlotsBet}</span>
                        <span id="lastWinDisplay">Last: $0</span>
                        <span id="balanceDisplay">Balance: $${balance}</span>
                    </div>
                </div>
            </div>
            <div class="slots-machine">
                <div class="slots-header">
                    <div class="slots-title" id="slotTypeTitle">slots</div>
                    <div class="win-display" id="winDisplay">select slot type and spin!</div>
                </div>
                <div class="reels-container" id="reelsContainer">
                </div>
                <div class="payline"></div>
                <div class="spin-controls">
                    <button class="spin-btn" id="spinBtn">
                        <i class="fas fa-play"></i>
                        <span>spin ($${currentSlotsBet})</span>
                    </button>
                </div>
            </div>
            <div class="paytable">
                <h3><i class="fas fa-list-alt"></i> paytable</h3>
                <div class="paytable-grid" id="paytableGrid"></div>
            </div>
            <div class="action-buttons">
                <button class="btn btn-secondary" onclick="goBackToMain()">
                    <i class="fas fa-arrow-left"></i> go back
                </button>
            </div>
        </div>
    `;
    initializeSlotsGame();
}
function createSlotsContainer() {
    const mainContainer = document.getElementById('mainGamesContainer');
    const container = document.createElement('div');
    container.id = 'slotsGameContainer';
    container.className = 'hidden';
    mainContainer.appendChild(container);
    return container;
}
function registerSlotsGame() {
    if (slotsGameRegistered) return;
    const slotTypeSelect = document.getElementById('slotType');
    const slotType = slotTypeSelect ? slotTypeSelect.value : '5x3';
    fetch('/api/slots/register-game', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            bet_amount: currentSlotsBet,
            slot_type: slotType
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            slotsGameId = data.game_id;
            slotsGameRegistered = true;
            console.log('Slots game registered:', slotsGameId);
            if (window.sendGameStatus) {
                window.sendGameStatus('slots');
            }
        }
    })
    .catch(error => {
        console.error('Failed to register slots game:', error);
    });
}
function initializeSlotsGame() {
    generateReelSymbols();
    generatePaytable();
    setupSlotsEventListeners();
    loadBalance();
}
function generateReelSymbols() {
    const slotTypeSelect = document.getElementById('slotType');
    const slotType = slotTypeSelect ? slotTypeSelect.value : '5x3';
    const reelCount = slotType === '3x3' ? 3 : 5;
    const reelsContainer = document.getElementById('reelsContainer');
    if (!reelsContainer) return;
    reelsContainer.innerHTML = '';
    reelsContainer.style.gridTemplateColumns = `repeat(${reelCount}, 1fr)`;
    reelsContainer.style.gap = '10px';
    const slotTypeTitle = document.getElementById('slotTypeTitle');
    if (slotTypeTitle) {
        slotTypeTitle.textContent = 'slots';
    }
    for (let i = 1; i <= reelCount; i++) {
        const reelWrapper = document.createElement('div');
        reelWrapper.className = 'reel-wrapper';
        reelWrapper.style.height = '240px';
        const reel = document.createElement('div');
        reel.className = 'reel';
        reel.id = `reel${i}`;
        const reelStrip = document.createElement('div');
        reelStrip.className = 'reel-strip';
        const totalSymbols = 20;
        for (let j = 0; j < totalSymbols; j++) {
            const symbol = getRandomSymbol(slotType);
            const symbolDiv = document.createElement('div');
            symbolDiv.className = 'symbol';
            symbolDiv.dataset.symbol = symbol.name.toLowerCase();
            symbolDiv.dataset.value = symbol.value;
            symbolDiv.innerHTML = `<i class="fas ${symbol.icon}"></i>`;
            symbolDiv.style.color = symbol.color;
            symbolDiv.style.height = '80px';
            symbolDiv.style.display = 'flex';
            symbolDiv.style.alignItems = 'center';
            symbolDiv.style.justifyContent = 'center';
            symbolDiv.style.fontSize = '2.5rem';
            reelStrip.appendChild(symbolDiv);
        }
        reel.appendChild(reelStrip);
        reelWrapper.appendChild(reel);
        reelsContainer.appendChild(reelWrapper);
    }
}
function getRandomSymbol(slotType) {
    const symbols = slotType === '3x3' ? SLOT_SYMBOLS_3x3 : SLOT_SYMBOLS_5x3;
    const weightedSymbols = [];
    symbols.forEach((symbol, index) => {
        let weight = 20 - (index * 2);
        if (symbol.name === 'Diamond') weight = 2;
        if (symbol.name === 'Crown') weight = 4;
        if (symbol.name === 'Coin') weight = 6;
        if (symbol.name === 'Heart') weight = 8;
        if (symbol.name === 'Bell') weight = 5;
        if (symbol.name === 'Snowflake' || symbol.name === 'Star') weight = 12;
        if (symbol.name === 'Rhombus') weight = 15;
        if (symbol.name === 'Lemon') weight = 20;
        if (symbol.name === 'Clover') weight = 10;
        for (let i = 0; i < weight; i++) {
            weightedSymbols.push(symbol);
        }
    });
    const randomIndex = Math.floor(Math.random() * weightedSymbols.length);
    return weightedSymbols[randomIndex];
}
function generatePaytable() {
    const paytableGrid = document.getElementById('paytableGrid');
    if (!paytableGrid) return;
    const slotTypeSelect = document.getElementById('slotType');
    const slotType = slotTypeSelect ? slotTypeSelect.value : '5x3';
    const symbols = slotType === '3x3' ? SLOT_SYMBOLS_3x3 : SLOT_SYMBOLS_5x3;
    paytableGrid.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'paytable-title';
    title.textContent = 'Paytable';
    title.style.gridColumn = '1 / -1';
    title.style.textAlign = 'center';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '10px';
    paytableGrid.appendChild(title);
    symbols.forEach(symbol => {
        const item = document.createElement('div');
        item.className = 'paytable-item';
        item.innerHTML = `
            <div class="paytable-symbol" style="color: ${symbol.color}">
                <i class="fas ${symbol.icon}"></i>
            </div>
            <div class="paytable-info">
                <div class="paytable-name">${symbol.name}</div>
                <div class="paytable-value">${symbol.value}x</div>
            </div>
        `;
        paytableGrid.appendChild(item);
    });
}
function setupSlotsEventListeners() {
    document.querySelectorAll('.bet-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.bet-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentSlotsBet = parseInt(this.dataset.bet);
            const customBetInput = document.getElementById('customBetInput');
            if (customBetInput) customBetInput.value = currentSlotsBet;
            updateSpinButtonText();
            updateBetDisplay();
        });
    });
    const spinBtn = document.getElementById('spinBtn');
    if (spinBtn) {
        spinBtn.addEventListener('click', spinSlots);
    }
    const customBetBtn = document.getElementById('setCustomBet');
    if (customBetBtn) {
        customBetBtn.addEventListener('click', setCustomBet);
    }
    const customBetInput = document.getElementById('customBetInput');
    if (customBetInput) {
        customBetInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                setCustomBet();
            }
        });
    }
    const slotTypeSelect = document.getElementById('slotType');
    if (slotTypeSelect) {
        slotTypeSelect.addEventListener('change', function() {
            generateReelSymbols();
            generatePaytable();
        });
    }
}
function updateSpinButtonText() {
    const spinBtn = document.getElementById('spinBtn');
    if (spinBtn) {
        const span = spinBtn.querySelector('span');
        if (span) span.textContent = `spin ($${currentSlotsBet})`;
    }
}
function updateBetDisplay() {
    const betDisplay = document.getElementById('currentBetDisplay');
    if (betDisplay) {
        betDisplay.textContent = `Bet: $${currentSlotsBet}`;
    }
}
function setCustomBet() {
    const customBetInput = document.getElementById('customBetInput');
    if (!customBetInput) return;
    let customBet = parseInt(customBetInput.value);
    if (isNaN(customBet) || customBet < 1) {
        showToast('Invalid Bet', 'Bet must be at least $1', 'error', 2000);
        return;
    }
    if (customBet > 1000) {
        customBet = 1000;
        customBetInput.value = 1000;
    }
    currentSlotsBet = customBet;
    document.querySelectorAll('.bet-btn').forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.dataset.bet) === customBet) {
            btn.classList.add('active');
        }
    });
    updateSpinButtonText();
    updateBetDisplay();
    showToast('Bet Updated', `Bet set to $${currentSlotsBet}`, 'info', 1500);
}
function spinSlots() {
    if (isSpinning) {
        showToast('Already Spinning', 'Please wait', 'warning', 2000);
        return;
    }
    
    const slotTypeSelect = document.getElementById('slotType');
    const slotType = slotTypeSelect ? slotTypeSelect.value : '5x3';
    
    fetch('/api/slots/deduct-bet', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            bet_amount: currentSlotsBet
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            balance = data.new_balance;
            updateHeaderBalance(balance);
            updateBalanceDisplay();
            
            if (!slotsGameRegistered) {
                fetch('/api/slots/register-game', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        bet_amount: currentSlotsBet,
                        slot_type: slotType
                    })
                })
                .then(response => response.json())
                .then(regData => {
                    if (regData.success) {
                        slotsGameId = regData.game_id;
                        slotsGameRegistered = true;
                        if (typeof window.sendGameStatus === 'function') {
                            window.sendGameStatus('slots');
                        }
                        executeSpin(slotType);
                    } else {
                        executeSpin(slotType);
                    }
                })
                .catch(error => {
                    console.error('Failed to register game:', error);
                    executeSpin(slotType);
                });
            } else {
                executeSpin(slotType);
            }
        } else {
            showToast('Insufficient Balance', data.message || `You need $${currentSlotsBet}`, 'error', 3000);
        }
    })
    .catch(error => {
        console.error('Failed to deduct bet:', error);
        showToast('Error', 'Failed to place bet', 'error', 3000);
    });
}
function executeSpin(slotType) {
    updateHeaderBalance(balance);
    updateBalanceDisplay();
    
    isSpinning = true;
    currentWin = 0;
    totalSpins++;
    
    const winDisplay = document.getElementById('winDisplay');
    if (winDisplay) {
        winDisplay.textContent = 'spinning...';
        winDisplay.className = 'win-display spinning';
    }
    
    const spinBtn = document.getElementById('spinBtn');
    if (spinBtn) spinBtn.disabled = true;
    document.querySelectorAll('.bet-btn').forEach(btn => {
        btn.disabled = true;
    });
    
    const customBetBtn = document.getElementById('setCustomBet');
    if (customBetBtn) customBetBtn.disabled = true;
    
    const customBetInput = document.getElementById('customBetInput');
    if (customBetInput) customBetInput.disabled = true;
    
    const slotTypeSelect = document.getElementById('slotType');
    if (slotTypeSelect) slotTypeSelect.disabled = true;
    
    const reelCount = slotType === '3x3' ? 3 : 5;
    const spinResults = [];
    for (let i = 0; i < reelCount; i++) {
        spinResults.push(getRandomSymbol(slotType));
    }
    
    if (window.globalSocket && window.globalSocket.connected && slotsGameId) {
        window.globalSocket.emit('slots_spinning', {
            game_id: slotsGameId,
            bet_amount: currentSlotsBet,
            slot_type: slotType
        });
    }
    
    for (let i = 1; i <= reelCount; i++) {
        setTimeout(() => {
            spinReel(i, 800 + (i * 100), spinResults[i-1]);
        }, i * 150);
    }
    
    setTimeout(() => {
        let winCheck;
        if (slotType === '3x3') {
            winCheck = checkWin3x3(spinResults);
        } else {
            winCheck = checkWin5x3(spinResults);
        }
        
        if (winCheck.winAmount > 0) {
            currentWin = winCheck.winAmount;
            
            fetch('/api/slots/update-balance', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    win_amount: currentWin,
                    bet_amount: currentSlotsBet
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    balance = data.new_balance;
                    updateHeaderBalance(balance);
                    updateBalanceDisplay();
                    
                    if (winDisplay) {
                        winDisplay.textContent = winCheck.message;
                        winDisplay.className = 'win-display win';
                    }
                    
                    showToast('Win', `You won $${currentWin}!`, 'success', 3000);
                    
                    const lastWinDisplay = document.getElementById('lastWinDisplay');
                    if (lastWinDisplay) {
                        lastWinDisplay.textContent = `Last: $${currentWin}`;
                    }
                    
                    highlightWinningReels(reelCount);
                    
                    if (window.globalSocket && window.globalSocket.connected && slotsGameId) {
                        window.globalSocket.emit('slots_spin_complete', {
                            game_id: slotsGameId,
                            win_amount: currentWin,
                            bet_amount: currentSlotsBet,
                            total_spins: totalSpins,
                            win_type: winCheck.type,
                            message: winCheck.message
                        });
                    }
                }
            })
            .catch(error => {
                console.error('Failed to update balance:', error);
            });
        } else {
            if (winDisplay) {
                winDisplay.textContent = 'try again!';
                winDisplay.className = 'win-display';
            }
            
            loadBalance().then(newBalance => {
                balance = newBalance;
                updateHeaderBalance(balance);
                updateBalanceDisplay();
            });
            
            if (window.globalSocket && window.globalSocket.connected && slotsGameId) {
                window.globalSocket.emit('slots_spin_complete', {
                    game_id: slotsGameId,
                    win_amount: 0,
                    bet_amount: currentSlotsBet,
                    total_spins: totalSpins
                });
            }
        }
        
        isSpinning = false;
        if (spinBtn) spinBtn.disabled = false;
        document.querySelectorAll('.bet-btn').forEach(btn => {
            btn.disabled = false;
        });
        
        if (customBetBtn) customBetBtn.disabled = false;
        if (customBetInput) customBetInput.disabled = false;
        if (slotTypeSelect) slotTypeSelect.disabled = false;
    }, 2000 + (reelCount * 200));
}
function checkWin3x3(results) {
    const symbolNames = results.map(s => s.name.toLowerCase());
    const symbolValues = results.map(s => s.value);
    if (symbolNames[0] === symbolNames[1] && symbolNames[1] === symbolNames[2]) {
        const winAmount = Math.floor(currentSlotsBet * symbolValues[0]);
        return {
            winAmount: winAmount,
            message: 'THREE IN A ROW!',
            type: 'Three Match'
        };
    }
    if (symbolNames[0] === symbolNames[1]) {
        const winAmount = Math.floor(currentSlotsBet * (symbolValues[0] / 3));
        return {
            winAmount: winAmount,
            message: 'DOUBLE (left)!',
            type: 'Double'
        };
    }
    if (symbolNames[1] === symbolNames[2]) {
        const winAmount = Math.floor(currentSlotsBet * (symbolValues[1] / 3));
        return {
            winAmount: winAmount,
            message: 'DOUBLE (right)!',
            type: 'Double'
        };
    }
    if (symbolNames[0] === symbolNames[2]) {
        const winAmount = Math.floor(currentSlotsBet * (symbolValues[0] / 4));
        return {
            winAmount: winAmount,
            message: 'DIAGONAL WIN!',
            type: 'Diagonal'
        };
    }
    return {
        winAmount: 0,
        message: 'try again!',
        type: 'No Win'
    };
}
function checkWin5x3(results) {
    const symbolNames = results.map(s => s.name.toLowerCase());
    const symbolValues = results.map(s => s.value);
    if (symbolNames[0] === symbolNames[1] && symbolNames[1] === symbolNames[2] && 
        symbolNames[2] === symbolNames[3] && symbolNames[3] === symbolNames[4]) {
        return {
            winAmount: Math.floor(currentSlotsBet * symbolValues[0] * 3),
            message: 'FIVE IN A ROW!',
            type: 'Five Match'
        };
    }
    if (symbolNames[0] === symbolNames[1] && symbolNames[1] === symbolNames[2] && 
        symbolNames[2] === symbolNames[3]) {
        return {
            winAmount: Math.floor(currentSlotsBet * symbolValues[0] * 2),
            message: 'FOUR IN A ROW!',
            type: 'Four Match'
        };
    }
    if (symbolNames[1] === symbolNames[2] && symbolNames[2] === symbolNames[3] && 
        symbolNames[3] === symbolNames[4]) {
        return {
            winAmount: Math.floor(currentSlotsBet * symbolValues[1] * 2),
            message: 'FOUR IN A ROW!',
            type: 'Four Match'
        };
    }
    for (let i = 0; i <= 2; i++) {
        if (symbolNames[i] === symbolNames[i+1] && symbolNames[i+1] === symbolNames[i+2]) {
            return {
                winAmount: Math.floor(currentSlotsBet * symbolValues[i]),
                message: 'THREE IN A ROW!',
                type: 'Three Match'
            };
        }
    }
    let bestPairIndex = -1;
    let bestPairValue = 0;
    for (let i = 0; i <= 3; i++) {
        if (symbolNames[i] === symbolNames[i+1]) {
            if (symbolValues[i] > bestPairValue) {
                bestPairValue = symbolValues[i];
                bestPairIndex = i;
            }
        }
    }
    if (bestPairIndex !== -1) {
        return {
            winAmount: Math.floor(currentSlotsBet * (bestPairValue / 5)),
            message: 'DOUBLE!',
            type: 'Double'
        };
    }
    return {
        winAmount: 0,
        message: 'try again!',
        type: 'No Win'
    };
}
function getCurrentUserId() {
    if (!currentUserId) {
        const userId = localStorage.getItem('userId');
        if (userId) {
            currentUserId = parseInt(userId);
        } else {
            fetch('/api/check-auth')
                .then(response => response.json())
                .then(data => {
                    if (data.authenticated) {
                        currentUserId = data.user_id;
                        localStorage.setItem('userId', data.user_id);
                    }
                })
                .catch(console.error);
        }
    }
    return currentUserId;
}
function spinReel(reelNumber, duration, targetSymbol) {
    const reel = document.getElementById(`reel${reelNumber}`);
    if (!reel) return;
    const reelStrip = reel.querySelector('.reel-strip');
    if (!reelStrip) return;
    reelStrip.style.transition = 'none';
    reelStrip.style.transform = 'translateY(0)';
    void reelStrip.offsetWidth;
    const symbolHeight = 80;
    const totalSymbols = 20;
    const extraSpins = 3;
    const randomStop = Math.floor(Math.random() * totalSymbols);
    const stripHeight = totalSymbols * symbolHeight;
    const visibleHeight = 240;
    const maxTranslate = -(stripHeight - visibleHeight);
    const finalPosition = Math.max(
        -(randomStop * symbolHeight) - (extraSpins * totalSymbols * symbolHeight),
        maxTranslate
    );
    reelStrip.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0.8, 0.3, 1)`;
    reelStrip.style.transform = `translateY(${finalPosition}px)`;
    setTimeout(() => {
        const symbols = reelStrip.querySelectorAll('.symbol');
        const currentPos = Math.abs(Math.round(finalPosition / symbolHeight)) % totalSymbols;
        const paylineIndex = (currentPos + 1) % totalSymbols;
        if (symbols[paylineIndex]) {
            symbols[paylineIndex].dataset.symbol = targetSymbol.name.toLowerCase();
            symbols[paylineIndex].dataset.value = targetSymbol.value;
            symbols[paylineIndex].innerHTML = `<i class="fas ${targetSymbol.icon}"></i>`;
            symbols[paylineIndex].style.color = targetSymbol.color;
        }
        reel.style.transform = 'scale(1.05)';
        setTimeout(() => {
            reel.style.transform = 'scale(1)';
        }, 100);
    }, duration - 50);
}
function highlightWinningReels(reelCount) {
    const payline = document.querySelector('.payline');
    if (payline) {
        payline.style.animation = 'none';
        void payline.offsetWidth;
        payline.style.animation = 'pulse 0.5s ease 3';
    }
    for (let i = 1; i <= reelCount; i++) {
        setTimeout(() => {
            const reel = document.getElementById(`reel${i}`);
            if (reel) {
                reel.style.boxShadow = '0 0 15px gold';
                setTimeout(() => {
                    reel.style.boxShadow = 'none';
                }, 800);
            }
        }, i * 150);
    }
}
function loadBalance() {
    return fetch('/api/check-auth')
        .then(response => response.json())
        .then(data => {
            if (data.authenticated) {
                balance = data.balance;
                updateHeaderBalance(balance);
                updateBalanceDisplay();
                return balance;
            }
            return 0;
        })
        .catch(error => {
            console.error('Error loading balance:', error);
            return 0;
        });
}
function updateBalanceDisplay() {
    const balanceDisplay = document.getElementById('balanceDisplay');
    if (balanceDisplay) {
        balanceDisplay.textContent = `Balance: $${balance}`;
    }
}
function updateHeaderBalance(balance) {
    const header = document.querySelector('.header');
    let balanceDiv = header.querySelector('.balance-header');
    if (!balanceDiv) {
        balanceDiv = document.createElement('div');
        balanceDiv.className = 'balance-header';
        const logo = header.querySelector('.logo');
        header.insertBefore(balanceDiv, logo.nextElementSibling);
    }
    balanceDiv.innerHTML = `
        <i class="fas fa-coins"></i>
        <span>balance: $${balance}</span>
    `;
}
function showToast(title, message, type = 'info', duration = 5000) {
    const container = document.getElementById('toastContainer') || createToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = getToastIcon(type);
    toast.innerHTML = `
        <div class="toast-icon">
            <i class="${icon}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="removeToast(this)">
            <i class="fas fa-times"></i>
        </button>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    if (duration > 0) {
        setTimeout(() => {
            removeToast(toast.querySelector('.toast-close'));
        }, duration);
    }
    return toast;
}
function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
}
function cleanupSlotsGame() {
    if (slotsGameId && window.globalSocket && window.globalSocket.connected) {
        window.globalSocket.emit('slots_game_ended', {
            game_id: slotsGameId
        });
        console.log('Emitted slots_game_ended for:', slotsGameId);
    }
    if (typeof window.sendGameStatus === 'function') {
        window.sendGameStatus(null);
    }
    slotsGameId = null;
    slotsGameRegistered = false;
}
function getToastIcon(type) {
    switch(type) {
        case 'success':
            return 'fas fa-check-circle';
        case 'error':
            return 'fas fa-exclamation-circle';
        case 'warning':
            return 'fas fa-exclamation-triangle';
        case 'info':
            return 'fas fa-info-circle';
        default:
            return 'fas fa-info-circle';
    }
}
function removeToast(closeBtn) {
    const toast = closeBtn.closest('.toast');
    if (toast) {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }
}
const style = document.createElement('style');
style.textContent = `
@keyframes pulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 10px #4cc9f0; }
    50% { opacity: 0.7; box-shadow: 0 0 25px #ffd700; }
}
`;
const spinStyle = document.createElement('style');
spinStyle.textContent = `
@keyframes spin {
    0% { transform: rotateX(0deg); opacity: 1; }
    25% { transform: rotateX(90deg); opacity: 0.7; }
    50% { transform: rotateX(180deg); opacity: 0.5; }
    75% { transform: rotateX(270deg); opacity: 0.7; }
    100% { transform: rotateX(360deg); opacity: 1; }
}
.reel.spinning .reel-strip {
    animation: spin 0.1s linear infinite;
}
.win-display.spinning {
    color: #4cc9f0;
    animation: pulse 0.5s infinite;
}
.win-display.win {
    color: #38b000;
    font-weight: bold;
    animation: pulse 1s infinite;
}
@keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
}
`;
document.head.appendChild(spinStyle);
document.head.appendChild(style);