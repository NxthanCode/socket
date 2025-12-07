let globalSocket = null;
let currentUserId = null;
let notificationSlotsActive = false;
let isSpectatingSlots = false;
let spectatingSlotsData = null;
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        initializeGlobalSocket();
        loadCurrentUserId();
    }, 1500);
});
function initializeGlobalSocket() {
    try {
        if (typeof io === 'undefined') {
            console.log('Socket.io loading...');
            setTimeout(initializeGlobalSocket, 2000);
            return;
        }
        globalSocket = io();
        globalSocket.on('connect', function() {
            console.log('Global notifications connected');
        });
        globalSocket.on('user_status', function(data) {
            if (data && data.status === 'online' && data.user_id !== currentUserId && data.game) {
                showOnlineNotification(data.user_id, data.game);
            }
        });
        globalSocket.on('new_message', function(message) {
            if (message && message.receiver_id === currentUserId) {
                showMessageNotification(message);
            }
        });
    } catch (error) {
        console.log('Socket error:', error);
    }
}
function loadCurrentUserId() {
    const userId = localStorage.getItem('userId');
    if (userId) {
        currentUserId = parseInt(userId);
        return;
    }
    fetch('/api/check-auth')
        .then(response => response.json())
        .then(data => {
            if (data.authenticated) {
                currentUserId = data.user_id;
                localStorage.setItem('userId', data.user_id);
            }
        })
        .catch(() => {
        });
}
function showOnlineNotification(userId, game) {
    if (window.location.pathname === '/players') return;
    fetch(`/api/user/${userId}`)
        .then(response => {
            if (!response.ok) return null;
            return response.json();
        })
        .then(user => {
            if (!user) return;
            const container = getNotificationContainer();
            const noti = document.createElement('div');
            noti.className = 'global-notification game-notification';
            const avatarUrl = user.avatar || '/static/default-avatar.png';
            const gameIcon = game === 'mines' ? 'fa-bomb' : 
                           game === 'slots' ? 'fa-slot-machine' :
                           game === 'crash' ? 'fa-plane' : 'fa-gamepad';
            const canSpectate = game === 'mines' || game === 'slots';
            const gameText = canSpectate ? '<div class="notification-game">Click to spectate</div>' : '';
            noti.innerHTML = `
                <div class="notification-content">
                    <div class="notification-header">
                        <img class="notification-avatar" src="${avatarUrl}" alt="${user.username}" onerror="this.src='/static/default-avatar.png'">
                        <div class="notification-info">
                            <div class="notification-title">
                                <span class="online-dot"></span>
                                ${user.username}
                            </div>
                            <div class="notification-subtitle">
                                <i class="fas ${gameIcon}"></i>
                                Started playing ${game}
                            </div>
                            ${gameText}
                        </div>
                    </div>
                </div>
                <button class="notification-close" onclick="closeNotification(this)">×</button>
            `;
            noti.addEventListener('click', function(e) {
                if (!e.target.classList.contains('notification-close')) {
                    if (game === 'mines' || game === 'slots') {
                        if (window.location.pathname === '/games' || window.location.pathname === '/players') {
                            fetch('/api/players-in-game')
                                .then(response => response.json())
                                .then(players => {
                                    const playerInGame = players.find(p => 
                                        p.user_id === userId && p.game_type === game
                                    );
                                    if (playerInGame) {
                                        if (typeof window.startSpectating === 'function') {
                                            window.startSpectating(userId, game, playerInGame.game_id);
                                        } else {
                                            window.location.href = '/games';
                                        }
                                    } else {
                                        if (typeof window.viewProfile === 'function') {
                                            window.viewProfile(userId);
                                        }
                                    }
                                })
                                .catch(() => {
                                    if (typeof window.viewProfile === 'function') {
                                        window.viewProfile(userId);
                                    }
                                });
                        } else {
                            window.location.href = '/games';
                        }
                    } else {
                        if (typeof window.viewProfile === 'function') {
                            window.viewProfile(userId);
                        }
                    }
                }
            });
            container.appendChild(noti);
            setTimeout(() => {
                if (noti.parentNode) {
                    noti.remove();
                }
            }, 3000);
        })
        .catch(() => {
        });
}
function showMessageNotification(message) {
    if (window.location.pathname === '/messages') return;
    const container = getNotificationContainer();
    const noti = document.createElement('div');
    noti.className = 'global-notification message-notification';
    const shortMsg = message.message.length > 50 ? 
        message.message.substring(0, 50) + '...' : 
        message.message;
    const avatarUrl = message.sender_avatar || '/static/default-avatar.png';
    noti.innerHTML = `
        <div class="notification-content">
            <div class="notification-header">
                <img class="notification-avatar" src="${avatarUrl}" alt="${message.sender_name}" onerror="this.src='/static/default-avatar.png'">
                <div class="notification-info">
                    <div class="notification-title">
                        <i class="fas fa-comment notification-icon"></i>
                        ${message.sender_name}
                    </div>
                    <div class="notification-message">${shortMsg}</div>
                </div>
            </div>
        </div>
        <button class="notification-close" onclick="closeNotification(this)">×</button>
    `;
    noti.addEventListener('click', function(e) {
        if (!e.target.classList.contains('notification-close')) {
            window.location.href = `/messages?user=${message.sender_id}`;
        }
    });
    container.appendChild(noti);
    setTimeout(() => {
        if (noti.parentNode) {
            noti.remove();
        }
    }, 5000);
}
function getNotificationContainer() {
    let container = document.getElementById('globalNotifications');
    if (!container) {
        container = document.createElement('div');
        container.id = 'globalNotifications';
        container.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-width: 350px;
        `;
        document.body.appendChild(container);
        addNotificationStyles();
    }
    return container;
}
function addNotificationStyles() {
    if (document.getElementById('notification-styles')) return;
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
        .global-notification {
            background: var(--card-bg, #1a1a2e);
            border-radius: 12px;
            padding: 15px;
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
            border: 1px solid var(--border-color, #2d3748);
            display: flex;
            align-items: flex-start;
            gap: 12px;
            cursor: pointer;
            transform: translateX(0);
            opacity: 1;
            transition: all 0.3s ease;
            animation: slideInRight 0.4s cubic-bezier(0.2, 0.8, 0.3, 1);
            max-width: 320px;
        }
        .global-notification:hover {
            transform: translateX(-5px);
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
            border-color: var(--primary-color, #4361ee);
        }
        .online-notification {
            border-left: 4px solid var(--success-color, #38b000);
        }
        .message-notification {
            border-left: 4px solid var(--primary-color, #4361ee);
        }
        .notification-content {
            flex: 1;
        }
        .notification-header {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .notification-avatar {
            width: 42px;
            height: 42px;
            border-radius: 50%;
            object-fit: cover;
            border: 2px solid var(--border-color, #2d3748);
            flex-shrink: 0;
        }
        .notification-info {
            flex: 1;
            min-width: 0;
        }
        .notification-title {
            font-weight: 600;
            color: var(--text-primary, #ffffff);
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 4px;
        }
        .online-dot {
            display: inline-block;
            width: 8px;
            height: 8px;
            background: var(--success-color, #38b000);
            border-radius: 50%;
            animation: pulse 2s infinite;
        }
        .notification-icon {
            color: var(--primary-color, #4361ee);
            font-size: 12px;
        }
        .notification-subtitle {
            color: var(--text-muted, #a0aec0);
            font-size: 12px;
            margin-bottom: 4px;
        }
        .notification-game {
            color: var(--primary-color, #4361ee);
            font-size: 11px;
            background: rgba(67, 97, 238, 0.1);
            padding: 3px 8px;
            border-radius: 10px;
            display: inline-block;
            margin-top: 4px;
        }
        .notification-message {
            color: var(--text-secondary, #cbd5e0);
            font-size: 13px;
            line-height: 1.4;
            word-break: break-word;
        }
        .notification-close {
            background: none;
            border: none;
            color: var(--text-muted, #a0aec0);
            cursor: pointer;
            padding: 0;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            opacity: 0.7;
            transition: all 0.2s;
            flex-shrink: 0;
            border-radius: 50%;
        }
        .notification-close:hover {
            opacity: 1;
            color: var(--danger-color, #f72585);
            background: rgba(247, 37, 133, 0.1);
        }
        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
    `;
    document.head.appendChild(style);
}
window.closeNotification = function(closeBtn) {
    const noti = closeBtn.closest('.global-notification');
    if (noti) {
        noti.style.transform = 'translateX(100%)';
        noti.style.opacity = '0';
        setTimeout(() => {
            if (noti.parentNode) {
                noti.remove();
            }
        }, 300);
    }
};
window.sendGameStatus = function(gameName) {
    if (globalSocket && globalSocket.connected) {
        globalSocket.emit('game_status', { game: gameName });
    }
};