let currentGameId = null;
let minesGameActive = false;
let revealedCells = [];
let minesPositions = [];
let crashGameActive = false;
let crashGameId = null;
let crashMultiplier = 1.00;
let crashInterval = null;
let crashStartTime = null;
let crashPoint = null;
let crashBetAmount = 0;
let isSpectating = false;
let spectatingGameData = null;
let spectatingGameType = null;
let spectatingGameId = null;
let activeMinesBoosters = [];
let activeCrashBoosters = [];
let minesMultiplier = 1.0;

document.addEventListener('DOMContentLoaded', function() {
    loadBalance();
    setupSpectatingCheck();
    setupCategoryTabs();
    checkURLForSpectate();
});
function setupSpectatingCheck() {
    setInterval(() => {
        if (!isSpectating && !minesGameActive && !crashGameActive) {
            loadPlayersInGame();
        }
    }, 10000);
    loadPlayersInGame();
}
function sendGameStatus(game) {
    if (typeof window.sendGameStatus === 'function') {
        window.sendGameStatus(game);
    }
}
function loadBalance() {
    fetch('/api/check-auth')
        .then(response => response.json())
        .then(data => {
            if (data.authenticated) {
                updateHeaderBalance(data.balance);
            }
        })
        .catch(error => {
            console.error('error:', error);
        });
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
function loadPlayersInGame() {
    fetch('/api/players-in-game')
        .then(response => response.json())
        .then(players => {
            const minesPlayers = players.filter(player => player.game_type === 'mines');
            updateSpectatingSidebar(minesPlayers);
        })
        .catch(error => {
            console.error('Error loading players in game:', error);
        });
}
function updateSpectatingSidebar(players) {
    let sidebar = document.getElementById('spectatingSidebar');
    if (!sidebar) {
        sidebar = document.createElement('div');
        sidebar.id = 'spectatingSidebar';
        sidebar.className = 'spectating-sidebar hidden';
        sidebar.innerHTML = `
            <div class="sidebar-header">
                <h4><i class="fas fa-bomb"></i> Live Mines Games</h4>
                <button class="sidebar-close" onclick="toggleSpectatingSidebar()">&times;</button>
            </div>
            <div class="sidebar-content">
                <div class="sessions-list" id="sessionsList">
                    <div class="loading-sessions">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Loading live games...</p>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(sidebar);
    }
    const sessionsList = document.getElementById('sessionsList');
    if (players.length === 0) {
        sessionsList.innerHTML = `
            <div class="no-sessions">
                <i class="fas fa-bomb"></i>
                <p>No live mines games</p>
                <p class="hint">Players will appear here when they start a mines game</p>
            </div>
        `;
        return;
    }
    sessionsList.innerHTML = '';
    players.forEach(player => {
        const sessionItem = document.createElement('div');
        sessionItem.className = 'session-item';
        if (spectatingGameId === player.game_id && spectatingGameType === player.game_type) {
            sessionItem.classList.add('watching');
        }
        sessionItem.innerHTML = `
            <div class="session-header">
                <div class="session-avatar">
                    <img src="${player.avatar}" alt="${player.username}" onerror="this.src='/static/default-avatar.png'">
                </div>
                <div class="session-info">
                    <div class="session-name">${player.username}</div>
                    <div class="session-game">
                        <i class="fas fa-bomb"></i>
                        mines
                    </div>
                </div>
            </div>
            <div class="session-stats">
                <span class="stat"><i class="fas fa-coins"></i> $${player.balance}</span>
                <span class="stat"><i class="fas fa-bomb"></i> Mines</span>
            </div>
            ${spectatingGameId === player.game_id && spectatingGameType === player.game_type ? 
                `<button class="btn btn-danger btn-small" onclick="stopSpectating()">
                    <i class="fas fa-eye-slash"></i> Stop
                </button>` :
                `<button class="btn btn-primary btn-small" onclick="startSpectating(${player.user_id}, '${player.game_type}', '${player.game_id}')">
                    <i class="fas fa-eye"></i> Spectate
                </button>`
            }
        `;
        sessionsList.appendChild(sessionItem);
    });
}
function toggleSpectatingSidebar() {
    const sidebar = document.getElementById('spectatingSidebar');
    if (sidebar) {
        sidebar.classList.toggle('hidden');
        if (!sidebar.classList.contains('hidden')) {
            loadPlayersInGame();
        }
    }
}
function startSpectating(hostId, gameType, gameId) {
    console.log('START SPECTATING:', { hostId, gameType, gameId });
    if (gameType !== 'mines' && gameType !== 'slots') {
        showToast('Cannot Spectate', 'Only mines and slots games can be spectated', 'error', 3000);
        return;
    }
    fetch('/api/spectate/start', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            host_id: hostId,
            game_type: gameType,
            game_id: gameId
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            isSpectating = true;
            spectatingGameType = gameType;
            spectatingGameId = gameId;
            if (gameType === 'mines') {
                fetchGameData(gameType, gameId, hostId);
            } else if (gameType === 'slots') {
                showSlotsSpectatingView(hostId, gameId);
            }
            showToast('Spectating Started', `Now watching ${gameType} game`, 'info', 3000);
            updateSpectatingSidebar([]);
        } else {
            showToast('Error', data.message, 'error', 3000);
        }
    })
    .catch(error => {
        showToast('Error', 'Failed to start spectating', 'error', 3000);
    });
}
function showSlotsSpectatingView(hostId, gameId) {
    let spectatingContainer = document.getElementById('spectatingContainer');
    if (!spectatingContainer) {
        spectatingContainer = document.createElement('div');
        spectatingContainer.id = 'spectatingContainer';
        spectatingContainer.className = 'spectating-container';
        document.body.appendChild(spectatingContainer);
    }
    spectatingContainer.innerHTML = `
        <div class="spectating-header">
            <div class="spectating-host-info">
                <div class="host-avatar">
                    <img src="/static/default-avatar.png" alt="Player">
                </div>
                <div class="host-details">
                    <div class="host-name">Loading...</div>
                    <div class="host-game">
                        <i class="fas fa-slot-machine"></i>
                        Slots Game
                    </div>
                </div>
            </div>
            <button class="btn btn-danger btn-small" onclick="stopSpectating()">
                <i class="fas fa-eye-slash"></i> Stop Spectating
            </button>
        </div>
        <div class="spectating-content">
            <div class="slots-spectating-view">
                <div class="spectating-title">
                    <i class="fas fa-slot-machine"></i> Slots Game
                </div>
                <div class="slots-reels-preview">
                    <div class="reel-preview">?</div>
                    <div class="reel-preview">?</div>
                    <div class="reel-preview">?</div>
                    <div class="reel-preview">?</div>
                    <div class="reel-preview">?</div>
                </div>
                <div class="spectating-status" id="slotsSpectatingStatus">
                    <i class="fas fa-spinner fa-spin"></i>
                    Waiting for player to spin...
                </div>
                <div class="slots-stats">
                    <div class="stat-item">
                        <div class="stat-label">Last Win</div>
                        <div class="stat-value" id="lastWin">$0</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Total Spins</div>
                        <div class="stat-value" id="totalSpins">0</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    spectatingContainer.style.display = 'block';
    setupSlotsSpectatingSocketListeners(hostId, gameId);
}
function setupSlotsSpectatingSocketListeners(hostId, gameId) {
    const socket = io();
    socket.on('slots_spinning', function(data) {
        if (data.game_id == gameId && data.host_id == hostId) {
            const status = document.getElementById('slotsSpectatingStatus');
            if (status) {
                status.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Player is spinning...';
            }
            const reels = document.querySelectorAll('.reel-preview');
            reels.forEach(reel => {
                reel.style.animation = 'spin 0.5s linear infinite';
            });
        }
    });
    socket.on('slots_spin_complete', function(data) {
        if (data.game_id == gameId && data.host_id == hostId) {
            const status = document.getElementById('slotsSpectatingStatus');
            if (status) {
                if (data.win_amount > 0) {
                    status.innerHTML = `<i class="fas fa-trophy"></i> Won $${data.win_amount}!`;
                    status.style.color = '#38b000';
                } else {
                    status.innerHTML = '<i class="fas fa-times"></i> No win this spin';
                    status.style.color = '#f72585';
                }
            }
            const reels = document.querySelectorAll('.reel-preview');
            reels.forEach(reel => {
                reel.style.animation = 'none';
            });
            const lastWin = document.getElementById('lastWin');
            if (lastWin && data.win_amount > 0) {
                lastWin.textContent = `$${data.win_amount}`;
            }
            const totalSpins = document.getElementById('totalSpins');
            if (totalSpins && data.total_spins) {
                totalSpins.textContent = data.total_spins;
            }
            setTimeout(() => {
                if (status) {
                    status.innerHTML = '<i class="fas fa-clock"></i> Waiting for next spin...';
                    status.style.color = '';
                }
            }, 3000);
        }
    });
}
function stopSpectating() {
    if (!isSpectating) return;
    fetch('/api/spectate/stop', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            game_type: spectatingGameType,
            game_id: spectatingGameId
        })
    })
    .then(response => response.json())
    .then(data => {
        isSpectating = false;
        spectatingGameData = null;
        spectatingGameType = null;
        spectatingGameId = null;
        const spectatingContainer = document.getElementById('spectatingContainer');
        if (spectatingContainer) {
            spectatingContainer.remove();
        }
        showToast('Spectating Stopped', 'You are no longer spectating', 'info', 3000);
        loadPlayersInGame();
    })
    .catch(error => {
        console.error('Error stopping spectating:', error);
    });
}
function fetchGameData(gameType, gameId, hostId) {
    if (gameType !== 'mines' && gameType !== 'slots') {
        showToast('Spectating Error', 'Only mines and slots games can be spectated', 'error', 3000);
        stopSpectating();
        return;
    }
    fetch(`/api/spectate/game-data?game_type=${gameType}&game_id=${gameId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                spectatingGameData = data.game_data;
                showSpectatingView(gameType, data.game_data);
                setupSpectatingSocketListeners(gameType, gameId, hostId);
                if (gameType === 'mines') {
                    setupMinesSpectating(data.game_data);
                } else if (gameType === 'slots') {
                    setupSlotsSpectating(data.game_data);
                }
            }
        })
        .catch(error => {
            console.error('Error fetching game data:', error);
        });
}
function setupSlotsSpectating(gameData) {
    const spectatingContent = document.getElementById('spectatingContent');
    spectatingContent.innerHTML = `
        <div class="spectating-game-area">
            <div class="spectating-title">
                <i class="fas fa-slot-machine"></i> Slots Game - ${gameData.slot_type || '5x3'}
            </div>
            <div class="spectating-slots-container">
                <div class="spectating-reels" id="spectatingReels">
                    <div class="spectating-reel spinning">
                        <div class="reel-symbol">?</div>
                    </div>
                    <div class="spectating-reel spinning">
                        <div class="reel-symbol">?</div>
                    </div>
                    <div class="spectating-reel spinning">
                        <div class="reel-symbol">?</div>
                    </div>
                    ${(gameData.slot_type || '5x3') === '5x3' ? `
                        <div class="spectating-reel spinning">
                            <div class="reel-symbol">?</div>
                        </div>
                        <div class="spectating-reel spinning">
                            <div class="reel-symbol">?</div>
                        </div>
                    ` : ''}
                </div>
                <div class="spectating-spin-status" id="slotsSpinStatus">Player is spinning...</div>
            </div>
            <div class="spectating-slots-info">
                <div class="slots-info-item">
                    <div class="slots-info-label">Current Bet</div>
                    <div class="slots-info-value" id="spectatingSlotsBet">$${gameData.current_bet || gameData.bet_amount || 10}</div>
                </div>
                <div class="slots-info-item">
                    <div class="slots-info-label">Last Win</div>
                    <div class="slots-info-value" id="spectatingLastWin">$${gameData.last_win || 0}</div>
                </div>
                <div class="slots-info-item">
                    <div class="slots-info-label">Total Spins</div>
                    <div class="slots-info-value" id="spectatingTotalSpins">${gameData.total_spins || 0}</div>
                </div>
            </div>
            <div class="game-status" id="slotsGameStatus">
                <span class="status-indicator active"></span>
                <span>Watching slots game</span>
            </div>
        </div>
    `;
    const reels = document.querySelectorAll('.spectating-reel');
    reels.forEach(reel => {
        reel.classList.add('spinning');
    });
}
function generateSpectatingSlotsReels(slotType, currentReels) {
    const reelsContainer = document.getElementById('spectatingReelsContainer');
    if (!reelsContainer) return;
    const reelCount = slotType === '3x3' ? 3 : 5;
    reelsContainer.innerHTML = '';
    reelsContainer.style.gridTemplateColumns = `repeat(${reelCount}, 1fr)`;
    for (let i = 0; i < reelCount; i++) {
        const reelWrapper = document.createElement('div');
        reelWrapper.className = 'reel-wrapper spectating';
        const reel = document.createElement('div');
        reel.className = 'reel spectating';
        const symbol = currentReels[i] || getRandomSymbol(slotType);
        const symbolDiv = document.createElement('div');
        symbolDiv.className = 'symbol spectating';
        symbolDiv.innerHTML = `<i class="fas ${symbol.icon}"></i>`;
        symbolDiv.style.color = symbol.color;
        symbolDiv.style.fontSize = '3rem';
        reel.appendChild(symbolDiv);
        reelWrapper.appendChild(reel);
        reelsContainer.appendChild(reelWrapper);
    }
}
function showSpectatingView(gameType, gameData) {
    if (gameType !== 'mines' && gameType !== 'slots') {
        showToast('Error', 'Only mines and slots games can be spectated', 'error', 3000);
        stopSpectating();
        return;
    }
    let spectatingContainer = document.getElementById('spectatingContainer');
    if (!spectatingContainer) {
        spectatingContainer = document.createElement('div');
        spectatingContainer.id = 'spectatingContainer';
        spectatingContainer.className = 'spectating-container';
        document.body.appendChild(spectatingContainer);
    }
    const gameIcon = gameType === 'mines' ? 'fa-bomb' : 'fa-slot-machine';
    spectatingContainer.innerHTML = `
        <div class="spectating-header">
            <div class="spectating-host-info">
                <div class="host-avatar">
                    <img src="${gameData.host_avatar}" alt="${gameData.host_username}" onerror="this.src='/static/default-avatar.png'">
                </div>
                <div class="host-details">
                    <div class="host-name">${gameData.host_username}</div>
                    <div class="host-game">
                        <i class="fas ${gameIcon}"></i>
                        ${gameType.charAt(0).toUpperCase() + gameType.slice(1)} Game
                    </div>
                </div>
            </div>
            <button class="btn btn-danger btn-small" onclick="stopSpectating()">
                <i class="fas fa-eye-slash"></i> Stop Spectating
            </button>
        </div>
        <div class="spectating-content" id="spectatingContent">
            <div class="loading-spectating">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Loading ${gameType} game view...</p>
            </div>
        </div>
        <div class="spectating-stats">
            <div class="stat-item">
                <div class="stat-label">Balance</div>
                <div class="stat-value">$${gameData.host_balance}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Current Bet</div>
                <div class="stat-value">$${gameData.bet_amount || gameData.current_bet || 0}</div>
            </div>
            ${gameType === 'mines' ? `
                <div class="stat-item">
                    <div class="stat-label">Revealed Cells</div>
                    <div class="stat-value" id="revealedCountSpectating">0/${(gameData.grid_size * gameData.grid_size) - gameData.mines_count}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Potential Win</div>
                    <div class="stat-value">$${gameData.potential_win || 0}</div>
                </div>
            ` : ''}
            ${gameType === 'slots' ? `
                <div class="stat-item">
                    <div class="stat-label">Last Win</div>
                    <div class="stat-value">$${gameData.last_win || 0}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Total Spins</div>
                    <div class="stat-value">${gameData.total_spins || 0}</div>
                </div>
            ` : ''}
        </div>
    `;
    spectatingContainer.style.display = 'block';
}
function setupSpectatingSocketListeners(gameType, gameId, hostId) {
    const socket = io();
    
    if (gameType === 'mines') {
        socket.on('mines_update', function(data) {
            if (data.game_id == gameId && data.host_id == hostId) {
                updateSpectatingMinesDisplay(data);
            }
        });
        
        socket.on('mines_cell_revealed', function(data) {
            if (data.game_id == gameId && data.host_id == hostId) {
                updateSpectatingMinesCell(data);
            }
        });
        
        socket.on('mines_game_over', function(data) {
            if (data.game_id == gameId && data.host_id == hostId) {
                updateSpectatingMinesGameOver(data);
            }
        });
        
        socket.on('mines_cashout', function(data) {
            if (data.game_id == gameId && data.host_id == hostId) {
                updateSpectatingMinesCashout(data);
            }
        });
    }
    
    if (gameType === 'slots') {
        socket.on('slots_spinning', function(data) {
            if (data.game_id == gameId && data.host_id == hostId) {
                updateSpectatingSlotsSpinning(data);
            }
        });
        
        socket.on('slots_spin_complete', function(data) {
            if (data.game_id == gameId && data.host_id == hostId) {
                updateSpectatingSlotsComplete(data);
            }
        });
    }
}

function updateSpectatingMinesGameOver(data) {
    const gameStatus = document.getElementById('minesGameStatus');
    if (gameStatus) {
        gameStatus.innerHTML = `
            <span class="status-indicator danger"></span>
            <span>Game Over - Hit a mine!</span>
        `;
    }
    
    // Show all mines
    const grid = document.getElementById('spectatingMinesGrid');
    if (grid && data.mines_positions) {
        data.mines_positions.forEach(mineIndex => {
            const cell = grid.querySelector(`[data-index="${mineIndex}"]`);
            if (cell && !cell.classList.contains('revealed')) {
                cell.classList.add('mine');
                cell.innerHTML = '<i class="fas fa-bomb"></i>';
            }
        });
    }
    
    showToast('Game Over', 'Player hit a mine!', 'error', 3000);
}

function updateSpectatingMinesCashout(data) {
    const gameStatus = document.getElementById('minesGameStatus');
    if (gameStatus) {
        gameStatus.innerHTML = `
            <span class="status-indicator success"></span>
            <span>Cashed Out! Won $${data.win_amount || 0}</span>
        `;
    }
    
    showToast('Cashout', `Player cashed out $${data.win_amount || 0}!`, 'success', 3000);
}


function updateSpectatingMinesCell(data) {
    if (!spectatingGameData) return;
    
    // Update the grid display
    const grid = document.getElementById('spectatingMinesGrid');
    if (grid) {
        const cell = grid.querySelector(`[data-index="${data.cell_index}"]`);
        if (cell) {
            if (data.result === 'mine') {
                cell.classList.add('mine');
                cell.innerHTML = '<i class="fas fa-bomb"></i>';
            } else {
                cell.classList.add('revealed');
                cell.innerHTML = '<i class="fas fa-gem"></i>';
            }
        }
    }
    
    // Update revealed count
    const revealedCount = document.getElementById('revealedCountSpectating');
    if (revealedCount && spectatingGameData) {
        const totalSafe = (spectatingGameData.grid_size * spectatingGameData.grid_size) - spectatingGameData.mines_count;
        const currentRevealed = data.revealed_cells ? data.revealed_cells.length : 0;
        revealedCount.textContent = `${currentRevealed}/${totalSafe}`;
    }
    
    // Update potential win
    const potentialWin = document.querySelector('.stat-value:last-child');
    if (potentialWin && data.potential_win) {
        potentialWin.textContent = `$${data.potential_win}`;
    }
}

function updateSpectatingSlotsComplete(data) {
    const spinStatus = document.getElementById('slotsSpinStatus');
    if (spinStatus) {
        if (data.win_amount > 0) {
            spinStatus.textContent = `Won $${data.win_amount}!`;
            spinStatus.className = 'spectating-spin-status win';
        } else {
            spinStatus.textContent = 'Spin complete - No win';
            spinStatus.className = 'spectating-spin-status';
        }
    }
    const lastWinElement = document.getElementById('spectatingLastWin');
    if (lastWinElement && data.win_amount > 0) {
        lastWinElement.textContent = `$${data.win_amount}`;
    }
    const totalSpinsElement = document.getElementById('spectatingTotalSpins');
    if (totalSpinsElement && data.total_spins) {
        totalSpinsElement.textContent = data.total_spins;
    }
    const reels = document.querySelectorAll('.spectating-reel');
    reels.forEach(reel => {
        reel.classList.remove('spinning');
    });
    setTimeout(() => {
        if (spinStatus) {
            spinStatus.textContent = 'Waiting for next spin...';
            spinStatus.className = 'spectating-spin-status';
        }
    }, 3000);
}
function updateSpectatingSlotsSpinning(data) {
    const spinStatus = document.getElementById('slotsSpinStatus');
    if (spinStatus) {
        spinStatus.textContent = 'Player is spinning...';
        spinStatus.className = 'spectating-spin-status spinning';
    }
    const betElement = document.getElementById('spectatingSlotsBet');
    if (betElement && data.bet_amount) {
        betElement.textContent = `$${data.bet_amount}`;
    }
    const reels = document.querySelectorAll('.spectating-reel');
    reels.forEach(reel => {
        reel.classList.add('spinning');
    });
}
function updateSpectatingSlotsDisplay(data) {
    const gameStatus = document.getElementById('slotsGameStatus');
    if (gameStatus) {
        if (data.win_amount > 0) {
            gameStatus.innerHTML = `
                <span class="status-indicator success"></span>
                <span>Won $${data.win_amount} on spin!</span>
            `;
            setTimeout(() => {
                gameStatus.innerHTML = `
                    <span class="status-indicator active"></span>
                    <span>Watching slots game</span>
                `;
            }, 3000);
        }
    }
    if (data.reels && spectatingGameData) {
        generateSpectatingSlotsReels(spectatingGameData.slot_type || '5x3', data.reels);
    }
}
function setupMinesSpectating(gameData) {
    const spectatingContent = document.getElementById('spectatingContent');
    spectatingContent.innerHTML = `
        <div class="spectating-game-area">
            <div class="spectating-title">
                <i class="fas fa-bomb"></i> Mines Game - ${gameData.grid_size}x${gameData.grid_size} Grid
            </div>
            <div class="spectating-grid" id="spectatingMinesGrid"></div>
            <div class="game-status" id="minesGameStatus">
                <span class="status-indicator active"></span>
                <span>Game in progress</span>
            </div>
        </div>
    `;
    createSpectatingMinesGrid(gameData.grid_size, gameData.revealed_cells || [], gameData.mines_positions || []);
    updateSpectatingMinesDisplay(gameData);
}
function createSpectatingMinesGrid(size, revealedCells, minesPositions) {
    const grid = document.getElementById('spectatingMinesGrid');
    grid.innerHTML = '';
    let cellSize;
    if (size === 3) cellSize = '60px';
    else if (size === 5) cellSize = '50px';
    else cellSize = '40px';
    grid.style.gridTemplateColumns = `repeat(${size}, ${cellSize})`;
    grid.style.gridTemplateRows = `repeat(${size}, ${cellSize})`;
    const totalCells = size * size;
    for (let i = 0; i < totalCells; i++) {
        const cell = document.createElement('div');
        cell.className = 'spectating-cell';
        cell.dataset.index = i;
        if (revealedCells.includes(i)) {
            if (minesPositions.includes(i)) {
                cell.classList.add('mine');
                cell.innerHTML = '<i class="fas fa-bomb"></i>';
            } else {
                cell.classList.add('revealed');
                cell.innerHTML = '<i class="fas fa-gem"></i>';
            }
        } else {
            if (minesPositions.includes(i)) {
                cell.classList.add('mine-hidden');
            }
            cell.innerHTML = '<i class="fas fa-question"></i>';
        }
        grid.appendChild(cell);
    }
}
function updateSpectatingMinesDisplay(gameData) {
    const revealedCount = document.getElementById('revealedCountSpectating');
    if (revealedCount && spectatingGameData) {
        const totalSafe = (spectatingGameData.grid_size * spectatingGameData.grid_size) - spectatingGameData.mines_count;
        const safeRevealed = (gameData.revealed_cells || []).filter(cell => 
            !(gameData.mines_positions || spectatingGameData.mines_positions || []).includes(cell)
        ).length;
        revealedCount.textContent = `${safeRevealed}/${totalSafe}`;
    }
    const gameStatus = document.getElementById('minesGameStatus');
    if (gameStatus) {
        if (gameData.game_state === 'lost') {
            gameStatus.innerHTML = `
                <span class="status-indicator danger"></span>
                <span>Game Over - Hit a mine!</span>
            `;
            if (gameData.mines_positions) {
                createSpectatingMinesGrid(
                    spectatingGameData.grid_size, 
                    gameData.revealed_cells || [], 
                    gameData.mines_positions
                );
            }
            showToast('Game Over', 'Player hit a mine!', 'error', 3000);
        } else if (gameData.game_state === 'cashed_out') {
            gameStatus.innerHTML = `
                <span class="status-indicator success"></span>
                <span>Cashed Out! Won $${gameData.win_amount || 0}</span>
            `;
            showToast('Cashout', `Player cashed out $${gameData.win_amount || 0}!`, 'success', 3000);
        } else {
            gameStatus.innerHTML = `
                <span class="status-indicator active"></span>
                <span>Game in progress - Potential win: $${gameData.potential_win || 0}</span>
            `;
            if (spectatingGameData) {
                createSpectatingMinesGrid(
                    spectatingGameData.grid_size, 
                    gameData.revealed_cells || [], 
                    gameData.mines_positions || spectatingGameData.mines_positions || []
                );
            }
        }
    }
}
function loadSlotsGame() {
    removeAllGameContainers();
    cleanupSlotsGame();
    const gamesContainer = document.getElementById('gamesContainer');
    if (gamesContainer) {
        gamesContainer.classList.add('hidden');
        gamesContainer.style.display = 'none';
    }
    let slotsGameContainer = document.getElementById('slotsGameContainer');
    if (!slotsGameContainer) {
        const mainContainer = document.getElementById('mainGamesContainer');
        slotsGameContainer = document.createElement('div');
        slotsGameContainer.id = 'slotsGameContainer';
        slotsGameContainer.className = 'slots-game-container';
        mainContainer.appendChild(slotsGameContainer);
    }
    slotsGameContainer.classList.remove('hidden');
    slotsGameContainer.style.display = 'block';
    slotsGameContainer.innerHTML = '';
    if (typeof window.initializeSlotsGame === 'function') {
        const slotsWrapper = document.createElement('div');
        slotsWrapper.id = 'slotsGameWrapper';
        slotsGameContainer.appendChild(slotsWrapper);
        window.initializeSlotsGame();
    } else {
        slotsGameContainer.innerHTML = `
            <div class="game-header">
                <h2><i class="fas fa-slot-machine"></i> slots</h2>
                <button class="btn btn-secondary btn-small" onclick="goBackToMain()">
                    <i class="fas fa-arrow-left"></i> go back
                </button>
            </div>
            <div class="game-content">
                <p>Loading slots game...</p>
                <p>If this doesn't load, make sure slots.js is properly included.</p>
                <button class="btn btn-secondary" onclick="goBackToMain()">
                    <i class="fas fa-arrow-left"></i> go back
                </button>
            </div>
        `;
    }
}
function createMinesContainer() {
    const mainContainer = document.getElementById('mainGamesContainer');
    const container = document.createElement('div');
    container.id = 'minesGameContainer';
    container.className = 'hidden';
    mainContainer.appendChild(container);
    return container;
}
function createCrashContainer() {
    const mainContainer = document.getElementById('mainGamesContainer');
    const container = document.createElement('div');
    container.id = 'crashGameContainer';
    container.className = 'hidden';
    mainContainer.appendChild(container);
    return container;
}
function loadMinesGame() {
    removeAllGameContainers();
    const gamesContainer = document.getElementById('gamesContainer');
    const minesGameContainer = document.getElementById('minesGameContainer') || createMinesContainer();
    const crashGameContainer = document.getElementById('crashGameContainer');
    const slotsGameContainer = document.getElementById('slotsGameContainer');
    if (crashGameContainer) {
        crashGameContainer.innerHTML = '';
        crashGameContainer.classList.add('hidden');
        crashGameContainer.style.display = 'none';
    }
    if (slotsGameContainer) {
        slotsGameContainer.innerHTML = '';
        slotsGameContainer.classList.add('hidden');
        slotsGameContainer.style.display = 'none';
    }
    gamesContainer.classList.add('hidden');
    gamesContainer.style.display = 'none';
    minesGameContainer.classList.remove('hidden');
    minesGameContainer.style.display = 'block';
    minesGameContainer.innerHTML = '';
    minesGameContainer.innerHTML = `
        <div class="mines-game-container">
            <div class="game-header-with-spectate">
                <h2><i class="fas fa-bomb"></i> mines game</h2>
                <button class="btn btn-secondary btn-small" onclick="toggleSpectatingSidebar()">
                    <i class="fas fa-eye"></i> Live Games
                </button>
            </div>
            <div class="game-controls">
                <div class="control-group">
                    <label><i class="fas fa-dollar-sign"></i> bet amount</label>
                    <input type="number" id="betAmount" class="control-input" value="10" min="1">
                </div>
                <div class="control-group">
                    <label><i class="fas fa-th-large"></i> grid size</label>
                    <select id="gridSize" class="control-input">
                        <option value="3">3x3</option>
                        <option value="5" selected>5x5</option>
                        <option value="8">8x8</option>
                    </select>
                </div>
            </div>
            <button class="play-btn" id="startMinesGame">
                <i class="fas fa-play"></i> start game
            </button>
            <div id="gameBoard" class="hidden">
                <div class="mines-grid" id="minesGrid">
                </div>
                <div class="game-info-panel">
                    <div class="info-item">
                        <div class="info-label">bet</div>
                        <div class="info-value" id="currentBet">$10</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">winning</div>
                        <div class="info-value win" id="potentialWin">$12</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">revealed</div>
                        <div class="info-value" id="revealedCount">0/20</div>
                    </div>
                </div>
                <div class="action-buttons">
                    <button class="btn btn-primary" id="cashoutBtn">
                        <i class="fas fa-money-bill-wave"></i> cashout
                    </button>
                    <button class="btn btn-secondary" onclick="goBackToMain()">
                        <i class="fas fa-arrow-left"></i> go back
                    </button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('startMinesGame').addEventListener('click', startMinesGame);
    document.getElementById('betAmount').addEventListener('input', updateBetDisplay);
    document.getElementById('gridSize').addEventListener('change', updateGridDisplay);
    updateBetDisplay();
    updateGridDisplay();
}
function startMinesGame() {
    const betAmount = parseInt(document.getElementById('betAmount').value);
    const gridSize = parseInt(document.getElementById('gridSize').value);
    let minesCount;
    
    if (gridSize === 3) minesCount = 3;
    else if (gridSize === 5) minesCount = 5;
    else minesCount = 10;
    
    // Apply boosters
    applyMinesBoosters();
    
    // Adjust mines count based on boosters
    if (activeMinesBoosters.includes('mine_sniffer')) {
        // Mine sniffer reduces mines by 1
        minesCount = Math.max(1, minesCount - 1);
    }
    
    if (betAmount < 1) {
        showToast('Invalid Bet', 'Bet amount must be at least 1', 'error', 3000);
        return;
    }
    
    // Apply multiplier from gold pickaxe
    const effectiveBet = Math.floor(betAmount * minesMultiplier);
    
    fetch('/api/mines/start', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            bet_amount: effectiveBet,
            grid_size: gridSize,
            mines_count: minesCount,
            boosters: activeMinesBoosters
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            currentGameId = data.game_id;
            minesGameActive = true;
            revealedCells = [];
            minesPositions = [];
            
            // Show active boosters
            showActiveBoosters();
            
            document.getElementById('startMinesGame').classList.add('hidden');
            document.getElementById('gameBoard').classList.remove('hidden');
            document.getElementById('currentBet').textContent = `$${effectiveBet}`;
            const totalSafe = (gridSize * gridSize) - minesCount;
            document.getElementById('revealedCount').textContent = `0/${totalSafe}`;
            createMinesGrid(gridSize);
            updateHeaderBalanceDisplay();
            
            if (typeof window.sendGameStatus === 'function') {
                window.sendGameStatus('mines');
            }
            
            showToast('Game Started', 'Good luck finding the gems', 'info', 3000);
            loadPlayersInGame();
        } else {
            showToast('Error', data.message, 'error', 3000);
        }
    })
    .catch(error => {
        showToast('Error', 'Failed to start game', 'error', 3000);
    });
}

function applyMinesBoosters() {
    activeMinesBoosters = [];
    minesMultiplier = 1.0;
    
    // Check localStorage for active boosters
    const savedBoosters = localStorage.getItem('activeMinesBoosters');
    if (savedBoosters) {
        activeMinesBoosters = JSON.parse(savedBoosters);
    }
    
    // Apply effects
    if (activeMinesBoosters.includes('gold_pickaxe')) {
        minesMultiplier = 1.5; // 50% more rewards
    }
    
    if (activeMinesBoosters.includes('x_ray')) {
        // X-ray will reveal 1 mine at game start
        setTimeout(() => {
            revealRandomMine();
        }, 1000);
    }
}

function revealRandomMine() {
    if (!minesGameActive || !minesPositions.length) return;
    
    const unrevealedMines = minesPositions.filter(pos => !revealedCells.includes(pos));
    if (unrevealedMines.length > 0) {
        const randomMine = unrevealedMines[Math.floor(Math.random() * unrevealedMines.length)];
        const cell = document.querySelector(`.mine-cell[data-index="${randomMine}"]`);
        if (cell && !cell.classList.contains('revealed')) {
            cell.classList.add('xray');
            cell.innerHTML = '<i class="fas fa-eye"></i>';
            setTimeout(() => {
                cell.classList.remove('xray');
                cell.innerHTML = '<i class="fas fa-question"></i>';
            }, 5000);
        }
    }
}

function showActiveBoosters() {
    const gameBoard = document.getElementById('gameBoard');
    const existingBoosters = gameBoard.querySelector('.active-boosters');
    if (existingBoosters) existingBoosters.remove();
    
    if (activeMinesBoosters.length === 0) return;
    
    const boostersDiv = document.createElement('div');
    boostersDiv.className = 'active-boosters';
    boostersDiv.innerHTML = `
        <div class="boosters-title">
            <i class="fas fa-bolt"></i> active boosters
        </div>
        <div class="boosters-list">
            ${activeMinesBoosters.map(booster => `
                <div class="booster-badge ${booster}">
                    <i class="${getBoosterIcon(booster, 'mines')}"></i>
                    <span>${booster.replace('_', ' ')}</span>
                </div>
            `).join('')}
        </div>
    `;
    
    const gameInfo = gameBoard.querySelector('.game-info-panel');
    if (gameInfo) {
        gameBoard.insertBefore(boostersDiv, gameInfo);
    }
}


function createMinesGrid(size) {
    const grid = document.getElementById('minesGrid');
    grid.innerHTML = '';
    let cellSize;
    if (size === 3) cellSize = '80px';
    else if (size === 5) cellSize = '60px';
    else cellSize = '40px';
    grid.style.gridTemplateColumns = `repeat(${size}, ${cellSize})`;
    grid.style.gridTemplateRows = `repeat(${size}, ${cellSize})`;
    const totalCells = size * size;
    for (let i = 0; i < totalCells; i++) {
        const cell = document.createElement('div');
        cell.className = 'mine-cell';
        cell.dataset.index = i;
        cell.innerHTML = '<i class="fas fa-question"></i>';
        cell.addEventListener('click', () => {
            if (minesGameActive && currentGameId && !revealedCells.includes(i)) {
                revealCell(i);
            }
        });
        grid.appendChild(cell);
    }
}
function revealCell(cellIndex) {
    fetch('/api/mines/reveal', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            game_id: currentGameId,
            cell_index: cellIndex,
            has_kevlar: activeMinesBoosters.includes('kevlar_vest')
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            revealedCells = data.revealed_cells;
            minesPositions = data.mines_positions || [];
            const cell = document.querySelector(`.mine-cell[data-index="${cellIndex}"]`);
            
            if (data.result === 'mine') {
                if (data.kevlar_saved) {
                    // Kevlar vest saved you!
                    cell.classList.add('kevlar-saved');
                    cell.innerHTML = '<i class="fas fa-shield-alt"></i>';
                    showToast('Kevlar Vest Saved You!', 'The vest protected you from a mine!', 'success', 3000);
                    
                    // Remove kevlar from active boosters
                    activeMinesBoosters = activeMinesBoosters.filter(b => b !== 'kevlar_vest');
                    showActiveBoosters();
                } else {
                    cell.classList.add('mine');
                    cell.innerHTML = '<i class="fas fa-bomb"></i>';
                    minesGameActive = false;
                    if (data.mines_positions) {
                        minesPositions = data.mines_positions;
                        revealAllMines();
                    }
                    document.getElementById('cashoutBtn').disabled = true;
                    showToast('Game Over', 'You hit a mine', 'error', 3000);
                }
            } else {
                cell.classList.add('revealed');
                cell.innerHTML = `<i class="fas fa-gem"></i>`;
                if (data.potential_win) {
                    document.getElementById('potentialWin').textContent = `$${data.potential_win}`;
                }
                const gridSize = parseInt(document.getElementById('gridSize').value);
                let minesCount;
                if (gridSize === 3) minesCount = 3;
                else if (gridSize === 5) minesCount = 5;
                else minesCount = 10;
                const totalSafe = (gridSize * gridSize) - minesCount;
                document.getElementById('revealedCount').textContent = `${revealedCells.length}/${totalSafe}`;
                if (revealedCells.length >= totalSafe) {
                    minesGameActive = false;
                    cashout();
                }
            }
        } else {
            showToast('Error', data.message, 'error', 3000);
        }
    })
    .catch(error => {
        showToast('Error', 'Failed to reveal cell', 'error', 3000);
    });
}
function revealAllMines() {
    minesPositions.forEach(mineIndex => {
        const cell = document.querySelector(`.mine-cell[data-index="${mineIndex}"]`);
        if (cell && !cell.classList.contains('revealed')) {
            cell.classList.add('mine');
            cell.innerHTML = '<i class="fas fa-bomb"></i>';
        }
    });
}
function cashout() {
    if (!currentGameId) return;
    fetch('/api/mines/cashout', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            game_id: currentGameId
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            minesGameActive = false;
            document.getElementById('cashoutBtn').disabled = true;
            updateHeaderBalance(data.new_balance);
            showToast('Congrats', `You won $${data.win_amount}`, 'success', 4000);
            loadPlayersInGame();
        } else {
            showToast('Error', data.message, 'error', 3000);
        }
    })
    .catch(error => {
        showToast('Error', 'Failed to cashout', 'error', 3000);
    });
}
document.addEventListener('click', function(e) {
    if (e.target.id === 'cashoutBtn' && currentGameId && minesGameActive) {
        cashout();
    }
});
function updateBetDisplay() {
    const betAmount = document.getElementById('betAmount').value;
    document.getElementById('currentBet').textContent = `$${betAmount}`;
    const potentialWin = Math.floor(betAmount * 1.5);
    document.getElementById('potentialWin').textContent = `$${potentialWin}`;
}
function updateGridDisplay() {
    const gridSize = parseInt(document.getElementById('gridSize').value);
    let totalSafe;
    if (gridSize === 3) totalSafe = 6;
    else if (gridSize === 5) totalSafe = 20;
    else totalSafe = 54;
    document.getElementById('revealedCount').textContent = `0/${totalSafe}`;
}
function updateHeaderBalanceDisplay() {
    fetch('/api/money')
        .then(response => response.json())
        .then(data => {
            updateHeaderBalance(data.balance);
        })
        .catch(error => {
            console.error('Error:', error);
        });
}
function loadCrashGame() {
    removeAllGameContainers();
    const gamesContainer = document.getElementById('gamesContainer');
    const crashGameContainer = document.getElementById('crashGameContainer') || createCrashContainer();
    const minesGameContainer = document.getElementById('minesGameContainer');
    const slotsGameContainer = document.getElementById('slotsGameContainer');
    if (minesGameContainer) {
        minesGameContainer.innerHTML = '';
        minesGameContainer.classList.add('hidden');
        minesGameContainer.style.display = 'none';
    }
    if (slotsGameContainer) {
        slotsGameContainer.innerHTML = '';
        slotsGameContainer.classList.add('hidden');
        slotsGameContainer.style.display = 'none';
    }
    gamesContainer.classList.add('hidden');
    gamesContainer.style.display = 'none';
    crashGameContainer.classList.remove('hidden');
    crashGameContainer.style.display = 'block';
    crashGameContainer.innerHTML = '';
    crashGameContainer.innerHTML = `
        <div class="crash-game-container full-width">
            <h2><i class="fas fa-plane"></i> crash game</h2>
            <div class="game-controls">
                <div class="control-group">
                    <label><i class="fas fa-dollar-sign"></i> bet amount</label>
                    <input type="number" id="crashBetAmount" class="control-input" value="10" min="1">
                </div>
            </div>
            <button class="play-btn" id="startCrashGame">
                <i class="fas fa-play"></i> start game
            </button>
            <div id="crashGameBoard" class="hidden">
                <div class="crash-game-area" id="crashGameArea">
                    <div class="crash-sky"></div>
                    <img src="/static/plane.png" class="crash-plane-img" id="crashPlane" alt="plane">
                    <div class="crash-multiplier" id="crashMultiplier">1.00x</div>
                    <div class="crash-timer" id="crashTimer">0.0s</div>
                </div>
                <div class="game-info-panel">
                    <div class="info-item">
                        <div class="info-label">bet</div>
                        <div class="info-value" id="crashCurrentBet">$10</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">winning</div>
                        <div class="info-value win" id="crashPotentialWin">$10</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">status</div>
                        <div class="info-value" id="crashStatus">waiting</div>
                    </div>
                </div>
                <div class="multiplier-history" id="multiplierHistory">
                </div>
                <div class="crash-buttons">
                    <button class="crash-btn primary" id="cashoutCrashBtn">
                        <i class="fas fa-money-bill-wave"></i> cashout
                    </button>
                    <button class="crash-btn danger" id="cancelCrashBtn">
                        <i class="fas fa-stop"></i> cancel
                    </button>
                </div>
                <div class="action-buttons">
                    <button class="btn btn-secondary" onclick="goBackToMain()">
                        <i class="fas fa-arrow-left"></i> go back
                    </button>
                </div>
            </div>
        </div>
    `;
    const startBtn = document.getElementById('startCrashGame');
    const cashoutBtn = document.getElementById('cashoutCrashBtn');
    const cancelBtn = document.getElementById('cancelCrashBtn');
    const betInput = document.getElementById('crashBetAmount');
    if (startBtn) {
        startBtn.addEventListener('click', startCrashGame);
    }
    if (cashoutBtn) {
        cashoutBtn.addEventListener('click', cashoutCrash);
    }
    if (cancelBtn) {
        cancelBtn.addEventListener('click', cancelCrash);
    }
    if (betInput) {
        betInput.addEventListener('input', updateCrashBetDisplay);
    }
    updateCrashBetDisplay();
    loadMultiplierHistory();
}
function startCrashGame() {
    const betAmount = parseInt(document.getElementById('crashBetAmount').value);
    if (betAmount < 1) {
        showToast('Invalid Bet', 'Bet amount must be at least 1', 'error', 3000);
        return;
    }
    fetch('/api/crash/start', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            bet_amount: betAmount
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            crashGameId = data.game_id;
            crashGameActive = true;
            crashMultiplier = 1.00;
            crashBetAmount = betAmount;
            crashPoint = data.crash_point;
            document.getElementById('startCrashGame').classList.add('hidden');
            document.getElementById('crashGameBoard').classList.remove('hidden');
            document.getElementById('crashCurrentBet').textContent = `$${betAmount}`;
            document.getElementById('crashPotentialWin').textContent = `$${betAmount}`;
            document.getElementById('crashStatus').textContent = 'flying...';
            document.getElementById('crashStatus').className = 'info-value win';
            crashStartTime = Date.now();
            startCrashTimer();
            updateHeaderBalanceDisplay();
            if (typeof window.sendGameStatus === 'function') {
                window.sendGameStatus('crash');
            }
        } else {
            showToast('Error', data.message, 'error', 3000);
        }
    })
    .catch(error => {
        showToast('Error', 'Failed to start game', 'error', 3000);
    });
}
function startCrashTimer() {
    clearInterval(crashInterval);
    crashInterval = setInterval(() => {
        if (!crashGameActive) return;
        const elapsed = (Date.now() - crashStartTime) / 1000;
        crashMultiplier = calculateDynamicMultiplier(elapsed, crashBetAmount);
        if (shouldCrashNow(crashMultiplier, elapsed, crashBetAmount)) {
            crashGameOver();
            return;
        }
        updateCrashDisplay();
    }, 50);
}
function updateCrashDisplay() {
    document.getElementById('crashMultiplier').textContent = `${crashMultiplier.toFixed(2)}x`;
    document.getElementById('crashTimer').textContent = `${((Date.now() - crashStartTime) / 1000).toFixed(1)}s`;
    document.getElementById('crashPotentialWin').textContent = `$${Math.floor(crashBetAmount * crashMultiplier)}`;
}
function calculateDynamicMultiplier(elapsed, betAmount) {
    let baseMultiplier = 1 + (elapsed * 0.1);
    let speed = 0.1;
    if (baseMultiplier > 5) {
        speed = 0.15;
    } else if (baseMultiplier > 3) {
        speed = 0.12;
    }
    if (betAmount >= 1000) {
        speed *= 1.5;
    } else if (betAmount >= 500) {
        speed *= 1.3;
    } else if (betAmount >= 100) {
        speed *= 1.15;
    }
    return 1 + (elapsed * speed);
}
function shouldCrashNow(currentMultiplier, elapsed, betAmount) {
    if (currentMultiplier >= crashPoint) {
        return true;
    }
    let crashProbability = 0.001;
    if (currentMultiplier > 5) {
        crashProbability *= 10;
    } else if (currentMultiplier > 3) {
        crashProbability *= 5;
    } else if (currentMultiplier > 2) {
        crashProbability *= 2;
    }
    if (elapsed > 30) {
        crashProbability *= 3;
    } else if (elapsed > 15) {
        crashProbability *= 2;
    }
    if (betAmount >= 1000) {
        crashProbability *= 4;
    } else if (betAmount >= 500) {
        crashProbability *= 2.5;
    } else if (betAmount >= 100) {
        crashProbability *= 1.5;
    }
    return Math.random() < crashProbability;
}
function cashoutCrash() {
    if (!crashGameActive || !crashGameId) return;
    fetch('/api/crash/cashout', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            game_id: crashGameId,
            bet_amount: crashBetAmount,
            multiplier: crashMultiplier
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            crashGameActive = false;
            clearInterval(crashInterval);
            document.getElementById('crashStatus').textContent = 'cashed out';
            document.getElementById('crashStatus').className = 'info-value win';
            updateHeaderBalance(data.new_balance);
            addToMultiplierHistory(crashMultiplier, 'cashed');
            showToast('Cashed Out!', `You won $${data.win_amount} at ${crashMultiplier.toFixed(2)}x`, 'success', 4000);
        } else {
            showToast('Error', data.message, 'error', 3000);
        }
    })
    .catch(error => {
        showToast('Error', 'Failed to cashout', 'error', 3000);
    });
}
function crashGameOver() {
    if (!crashGameActive) return;
    crashGameActive = false;
    clearInterval(crashInterval);
    const plane = document.getElementById('crashPlane');
    if (plane) {
        plane.style.transform = 'rotate(90deg)';
        plane.style.transition = 'all 0.5s ease';
        setTimeout(() => {
            plane.style.bottom = '-100px';
        }, 300);
    }
    document.getElementById('crashMultiplier').textContent = `crashed`;
    document.getElementById('crashMultiplier').style.color = 'var(--danger-color)';
    document.getElementById('crashStatus').textContent = 'crashed';
    document.getElementById('crashStatus').className = 'info-value loss';
    addToMultiplierHistory(crashMultiplier, 'crashed');
    showToast('Game Crashed!', `Crashed at ${crashMultiplier.toFixed(2)}x`, 'error', 4000);
}
function cancelCrash() {
    if (crashGameActive) {
        showToast('Game Cancelled', 'Your bet has been lost', 'warning', 3000);
        crashGameActive = false;
        clearInterval(crashInterval);
        resetCrashGame();
    } else {
        resetCrashGame();
    }
}
function resetCrashGame() {
    crashGameActive = false;
    crashGameId = null;
    crashMultiplier = 1.00;
    clearInterval(crashInterval);
    document.getElementById('startCrashGame').classList.remove('hidden');
    document.getElementById('crashGameBoard').classList.add('hidden');
}
function updateCrashBetDisplay() {
    const betAmount = document.getElementById('crashBetAmount').value;
    document.getElementById('crashCurrentBet').textContent = `$${betAmount}`;
    document.getElementById('crashPotentialWin').textContent = `$${betAmount}`;
}
function loadMultiplierHistory() {
    const history = JSON.parse(localStorage.getItem('crashHistory') || '[]');
    const historyDiv = document.getElementById('multiplierHistory');
    history.forEach(item => {
        const chip = document.createElement('div');
        chip.className = `multiplier-chip ${item.type}`;
        chip.textContent = `${item.multiplier}x`;
        historyDiv.appendChild(chip);
    });
}
function addToMultiplierHistory(multiplier, type) {
    const history = JSON.parse(localStorage.getItem('crashHistory') || '[]');
    history.unshift({
        multiplier: multiplier.toFixed(2),
        type: type,
        timestamp: Date.now()
    });
    if (history.length > 10) {
        history.pop();
    }
    localStorage.setItem('crashHistory', JSON.stringify(history));
    const historyDiv = document.getElementById('multiplierHistory');
    const chip = document.createElement('div');
    chip.className = `multiplier-chip ${type}`;
    chip.textContent = `${multiplier.toFixed(2)}x`;
    historyDiv.insertBefore(chip, historyDiv.firstChild);
    if (historyDiv.children.length > 10) {
        historyDiv.removeChild(historyDiv.lastChild);
    }
}
function goBackToMain() {
    const gamesContainer = document.getElementById('gamesContainer');
    if (gamesContainer) {
        gamesContainer.classList.remove('hidden');
        gamesContainer.style.display = 'block';
    }
    cleanupSlotsGame();
    removeAllGameContainers();
    window.scrollTo(0, 0);
    loadBalance();
}
function setupCategories() {
    const tabs = document.querySelectorAll('.category-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const category = this.dataset.category;
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            const contents = document.querySelectorAll('.category-content');
            contents.forEach(content => content.classList.remove('active'));
            const targetContent = document.getElementById(`${category}Games`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
}
function setupCategoryTabs() {
    const tabs = document.querySelectorAll('.category-tab');
    const contents = document.querySelectorAll('.category-content');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const category = this.dataset.category;
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            contents.forEach(content => content.classList.remove('active'));
            const targetContent = document.getElementById(`${category}Games`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
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
function loadDailyStatus() {
    fetch('/api/daily-status')
        .then(response => response.json())
        .then(data => {
            const claimBtn = document.getElementById('claimDailyBtn');
            const claimedText = document.getElementById('alreadyClaimed');
            const streakCount = document.getElementById('streakCount');
            const rewardAmount = document.getElementById('rewardAmount');
            const streakBonus = document.getElementById('streakBonus');
            if (streakCount) {
                streakCount.textContent = data.streak;
            }
            const baseReward = 100;
            const bonus = data.streak * 50;
            const total = baseReward + bonus;
            if (rewardAmount) {
                rewardAmount.textContent = `$${total}`;
            }
            if (streakBonus) {
                streakBonus.textContent = `+ $${bonus} streak bonus`;
            }
            if (data.claimed_today) {
                if (claimBtn) claimBtn.classList.add('hidden');
                if (claimedText) claimedText.classList.remove('hidden');
                if (claimBtn) claimBtn.disabled = true;
            } else {
                if (claimBtn) claimBtn.classList.remove('hidden');
                if (claimedText) claimedText.classList.add('hidden');
                if (claimBtn) claimBtn.disabled = false;
            }
        })
        .catch(error => {
            console.error('error loading daily status:', error);
        });
}
function claimDailyReward() {
    const claimBtn = document.getElementById('claimDailyBtn');
    if (claimBtn.disabled) return;
    claimBtn.disabled = true;
    claimBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> claiming..';
    fetch('/api/daily-reward', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            loadDailyStatus();
            updateHeaderBalance(data.new_balance);
            showToast('daily reward claimed', 
                     `$${data.reward} added -> (${data.streak} day streak)`, 
                     'success', 4000);
        } else {
            showToast('already claimed', data.message, 'error', 3000);
            loadDailyStatus();
        }
    })
    .catch(error => {
        console.error('error claiming daily reward:', error);
        showToast('error', 'Failed to claim daily reward', 'error', 3000);
        claimBtn.disabled = false;
        claimBtn.innerHTML = '<i class="fas fa-gift"></i> claim daily reward';
    });
}
function loadLeaderboard() {
    const refreshBtn = document.getElementById('refreshLeaderboard');
    const leaderboardList = document.getElementById('leaderboardList');
    if (refreshBtn) refreshBtn.disabled = true;
    if (leaderboardList) {
        leaderboardList.innerHTML = `
            <div class="loading-leaderboard">
                <i class="fas fa-spinner fa-spin"></i>
                <p>loading leaderboard..</p>
            </div>
        `;
    }
    fetch('/api/leaderboard')
        .then(response => response.json())
        .then(data => {
            if (leaderboardList) {
                leaderboardList.innerHTML = '';
                data.forEach(player => {
                    const item = document.createElement('div');
                    item.className = 'leaderboard-item';
                    const rankClass = `rank-${player.rank}`;
                    item.innerHTML = `
                        <div class="leaderboard-rank ${rankClass}">
                            ${player.rank}
                        </div>
                        <div class="leaderboard-avatar">
                            <img src="${player.avatar}" alt="${player.username}" onerror="this.src='/static/default-avatar.png'">
                        </div>
                        <div class="leaderboard-user">
                            <div class="leaderboard-username">
                                ${player.username}
                                ${player.id === parseInt(localStorage.getItem('userId') || 0) ? 
                                  '<span class="you-indicator">you</span>' : ''}
                            </div>
                            <div class="leaderboard-stats">
                                <span><i class="fas fa-coins" style="color: #f0b90b;"></i> $${player.balance}</span>
                                <span><i class="fas fa-fire" style="color: #ff9e00;"></i> ${player.streak} days</span>
                                <span><i class="fas fa-circle ${player.status === 'online' ? 'online' : 'offline'}" 
                                       style="color: ${player.status === 'online' ? '#4cc9f0' : '#888'}"></i> ${player.status}</span>
                            </div>
                        </div>
                    `;
                    leaderboardList.appendChild(item);
                });
            }
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = '<i class="fas fa-redo"></i> refresh';
            }
        })
        .catch(error => {
            console.error('Error loading leaderboard:', error);
            if (leaderboardList) {
                leaderboardList.innerHTML = `
                    <div class="error-message">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>failed to load leaderboard</p>
                        <button onclick="loadLeaderboard()" class="btn btn-secondary">
                            <i class="fas fa-redo"></i> retry
                        </button>
                </div>
                `;
            }
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = '<i class="fas fa-redo"></i> refresh';
            }
        });
}
function removeAllGameContainers() {
    const mainContainer = document.getElementById('mainGamesContainer');
    if (!mainContainer) return;
    const containers = ['minesGameContainer', 'crashGameContainer', 'slotsGameContainer'];
    containers.forEach(id => {
        const container = document.getElementById(id);
        if (container) {
            container.innerHTML = '';
            container.classList.add('hidden');
            container.style.display = 'none';
        }
    });
    minesGameActive = false;
    crashGameActive = false;
    currentGameId = null;
    if (crashInterval) {
        clearInterval(crashInterval);
        crashInterval = null;
    }
}
function setupSlotsSpectating(gameData) {
    const spectatingContent = document.getElementById('spectatingContent');
    spectatingContent.innerHTML = `
        <div class="spectating-game-area">
            <div class="spectating-title">
                <i class="fas fa-slot-machine"></i> Slots Game - ${gameData.slot_type || '5x3'}
            </div>
            <div class="spectating-slots-container">
                <div class="spectating-reels" id="spectatingReels">
                    ${generateSlotsReelsHTML(gameData.slot_type || '5x3')}
                </div>
                <div class="spectating-spin-status" id="slotsSpinStatus">Watching player play slots</div>
            </div>
            <div class="spectating-slots-info">
                <div class="slots-info-item">
                    <div class="slots-info-label">Current Bet</div>
                    <div class="slots-info-value" id="spectatingSlotsBet">$${gameData.current_bet || gameData.bet_amount || 10}</div>
                </div>
                <div class="slots-info-item">
                    <div class="slots-info-label">Last Win</div>
                    <div class="slots-info-value" id="spectatingLastWin">$${gameData.last_win || 0}</div>
                </div>
                <div class="slots-info-item">
                    <div class="slots-info-label">Total Spins</div>
                    <div class="slots-info-value" id="spectatingTotalSpins">${gameData.total_spins || 0}</div>
                </div>
            </div>
            <div class="game-status" id="slotsGameStatus">
                <span class="status-indicator active"></span>
                <span>Watching slots game</span>
            </div>
        </div>
    `;
}
function generateSlotsReelsHTML(slotType) {
    const reelCount = slotType === '3x3' ? 3 : 5;
    let html = '';
    for (let i = 0; i < reelCount; i++) {
        html += `
            <div class="spectating-reel">
                <div class="reel-symbol">?</div>
            </div>
        `;
    }
    return html;
}
function checkURLForSpectate() {
    console.log('Checking for spectate requests...');
    const urlParams = new URLSearchParams(window.location.search);
    const spectateUserId = urlParams.get('spectate');
    const gameType = urlParams.get('game');
    const pendingSpectate = localStorage.getItem('pendingSpectate');
    let spectateData = null;
    if (spectateUserId && gameType) {
        spectateData = {
            userId: parseInt(spectateUserId),
            gameType: gameType,
            source: 'url'
        };
        console.log('Spectate data from URL:', spectateData);
        const cleanURL = window.location.pathname;
        window.history.replaceState({}, document.title, cleanURL);
    } else if (pendingSpectate) {
        try {
            spectateData = JSON.parse(pendingSpectate);
            spectateData.source = 'localStorage';
            console.log('Spectate data from localStorage:', spectateData);
            const age = Date.now() - spectateData.timestamp;
            if (age > 10000) { 
                console.log('Pending spectate too old, ignoring');
                localStorage.removeItem('pendingSpectate');
                return;
            }
        } catch (e) {
            console.error('Error parsing pending spectate:', e);
            localStorage.removeItem('pendingSpectate');
        }
    }
    if (spectateData) {
        console.log('Processing spectate request:', spectateData);
        setTimeout(() => {
            startSpectatingFromURL(spectateData.userId, spectateData.gameType);
            localStorage.removeItem('pendingSpectate');
        }, 2000); 
    }
}
function startSpectatingFromURL(userId, gameType) {
    console.log('startSpectatingFromURL called with:', { userId, gameType });
    fetch('/api/players-in-game')
        .then(response => response.json())
        .then(players => {
            console.log('Players in game from API:', players);
            const playerInGame = players.find(p => 
                p.user_id === userId && p.game_type === gameType.toLowerCase()
            );
            if (playerInGame) {
                console.log('Player found in game, starting spectate:', playerInGame);
                startSpectating(userId, gameType.toLowerCase(), playerInGame.game_id);
            } else {
                console.log('Player not found in active games');
                showToast('Player Not Found', 'Player is no longer in that game', 'error', 3000);
                const anyGame = players.find(p => p.user_id === userId);
                if (anyGame) {
                    console.log('Found player in different game:', anyGame);
                    showToast('Player In Different Game', 
                             `Player is playing ${anyGame.game_type} instead`, 'info', 3000);
                }
            }
        })
        .catch(error => {
            console.error('Error checking players in game:', error);
            showToast('Error', 'Could not check player status', 'error', 3000);
        });
}

const boosterStyles = document.createElement('style');
boosterStyles.textContent = `
.active-boosters {
    background-color: rgba(67, 97, 238, 0.1);
    border-radius: var(--radius-sm);
    padding: 15px;
    margin: 20px 0;
    border: 1px solid var(--primary-color);
}

.boosters-title {
    color: var(--text-primary);
    font-weight: 600;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.boosters-list {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
}

.booster-badge {
    background-color: rgba(255, 255, 255, 0.1);
    padding: 8px 12px;
    border-radius: 20px;
    font-size: 0.85rem;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 5px;
    border: 1px solid;
}

.booster-badge.mine_sniffer {
    border-color: #4cc9f0;
    background-color: rgba(76, 201, 240, 0.2);
}

.booster-badge.kevlar_vest {
    border-color: #38b000;
    background-color: rgba(56, 176, 0, 0.2);
}

.booster-badge.gold_pickaxe {
    border-color: #ffd700;
    background-color: rgba(255, 215, 0, 0.2);
}

.booster-badge.metal_detector {
    border-color: #7209b7;
    background-color: rgba(114, 9, 183, 0.2);
}

.booster-badge.x_ray {
    border-color: #f72585;
    background-color: rgba(247, 37, 133, 0.2);
}

.mine-cell.xray {
    background-color: rgba(247, 37, 133, 0.3);
    border-color: #f72585;
    animation: xrayPulse 1s infinite;
}

@keyframes xrayPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}

.mine-cell.kevlar-saved {
    background-color: rgba(56, 176, 0, 0.3);
    border-color: #38b000;
    color: #38b000;
}

.crash-boosters {
    position: absolute;
    top: 20px;
    right: 20px;
    display: flex;
    gap: 10px;
    z-index: 10;
}

.crash-booster-badge {
    background-color: rgba(76, 201, 240, 0.2);
    border: 2px solid #4cc9f0;
    border-radius: 20px;
    padding: 8px 15px;
    color: white;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 5px;
    backdrop-filter: blur(10px);
}
`;
document.head.appendChild(boosterStyles);


window.goBackToMain = goBackToMain;
window.toggleSpectatingSidebar = toggleSpectatingSidebar;
window.startSpectating = startSpectating;
window.stopSpectating = stopSpectating;