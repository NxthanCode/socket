
document.addEventListener('DOMContentLoaded', function() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(console.error);
    }
    
    if (window.performance) {
        const resources = performance.getEntriesByType('resource');
        resources.forEach(resource => {
            console.log(`${resource.name}: ${resource.duration.toFixed(2)}ms`);
        });
    }
    
    simulateLoading();
});

function simulateLoading() {
    const loader = document.getElementById('loader-container');
    
    const timeout = Math.min(1500, Math.random() * 1000 + 1000);
    
    setTimeout(() => {
        checkAuthentication();
        
        loader.style.opacity = '0';
        
        setTimeout(() => {
            loader.classList.add('hidden');
        }, 300);
        
    }, timeout);
}

function checkAuthentication() {
    const cacheKey = 'auth_check_cache';
    const cachedAuth = localStorage.getItem(cacheKey);
    
    if (cachedAuth) {
        const data = JSON.parse(cachedAuth);
        if (data.timestamp && Date.now() - data.timestamp < 30000) {
            if (data.authenticated) {
                window.location.href = '/profile';
            } else {
                window.location.href = '/login';
            }
            return;
        }
    }
    
    fetch('/api/check-auth', {
        cache: 'no-cache',
        headers: {
            'Cache-Control': 'no-cache'
        }
    })
        .then(response => response.json())
        .then(data => {
            localStorage.setItem(cacheKey, JSON.stringify({
                ...data,
                timestamp: Date.now()
            }));
            
            if (data.authenticated) {
                window.location.href = '/profile';
            } else {
                window.location.href = '/login';
            }
        })
        .catch(error => {
            console.error('auth check error:', error);
            window.location.href = '/login';
        });
}

document.addEventListener('contextmenu', function(e) {
    if (e.target.nodeName === 'IMG') {
        e.preventDefault();
    }
});
