// --- Database abstraction layer (Ready for Supabase/Firebase) ---
const DBStatus = {
    isOnline: false, // Set to true when connected to an external DB
};

const StateManager = {
    currentWallet: 'personal',
    data: {
        personal: JSON.parse(localStorage.getItem('wallet_personal')) || [],
        business: JSON.parse(localStorage.getItem('wallet_business')) || []
    },
    budgets: {
        personal: localStorage.getItem('budget_personal') || 0,
        business: localStorage.getItem('budget_business') || 0
    },
    goals: {
        personal: JSON.parse(localStorage.getItem('goals_personal')) || [],
        business: JSON.parse(localStorage.getItem('goals_business')) || []
    },

    save(walletId, transactions) {
        this.data[walletId] = transactions;
        localStorage.setItem(`wallet_${walletId}`, JSON.stringify(transactions));
        if (DBStatus.isOnline) {
            console.log(`Syncing ${walletId} with cloud DB...`);
        }
    },

    saveBudget(walletId, amount) {
        this.budgets[walletId] = amount;
        localStorage.setItem(`budget_${walletId}`, amount);
    },

    saveGoals(walletId, goals) {
        this.goals[walletId] = goals;
        localStorage.setItem(`goals_${walletId}`, JSON.stringify(goals));
    },

    getTransactions(walletId) {
        return this.data[walletId];
    },

    getBudget(walletId) {
        return this.budgets[walletId];
    },

    getGoals(walletId) {
        return this.goals[walletId];
    }
};

let transactions = StateManager.getTransactions(StateManager.currentWallet);
let goals = StateManager.getGoals(StateManager.currentWallet);
let SECRET_PIN = localStorage.getItem('wallet_pin') || '1234';
let currentCurrency = localStorage.getItem('wallet_currency') || '$';

// DOM Elements
const balanceDisplay = document.getElementById('total-balance');
const incomeDisplay = document.getElementById('total-income');
const expenseDisplay = document.getElementById('total-expense');
const list = document.getElementById('transaction-list');
const form = document.getElementById('transaction-form');
const clearBtn = document.getElementById('clear-all');
const walletSelector = document.getElementById('wallet-selector');
const walletTitle = document.getElementById('current-wallet-title');
const budgetInput = document.getElementById('budget-input');
const adviceText = document.getElementById('advice-text');
const chartCard = document.getElementById('chart-card');
const exportBackupBtn = document.getElementById('export-backup');
const importTrigger = document.getElementById('import-trigger');
const importBackupInput = document.getElementById('import-backup');
const loadDemoBtn = document.getElementById('load-demo');
const currencySelector = document.getElementById('currency-selector');
const toastContainer = document.getElementById('toast-container');

// New Elements
const isRecurrent = document.getElementById('is-recurrent');
const goalName = document.getElementById('goal-name');
const goalTarget = document.getElementById('goal-target');
const addGoalBtn = document.getElementById('add-goal-btn');
const goalsContainer = document.getElementById('goals-container');
const recurringOptions = document.getElementById('recurring-options');
const recurringDay = document.getElementById('recurring-day');
const recurringTime = document.getElementById('recurring-time');

const loginOverlay = document.getElementById('login-overlay');
const loginCard = document.querySelector('.login-card');

const toastContainerLocal = document.getElementById('toast-container-local');

let failedAttempts = 0;
let isLockedOut = false;

// --- Notification System ---
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> ${message}`;
    toastContainer.appendChild(toast);

    // Auto remove
    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease-in forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showLocalToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> ${message}`;
    toastContainerLocal.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease-in forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Handle Recurring Checkbox
isRecurrent.addEventListener('change', () => {
    if (isRecurrent.checked) {
        const confirmRecur = confirm('¿Estás seguro de que quieres que este movimiento se repita de forma automática cada mes?');
        if (confirmRecur) {
            recurringOptions.style.display = 'block';
            showLocalToast('Configuración mensual activada', 'success');

            // Default to today
            if (!recurringDay.value) recurringDay.value = new Date().getDate();
            if (!recurringTime.value) {
                const now = new Date();
                // Set current time in 24h for the input type="time" backend, we'll label it or handle 12h display if needed
                // But typically <input type="time"> handles 12h display based on browser locale
                recurringTime.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            }
        } else {
            isRecurrent.checked = false;
        }
    } else {
        recurringOptions.style.display = 'none';
        showLocalToast('Recurrencia desactivada', 'warning');
    }
});

const loginCardElement = document.querySelector('.login-card');
const mainApp = document.getElementById('main-app');
const pinInput = document.getElementById('pin');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const exportBtn = document.getElementById('export-btn');

const description = document.getElementById('description');
const category = document.getElementById('category');
const amount = document.getElementById('amount');
const type = document.getElementById('type');

// Chart Initialization
Chart.register(ChartDataLabels);
let expenseChart;
const ctx = document.getElementById('expense-chart').getContext('2d');

const categoryColors = {
    '🍔 Comida': '#fb7185', // Rosa suave
    '🏠 Renta': '#60a5fa',  // Azul brillante
    '🚗 Transporte': '#34d399', // Esmeralda
    '👔 Trabajo': '#818cf8', // Indigo
    '💡 Otros': '#94a3b8'  // Gris azulado
};

function updateChart() {
    const expensesByCategory = {};
    let totalExpenseAmount = 0;

    transactions.forEach(t => {
        if (t.type === 'expense') {
            const cat = t.category || '💡 Otros';
            expensesByCategory[cat] = (expensesByCategory[cat] || 0) + Number(t.amount);
            totalExpenseAmount += Number(t.amount);
        }
    });

    const labels = Object.keys(expensesByCategory);
    const data = Object.values(expensesByCategory);
    const colors = labels.map(label => categoryColors[label] || '#94a3b8');

    if (expenseChart) {
        expenseChart.data.labels = labels;
        expenseChart.data.datasets[0].data = data;
        expenseChart.data.datasets[0].backgroundColor = colors;
        expenseChart.update();
    } else {
        expenseChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#94a3b8',
                            usePointStyle: true,
                            font: {
                                family: 'Plus Jakarta Sans',
                                size: 12
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleFont: { size: 14 },
                        bodyFont: { size: 14 },
                        padding: 12,
                        cornerRadius: 10,
                        displayColors: false
                    },
                    datalabels: {
                        color: '#fff',
                        font: {
                            weight: 'bold',
                            family: 'Plus Jakarta Sans'
                        },
                        formatter: (value, ctx) => {
                            if (totalExpenseAmount === 0) return '';
                            const percentage = (value / totalExpenseAmount * 100).toFixed(0);
                            return percentage > 5 ? percentage + '%' : ''; // Only show if > 5%
                        }
                    }
                },
                cutout: '70%'
            }
        });
    }
}

// --- Savings Goals Logic ---
function addGoal() {
    const name = goalName.value.trim();
    const target = Number(goalTarget.value);

    if (name === '' || target <= 0) {
        showToast('Añade un nombre y un monto válido para la meta', 'warning');
        return;
    }

    const newGoal = {
        id: Date.now(),
        name,
        target,
        current: 0
    };

    goals.push(newGoal);
    StateManager.saveGoals(StateManager.currentWallet, goals);
    renderGoals();

    goalName.value = '';
    goalTarget.value = '';
    showToast('Meta de ahorro añadida', 'success');
}

function deleteGoal(id) {
    goals = goals.filter(g => g.id !== id);
    StateManager.saveGoals(StateManager.currentWallet, goals);
    renderGoals();
    showToast('Meta eliminada', 'warning');
}

function renderGoals() {
    goalsContainer.innerHTML = '';

    const totalBalance = transactions.reduce((acc, t) => acc + (t.type === 'income' ? t.amount : -t.amount), 0);

    if (goals.length === 0) {
        goalsContainer.innerHTML = '<p class="empty-state">No tienes metas activas.</p>';
        return;
    }

    goals.forEach(goal => {
        const percent = Math.min((totalBalance / goal.target) * 100, 100);

        const goalEl = document.createElement('div');
        goalEl.className = 'goal-item';
        goalEl.innerHTML = `
            <div class="goal-info">
                <strong>${goal.name}</strong>
                <button onclick="deleteGoal(${goal.id})" class="mini-text-btn">🗑️</button>
            </div>
            <div class="goal-info" style="margin-top: 5px;">
                <span>Progreso: ${currentCurrency}${totalBalance.toFixed(0)}</span>
                <span>Objetivo: ${currentCurrency}${goal.target}</span>
            </div>
            <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width: ${percent}%"></div>
            </div>
            <span class="goal-status">${percent.toFixed(1)}% completado</span>
        `;
        goalsContainer.appendChild(goalEl);
    });
}

// --- Recurring Transactions Logic ---
function checkRecurringTransactions() {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    let addedAny = false;

    // Filter templates to join
    const recurringTemplates = transactions.filter(t => t.isRecurrent);

    recurringTemplates.forEach(t => {
        const [tDay, tMonth, tYear] = t.date.split('/');

        // Simple logic: if the template is NOT from this month/year, 
        // check if we already have an entry for this month
        const isFromPast = Number(tMonth) < currentMonth || Number(tYear) < currentYear;

        if (isFromPast) {
            const hasEntryThisMonth = transactions.some(existing =>
                existing.description === t.description &&
                existing.date.includes(`/${currentMonth}/${currentYear}`) &&
                existing.id !== t.id
            );

            if (!hasEntryThisMonth) {
                // Determine day/time to register
                const regDay = t.recurringDay || 1;
                const [regHour, regMin] = (t.recurringTime || "00:00").split(':');

                const newT = {
                    ...t,
                    id: Date.now() + Math.random(),
                    date: `${regDay}/${currentMonth}/${currentYear}`,
                    isRecurrent: true
                };
                transactions.push(newT);
                addedAny = true;
            }
        }
    });

    if (addedAny) {
        updateLocalStorage();
        init();
        showToast('Transacciones recurrentes aplicadas', 'info');
    }
}

// Security Functions
function checkPin() {
    if (isLockedOut) return;

    if (pinInput.value === SECRET_PIN) {
        failedAttempts = 0;
        loginOverlay.classList.add('fade-out');
        mainApp.style.display = 'block';
        loginError.style.display = 'none';

        // Welcome Summary
        const balance = balanceDisplay.innerText;
        showToast(`¡Hola Admin! Tu balance actual es de ${balance}`, 'success');

        pinInput.value = '';
    } else {
        failedAttempts++;
        loginError.innerText = `PIN Incorrecto. Intento ${failedAttempts}/3.`;
        loginError.style.display = 'block';
        pinInput.value = '';
        pinInput.focus();

        if (failedAttempts >= 3) {
            startLockout();
        }
    }
}

function startLockout() {
    isLockedOut = true;
    loginCard.classList.add('locked');
    let timeLeft = 30;

    const timerDisplay = document.createElement('p');
    timerDisplay.className = 'lockout-timer';
    loginCard.appendChild(timerDisplay);

    const interval = setInterval(() => {
        timeLeft--;
        timerDisplay.innerText = `Sistema bloqueado. Reintenta en ${timeLeft}s`;

        if (timeLeft <= 0) {
            clearInterval(interval);
            isLockedOut = false;
            failedAttempts = 0;
            loginCard.classList.remove('locked');
            timerDisplay.remove();
            loginError.style.display = 'none';
        }
    }, 1000);
}

function lockWallet() {
    loginOverlay.classList.remove('fade-out');
    mainApp.style.display = 'none';
    pinInput.focus();
}

// CSV Export Logic
function exportToCSV() {
    if (transactions.length === 0) {
        alert('No hay transacciones para exportar.');
        return;
    }

    // Header row
    let csvContent = "Fecha,Descripción,Categoría,Tipo,Monto\n";

    // Data rows
    let totalBalance = 0;
    transactions.forEach(t => {
        const typeLabel = t.type === 'income' ? 'Ingreso' : 'Gasto';
        const amountValue = t.type === 'income' ? t.amount : -t.amount;
        totalBalance += amountValue;

        csvContent += `${t.date},"\"${t.description}\"","\"${t.category || '💡 Otros'}\"","${typeLabel}","${amountValue.toFixed(2)}"\n`;
    });

    // Final balance row
    csvContent += `\n,,,BALANCE TOTAL,${totalBalance.toFixed(2)}`;

    // Create download link with UTF-8 BOM for Excel
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Reporte_Billetera_${new Date().toLocaleDateString()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Reporte CSV generado con éxito', 'success');
}

// Backup Logic
function exportBackup() {
    const backupData = {
        wallet_personal: StateManager.getTransactions('personal'),
        wallet_business: StateManager.getTransactions('business'),
        budget_personal: StateManager.getBudget('personal'),
        budget_business: StateManager.getBudget('business'),
        goals_personal: StateManager.getGoals('personal'),
        goals_business: StateManager.getGoals('business'),
        pin: SECRET_PIN,
        version: "1.1"
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Billetera_Backup_${new Date().toLocaleDateString()}.json`;
    link.click();
    showToast('Copia de seguridad creada', 'success');
}

function importBackup(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);

            // Restore data
            if (data.wallet_personal) localStorage.setItem('wallet_personal', JSON.stringify(data.wallet_personal));
            if (data.wallet_business) localStorage.setItem('wallet_business', JSON.stringify(data.wallet_business));
            if (data.budget_personal) localStorage.setItem('budget_personal', data.budget_personal);
            if (data.budget_business) localStorage.setItem('budget_business', data.budget_business);
            if (data.goals_personal) localStorage.setItem('goals_personal', JSON.stringify(data.goals_personal));
            if (data.goals_business) localStorage.setItem('goals_business', JSON.stringify(data.goals_business));
            if (data.pin) {
                SECRET_PIN = data.pin;
                localStorage.setItem('wallet_pin', data.pin);
            }

            alert('¡Copia de seguridad restaurada con éxito! La página se recargará.');
            window.location.reload();
        } catch (err) {
            alert('Error al leer el archivo de respaldo. Asegúrate de que es un archivo .json válido.');
        }
    };
    reader.readAsText(file);
}

// Demo Data Logic
function loadDemoData() {
    const demoTransactions = [
        { id: 1, description: 'Salario Mensual', amount: 3000, type: 'income', category: '👔 Trabajo', date: '01/01/2026', isRecurrent: true, recurringDay: 1, recurringTime: "08:00" },
        { id: 2, description: 'Pago de Renta', amount: 800, type: 'expense', category: '🏠 Renta', date: '02/01/2026', isRecurrent: true, recurringDay: 2, recurringTime: "10:00" },
        { id: 3, description: 'Supermercado', amount: 150, type: 'expense', category: '🍔 Comida', date: '05/02/2026' },
        { id: 4, description: 'Gasolina', amount: 60, type: 'expense', category: '🚗 Transporte', date: '07/02/2026' },
        { id: 5, description: 'Freelance Web', amount: 500, type: 'income', category: '👔 Trabajo', date: '10/02/2026' },
        { id: 6, description: 'Cena Restaurante', amount: 45, type: 'expense', category: '🍔 Comida', date: '12/02/2026' },
        { id: 7, description: 'Servicios (Luz/Agua)', amount: 120, type: 'expense', category: '💡 Otros', date: '14/02/2026' },
        { id: 8, description: 'Mantenimiento Auto', amount: 200, type: 'expense', category: '🚗 Transporte', date: '15/02/2026' },
        { id: 9, description: 'Venta Artículo Usado', amount: 80, type: 'income', category: '💡 Otros', date: '16/02/2026' },
        { id: 10, description: 'Suscripción Gym', amount: 35, type: 'expense', category: '💡 Otros', date: '16/01/2026', isRecurrent: true, recurringDay: 16, recurringTime: "07:00" }
    ];

    if (confirm('¿Quieres cargar 10 transacciones de prueba? Esto llenará tu billetera actual.')) {
        transactions = [...transactions, ...demoTransactions];
        updateLocalStorage();
        init();
        showToast('Datos demo cargados con éxito', 'success');
    }
}

function switchCurrency(e) {
    currentCurrency = e.target.value;
    localStorage.setItem('wallet_currency', currentCurrency);
    init();
    showToast(`Moneda cambiada a ${currentCurrency}`, 'info');
}

// Event Listeners for Security
loginBtn.addEventListener('click', checkPin);
pinInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkPin();
});
logoutBtn.addEventListener('click', lockWallet);
exportBtn.addEventListener('click', exportToCSV);
walletSelector.addEventListener('change', switchWallet);
exportBackupBtn.addEventListener('click', exportBackup);
importTrigger.addEventListener('click', () => importBackupInput.click());
importBackupInput.addEventListener('change', importBackup);
loadDemoBtn.addEventListener('click', loadDemoData);
currencySelector.addEventListener('change', switchCurrency);

// Initialization
function init() {
    list.innerHTML = '';
    currencySelector.value = currentCurrency;
    transactions.forEach(addTransactionDOM);
    updateValues();
    renderGoals();
    checkRecurringTransactions();
}

// Helper to format 24h to 12h string
function format12h(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    let h = parseInt(hours);
    const m = minutes;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12; // the hour '0' should be '12'
    return `${h}:${m} ${ampm}`;
}

// Add transaction to DOM
function addTransactionDOM(transaction) {
    const sign = transaction.type === 'income' ? '+' : '-';
    const item = document.createElement('li');

    item.classList.add('transaction-item');

    const itemCategory = transaction.category || '💡 Otros';
    const timeLabel = transaction.recurringTime ? `<br><small>H: ${format12h(transaction.recurringTime)}</small>` : '';
    const recurrenceLabel = transaction.isRecurrent ? ` <small title="Recurrente (Día ${transaction.recurringDay})">🔄 Día ${transaction.recurringDay}${timeLabel}</small>` : '';

    item.innerHTML = `
        <div class="item-info">
            <span class="title">${transaction.description}${transaction.isRecurrent ? ' 🔄' : ''}</span>
            <span class="category-tag">${itemCategory}</span>
            <span class="date">${transaction.date}${recurrenceLabel}</span>
        </div>
        <span class="item-amount ${transaction.type === 'income' ? 'amount-income' : 'amount-expense'}">
            ${sign}${currentCurrency}${Math.abs(transaction.amount).toFixed(2)}
        </span>
    `;

    list.appendChild(item);
}

// Update total balance, income, and expenses
function updateValues() {
    const amounts = transactions.map(t => t.type === 'income' ? t.amount : -t.amount);

    const total = amounts.reduce((acc, item) => (acc += item), 0);
    const income = amounts
        .filter(item => item > 0)
        .reduce((acc, item) => (acc += item), 0);
    const expense = amounts
        .filter(item => item < 0)
        .reduce((acc, item) => (acc += item), 0);

    balanceDisplay.innerText = `${currentCurrency}${total.toFixed(2)}`;
    incomeDisplay.innerText = `${currentCurrency}${income.toFixed(2)}`;
    expenseDisplay.innerText = `${currentCurrency}${Math.abs(expense).toFixed(2)}`;

    updateChart();
    updateBudgetIntelligence(Math.abs(expense));

    // Show empty state if no transactions
    if (transactions.length === 0) {
        list.innerHTML = '<p class="empty-state">No hay transacciones registradas.</p>';
    }
}

function updateBudgetIntelligence(totalExpense) {
    const budget = Number(StateManager.getBudget(StateManager.currentWallet));
    budgetInput.value = budget > 0 ? budget : '';

    if (!budget || budget <= 0) {
        adviceText.innerText = 'Introduce un presupuesto para recibir consejos.';
        chartCard.className = 'chart-container';
        return;
    }

    const percent = (totalExpense / budget) * 100;

    if (percent >= 100) {
        adviceText.innerHTML = '<span class="blinking-bulb">💡</span> <strong>¡Cuidado!</strong> Has agotado tu presupuesto mensual. Detén los gastos no esenciales.';
        chartCard.className = 'chart-container danger-border';
    } else if (percent >= 80) {
        adviceText.innerHTML = '<span class="blinking-bulb">💡</span> <strong>Atención:</strong> Has gastado el ' + Math.floor(percent) + '% de tu presupuesto. Es hora de ahorrar.';
        chartCard.className = 'chart-container warning-border';
    } else {
        adviceText.innerText = 'Vas por buen camino. Te queda un ' + Math.floor(100 - percent) + '% de presupuesto.';
        chartCard.className = 'chart-container';
    }
}

// Add new transaction
function addTransaction(e) {
    e.preventDefault();

    if (description.value.trim() === '' || amount.value.trim() === '') {
        alert('Por favor añade una descripción y un monto');
        return;
    }

    const transaction = {
        id: Math.floor(Math.random() * 100000000),
        description: description.value,
        category: category.value,
        amount: +amount.value,
        type: type.value,
        date: new Date().toLocaleDateString(),
        isRecurrent: isRecurrent.checked,
        recurringDay: isRecurrent.checked ? Number(recurringDay.value) : null,
        recurringTime: isRecurrent.checked ? recurringTime.value : null
    };

    // Remove empty state if it's the first one
    if (transactions.length === 0) {
        list.innerHTML = '';
    }

    transactions.push(transaction);
    addTransactionDOM(transaction);
    updateValues();
    updateLocalStorage();
    renderGoals(); // Update goals progress
    showToast('Movimiento registrado', 'info');

    // Reset form
    description.value = '';
    amount.value = '';
    isRecurrent.checked = false;
    recurringOptions.style.display = 'none';
}

// Update storage
function updateLocalStorage() {
    StateManager.save(StateManager.currentWallet, transactions);
}

// Wallet Switching Logic
function switchWallet(e) {
    StateManager.currentWallet = e.target.value;
    transactions = StateManager.getTransactions(StateManager.currentWallet);
    goals = StateManager.getGoals(StateManager.currentWallet);

    // Update UI
    walletTitle.innerText = StateManager.currentWallet === 'personal' ? 'Billetera Personal' : 'Billetera de Empresa';

    init(); // Re-render everything for the new wallet
}

// Clear all
function clearAll() {
    if (confirm(`¿Estás seguro de que quieres borrar el historial de ${StateManager.currentWallet === 'personal' ? 'Gastos Personales' : 'Gastos de Empresa'}?`)) {
        transactions = [];
        updateLocalStorage();
        init();
        showToast('Historial limpiado', 'warning');
    }
}

// Event Listeners
form.addEventListener('submit', addTransaction);
clearBtn.addEventListener('click', clearAll);
budgetInput.addEventListener('input', (e) => {
    StateManager.saveBudget(StateManager.currentWallet, e.target.value);
    updateValues();
    renderGoals();
});
addGoalBtn.addEventListener('click', addGoal);
walletSelector.addEventListener('change', switchWallet);
exportBtn.addEventListener('click', exportToCSV);
exportBackupBtn.addEventListener('click', exportBackup);
importTrigger.addEventListener('click', () => importBackupInput.click());
importBackupInput.addEventListener('change', importBackup);
loadDemoBtn.addEventListener('click', loadDemoData);
currencySelector.addEventListener('change', switchCurrency);

// Run init
init();
