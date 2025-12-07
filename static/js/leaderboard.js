document.addEventListener('DOMContentLoaded', function() {
    loadLeaderboard();
    setupEventListeners();
});

function setupEventListeners() {
    const refreshBtn = document.getElementById('refreshLeaderboard');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadLeaderboard);
    }
}

function loadLeaderboard() {
    const refreshBtn = document.getElementById('refreshLeaderboard');
    const leaderboardGrid = document.getElementById('leaderboardGrid');
    
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> loading...';
    }
    
    if (leaderboardGrid) {
        leaderboardGrid.innerHTML = `
            <div class="loading-leaderboard">
                <i class="fas fa-spinner fa-spin"></i>
                <p>loading leaderboard..</p>
            </div>
        `;
    }
    
    fetch('/api/leaderboard')
        .then(response => response.json())
        .then(data => {
            if (leaderboardGrid) {
                leaderboardGrid.innerHTML = '';
                
                if (data.length === 0) {
                    leaderboardGrid.innerHTML = `
                        <div class="no-data">
                            <i class="fas fa-users-slash"></i>
                            <p>no players found</p>
                        </div>
                    `;
                    return;
                }
                
                data.forEach((player) => {
                    const card = document.createElement('div');
                    const rankClass = player.rank <= 3 ? `rank-${player.rank}` : 'rank-other';
                    const isYou = player.is_you;
                    
                    card.className = `leaderboard-card ${rankClass} ${isYou ? 'you' : ''}`;
                    
                    card.innerHTML = `
                        <div class="rank-badge">
                            ${player.rank}
                        </div>
                        <div class="player-info">
                            <div class="player-avatar">
                                <img src="${player.avatar}" alt="${player.username}" onerror="this.src='/static/default-avatar.png'">
                            </div>
                            <div class="player-details">
                                <div class="player-name">
                                    ${player.username}
                                    ${isYou ? '<span class="you-badge">you</span>' : ''}
                                </div>
                                <div class="player-balance">
                                    <i class="fas fa-coins"></i>
                                    $${player.balance}
                                </div>
                            </div>
                        </div>
                    `;
                    
                    leaderboardGrid.appendChild(card);
                });
            }
            
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = '<i class="fas fa-redo"></i> refresh';
            }
        })
        .catch(error => {
            console.error('Error loading leaderboard:', error);
            
            if (leaderboardGrid) {
                leaderboardGrid.innerHTML = `
                    <div class="error-message">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>failed to load leaderboard</p>
                        <button onclick="loadLeaderboard()" class="btn btn-secondary" style="margin-top: 15px;">
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