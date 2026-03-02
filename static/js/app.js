// Telegram Web App API
let tg = window.Telegram.WebApp;
if (tg && typeof tg.expand === 'function') {
    tg.expand();
}

// Global state
const state = {
    freeTimerInterval: null, freeSyncInterval: null, freeRemainingSeconds: 0,
    freeCaseAvailable: true, user: null, cases: [], inventory: [], history: [],
    currentCase: null, currentOpening: null
};

const API_URL = '/api';

document.addEventListener('DOMContentLoaded', async () => {
    await initUser(); await loadCases(); await loadInventory(); await loadHistory();
    await syncFreeTimer(); startFreeSyncLoop(); startHistoryPolling();
    const liveHistorySection = document.querySelector('.live-history-section');
    if (liveHistorySection) liveHistorySection.style.display = 'block';
    if (window.initAllTGS) setTimeout(() => initAllTGS(), 200);
});

async function initUser() {
    const initData = tg?.initDataUnsafe || {};
    const referrerCode = initData?.start_param || null;

    if (initData.user) {
        try {
            const response = await apiRequest('/user/init', 'POST', {
                telegram_id: initData.user.id, username: initData.user.username,
                first_name: initData.user.first_name, last_name: initData.user.last_name,
                photo_url: initData.user.photo_url, referrer_code: referrerCode
            });
            if (response.success) {
                state.user = response.user;
                if (initData.user.photo_url) state.user.photo_url = initData.user.photo_url;
                updateUserDisplay(); return;
            }
        } catch (error) { console.error('Failed to init user:', error); }
    }
    // Фолбек для браузера
    try {
        const response = await apiRequest('/user/init', 'POST', { telegram_id: 999999999, username: 'test_user', first_name: 'Test User', last_name: '', photo_url: null, referrer_code: null });
        if (response.success) state.user = response.user;
        else state.user = { telegram_id: 999999999, first_name: 'Test User', balance: 0, username: 'test_user', photo_url: null };
    } catch (error) { state.user = { telegram_id: 999999999, first_name: 'Test User', balance: 0, username: 'test_user', photo_url: null }; }
    updateUserDisplay();
}

function updateUserDisplay() {
    if (!state.user) return;
    document.getElementById('userName').textContent = state.user.first_name || 'Пользователь';
    document.getElementById('userBalance').textContent = state.user.balance || 0;
    const userAvatar = document.getElementById('userAvatar');
    if (userAvatar) {
        const photoUrl = state.user.photo_url || (tg?.initDataUnsafe?.user?.photo_url);
        if (photoUrl) userAvatar.innerHTML = `<img src="${photoUrl}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
        else userAvatar.textContent = '👤';
    }
}

async function loadCases() {
    showLoader();
    const response = await apiRequest('/cases/list', 'GET');
    if (response.success) { state.cases = response.cases; renderCases(); }
    hideLoader();
}

async function syncFreeTimer() {
    if (!state.user?.telegram_id) return;
    try {
        const res = await apiRequest(`/user/${state.user.telegram_id}/free-case-check`, 'GET');
        const available = res.available !== false;
        const remaining = available ? 0 : Math.ceil(res.remaining_seconds || 0);
        state.freeCaseAvailable = available; state.freeRemainingSeconds = remaining;
        updateFreeCaseUI();
        if (!available && remaining > 0) _ensureTickerRunning();
        else _stopTicker();
    } catch(e) {}
}

function _ensureTickerRunning() {
    if (state.freeTimerInterval) return;
    state.freeTimerInterval = setInterval(() => {
        if (state.freeRemainingSeconds > 0) { state.freeRemainingSeconds--; updateFreeCaseUI(); }
        if (state.freeRemainingSeconds <= 0) { _stopTicker(); state.freeCaseAvailable = true; updateFreeCaseUI(); }
    }, 1000);
}

function _stopTicker() {
    if (state.freeTimerInterval) { clearInterval(state.freeTimerInterval); state.freeTimerInterval = null; }
}

function startFreeSyncLoop() {
    if (state.freeSyncInterval) clearInterval(state.freeSyncInterval);
    state.freeSyncInterval = setInterval(syncFreeTimer, 30_000);
}

function formatTimer(s) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function updateFreeCaseUI() {
    const available = state.freeCaseAvailable, t = formatTimer(state.freeRemainingSeconds);
    state.cases.filter(c => c.is_free).forEach(c => {
        const el = document.getElementById(`card-price-${c.id}`);
        if (!el) return;
        if (available) { el.className = 'case-price free'; el.textContent = 'Открыть бесплатно'; }
        else { el.className = 'case-price timer'; el.textContent = t; }
    });
    if (state.currentCase?.is_free) {
        const btn = document.getElementById('btnOpenCase');
        if (!btn) return;
        if (available) {
            btn.disabled = false; btn.classList.add('free'); btn.classList.remove('timer-btn');
            btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Открыть бесплатно`;
        } else {
            btn.disabled = true; btn.classList.remove('free'); btn.classList.add('timer-btn');
            btn.innerHTML = `<span style="font-size:15px;letter-spacing:2px">${t}</span>`;
        }
    }
}

function renderCases() {
    const grid = document.getElementById('casesGrid');
    if(!grid) return;
    grid.innerHTML = '';
    if (state.cases.length === 0) { grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">📦</div><div class="empty-state-text">Пока нет доступных кейсов</div></div>`; return; }
    state.cases.forEach(caseItem => {
        const card = document.createElement('div'); card.className = 'case-card';
        card.onclick = () => showCasePreview(caseItem.id);
        const cleanName = (caseItem.name || '').replace(/[^\w\s\u0400-\u04FF]/gu, '').trim();
        const imageContent = `<img class="case-image" src="${caseItem.image_url || '/static/images/free-stars-case.png'}" alt="${cleanName}">`;
        let priceHtml = caseItem.is_free ? `<div class="case-price free" id="card-price-${caseItem.id}">Открыть бесплатно</div>` : `<div class="case-price"><img src="/static/images/star.png" class="price-star-icon" onerror="this.outerHTML='⭐'" alt="star"> ${caseItem.price}</div>`;
        card.innerHTML = `<div class="case-card-inner"><div class="case-image-wrapper">${imageContent}</div><div class="case-info"><div class="case-name">${cleanName}</div>${priceHtml}</div></div>`;
        grid.appendChild(card);
        if (caseItem.is_free) updateFreeCaseUI();
    });
}

let _previewRouletteItems = [];
async function showCasePreview(caseId) {
    const caseItem = state.cases.find(c => c.id === caseId);
    if (!caseItem) return;
    state.currentCase = caseItem;
    const response = await apiRequest(`/cases/${caseId}/items`, 'GET');
    if (!response.success) return;

    if(window.tgsManager) window.tgsManager.destroyAll();
    stopPreviewRoulette();

    document.getElementById('openingCaseName').textContent = caseItem.name;
    document.getElementById('openingCaseDescription').textContent = caseItem.description || '';

    const priceDisplay = document.getElementById('openingCasePrice');
    const btnOpenCase  = document.getElementById('btnOpenCase');

    if (caseItem.is_free) {
        if(priceDisplay) priceDisplay.innerHTML = '';
        updateFreeCaseUI();
    } else {
        if(priceDisplay) priceDisplay.innerHTML = `<img src="/static/images/star.png" class="price-icon" onerror="this.outerHTML='⭐'" alt="star"><span class="price-amount">${caseItem.price}</span>`;
        if(btnOpenCase) { btnOpenCase.disabled = false; btnOpenCase.classList.remove('free', 'timer-btn'); btnOpenCase.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Открыть кейс`; }
    }

    _previewRouletteItems = response.items;
    buildPreviewRoulette(caseId, response.items);

    const itemsPreview = document.getElementById('caseItemsPreview');
    if(itemsPreview) {
        itemsPreview.innerHTML = '';
        response.items.forEach((item, index) => {
            const tgsNum = item.gift.gift_number || ((item.gift.id - 1) % 120) + 1;
            const tgsId  = `prev_${caseId}_${index}`;
            const tile   = document.createElement('div');
            tile.className = `preview-tile rarity-${item.gift.rarity || 'common'}`;
            tile.innerHTML = `<div class="preview-tile-tgs">${tgsEl(tgsId, tgsNum, '80px')}</div><div class="preview-tile-name">${item.gift.name}</div><div class="preview-tile-footer"><span class="preview-tile-chance">${item.drop_chance.toFixed(1)}%</span></div>`;
            itemsPreview.appendChild(tile);
        });
    }
    switchScreen('opening-screen');
    setTimeout(() => { initAllTGS(); startPreviewRoulette(); }, 150);
}

function buildPreviewRoulette(caseId, items) {
    const track = document.getElementById('previewRouletteTrack');
    if (!track) return;
    track.innerHTML = ''; track.style.transition = 'none'; track.style.transform = 'translateX(0)';
    for (let i = 0; i < 40; i++) {
        const item = items[i % items.length];
        const tgsNum = item.gift.gift_number || ((item.gift.id - 1) % 120) + 1;
        const el = document.createElement('div');
        el.className = `preview-roulette-item rarity-${item.gift.rarity || 'common'}`;
        el.innerHTML = `${tgsEl(`prv_rou_${i}`, tgsNum, '108px')}`;
        track.appendChild(el);
    }
}

function startPreviewRoulette() {
    const track = document.getElementById('previewRouletteTrack');
    if (!track) return;
    stopPreviewRoulette();
    const loopWidth = (track.children.length / 2) * 126; let currentX = 0;
    function loop() { currentX -= 0.35; if (Math.abs(currentX) >= loopWidth) currentX = 0; track.style.transform = `translateX(${currentX}px)`; window._previewRAFId = requestAnimationFrame(loop); }
    window._previewRAFId = requestAnimationFrame(loop);
}

function stopPreviewRoulette() { if (window._previewRAFId) { cancelAnimationFrame(window._previewRAFId); window._previewRAFId = null; } }
function closeOpeningScreen() { stopPreviewRoulette(); switchScreen('main-screen'); }

async function confirmOpenCase() {
    if (!state.currentCase) return;
    if (!state.currentCase.is_free && state.user.balance < state.currentCase.price) { showToast('❌ Недостаточно звезд!'); setTimeout(() => showTopupScreen(), 1500); return; }
    if (state.currentCase.is_free) { const canOpen = await checkFreeCaseAvailable(); if (!canOpen) { showToast('⏰ Бесплатный кейс доступен раз в 24 часа'); return; } }
    const confirmText = state.currentCase.is_free ? `Открыть бесплатный кейс "${state.currentCase.name}"?` : `Открыть кейс "${state.currentCase.name}" за ${state.currentCase.price} <img src="/static/images/star.png" class="confirm-star-icon" alt="star">?`;
    document.getElementById('confirmText').innerHTML = confirmText;
    document.getElementById('confirmModal').classList.add('active');
}

async function executeOpenCase() {
    closeConfirmModal(); showLoader();
    const response = await apiRequest('/cases/open', 'POST', { case_id: state.currentCase.id, user_id: state.user.telegram_id });
    hideLoader();
    if (response.success) {
        state.user.balance = response.balance; updateUserDisplay();
        if (state.currentCase?.is_free) syncFreeTimer();
        state.currentOpening = response; await playOpeningAnimation(response);
    } else { showToast('❌ ' + (response.error || 'Ошибка открытия кейса')); }
}

async function playOpeningAnimation(result) {
    switchScreen('animation-screen');
    if(window.tgsManager) window.tgsManager.destroyAll();
    const items = await apiRequest(`/cases/${state.currentCase.id}/items`, 'GET');
    if (!items.success) return;

    const track = document.getElementById('rouletteTrack');
    track.innerHTML = ''; track.style.transition = 'none'; track.style.transform  = 'translateX(0)';

    const itemsList = items.items;
    const wonItemData = itemsList.find(it => it.gift.id === result.gift.id) || itemsList[0];

    for (let i = 0; i < 60; i++) {
        const itemData = (i === 48) ? wonItemData : itemsList[Math.floor(Math.random() * itemsList.length)];
        const tgsNum = itemData.gift.gift_number || ((itemData.gift.id - 1) % 120) + 1;
        const itemEl = document.createElement('div');
        itemEl.className = 'roulette-item';
        itemEl.innerHTML = `${tgsEl(`rou_${i}`, tgsNum, '90px')}<div class="roulette-item-bg"></div>`;
        track.appendChild(itemEl);
    }
    setTimeout(() => initAllTGS(), 100);
    setTimeout(() => {
        const container = document.querySelector('.roulette-track-container'); const wonEl = track.children[48];
        if (!wonEl || !container) return;
        const offset = -(wonEl.getBoundingClientRect().left - container.getBoundingClientRect().left + wonEl.getBoundingClientRect().width / 2 - container.getBoundingClientRect().width / 2);
        track.style.transition = `transform 5000ms cubic-bezier(0.15, 0, 0.25, 1)`; track.style.transform  = `translateX(${offset}px)`;
    }, 300);
    setTimeout(() => { const wonEl = track.children[48]; if (wonEl) wonEl.classList.add('roulette-item-won'); }, 5700);
    setTimeout(() => showResult(result), 6500);
}

function showResult(result) {
    switchScreen('result-screen');
    if(window.tgsManager) window.tgsManager.destroyAll();
    const wonItemImage = document.getElementById('wonItemImage');
    const imageContainer = wonItemImage.parentElement;
    const oldTgs = imageContainer.querySelector('[data-tgs]'); if (oldTgs) oldTgs.remove();

    wonItemImage.style.display = 'none';
    const tgsNum = result.gift.gift_number || ((result.gift.id - 1) % 120) + 1;
    const div = document.createElement('div'); div.innerHTML = tgsEl('result_tgs', tgsNum, '150px');
    imageContainer.insertBefore(div.firstElementChild, wonItemImage);

    setTimeout(() => initAllTGS(), 100);

    document.getElementById('wonItemName').textContent = result.gift.name;
    document.getElementById('wonItemValue').textContent = result.gift.value;
    document.getElementById('resultSellPrice').textContent = result.gift.value || 0;

    const btnSell = document.querySelector('.btn-sell-result'), starsNotice = document.getElementById('starsAutoNotice'), itemValueSection = document.querySelector('.item-value');
    if (result.gift.is_stars) {
        if (btnSell) btnSell.style.display = 'none'; if (starsNotice) starsNotice.style.display = 'flex'; if (itemValueSection) itemValueSection.style.display = 'none';
    } else {
        if (btnSell) btnSell.style.display = ''; if (starsNotice) starsNotice.style.display = 'none'; if (itemValueSection) itemValueSection.style.display = '';
    }
    const rarityEl = document.getElementById('wonItemRarity');
    if(rarityEl) { rarityEl.className = `item-rarity-badge ${result.gift.rarity || 'common'}`; rarityEl.textContent = getRarityText(result.gift.rarity || 'common'); }
}

async function sellResultItem() {
    if (!state.currentOpening) return;
    showLoader(); const response = await apiRequest('/sell', 'POST', { opening_id: state.currentOpening.opening_id, user_id: state.user.telegram_id }); hideLoader();
    if (response.success) { state.user.balance = response.new_balance; updateUserDisplay(); showToast(`💰 Продано за ${state.currentOpening?.gift?.value || 0} ⭐`); closeResultScreen(); }
    else { showToast('❌ ' + (response.error || 'Ошибка продажи')); }
}

function closeResultScreen() { switchScreen('main-screen'); switchTab('inventory'); loadInventory(); }

// === INVENTORY ===
async function loadInventory() { const response = await apiRequest(`/inventory/${state.user.telegram_id}`, 'GET'); if (response.success) { state.inventory = response.inventory; renderInventory(); } }
function renderInventory() {
    const list = document.getElementById('inventoryList'); if(!list) return; list.innerHTML = '';
    if (state.inventory.length === 0) { list.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><img src="/static/images/tab-inventory.png" class="empty-state-icon-img"></div><div class="empty-state-text">Инвентарь пуст — открой кейс!</div></div>`; return; }
    state.inventory.forEach((item, index) => {
        if (item.is_sold || item.gift?.is_stars) return;
        const itemEl = document.createElement('div'); itemEl.className = 'inventory-item';
        const gn = item.gift?.gift_number;
        const imgContent = (gn >= 1 && gn <= 120) ? tgsEl(`inv_tgs_${index}`, gn, '60px') : `<img src="${item.gift?.image_url || '/static/images/star.png'}" style="width:60px;height:60px;object-fit:contain">`;
        let actionsHtml = item.is_withdrawn ? `<div class="inv-done">✅ Выведено</div>` : `<div class="inv-actions"><button class="btn-inv btn-inv-withdraw" onclick="withdrawInventoryItem(${item.opening_id})"><img src="/static/images/withdraw-icon.png" class="btn-inv-withdraw-icon" onerror="this.outerHTML='📤'">Вывести</button><button class="btn-inv btn-inv-sell" onclick="sellInventoryItem(${item.opening_id}, ${item.gift?.value || 0})"><span class="btn-inv-sell-label">Продать за</span><span class="btn-inv-sell-row"><img src="/static/images/star.png" class="btn-inv-star-icon">${item.gift?.value || 0}</span></button></div>`;
        itemEl.innerHTML = `<div class="inv-rarity ${item.gift?.rarity || 'common'}"></div><div class="inv-img">${imgContent}</div><div class="inv-name">${item.gift?.name || 'Приз'}</div>${actionsHtml}`;
        list.appendChild(itemEl);
    });
    setTimeout(() => initAllTGS(), 50);
}

async function withdrawInventoryItem(openingId) { showLoader(); const response = await apiRequest('/withdraw', 'POST', { opening_id: openingId, user_id: state.user.telegram_id }); hideLoader(); if (response.success) { showToast('✅ Приз отправляется!'); loadInventory(); } else showToast('❌ ' + (response.error || 'Ошибка вывода')); }
async function sellInventoryItem(openingId, value) { showLoader(); const response = await apiRequest('/sell', 'POST', { opening_id: openingId, user_id: state.user.telegram_id }); hideLoader(); if (response.success) { state.user.balance = response.new_balance; updateUserDisplay(); showToast(`💰 Продано за ${value} ⭐`); loadInventory(); } else showToast('❌ ' + (response.error || 'Ошибка продажи')); }

// === HISTORY ===
async function loadHistory() { const response = await apiRequest('/history/recent', 'GET'); if (response.success) { state.history = response.history; renderHistory(); } }
function renderHistory() {
    const liveScroll = document.getElementById('liveHistoryScroll'); if (!liveScroll) return;
    if (state.history.length === 0) { liveScroll.innerHTML = `<div style="color:var(--txt3);font-size:12px;padding:8px 4px">Пока пусто</div>`; return; }
    liveScroll.innerHTML = '';
    state.history.forEach((item, index) => {
        const card = document.createElement('div'); card.className = `live-history-card rarity-${item.gift?.rarity || 'common'}`;
        const giftNum = item.gift?.gift_number;
        const imgContent = (giftNum && giftNum >= 1) ? tgsEl(`lh_tgs_${index}`, giftNum, '48px') : `<img src="${item.gift?.image_url || '/static/images/star.png'}" style="width:48px;height:48px;object-fit:contain;flex-shrink:0">`;
        card.innerHTML = `${imgContent}<div class="live-history-card-name">${item.gift?.name || 'Приз'}</div><div class="live-history-card-user">${item.user?.first_name || '...'}</div>`;
        liveScroll.appendChild(card);
    });
    requestAnimationFrame(() => { state.history.forEach((item, index) => { if (item.gift?.gift_number && item.gift?.gift_number >= 1) renderTGS(`lh_tgs_${index}`, item.gift.gift_number); }); });
}
function startHistoryPolling() { setInterval(loadHistory, 5000); }

// === TABS & SCREENS ===
function switchTab(tabName) {
    document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    // Правильно подсвечиваем кнопку в меню
    const navTab = tabName === 'cases' ? 'main' : tabName;
    const activeTab = document.querySelector(`.nav-item[data-tab="${navTab}"]`); 
    if (activeTab) activeTab.classList.add('active');
    
    // Показываем контент вкладки
    const tabContent = document.getElementById(`${tabName}-tab`); 
    if (tabContent) tabContent.classList.add('active');

    // Скрываем шапку в профиле
    const header = document.getElementById('mainHeader');
    if (header) header.style.display = (tabName === 'profile') ? 'none' : 'flex';

    // Управление нативной кнопкой "Назад" (с проверкой на наличие tg.BackButton)
    if (tg && tg.BackButton) {
        if (tabName === 'cases' || tabName === 'inventory' || tabName === 'profile') {
            tg.BackButton.show();
        } else {
            tg.BackButton.hide();
        }
    }
}

function switchScreen(screenName) {
    if (window.tgsManager) window.tgsManager.destroyAll();
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenName); if (screen) screen.classList.add('active');
}

// === TOPUP ===
function showTopupScreen() { document.getElementById('topupModal').classList.add('active'); }
function closeTopupModal() { document.getElementById('topupModal').classList.remove('active'); }
function closeConfirmModal() { document.getElementById('confirmModal').classList.remove('active'); }

async function createStarsInvoice(stars) {
    showLoader();
    try {
        const response = await apiRequest('/payment/create-invoice', 'POST', { user_id: state.user.telegram_id, stars: stars });
        hideLoader();
        if (response.success && response.invoice_link) {
            closeTopupModal();
            tg.openInvoice(response.invoice_link, async (status) => {
                if (status === 'paid') {
                    if (window.playSuccessAnimation) window.playSuccessAnimation();
                    showToast(`✅ Баланс пополнен на ${stars} ⭐`);
                    setTimeout(async () => { await loadUserBalance(); }, 1000);
                } else if (status === 'failed') showToast('❌ Ошибка оплаты');
            });
        } else showToast('❌ ' + (response.error || 'Ошибка создания платежа'));
    } catch (error) { hideLoader(); showToast('❌ Ошибка создания платежа'); }
}
function createCustomStarsInvoice() {
    const input = document.getElementById('customStarsAmount'); let stars = parseInt(input?.value);
    if (!stars || stars < 1) { showToast('❌ Минимальная сумма: 1 ⭐'); return; }
    if (stars > 100000) { showToast('❌ Максимальная сумма: 100,000 ⭐'); return; }
    createStarsInvoice(stars);
}
async function loadUserBalance() { const response = await apiRequest(`/user/${state.user.telegram_id}/profile`, 'GET'); if (response.success) { state.user.balance = response.profile.balance; updateUserDisplay(); } }
function showLoader() { document.getElementById('loader').classList.remove('hidden'); }
function hideLoader() { document.getElementById('loader').classList.add('hidden'); }
function showToast(message) {
    const toast = document.getElementById('toast'); if(!toast) return;
    toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3000);
}
async function apiRequest(endpoint, method = 'GET', data = null) {
    try {
        const options = { method, headers: { 'Content-Type': 'application/json' } };
        if (data && method !== 'GET') options.body = JSON.stringify(data);
        const response = await fetch(API_URL + endpoint, options); return await response.json();
    } catch (error) { return { success: false, error: error.message }; }
}
async function checkFreeCaseAvailable() { const response = await apiRequest(`/user/${state.user.telegram_id}/free-case-check`, 'GET'); return response.available; }
function getRarityText(rarity) { return { 'common': 'Обычный', 'rare': 'Редкий', 'epic': 'Эпический', 'legendary': 'Легендарный' }[rarity] || 'Обычный'; }

if (tg && tg.BackButton) {
    tg.BackButton.onClick(() => {
        const currentScreen = document.querySelector('.screen.active'); 
        if (!currentScreen) return;
        
        if (currentScreen.id === 'opening-screen') {
            closeOpeningScreen();
        } else if (currentScreen.id === 'animation-screen' || currentScreen.id === 'result-screen') {
            switchScreen('main-screen');
        } else if (currentScreen.id === 'main-screen') {
            // Если мы внутри вкладки, возвращаемся на Главную
            const activeTab = document.querySelector('.tab-content.active');
            if (activeTab && (activeTab.id === 'cases-tab' || activeTab.id === 'inventory-tab' || activeTab.id === 'profile-tab')) {
                switchTab('main');
            }
        }
    });
}

document.addEventListener('click', (e) => { if (e.target.closest('button') || e.target.closest('.case-card')) { if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light'); } });
// === ЛОГИКА МИН ===
let minesGameActive = false;

function showMinesScreen() {
    switchScreen('mines-screen');
    renderMinesGrid();
    document.getElementById('btnMinesAction').textContent = 'Начать игру';
    document.getElementById('btnMinesAction').onclick = startMines;
    document.getElementById('btnMinesAction').className = 'btn-open-case';
    minesGameActive = false;
}

function renderMinesGrid(minesArray = []) {
    const grid = document.getElementById('minesGrid');
    grid.innerHTML = '';
    for (let i = 0; i < 25; i++) {
        const cell = document.createElement('div');
        cell.className = 'mine-cell';
        cell.id = `mine-${i}`;
        
        // Если передали массив мин (конец игры)
        if (minesArray.length > 0) {
            cell.classList.add('disabled');
            if (minesArray.includes(i)) {
                cell.innerHTML = '💣';
                if (!cell.classList.contains('bomb')) cell.style.opacity = '0.5'; // Показываем остальные мины прозрачными
            }
        } else {
            cell.onclick = () => clickMine(i);
        }
        grid.appendChild(cell);
    }
}

async function startMines() {
    const bet = parseInt(document.getElementById('minesBet').value);
    const bombs = parseInt(document.getElementById('minesCount').value);
    
    if (bet > state.user.balance) return showToast('❌ Недостаточно звезд!');

    showLoader();
    const res = await apiRequest('/mines/start', 'POST', { user_id: state.user.telegram_id, bet, bombs });
    hideLoader();

    if (res.success) {
        state.user.balance = res.balance;
        updateUserDisplay();
        minesGameActive = true;
        renderMinesGrid();
        
        const btn = document.getElementById('btnMinesAction');
        btn.innerHTML = `Забрать: ${bet} ⭐`;
        btn.onclick = collectMines;
        btn.className = 'btn-open-case free'; // Зеленая кнопка
    } else { showToast(res.error); }
}

async function clickMine(index) {
    if (!minesGameActive) return;
    const cell = document.getElementById(`mine-${index}`);
    if (cell.classList.contains('success')) return;

    showLoader();
    const res = await apiRequest('/mines/click', 'POST', { user_id: state.user.telegram_id, cell: index });
    hideLoader();

    if (res.success) {
        if (res.status === 'lose') {
            minesGameActive = false;
            cell.classList.add('bomb');
            cell.innerHTML = '💥';
            renderMinesGrid(res.mines); // Раскрываем все мины
            
            const btn = document.getElementById('btnMinesAction');
            btn.textContent = 'Попробовать еще раз';
            btn.onclick = startMines;
            btn.className = 'btn-open-case';
            
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
        } else {
            cell.classList.add('success');
            cell.innerHTML = '💎';
            document.getElementById('btnMinesAction').innerHTML = `Забрать: ${res.win_amount} ⭐`;
            if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
        }
    } else { showToast(res.error); }
}

async function collectMines() {
    if (!minesGameActive) return;
    
    showLoader();
    const res = await apiRequest('/mines/collect', 'POST', { user_id: state.user.telegram_id });
    hideLoader();

    if (res.success) {
        minesGameActive = false;
        state.user.balance = res.balance;
        updateUserDisplay();
        renderMinesGrid(res.mines);
        
        const btn = document.getElementById('btnMinesAction');
        btn.textContent = 'Начать игру';
        btn.onclick = startMines;
        btn.className = 'btn-open-case';
        
        showToast(`🎉 Вы забрали ${res.win_amount} ⭐`);
        if (window.playSuccessAnimation) window.playSuccessAnimation();
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } else { showToast(res.error); }
}
// === ПРОФИЛЬ И РЕФЕРАЛЫ ===
function openProfile() {
    openProfileTab();
}

function openProfileTab() {
    switchTab('profile'); // Сразу переключаем вкладку, чтобы не было пустой страницы
    
    if (!state.user?.telegram_id) return;
    
    showLoader();
    apiRequest(`/user/${state.user.telegram_id}/profile`, 'GET')
        .then(response => {
            if (response.success) {
                const profile = response.profile;
                const avatar = document.getElementById('profileAvatar');
                if (avatar) avatar.innerHTML = profile.photo_url ? `<img src="${profile.photo_url}" alt="avatar" style="width:100%;height:100%;object-fit:cover;">` : '👤';
                
                document.getElementById('profileName').textContent = profile.first_name || 'Пользователь';
                document.getElementById('profileUsername').textContent = profile.username ? `@${profile.username}` : '';
                document.getElementById('profileBalance').textContent = profile.balance || 0;
                document.getElementById('profileOpenings').textContent = profile.total_openings || 0;
                document.getElementById('profileReferrals').textContent = profile.total_referrals || 0;
                document.getElementById('profileDeposits').textContent = profile.total_deposits || 0;
            } else { showToast('❌ Ошибка загрузки профиля'); }
        })
        .catch(error => showToast('❌ Ошибка: ' + error.message))
        .finally(() => hideLoader());
}

async function showReferralsList() {
    if (!state.user?.telegram_id) return;
    document.getElementById('referralsModal').classList.add('active');
    document.getElementById('referralsList').innerHTML = '<div class="loader-spinner" style="margin: 20px auto"></div>';
    document.getElementById('refModalBalance').textContent = state.user.balance || 0;

    const botUsername = 'ludomihabot'; 
    document.getElementById('refModalLinkInput').value = `https://t.me/${botUsername}?start=${state.user.referral_code}`;

    const profileRes = await apiRequest(`/user/${state.user.telegram_id}/profile`, 'GET');
    if (profileRes.success) {
        const available = profileRes.profile.available_referral_earnings || 0;
        document.getElementById('refModalEarned').textContent = available;
        document.getElementById('refModalCount').textContent = profileRes.profile.total_referrals || 0;
        
        const btnWithdraw = document.getElementById('btnRefWithdraw');
        if (btnWithdraw) {
            btnWithdraw.disabled = available <= 0;
        }
    }

    const response = await apiRequest(`/user/${state.user.telegram_id}/referrals`, 'GET');
    if (response.success) {
        const listContainer = document.getElementById('referralsList');
        listContainer.innerHTML = '';
        if (!response.referrals || response.referrals.length === 0) {
            listContainer.innerHTML = `<div class="empty-state" style="padding-top:20px;"><div style="font-size:40px;margin-bottom:10px;opacity:0.5;">👥</div>Пока нет рефералов<br><span style="font-size:12px;color:#888;">Поделитесь ссылкой с друзьями, чтобы заработать звезды</span></div>`;
            return;
        }
        response.referrals.forEach(ref => {
            const regDate = new Date(ref.joined_at || new Date()).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
            const avatarHtml = ref.photo_url ? `<img src="${ref.photo_url}" style="width:100%;height:100%;object-fit:cover;">` : `👤`;
            listContainer.innerHTML += `<div class="modern-list-item"><div class="ml-left"><div class="ml-avatar">${avatarHtml}</div><div class="ml-info"><div class="ml-title">${ref.first_name || 'Игрок'}</div><div class="ml-subtitle">Регистрация: ${regDate}</div></div></div><div class="ml-right"><div class="ml-value positive">+${ref.total_earned || 0} <img src="/static/images/star.png" style="width:14px;height:14px;vertical-align:middle;position:relative;top:-1px;"></div></div></div>`;
        });
    } else {
        document.getElementById('referralsList').innerHTML = '<div class="empty-state">Ошибка загрузки</div>';
    }
}

async function withdrawReferralEarnings() {
    if (!state.user?.telegram_id) return;
    const btn = document.getElementById('btnRefWithdraw');
    if (btn) btn.disabled = true;

    showLoader();
    const res = await apiRequest('/user/withdraw-referrals', 'POST', { telegram_id: state.user.telegram_id });
    hideLoader();

    if (res.success) {
        state.user.balance = res.new_balance;
        updateUserDisplay();
        document.getElementById('refModalBalance').textContent = res.new_balance;
        document.getElementById('refModalEarned').textContent = '0';
        showToast(`✅ Выведено ${res.withdrawn} ⭐ на баланс!`);
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } else {
        showToast('❌ ' + (res.error || 'Ошибка вывода'));
        if (btn) btn.disabled = false; 
    }
}

function copyReferralLinkModal() {
    const input = document.getElementById('refModalLinkInput');
    if(input) { input.select(); document.execCommand('copy'); showToast('📋 Ссылка скопирована!'); if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success'); }
}
function shareReferralLink() {
    const input = document.getElementById('refModalLinkInput')?.value; if(!input) return;
    const text = encodeURIComponent('🎁 Залетай скорей! Открывай бесплатный кейс и выигрывай Telegram NFT!');
    if (tg && tg.openTelegramLink) tg.openTelegramLink(`https://t.me/share/url?url=${input}&text=${text}`);
    else window.open(`https://t.me/share/url?url=${input}&text=${text}`, '_blank');
}
function closeReferralsModal() { document.getElementById('referralsModal').classList.remove('active'); }