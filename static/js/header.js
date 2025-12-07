document.addEventListener('DOMContentLoaded', function() {
    loadHeaderBalance();
});


function loadHeaderBalance() {
    fetch('/api/check-auth')
        .then(response => response.json())
        .then(data => {
            if (data.authenticated) {
                const header = document.querySelector('.header');
                const logo = header.querySelector('.logo');
                
                let logoArea = header.querySelector('.logo-area');
                if (!logoArea) {
                    logoArea = document.createElement('div');
                    logoArea.className = 'logo-area';
                    header.insertBefore(logoArea, logo);
                    logoArea.appendChild(logo);
                }
                
                let balanceDiv = header.querySelector('.balance-header');
                if (!balanceDiv) {
                    balanceDiv = document.createElement('div');
                    balanceDiv.className = 'balance-header';
                    logoArea.appendChild(balanceDiv);
                }
                
                balanceDiv.innerHTML = `
                    <i class="fas fa-coins"></i>
                    <span>balance: $${data.balance}</span>
                `;
                
                localStorage.setItem('userId', data.user_id);
            }
        })
        .catch(error => {
            console.error('error loading balance:', error);
        });
}

function updateHeaderBalance(balance) {
    const balanceDiv = document.querySelector('.balance-header');
    if (balanceDiv) {
        balanceDiv.innerHTML = `
            <i class="fas fa-coins"></i>
            <span>balance: $${balance}</span>
        `;
    }
}


function setupHeaderUpdate() {
    setInterval(() => {
        loadHeaderBalance();
    }, 30000);
}