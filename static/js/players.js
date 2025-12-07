let socket;
let allPlayers = [];
let currentFilter = 'all';
document.addEventListener('DOMContentLoaded', function() {
    initializeSocket();
    loadPlayers();
    setupEventListeners();
    checkSpectateFromURL(); 
});
function initializeSocket() {
    socket = io();
    socket.on('connect', function() {
        console.log('connected to socket');
        socket.emit('get_online_users');
    });
    socket.on('user_status', function(data) {
        console.log('user_status event:', data);
        updatePlayerStatus(data.user_id, data.status, data.game);
        if (data.status === 'online' && data.user_id !== currentUserId) {
            if (data.game) {
                showOnlineNotification(data.user_id, data.game);
            }
        }
    });
    socket.on('online_users', function(onlineUserIds) {
        console.log('online_users event:', onlineUserIds);
        updateAllPlayersStatus(onlineUserIds);
    });
    socket.on('game_status_update', function(data) {
        console.log('game_status_update event:', data);
        if (data.user_id && data.game !== undefined) {
            updatePlayerStatus(data.user_id, 'online', data.game);
        }
    });
    socket.on('connect', function() {
        socket.emit('request_game_status');
    });
}
function loadPlayers() {
    fetch('/api/players')
        .then(response => {
            if (!response.ok) {
                if (response.status === 401) {
                    window.location.href = '/login';
                }
                throw new Error('failed to load players');
            }
            return response.json();
        })
        .then(players => {
            allPlayers = players;
            renderPlayers(players);
        })
        .catch(error => {
            console.error('Error:', error);
            showError('failed to load players');
        });
}
function showOnlineNotification(userId, game) {
    fetch(`/api/user/${userId}`)
        .then(response => response.json())
        .then(user => {
            let notiContainer = document.getElementById('onlineNotifications');
            if (!notiContainer) {
                notiContainer = document.createElement('div');
                notiContainer.id = 'onlineNotifications';
                notiContainer.className = 'online-notifications';
                document.body.appendChild(notiContainer);
            }
            const noti = document.createElement('div');
            noti.className = 'online-notification';
            let gameText = '';
            if (game) {
                gameText = `<span class="online-game">Playing ${game}</span>`;
            }
            noti.innerHTML = `
                <div class="online-noti-avatar">
                    <img src="${user.avatar}" alt="${user.username}" onerror="this.src='/static/default-avatar.png'">
                </div>
                <div class="online-noti-content">
                    <div class="online-noti-name">${user.username} is online</div>
                    ${gameText}
                </div>
                <button class="online-noti-close" onclick="closeOnlineNotification(this)">×</button>
            `;
            noti.addEventListener('click', function(e) {
                if (!e.target.classList.contains('online-noti-close')) {
                    window.viewProfile(userId);
                    closeOnlineNotification(noti.querySelector('.online-noti-close'));
                }
            });
            notiContainer.appendChild(noti);
            setTimeout(() => {
                closeOnlineNotification(noti.querySelector('.online-noti-close'));
            }, 3000);
        });
}
function closeOnlineNotification(closeBtn) {
    const noti = closeBtn.closest('.online-notification');
    if (noti) {
        noti.style.transform = 'translateX(100%)';
        noti.style.opacity = '0';
        setTimeout(() => {
            noti.remove();
        }, 300);
    }
}
function renderPlayers(players) {
    const playersGrid = document.getElementById('playersGrid');
    if (players.length === 0) {
        playersGrid.innerHTML = `
            <div class="no-players">
                <i class="fas fa-users-slash"></i>
                <p>no players found</p>
            </div>
        `;
        return;
    }
    playersGrid.innerHTML = '';
    players.forEach(player => {
        const playerCard = createPlayerCard(player);
        playersGrid.appendChild(playerCard);
    });
}
function createPlayerCard(player) {
    const card = document.createElement('div');
    card.className = 'player-card';
    card.dataset.userId = player.id;
    const statusClass = player.status === 'online' ? 'online' : 'offline';
    const statusText = player.status === 'online' ? 'Online' : 'Offline';
    let gameStatus = '';
    let gameIcon = '';
    if (player.game) {
        if (player.game === 'mines') {
            gameIcon = 'fa-bomb';
            gameStatus = 'Playing Mines';
        } else if (player.game === 'slots') {
            gameIcon = 'fa-slot-machine';
            gameStatus = 'Playing Slots';
        } else if (player.game === 'crash') {
            gameIcon = 'fa-plane';
            gameStatus = 'Playing Crash';
        }
    }
    let actionButton = '';
    if (player.game && (player.game === 'mines' || player.game === 'slots')) {
        actionButton = `
            <button class="player-action-btn primary" onclick="window.handleSpectateClick(${player.id}, '${player.game}')">
                <i class="fas fa-eye"></i> spectate
            </button>
        `;
    } else if (player.game) {
        actionButton = `
            <button class="player-action-btn" disabled>
                <i class="fas fa-eye-slash"></i> no spectate
            </button>
        `;
    } else {
        actionButton = `
            <button class="player-action-btn primary" onclick="startConversation(${player.id})">
                <i class="fas fa-comment"></i> message
            </button>
        `;
    }
    card.innerHTML = `
        <div class="player-header">
            <div class="player-avatar">
                <img src="${player.avatar}" alt="${player.username}" onerror="this.src='/static/default-avatar.png'">
            </div>
            <div class="player-info">
                <div class="player-name">${player.username}</div>
                <div class="player-status">
                    <span class="status-indicator ${statusClass}"></span>
                    <span>${statusText}</span>
                    ${player.game ? `
                        <span class="player-game ${player.game}">
                            <i class="fas ${gameIcon}"></i>
                            ${gameStatus}
                        </span>
                    ` : ''}
                </div>
            </div>
        </div>
        <div class="player-details">
            <div class="player-balance">
                <i class="fas fa-coins"></i> $${player.balance}
            </div>
        </div>
        <div class="player-actions">
            <button class="player-action-btn" onclick="viewProfile(${player.id})">
                <i class="fas fa-user"></i> profile
            </button>
            ${actionButton}
        </div>
    `;
    return card;
}
function handleSpectateClick(userId, gameType) {
    console.log('handleSpectateClick called:', { userId, gameType });
    if (window.location.pathname === '/games') {
        console.log('Already on games page, starting spectate directly');
        spectatePlayer(userId, gameType);
    } else {
        console.log('Redirecting to games page with spectate parameters');
        localStorage.setItem('pendingSpectate', JSON.stringify({
            userId: userId,
            gameType: gameType,
            timestamp: Date.now()
        }));
        window.location.href = '/games';
    }
}
function checkSpectateFromURL() {
    if (window.location.pathname === '/games') {
        const urlParams = new URLSearchParams(window.location.search);
        const spectateUserId = urlParams.get('spectate');
        const gameType = urlParams.get('game');
        if (spectateUserId && gameType) {
            setTimeout(() => {
                spectatePlayer(parseInt(spectateUserId), gameType);
                window.history.replaceState({}, document.title, '/games');
            }, 1000);
        }
    }
}
window.handleSpectateClick = function(userId, gameType) {
    console.log('handleSpectateClick called:', { userId, gameType });
    localStorage.setItem('pendingSpectate', JSON.stringify({
        userId: userId,
        gameType: gameType,
        timestamp: Date.now()
    }));
    window.location.href = '/games';
};
function spectatePlayer(userId, gameType) {
    console.log('Spectate player called:', userId, gameType);
    localStorage.removeItem('pendingSpectate')
    if (gameType.toLowerCase() !== 'mines') {
        showToast('Cannot Spectate', 'Only mines games can be spectated', 'warning', 3000);
        return;
    }
    if (!window.startSpectating) {
        console.error('startSpectating function not found!');
        showToast('Error', 'Spectating function not available', 'error', 3000);
        return;
    }
    if (window.stopSpectating) {
        window.stopSpectating();
    }
    setTimeout(() => {
        console.log('Fetching players in game...');
        fetch('/api/players-in-game')
            .then(response => {
                if (!response.ok) throw new Error('API error');
                return response.json();
            })
            .then(players => {
                console.log('Players in game:', players);
                const playerInGame = players.find(p => 
                    p.user_id === userId && p.game_type === 'mines'
                );
                if (playerInGame) {
                    console.log('Starting spectate with:', playerInGame);
                    window.startSpectating(userId, 'mines', playerInGame.game_id);
                } else {
                    console.log('Player not currently in a mines game');
                    showToast('Player Not in Game', 'This player is not currently playing mines', 'error', 3000);
                }
            })
            .catch(error => {
                console.error('Error checking player game status:', error);
                showToast('Error', 'Could not check game status', 'error', 3000);
            });
    }, 100);
}
function setupEventListeners() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            filterBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.dataset.filter;
            filterPlayers();
        });
    });
    const searchInput = document.getElementById('playerSearch');
    searchInput.addEventListener('input', function() {
        filterPlayers();
    });
}
function filterPlayers() {
    let filteredPlayers = [...allPlayers];
    const searchTerm = document.getElementById('playerSearch').value.toLowerCase();
    if (searchTerm) {
        filteredPlayers = filteredPlayers.filter(player => 
            player.username.toLowerCase().includes(searchTerm)
        );
    }
    if (currentFilter === 'online') {
        filteredPlayers = filteredPlayers.filter(player => player.status === 'online');
    } else if (currentFilter === 'offline') {
        filteredPlayers = filteredPlayers.filter(player => player.status === 'offline');
    } else if (currentFilter === 'ingame') {
        filteredPlayers = filteredPlayers.filter(player => player.game);
    }
    renderPlayers(filteredPlayers);
}
function updatePlayerStatus(userId, status, game = null) {
    const playerIndex = allPlayers.findIndex(p => p.id === userId);
    if (playerIndex !== -1) {
        allPlayers[playerIndex].status = status;
        allPlayers[playerIndex].game = game;
        allPlayers[playerIndex].last_seen = new Date().toISOString();
        const playerCard = document.querySelector(`.player-card[data-user-id="${userId}"]`);
        if (playerCard) {
            const statusIndicator = playerCard.querySelector('.status-indicator');
            const statusText = playerCard.querySelector('.player-status span:nth-child(2)');
            if (status === 'online') {
                statusIndicator.className = 'status-indicator online';
                if (game) {
                    statusText.textContent = `Playing ${game}`;
                    statusIndicator.style.backgroundColor = '#4cc9f0';
                } else {
                    statusText.textContent = 'Online';
                }
            } else {
                statusIndicator.className = 'status-indicator offline';
                statusText.textContent = 'Offline';
            }
        }
        filterPlayers();
    }
}
function updateAllPlayersStatus(onlineUserIds) {
    allPlayers.forEach(player => {
        player.status = onlineUserIds.includes(player.id) ? 'online' : 'offline';
    });
    renderPlayers(allPlayers);
}
function viewProfile(userId) {
    window.viewProfile(userId);
}
function startConversation(userId) {
    window.location.href = `/messages?user=${userId}`;
}
function showError(message) {
    const playersGrid = document.getElementById('playersGrid');
    playersGrid.innerHTML = `
        <div class="error-message">
            <i class="fas fa-exclamation-triangle"></i>
            <p>${message}</p>
            <button onclick="loadPlayers()" class="btn btn-secondary">
                <i class="fas fa-redo"></i> retry
            </button>
        </div>
    `;
}
window.spectatePlayer = spectatePlayer;
document.body.classList.add('fade-in');