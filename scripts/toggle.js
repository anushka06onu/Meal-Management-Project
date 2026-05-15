const API_BASE_URL = '';

// State
let token = localStorage.getItem('token') || null;
let user = JSON.parse(localStorage.getItem('user')) || null;
let cart = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupTheme();
});

function setupTheme() {
    const currentTheme = localStorage.getItem('theme') || 'light';
    if (currentTheme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

function checkAuth() {
    if (token && user) {
        showDashboard();
    } else {
        showView('landing-view');
        showNav('public');
    }
}

function showView(viewId) {
    const views = ['landing-view', 'login-view', 'register-view', 'dashboard-view'];
    views.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    
    const target = document.getElementById(viewId);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('animate-fade-in');
    }
}

function showDashSubView(subViewId) {
    const subViews = ['dash-home', 'dash-menu', 'dash-orders'];
    subViews.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    
    const target = document.getElementById(`dash-${subViewId}`);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('animate-fade-in');
    }
}

function showNav(type) {
    const publicNav = document.getElementById('public-nav');
    const loggedInNav = document.getElementById('logged-in-nav');
    const userArea = document.getElementById('user-area');

    if (type === 'public') {
        if (publicNav) publicNav.classList.remove('hidden');
        if (loggedInNav) loggedInNav.classList.add('hidden');
        if (userArea) userArea.classList.add('hidden');
    } else {
        if (publicNav) publicNav.classList.add('hidden');
        if (loggedInNav) loggedInNav.classList.remove('hidden');
        if (userArea) userArea.classList.remove('hidden');
    }
}

function loginClick() {
    showView('login-view');
}

function regClick() {
    showView('register-view');
}

function backToAuth() {
    showView('landing-view');
}

function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const eye = document.getElementById(`${inputId}-eye`);
    if (input.type === 'password') {
        input.type = 'text';
        eye.classList.remove('fa-eye');
        eye.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        eye.classList.remove('fa-eye-slash');
        eye.classList.add('fa-eye');
    }
}

// API Calls
async function handleLogin(e) {
    const username = e.target.username.value;
    const password = e.target.password.value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }

        token = data.token;
        user = data.user;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));

        Swal.fire({
            icon: 'success',
            title: 'Logged In!',
            text: 'Welcome back to UniMeal.',
            timer: 1500,
            showConfirmButton: false
        });

        showDashboard();
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message
        });
    }
}

async function handleRegister(e) {
    const username = e.target.username.value;
    const password = e.target.password.value;
    const name = e.target.name.value;
    const email = e.target.email.value;
    const phone = e.target.phone.value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, name, email, phone })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Registration failed');
        }

        Swal.fire({
            icon: 'success',
            title: 'Registered!',
            text: 'You can now log in.',
            timer: 1500,
            showConfirmButton: false
        });

        showView('login-view');
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message
        });
    }
}

function logout() {
    token = null;
    user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    cart = [];
    showView('landing-view');
    showNav('public');
}

async function showDashboard() {
    showView('dashboard-view');
    showNav('logged-in');
    showDashSubView('home'); // Default sub-view
    updateHeader();
    await fetchProfile();
    await fetchMenu();
    await fetchOrders();
}

function updateHeader() {
    const userInfoEl = document.getElementById('user-info');
    const welcomeUserEl = document.getElementById('welcome-user');
    if (userInfoEl && user) {
        userInfoEl.textContent = `Hello, ${user.username}`;
    }
    if (welcomeUserEl && user) {
        welcomeUserEl.textContent = user.username;
    }
}

async function fetchProfile() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/customers/profile`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (response.ok) {
            const balanceEl = document.getElementById('customer-balance');
            if (balanceEl) balanceEl.textContent = `$${data.balance.toFixed(2)}`;
        }
    } catch (error) {
        console.error('Error fetching profile:', error);
    }
}

async function fetchMenu() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/menu`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (response.ok) {
            renderMenu(data);
        }
    } catch (error) {
        console.error('Error fetching menu:', error);
    }
}

function renderMenu(items) {
    const menuContainer = document.getElementById('menu-items');
    if (!menuContainer) return;
    
    menuContainer.innerHTML = '';
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'glass p-6 rounded-2xl flex flex-col justify-between hover:scale-105 transition-all-custom';
        
        const imgSrc = item.image_path || './images/food_banner.png';
        
        card.innerHTML = `
            <div>
                <img src="${imgSrc}" alt="${item.name}" class="w-full h-40 object-cover rounded-xl mb-4" />
                <h3 class="text-xl font-bold text-gray-900 dark:text-white">${item.name}</h3>
                <p class="text-gray-600 dark:text-gray-400 mt-2 text-sm">${item.description || 'Delicious meal option.'}</p>
            </div>
            <div class="mt-4 flex justify-between items-center">
                <span class="text-lg font-bold text-green-500">$${item.price.toFixed(2)}</span>
                <button onclick="addToCart(${item.id}, '${item.name}', ${item.price})" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm">
                    Add to Cart
                </button>
            </div>
        `;
        menuContainer.appendChild(card);
    });
}

function addToCart(id, name, price) {
    const existing = cart.find(item => item.menuItemId === id);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ menuItemId: id, name, price, quantity: 1 });
    }
    updateCartUI();
    Swal.fire({
        icon: 'success',
        title: 'Added to cart',
        text: `${name} added.`,
        timer: 1000,
        showConfirmButton: false
    });
}

function updateCartUI() {
    const cartContainer = document.getElementById('cart-items');
    if (!cartContainer) return;
    
    cartContainer.innerHTML = '';
    let total = 0;
    
    cart.forEach(item => {
        total += item.price * item.quantity;
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700';
        div.innerHTML = `
            <div>
                <span class="font-medium dark:text-white">${item.name}</span>
                <span class="text-sm text-gray-500 dark:text-gray-400">x${item.quantity}</span>
            </div>
            <span class="font-bold dark:text-white">$${(item.price * item.quantity).toFixed(2)}</span>
        `;
        cartContainer.appendChild(div);
    });
    
    const totalEl = document.getElementById('cart-total');
    if (totalEl) totalEl.textContent = `$${total.toFixed(2)}`;
}

async function handlePlaceOrder() {
    if (cart.length === 0) {
        Swal.fire('Empty Cart', 'Please add items to your cart first.', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/orders`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ 
                items: cart,
                specialInstructions: 'Web Order'
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to place order');
        }

        Swal.fire({
            icon: 'success',
            title: 'Order Placed!',
            text: `Order #${data.orderId} successful.`
        });

        cart = [];
        updateCartUI();
        await fetchProfile(); // Update balance
        await fetchOrders();  // Update history
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Order Failed',
            text: error.message
        });
    }
}

async function fetchOrders() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/customers/orders`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (response.ok) {
            renderOrders(data);
        }
    } catch (error) {
        console.error('Error fetching orders:', error);
    }
}

function renderOrders(orders) {
    const ordersContainer = document.getElementById('order-history');
    if (!ordersContainer) return;
    
    ordersContainer.innerHTML = '';
    orders.forEach(order => {
        const tr = document.createElement('tr');
        tr.className = 'border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800';
        tr.innerHTML = `
            <td class="px-4 py-3 font-medium text-gray-900 dark:text-white">#${order.id}</td>
            <td class="px-4 py-3 dark:text-gray-300">${new Date(order.created_at).toLocaleDateString()}</td>
            <td class="px-4 py-3 font-bold text-gray-900 dark:text-white">$${order.total_amount.toFixed(2)}</td>
            <td class="px-4 py-3">
                <span class="px-2 py-1 text-xs font-semibold rounded-full ${getStatusClass(order.status)}">
                    ${order.status}
                </span>
            </td>
        `;
        ordersContainer.appendChild(tr);
    });
}

function getStatusClass(status) {
    switch (status) {
        case 'pending': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
        case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
        case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
        default: return 'bg-gray-100 text-gray-800';
    }
}
