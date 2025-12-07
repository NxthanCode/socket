let profileModal = null;
let currentProfileData = null;
function initializeProfileModal() {
    if (!document.getElementById('profileModal')) {
        createProfileModal();
    }
    window.viewProfile = viewProfile;
}
function createProfileModal() {
    const modal = document.createElement('div');
    modal.id = 'profileModal';
    modal.className = 'modal profile-modal';
    modal.innerHTML = `
        <div class="modal-content profile-modal-content">
            <div class="modal-header">
                <h3><i class="fas fa-user"></i> player profile</h3>
                <button class="modal-close" id="closeProfileModal">&times;</button>
            </div>
            <div class="modal-body">
                <div class="profile-modal-avatar">
                    <img id="profileModalAvatar" src="" alt="Avatar">
                </div>
                <div class="profile-modal-info">
                    <div class="profile-modal-name" id="profileModalName"></div>
                    <div class="profile-modal-status" id="profileModalStatus">
                        <span class="status-indicator"></span>
                        <span class="status-text"></span>
                    </div>
                    <div class="profile-modal-bio" id="profileModalBio"></div>
                    <div class="profile-modal-stats">
                        <div class="stat-item">
                            <div class="stat-label">balance</div>
                            <div class="stat-value" id="profileModalBalance">
                                <i class="fas fa-coins"></i> $0
                            </div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-label">last seen</div>
                            <div class="stat-value" id="profileModalLastSeen">
                                <i class="far fa-clock"></i> loading...
                            </div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-label">status</div>
                            <div class="stat-value" id="profileModalGameStatus">
                                <i class="fas fa-circle"></i> idle
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="messageProfileBtn">
                    <i class="fas fa-comment"></i> send message
                </button>
                <button class="btn btn-primary" id="challengeProfileBtn">
                    <i class="fas fa-gamepad"></i> challenge
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('closeProfileModal').addEventListener('click', closeProfileModal);
    document.getElementById('messageProfileBtn').addEventListener('click', messageProfile);
    document.getElementById('challengeProfileBtn').addEventListener('click', challengeProfile);
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeProfileModal();
        }
    });
    return modal;
}
function viewProfile(userId) {
    if (!userId) return;
    fetch(`/api/user/${userId}`)
        .then(response => response.json())
        .then(user => {
            currentProfileData = user;
            updateProfileModal(user);
            openProfileModal();
            showPlayerInventory(userId); // Load inventory
        })
        .catch(error => {
            console.error('Error loading profile:', error);
            showToast('Error', 'Failed to load profile', 'error', 3000);
        });
}

function showPlayerInventory(userId) {
    fetch(`/api/user/${userId}/inventory`)
        .then(response => response.json())
        .then(inventory => {
            const modalBody = document.querySelector('.profile-modal .modal-body');
            const existingInventory = modalBody.querySelector('.player-inventory');
            if (existingInventory) existingInventory.remove();
            
            if (inventory.length === 0) return;
            
            const inventoryDiv = document.createElement('div');
            inventoryDiv.className = 'player-inventory';
            inventoryDiv.innerHTML = `
                <div class="inventory-title">
                    <i class="fas fa-backpack"></i> inventory
                </div>
                <div class="inventory-grid">
                    ${inventory.map(item => `
                        <div class="inventory-item">
                            <div class="inventory-icon ${item.game}">
                                <i class="${getBoosterIcon(item.type, item.game)}"></i>
                            </div>
                            <div class="inventory-info">
                                <div class="inventory-name">${item.name}</div>
                                <div class="inventory-count">x${item.quantity}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
            
            modalBody.appendChild(inventoryDiv);
        })
        .catch(error => {
            console.error('Error loading inventory:', error);
        });
}



function updateProfileModal(user) {
    const avatar = document.getElementById('profileModalAvatar');
    avatar.src = user.avatar || '/static/default-avatar.png';
    avatar.onerror = function() {
        this.src = '/static/default-avatar.png';
    };
    document.getElementById('profileModalName').textContent = user.username;
    const statusIndicator = document.querySelector('#profileModalStatus .status-indicator');
    const statusText = document.querySelector('#profileModalStatus .status-text');
    statusIndicator.className = `status-indicator ${user.status}`;
    statusText.textContent = user.status === 'online' ? 'Online' : 'Offline';
    const bio = document.getElementById('profileModalBio');
    bio.textContent = user.bio || 'No bio yet';
    if (!user.bio) {
        bio.style.color = 'var(--text-muted)';
        bio.style.fontStyle = 'italic';
    }
    const balance = document.getElementById('profileModalBalance');
    balance.innerHTML = `<i class="fas fa-coins"></i> $${user.balance || 0}`;
    const lastSeen = document.getElementById('profileModalLastSeen');
    if (user.last_seen) {
        const date = new Date(user.last_seen);
        const now = new Date();
        const diff = now - date;
        let timeText;
        if (diff < 60000) {
            timeText = 'Just now';
        } else if (diff < 3600000) {
            const minutes = Math.floor(diff / 60000);
            timeText = `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
        } else if (diff < 86400000) {
            const hours = Math.floor(diff / 3600000);
            timeText = `${hours} hour${hours !== 1 ? 's' : ''} ago`;
        } else {
            const days = Math.floor(diff / 86400000);
            timeText = `${days} day${days !== 1 ? 's' : ''} ago`;
        }
        lastSeen.innerHTML = `<i class="far fa-clock"></i> ${timeText}`;
    } else {
        lastSeen.innerHTML = '<i class="far fa-clock"></i> Unknown';
    }
    const gameStatus = document.getElementById('profileModalGameStatus');
    if (user.status === 'online') {
        gameStatus.innerHTML = '<i class="fas fa-circle" style="color: #4cc9f0"></i> online';
    } else {
        gameStatus.innerHTML = '<i class="fas fa-circle" style="color: var(--text-muted)"></i> offline';
    }
}
function openProfileModal() {
    const modal = document.getElementById('profileModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}
function closeProfileModal() {
    const modal = document.getElementById('profileModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}
function messageProfile() {
    if (!currentProfileData) return;
    closeProfileModal();
    window.location.href = `/messages?user=${currentProfileData.id}`;
}
function challengeProfile() {
    if (!currentProfileData) return;
    closeProfileModal();
    showToast('Challenge Sent', `Challenging ${currentProfileData.username}...`, 'info', 2000);
    setTimeout(() => {
        window.location.href = `/games?challenge=${currentProfileData.id}`;
    }, 1000);
}

const inventoryStyles = document.createElement('style');
inventoryStyles.textContent = `
.player-inventory {
    margin-top: 30px;
    padding-top: 20px;
    border-top: 1px solid var(--card-border);
}

.inventory-title {
    color: var(--text-primary);
    font-weight: 600;
    margin-bottom: 15px;
    display: flex;
    align-items: center;
    gap: 10px;
}

.inventory-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 10px;
}

.player-inventory .inventory-item {
    background-color: rgba(255, 255, 255, 0.05);
    border-radius: var(--radius-sm);
    padding: 10px;
    border: 1px solid var(--card-border);
    text-align: center;
}

.player-inventory .inventory-icon {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    margin: 0 auto 8px;
    background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
    color: white;
}

.player-inventory .inventory-name {
    font-size: 0.8rem;
    color: var(--text-primary);
    margin-bottom: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.player-inventory .inventory-count {
    font-size: 0.75rem;
    color: var(--text-secondary);
}
`;
document.head.appendChild(inventoryStyles);


document.addEventListener('DOMContentLoaded', function() {
    initializeProfileModal();
});