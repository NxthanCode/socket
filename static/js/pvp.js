let socket;
let currentUser = null;
let selectedOpponent = null;
let currentGame = null;
let currentGameId = null;
let gameRefreshInterval = null;

function startGameRefresh() {
    if (gameRefreshInterval) clearInterval(gameRefreshInterval);
    
    gameRefreshInterval = setInterval(() => {
        if (currentGameId && document.getElementById('gameView') && 
            !document.getElementById('gameView').classList.contains('hidden')) {
            refreshGameState();
        }
    }, 3000); // Refresh every 3 seconds
}

function stopGameRefresh() {
    if (gameRefreshInterval) {
        clearInterval(gameRefreshInterval);
        gameRefreshInterval = null;
    }
}

document.addEventListener('DOMContentLoaded', function() {
    initializeSocket();
    loadCurrentUser();
    setupEventListeners();
    loadLobbies();
    loadInvites();
    startInviteRefresh(); // Add this line
});


function startInviteRefresh() {
    setInterval(() => {
        if (document.getElementById('invitesTab').classList.contains('active')) {
            loadInvites();
        }
    }, 10000); // Refresh every 10 seconds
}

function refreshGameState() {
    if (!currentGameId) return;
    
    fetch(`/api/pvp/game/${currentGameId}`)
        .then(response => response.json())
        .then(game => {
            currentGame = game;
            updateCellClickHandlers();
            updateTurnIndicator(game.current_turn);
        })
        .catch(error => {
            console.error('Error refreshing game state:', error);
        });
}

function initializeSocket() {
    socket = io();
    
    socket.on('connect', function() {
        console.log('Connected to PVP server');
        // Join user's private room
        socket.emit('join_user_room');
    });
    
    socket.on('pvp_invite', function(data) {
        showToast('New Challenge!', `${data.from_username} challenged you to 1v1!`, 'info', 5000);
        loadInvites();
    });
    
    socket.on('pvp_game_started', function(data) {
        console.log('PVP game started via socket:', data);
        showToast('Game Started!', 'Your 1v1 game is ready!', 'success', 3000);
        // Load the game for both players
        loadGame(data.game_id);
    });
    
    socket.on('pvp_cell_revealed', function(data) {
        console.log('PVP cell revealed via socket:', data);
        
        // Check if we're still in this game
        if (currentGameId !== data.game_id) return;
        
        // Update game state
        if (data.updated_game) {
            updateCurrentGameState(data.updated_game);
        }
        
        // Update UI
        updateCellUI(data.cell_index, data.result);
        
        // Update scores and turn
        updateScoresAndTurn(data);
        
        // If game ended via this move, handle it
        if (data.game_ended) {
            setTimeout(() => {
                // Don't show another game result - it will come from pvp_game_ended
                console.log('Game ended via cell reveal');
            }, 1000);
        }
        
        // Show SINGLE notification
        if (data.player_id === currentUser.id) {
            if (data.result === 'mine') {
                // Don't show toast here - game end will handle it
            } else {
                showToast('Safe!', `+1 point!`, 'success', 2000);
            }
        }
    });

    socket.on('pvp_game_ended', function(data) {
        console.log('PVP game ended via socket:', data);
        
        if (currentGameId !== data.game_id) return;
        
        // Update currentGame state
        if (currentGame) {
            currentGame.game_state = 'finished';
            currentGame.winner_id = data.winner_id;
        }
        
        // Reveal all mines if mine was hit
        if (data.all_mines && data.all_mines.length > 0) {
            revealAllMines(data.all_mines, data.mine_hit_by);
        }
        
        // Show game result with proper winnings
        const didIWin = data.winner_id === currentUser.id;
        let message = '';
        
        if (data.reason === 'mine_hit') {
            const mineHitByCurrent = data.mine_hit_by === currentUser.id;
            message = mineHitByCurrent ? 
                `You hit a mine and lost!` : 
                `You won! ${mineHitByCurrent ? 'You' : 'Opponent'} hit a mine!`;
        } else if (data.reason === 'score_win') {
            message = didIWin ? 
                `You reached the target score first!` : 
                `Opponent reached the target score first!`;
        }
        
        // Show result with CORRECT winnings
        showGameResult(data.winner_id, data.winnings || 0, message);
        
        // Disable all cells
        disableAllCells();
    });
    
    socket.on('pvp_error', function(data) {
        showToast('Error', data.message, 'error', 3000);
    });
    
    socket.on('pvp_joined', function(data) {
        console.log('Joined PVP game room:', data.game_id);
    });
}


function disableAllCells() {
    const cells = document.querySelectorAll('.mine-cell');
    cells.forEach(cell => {
        cell.classList.add('disabled');
        cell.onclick = null;
        cell.style.cursor = 'not-allowed';
    });
}


function updateCellUI(cellIndex, result) {
    const cell = document.querySelector(`.mine-cell[data-index="${cellIndex}"]`);
    if (!cell) return;
    
    if (result === 'mine') {
        cell.classList.add('mine');
        cell.innerHTML = '<i class="fas fa-bomb"></i>';
    } else {
        cell.classList.add('revealed');
        cell.innerHTML = '<i class="fas fa-gem"></i>';
    }
    
    cell.classList.add('disabled');
    cell.onclick = null;
    cell.style.cursor = 'not-allowed';
}

function revealAllMines(allMines, mineHitBy) {
    allMines.forEach(mineIndex => {
        const cell = document.querySelector(`.mine-cell[data-index="${mineIndex}"]`);
        if (cell && !cell.classList.contains('revealed')) {
            if (mineIndex === mineHitBy) {
                // Highlight the mine that was hit
                cell.classList.add('mine-hit');
                cell.innerHTML = '<i class="fas fa-bomb" style="color: #ff0000;"></i>';
            } else {
                cell.classList.add('mine');
                cell.innerHTML = '<i class="fas fa-bomb"></i>';
            }
            cell.classList.add('disabled');
        }
    });
}

// Helper function to update current game state
function updateCurrentGameState(updatedGame) {
    if (!currentGame) return;
    
    currentGame.player1.revealed = updatedGame.player1_revealed ? 
        updatedGame.player1_revealed.map(x => parseInt(x)).filter(x => !isNaN(x)) : [];
    currentGame.player2.revealed = updatedGame.player2_revealed ? 
        updatedGame.player2_revealed.map(x => parseInt(x)).filter(x => !isNaN(x)) : [];
    currentGame.player1.score = updatedGame.player1_score || 0;
    currentGame.player2.score = updatedGame.player2_score || 0;
    currentGame.current_turn = updatedGame.current_turn;
    currentGame.your_turn = updatedGame.current_turn === currentUser.id;
    currentGame.game_state = updatedGame.game_state || 'playing';
}

function updateScoresAndTurn(data) {
    if (!currentGame) return;
    
    const isPlayer1 = currentGame.player1.id === currentUser.id;
    const myData = isPlayer1 ? currentGame.player1 : currentGame.player2;
    const opponentData = isPlayer1 ? currentGame.player2 : currentGame.player1;
    
    // Update score displays
    const myScoreElement = document.querySelector('.game-player-score');
    const opponentScoreElement = document.querySelectorAll('.game-player-score')[1];
    
    if (myScoreElement) myScoreElement.textContent = `Score: ${myData.score}`;
    if (opponentScoreElement) opponentScoreElement.textContent = `Score: ${opponentData.score}`;
    
    // Update turn indicator
    updateTurnIndicator(data.next_turn || currentGame.current_turn);
    
    // Update cell click handlers
    updateCellClickHandlers();
}

function loadCurrentUser() {
    fetch('/api/check-auth')
        .then(response => response.json())
        .then(data => {
            if (data.authenticated) {
                currentUser = {
                    id: data.user_id,
                    username: data.username,
                    balance: data.balance
                };
            }
        });
}

function setupEventListeners() {
    document.getElementById('createChallengeBtn').addEventListener('click', openCreateModal);
    
    document.querySelectorAll('.pvp-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            switchTab(this.dataset.tab);
        });
    });
}

function switchTab(tabName) {
    document.querySelectorAll('.pvp-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    event.target.closest('.pvp-tab').classList.add('active');
    document.getElementById(tabName + 'Tab').classList.add('active');
    
    if (tabName === 'lobbies') {
        loadLobbies();
    } else if (tabName === 'invites') {
        loadInvites();
    }
}

function openCreateModal() {
    document.getElementById('createModal').classList.add('active');
    loadPlayersForSelection();
}

function closeCreateModal() {
    document.getElementById('createModal').classList.remove('active');
    selectedOpponent = null;
}

function loadPlayersForSelection() {
    const container = document.getElementById('playersSelect');
    
    fetch('/api/players')
        .then(response => response.json())
        .then(players => {
            container.innerHTML = '';
            
            players.forEach(player => {
                const div = document.createElement('div');
                div.className = `player-select-item ${player.status === 'offline' ? 'offline' : ''}`;
                
                if (player.status === 'online') {
                    div.onclick = () => selectPlayer(player, div);
                }
                
                div.innerHTML = `
                    <div class="player-select-avatar">
                        <img src="${player.avatar}" alt="${player.username}" onerror="this.src='/static/default-avatar.png'">
                    </div>
                    <div class="player-select-info">
                        <div class="player-select-name">${player.username}</div>
                        <div class="player-select-balance">
                            <i class="fas fa-coins"></i> $${player.balance}
                        </div>
                    </div>
                    <span class="status-indicator ${player.status}"></span>
                `;
                
                container.appendChild(div);
            });
        })
        .catch(error => {
            console.error('Error loading players:', error);
            container.innerHTML = '<p class="error">Failed to load players</p>';
        });
}

function selectPlayer(player, element) {
    document.querySelectorAll('.player-select-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    element.classList.add('selected');
    selectedOpponent = player;
}

function sendChallenge() {
    if (!selectedOpponent) {
        showToast('No Opponent', 'Please select an opponent!', 'warning', 3000);
        return;
    }
    
    const betAmount = parseInt(document.getElementById('betAmount').value);
    const gridSize = parseInt(document.getElementById('gridSize').value);
    const minesCount = parseInt(document.getElementById('minesCount').value);
    
    if (betAmount < 1) {
        showToast('Invalid Bet', 'Bet must be at least $1', 'error', 3000);
        return;
    }
    
    fetch('/api/pvp/create-lobby', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            opponent_id: selectedOpponent.id,
            bet_amount: betAmount,
            grid_size: gridSize,
            mines_count: minesCount
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('Challenge Sent!', `Waiting for ${selectedOpponent.username} to accept...`, 'success', 3000);
            closeCreateModal();
            loadLobbies();
        } else {
            showToast('Error', data.message, 'error', 3000);
        }
    })
    .catch(error => {
        console.error('Error creating challenge:', error);
        showToast('Error', 'Failed to send challenge', 'error', 3000);
    });
}

function loadLobbies() {
    const container = document.getElementById('lobbiesGrid');
    
    fetch('/api/pvp/lobbies')
        .then(response => response.json())
        .then(lobbies => {
            if (lobbies.length === 0) {
                container.innerHTML = `
                    <div class="no-data" style="grid-column: 1/-1;">
                        <i class="fas fa-inbox"></i>
                        <h3>No open lobbies</h3>
                        <p>Be the first to create a challenge!</p>
                    </div>
                `;
                return;
            }
            
            container.innerHTML = '';
            lobbies.forEach(lobby => {
                const div = document.createElement('div');
                div.className = 'lobby-card';
                
                div.innerHTML = `
                    <div class="lobby-card-header">
                        <div class="lobby-avatar">
                            <img src="${lobby.host_avatar}" alt="${lobby.host_username}" onerror="this.src='/static/default-avatar.png'">
                        </div>
                        <div class="lobby-info">
                            <div class="lobby-host">${lobby.host_username}</div>
                            <div class="lobby-status">
                                <span class="status-dot waiting"></span>
                                Waiting for opponent
                            </div>
                        </div>
                    </div>
                    <div class="lobby-details">
                        <div class="detail-item">
                            <i class="fas fa-coins"></i>
                            $${lobby.bet_amount}
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-th-large"></i>
                            ${lobby.grid_size}x${lobby.grid_size}
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-bomb"></i>
                            ${lobby.mines_count} mines
                        </div>
                    </div>
                    <div class="lobby-actions">
                        <button class="btn btn-primary" onclick="joinLobby(${lobby.id})">
                            <i class="fas fa-sign-in-alt"></i>
                            Join
                        </button>
                    </div>
                `;
                
                container.appendChild(div);
            });
        })
        .catch(error => {
            console.error('Error loading lobbies:', error);
            container.innerHTML = '<p class="error">Failed to load lobbies</p>';
        });
}

function loadInvites() {
    const container = document.getElementById('invitesContainer');
    const badge = document.getElementById('invitesBadge');
    
    fetch('/api/pvp/invites')
        .then(response => response.json())
        .then(invites => {
            badge.textContent = invites.length;
            
            if (invites.length === 0) {
                container.innerHTML = `
                    <div class="no-data">
                        <i class="fas fa-envelope-open"></i>
                        <h3>No pending invites</h3>
                        <p>You'll see challenges here when players invite you!</p>
                    </div>
                `;
                return;
            }
            
            container.innerHTML = '';
            invites.forEach(invite => {
                const div = document.createElement('div');
                div.className = 'invite-card';
                
                const expiresIn = Math.floor((new Date(invite.expires_at) - new Date()) / 1000);
                const minutes = Math.floor(expiresIn / 60);
                const seconds = expiresIn % 60;
                
                div.innerHTML = `
                    <div class="invite-header">
                        <div class="invite-avatar">
                            <img src="${invite.from_avatar}" alt="${invite.from_username}" onerror="this.src='/static/default-avatar.png'">
                        </div>
                        <div class="invite-info">
                            <div class="invite-from">${invite.from_username}</div>
                            <div class="invite-timer">
                                <i class="fas fa-clock"></i>
                                ${minutes}:${seconds.toString().padStart(2, '0')}
                            </div>
                        </div>
                    </div>
                    <div class="invite-details">
                        <div class="detail-item">
                            <i class="fas fa-coins"></i>
                            $${invite.bet_amount}
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-th-large"></i>
                            ${invite.grid_size}x${invite.grid_size}
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-bomb"></i>
                            ${invite.mines_count} mines
                        </div>
                    </div>
                    <div class="invite-actions">
                        <button class="btn btn-success" onclick="acceptInvite(${invite.id})">
                            <i class="fas fa-check"></i>
                            Accept
                        </button>
                        <button class="btn btn-danger" onclick="declineInvite(${invite.id})">
                            <i class="fas fa-times"></i>
                            Decline
                        </button>
                    </div>
                `;
                
                container.appendChild(div);
            });
        })
        .catch(error => {
            console.error('Error loading invites:', error);
            container.innerHTML = '<p class="error">Failed to load invites</p>';
        });
}
function acceptInvite(inviteId) {
    fetch('/api/pvp/accept-invite', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ invite_id: inviteId })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('Challenge Accepted!', 'Starting game...', 'success', 2000);
        } else {
            showToast('Error', data.message, 'error', 3000);
        }
    })
    .catch(error => {
        console.error('Error accepting invite:', error);
        showToast('Error', 'Failed to accept challenge', 'error', 3000);
    });
}


function declineInvite(inviteId) {
    fetch('/api/pvp/decline-invite', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ invite_id: inviteId })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('Invite Declined', 'Challenge declined', 'info', 2000);
            loadInvites();
        }
    });
}

function loadGame(gameId) {
    currentGameId = gameId;
    
    fetch(`/api/pvp/game/${gameId}`)
        .then(response => response.json())
        .then(game => {
            currentGame = game;
            showGameBoard(game);
            // Join the game room via socket
            socket.emit('join_pvp_game', { game_id: gameId });
            
            // Update cell click handlers immediately
            setTimeout(() => {
                updateCellClickHandlers();
            }, 100);
        })
        .catch(error => {
            console.error('Error loading game:', error);
            showToast('Error', 'Failed to load game', 'error', 3000);
        });
}

function showGameBoard(game) {
    document.getElementById('lobbyView').classList.add('hidden');
    const gameView = document.getElementById('gameView');
    gameView.classList.remove('hidden');
    
    const isPlayer1 = game.player1.id === currentUser.id;
    const myData = isPlayer1 ? game.player1 : game.player2;
    const opponentData = isPlayer1 ? game.player2 : game.player1;
    
    gameView.innerHTML = `
        <div class="game-board-container">
            <div class="game-header">
                <div class="game-players">
                    <div class="game-player">
                        <div class="game-player-avatar ${game.current_turn === myData.id ? 'active' : ''}" 
                             data-player-id="${myData.id}">
                            <img src="${myData.avatar}" alt="${myData.username}" onerror="this.src='/static/default-avatar.png'">
                        </div>
                        <div class="game-player-name">${myData.username} (You)</div>
                        <div class="game-player-score">Score: ${myData.score}</div>
                    </div>
                    <div class="vs-divider">
                        <i class="fas fa-swords"></i>
                    </div>
                    <div class="game-player">
                        <div class="game-player-avatar ${game.current_turn === opponentData.id ? 'active' : ''}"
                             data-player-id="${opponentData.id}">
                            <img src="${opponentData.avatar}" alt="${opponentData.username}" onerror="this.src='/static/default-avatar.png'">
                        </div>
                        <div class="game-player-name">${opponentData.username}</div>
                        <div class="game-player-score">Score: ${opponentData.score}</div>
                    </div>
                </div>
                <div class="turn-indicator">
                    <i class="fas fa-hourglass-half"></i>
                    ${game.your_turn ? "Your Turn!" : `${opponentData.username}'s Turn`}
                </div>
            </div>
            
            <div class="mines-grid" id="pvpMinesGrid" style="grid-template-columns: repeat(${game.grid_size}, 1fr);">
                <!-- Cells will be generated -->
            </div>
            
            <div class="game-info-panel">
                <div class="info-item">
                    <div class="info-label">Bet</div>
                    <div class="info-value">$${game.bet_amount}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Prize Pool</div>
                    <div class="info-value win">$${game.bet_amount * 2}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Mines</div>
                    <div class="info-value">${game.mines_count}</div>
                </div>
            </div>
            
            <div class="action-buttons">
                <button class="btn btn-secondary" onclick="backToLobby()">
                    <i class="fas fa-arrow-left"></i> Back to Lobby
                </button>
            </div>
        </div>
    `;
    
    createPvPGrid(game);
}

function createPvPGrid(game) {
    const grid = document.getElementById('pvpMinesGrid');
    const totalCells = game.grid_size * game.grid_size;
    
    const isPlayer1 = game.player1.id === currentUser.id;
    const myRevealed = isPlayer1 ? game.player1.revealed : game.player2.revealed;
    const opponentRevealed = isPlayer1 ? game.player2.revealed : game.player1.revealed;
    const allRevealed = [...myRevealed, ...opponentRevealed];
    
    grid.innerHTML = '';
    
    for (let i = 0; i < totalCells; i++) {
        const cell = document.createElement('div');
        cell.className = 'mine-cell';
        cell.dataset.index = i;
        
        if (allRevealed.includes(i)) {
            cell.classList.add('revealed');
            cell.innerHTML = '<i class="fas fa-gem"></i>';
            cell.classList.add('disabled');
        } else {
            cell.innerHTML = '<i class="fas fa-question"></i>';
            
            // Only make clickable if it's my turn and game is playing
            if (game.your_turn && game.game_state === 'playing') {
                cell.addEventListener('click', () => revealPvPCell(i));
                cell.style.cursor = 'pointer';
            } else {
                cell.classList.add('disabled');
                cell.style.cursor = 'not-allowed';
            }
        }
        
        grid.appendChild(cell);
    }
}
function revealPvPCell(cellIndex) {
    if (!currentGameId) return;
    
    socket.emit('pvp_move', {
        game_id: currentGameId,
        cell_index: cellIndex
    });
}


function updateGameBoard(data) {
    console.log('Updating game board with data:', data);
    
    // Check if game ended
    if (data.game_ended) {
        // Disable all cells
        const cells = document.querySelectorAll('.mine-cell');
        cells.forEach(cell => {
            cell.classList.add('disabled');
            cell.onclick = null;
            cell.style.cursor = 'not-allowed';
        });
        
        // Show game result immediately
        if (data.winner_id) {
            const isWinner = data.winner_id === currentUser.id;
            if (isWinner) {
                showGameResult(data.winner_id, data.winnings || 0, 'You hit a mine and lost!', 'You won! Opponent hit a mine!');
            } else {
                showGameResult(data.winner_id, data.winnings || 0, 'You hit a mine and lost!', 'You won! Opponent hit a mine!');
            }
        }
        
        return;
    }
    
    // Update currentGame object with new data
    if (data.updated_game) {
        if (currentGame) {
            currentGame.player1.revealed = data.updated_game.player1_revealed.map(x => parseInt(x)).filter(x => !isNaN(x));
            currentGame.player2.revealed = data.updated_game.player2_revealed.map(x => parseInt(x)).filter(x => !isNaN(x));
            currentGame.player1.score = data.updated_game.player1_score;
            currentGame.player2.score = data.updated_game.player2_score;
            currentGame.current_turn = data.updated_game.current_turn;
            currentGame.your_turn = data.updated_game.current_turn === currentUser.id;
            currentGame.game_state = data.updated_game.game_state;
        }
    }
    
    // Update the cell UI
    const cell = document.querySelector(`.mine-cell[data-index="${data.cell_index}"]`);
    if (cell) {
        if (data.result === 'mine') {
            cell.classList.add('mine');
            cell.innerHTML = '<i class="fas fa-bomb"></i>';
            cell.classList.add('disabled');
            cell.onclick = null;
            cell.style.cursor = 'not-allowed';
        } else {
            cell.classList.add('revealed');
            cell.innerHTML = '<i class="fas fa-gem"></i>';
            cell.classList.add('disabled');
            cell.onclick = null;
            cell.style.cursor = 'not-allowed';
        }
    }
    
    // Update scores
    if (currentGame) {
        const isPlayer1 = currentGame.player1.id === currentUser.id;
        const myData = isPlayer1 ? currentGame.player1 : currentGame.player2;
        const opponentData = isPlayer1 ? currentGame.player2 : currentGame.player1;
        
        // Update score displays
        const myScoreElement = document.querySelector('.game-player-score');
        const opponentScoreElement = document.querySelectorAll('.game-player-score')[1];
        
        if (myScoreElement) myScoreElement.textContent = `Score: ${myData.score}`;
        if (opponentScoreElement) opponentScoreElement.textContent = `Score: ${opponentData.score}`;
    }
    
    // Update turn indicator
    updateTurnIndicator(data.next_turn || data.updated_game?.current_turn);
    
    // Update cell click handlers
    updateCellClickHandlers();
    
    // Show toast notification
    if (data.player_id === currentUser.id) {
        if (data.result === 'mine') {
            showToast('Hit a Mine!', 'You lost the game!', 'error', 3000);
        } else {
            showToast('Safe!', `+1 point! (Total: ${data.score || '?'})`, 'success', 2000);
        }
    } else {
        if (data.result === 'mine') {
            showToast('Opponent Hit Mine!', 'You won the game!', 'success', 3000);
        } else {
            showToast('Opponent Safe!', `Opponent now has ${data.score || '?'} points`, 'info', 2000);
        }
    }
}

function updateTurnIndicator(nextTurnId) {
    if (!currentGame) return;
    
    const isPlayer1 = currentGame.player1.id === currentUser.id;
    const opponentData = isPlayer1 ? currentGame.player2 : currentGame.player1;
    const isMyTurn = nextTurnId === currentUser.id;
    
    const turnIndicator = document.querySelector('.turn-indicator');
    if (turnIndicator) {
        turnIndicator.innerHTML = `
            <i class="fas fa-hourglass-half"></i>
            ${isMyTurn ? "Your Turn!" : `${opponentData.username}'s Turn`}
        `;
    }
    
    // Update active player avatars
    const myAvatar = document.querySelector(`.game-player-avatar[data-player-id="${currentUser.id}"]`);
    const opponentAvatar = document.querySelector(`.game-player-avatar[data-player-id="${opponentData.id}"]`);
    
    if (myAvatar && opponentAvatar) {
        if (isMyTurn) {
            myAvatar.classList.add('active');
            opponentAvatar.classList.remove('active');
        } else {
            myAvatar.classList.remove('active');
            opponentAvatar.classList.add('active');
        }
    }
}

// Add function to update cell click handlers
function updateCellClickHandlers() {
    if (!currentGame) return;
    
    const cells = document.querySelectorAll('.mine-cell');
    const isMyTurn = currentGame.your_turn;
    const isPlayer1 = currentGame.player1.id === currentUser.id;
    const myRevealed = isPlayer1 ? currentGame.player1.revealed : currentGame.player2.revealed;
    
    cells.forEach(cell => {
        const cellIndex = parseInt(cell.dataset.index);
        
        // Remove existing click handlers
        cell.onclick = null;
        
        // Add new click handler if it's my turn and cell not revealed
        if (isMyTurn && currentGame.game_state === 'playing') {
            if (!myRevealed.includes(cellIndex) && !cell.classList.contains('revealed') && !cell.classList.contains('mine')) {
                cell.onclick = () => revealPvPCell(cellIndex);
                cell.classList.remove('disabled');
                cell.style.cursor = 'pointer';
            } else {
                cell.classList.add('disabled');
                cell.style.cursor = 'not-allowed';
            }
        } else {
            cell.classList.add('disabled');
            cell.style.cursor = 'not-allowed';
        }
    });
}


function updateGameUI(game) {
    const isPlayer1 = game.player1.id === currentUser.id;
    const myData = isPlayer1 ? game.player1 : game.player2;
    const opponentData = isPlayer1 ? game.player2 : game.player1;
    
    // Update scores
    const myScoreElement = document.querySelector('.game-player-score');
    const opponentScoreElement = document.querySelectorAll('.game-player-score')[1];
    
    if (myScoreElement) myScoreElement.textContent = `Score: ${myData.score}`;
    if (opponentScoreElement) opponentScoreElement.textContent = `Score: ${opponentData.score}`;
    
    // Update turn indicator
    const turnIndicator = document.querySelector('.turn-indicator');
    if (turnIndicator) {
        turnIndicator.innerHTML = `
            <i class="fas fa-hourglass-half"></i>
            ${game.your_turn ? "Your Turn!" : `${opponentData.username}'s Turn`}
        `;
    }
    
    // Update active player
    const myAvatar = document.querySelector(`.game-player-avatar[data-player-id="${currentUser.id}"]`);
    const opponentAvatar = document.querySelector(`.game-player-avatar[data-player-id="${opponentData.id}"]`);
    
    if (myAvatar && opponentAvatar) {
        if (game.your_turn) {
            myAvatar.classList.add('active');
            opponentAvatar.classList.remove('active');
        } else {
            myAvatar.classList.remove('active');
            opponentAvatar.classList.add('active');
        }
    }
}

// Update

function showGameResult(winnerId, winnings, message) {
    const gameView = document.getElementById('gameView');
    
    if (!gameView) return;
    
    const didIWin = winnerId === currentUser.id;
    const isDraw = !winnerId;
    
    let resultHTML = '';
    if (isDraw) {
        resultHTML = `
            <div class="game-result">
                <i class="fas fa-handshake"></i>
                <h2>Draw!</h2>
                <p>Both players revealed the same number of safe cells</p>
            </div>
        `;
    } else if (didIWin) {
        resultHTML = `
            <div class="game-result win">
                <i class="fas fa-trophy"></i>
                <h2>You Win!</h2>
                <p>${message || 'Congratulations!'}</p>
                <p class="winnings">You won $${winnings}!</p>
            </div>
        `;
    } else {
        resultHTML = `
            <div class="game-result lose">
                <i class="fas fa-times-circle"></i>
                <h2>You Lost</h2>
                <p>${message || 'Better luck next time!'}</p>
            </div>
        `;
    }
    
    // Remove existing result if any
    const existingResult = gameView.querySelector('.game-result');
    if (existingResult) {
        existingResult.remove();
    }
    
    // Add result to game view
    const gameBoard = gameView.querySelector('.game-board-container');
    if (gameBoard) {
        const resultDiv = document.createElement('div');
        resultDiv.innerHTML = resultHTML;
        gameBoard.appendChild(resultDiv);
    }
    
    // Show toast - only ONE toast
    if (didIWin) {
        showToast('Victory!', `You won $${winnings}!`, 'success', 5000);
    } else {
        showToast('Game Over', 'The game has ended', 'info', 5000);
    }
    
    // Return to lobby after delay
    setTimeout(() => {
        backToLobby();
    }, 7000);
}


function backToLobby() {
    if (currentGameId) {
        socket.emit('leave_pvp_game', { game_id: currentGameId });
        currentGameId = null;
        currentGame = null;
    }
    
    document.getElementById('gameView').classList.add('hidden');
    document.getElementById('lobbyView').classList.remove('hidden');
    
    loadLobbies();
    loadInvites();
}

// Toast function
function showToast(title, message, type = 'info', duration = 5000) {
    const container = document.getElementById('toastContainer') || createToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'fa-check-circle' :
                 type === 'error' ? 'fa-exclamation-circle' :
                 type === 'warning' ? 'fa-exclamation-triangle' :
                 'fa-info-circle';
    
    toast.innerHTML = `
        <div class="toast-icon">
            <i class="fas ${icon}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    
    if (duration > 0) {
        setTimeout(() => toast.remove(), duration);
    }
}

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
}