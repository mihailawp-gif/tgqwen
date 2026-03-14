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
    
    // Обновляем баланс в минах
    const minesBal = document.getElementById('minesBalanceDisplay');
    if (minesBal) minesBal.textContent = state.user.balance || 0;

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
            const tgsNum = item.gift.gift_number;
            const tgsId  = `prev_${caseId}_${index}`;
			const tile   = document.createElement('div');
            tile.className = `preview-tile rarity-unique`;
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
    track.innerHTML = ''; track.style.transition = 'none'; 
    track.style.transform = 'translate3d(0,0,0)'; // GPU Ускорение
    
    // Снизили кол-во элементов с 40 до 20 (снимает 50% нагрузки с процессора!)
    for (let i = 0; i < 20; i++) {
        const item = items[i % items.length];
        const tgsNum = item.gift.gift_number;
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
    const loopWidth = (track.children.length / 2) * 126; 
    let currentX = 0;
    
    function loop() { 
        currentX -= 0.35; 
        if (Math.abs(currentX) >= loopWidth) currentX = 0; 
        // ИСПОЛЬЗУЕМ 3D ТРАНСФОРМАЦИЮ ДЛЯ АППАРАТНОГО УСКОРЕНИЯ (GPU)
        track.style.transform = `translate3d(${currentX}px, 0, 0)`; 
        window._previewRAFId = requestAnimationFrame(loop); 
    }
    
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
    track.innerHTML = ''; track.style.transition = 'none'; 
    track.style.transform  = 'translate3d(0,0,0)'; // GPU Ускорение

    const itemsList = items.items;
    const wonItemData = itemsList.find(it => it.gift.id === result.gift.id) || itemsList[0];

    // Снизили кол-во элементов с 60 до 35! Выигрышный предмет теперь 25-й.
    for (let i = 0; i < 35; i++) {
        const itemData = (i === 25) ? wonItemData : itemsList[Math.floor(Math.random() * itemsList.length)];
        const tgsNum = itemData.gift.gift_number;
        const itemEl = document.createElement('div');
        itemEl.className = 'roulette-item';
        itemEl.innerHTML = `${tgsEl(`rou_${i}`, tgsNum, '90px')}<div class="roulette-item-bg"></div>`;
        track.appendChild(itemEl);
    }
    setTimeout(() => initAllTGS(), 100);
    
    setTimeout(() => {
        const container = document.querySelector('.roulette-track-container'); 
        const wonEl = track.children[25]; // Ищем 25-й элемент
        if (!wonEl || !container) return;
        const offset = -(wonEl.getBoundingClientRect().left - container.getBoundingClientRect().left + wonEl.getBoundingClientRect().width / 2 - container.getBoundingClientRect().width / 2);
        track.style.transition = `transform 5000ms cubic-bezier(0.15, 0, 0.25, 1)`; 
        track.style.transform  = `translate3d(${offset}px, 0, 0)`; // GPU Ускорение сдвига
    }, 300);
    
    setTimeout(() => { const wonEl = track.children[25]; if (wonEl) wonEl.classList.add('roulette-item-won'); }, 5700);
    setTimeout(() => showResult(result), 6500);
}

function showResult(result) {
    switchScreen('result-screen');
    if(window.tgsManager) window.tgsManager.destroyAll();
    const wonItemImage = document.getElementById('wonItemImage');
    const imageContainer = wonItemImage.parentElement;
    const oldTgs = imageContainer.querySelector('[data-tgs]'); if (oldTgs) oldTgs.remove();

    wonItemImage.style.display = 'none';
	const tgsNum = result.gift.gift_number;
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
    if(rarityEl) { 
        rarityEl.className = `item-rarity-badge unique`; 
        rarityEl.textContent = 'LIMITED'; 
    }
}

async function sellResultItem() {
    if (!state.currentOpening) return;
    showLoader(); const response = await apiRequest('/sell', 'POST', { opening_id: state.currentOpening.opening_id, user_id: state.user.telegram_id }); hideLoader();
    if (response.success) { state.user.balance = response.new_balance; updateUserDisplay(); showToast(` Продано за ${state.currentOpening?.gift?.value || 0} <img src="/static/images/star.png" style="width:14px;height:14px;vertical-align:middle;position:relative;top:-1px;">`); closeResultScreen(); }
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
        
		const imgContent = (gn >= 1 && gn < 200) ? tgsEl(`inv_tgs_${index}`, gn, '60px') : `<img src="${item.gift?.image_url || '/static/images/star.png'}" style="width:60px;height:60px;object-fit:contain">`;
        
        let actionsHtml = '';
        let rejectedHtml = '';

        // Проверяем статус вывода
        if (item.status === 'pending') {
            actionsHtml = `<div class="inv-pending">⏳ Обработка вывода...</div>`;
        } else {
            if (item.status === 'rejected') {
                rejectedHtml = `<div class="inv-rejected">Отклонено! Обратитесь в поддержку</div>`;
            }
            // Новая крутая иконка вывода (SVG)
            const withdrawIcon = `<svg class="icon-withdraw-svg" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>`;
            actionsHtml = `<div class="inv-actions">
                <button class="btn-inv btn-inv-withdraw" onclick="withdrawInventoryItem(${item.opening_id})">${withdrawIcon}Вывести</button>
                <button class="btn-inv btn-inv-sell" onclick="sellInventoryItem(${item.opening_id}, ${item.gift?.value || 0})">
                    <span class="btn-inv-sell-label">Продать за</span>
                    <span class="btn-inv-sell-row"><img src="/static/images/star.png" class="btn-inv-star-icon">${item.gift?.value || 0}</span>
                </button>
            </div>`;
        }

		itemEl.innerHTML = `<div class="inv-rarity ${item.gift?.rarity || 'unique'}"></div><div class="inv-badge-unique">UNIQUE</div><div class="inv-img">${imgContent}</div><div class="inv-name" style="display:flex;flex-direction:column;align-items:center;"><span>${item.gift?.name || 'Приз'}</span>${rejectedHtml}</div>${actionsHtml}`;
        list.appendChild(itemEl);
    });
    setTimeout(() => initAllTGS(), 50);
}

async function withdrawInventoryItem(openingId) { 
    showLoader(); 
    const response = await apiRequest('/withdraw', 'POST', { opening_id: openingId, user_id: state.user.telegram_id }); 
    hideLoader(); 
    if (response.success) { 
        showToast('⏳ Заявка отправлена! Ожидайте обработки.'); 
        loadInventory(); // Перезагружаем инвентарь, чтобы появилась надпись "Обработка..."
    } else { 
        showToast('❌ ' + (response.error || 'Ошибка вывода')); 
    } 
}

async function sellInventoryItem(openingId, value) { showLoader(); const response = await apiRequest('/sell', 'POST', { opening_id: openingId, user_id: state.user.telegram_id }); hideLoader(); if (response.success) { state.user.balance = response.new_balance; updateUserDisplay(); showToast(` Продано за ${value} <img src="/static/images/star.png" style="width:14px;height:14px;vertical-align:middle;position:relative;top:-1px;">`); loadInventory(); } else showToast('❌ ' + (response.error || 'Ошибка продажи')); }

// === HISTORY ===
let _lastHistoryHash = '';
async function loadHistory() { 
    const response = await apiRequest('/history/recent', 'GET'); 
    if (response.success) { 
        // Простая проверка: если история не изменилась - ничего не трогаем (экономит FPS и не сбрасывает анимации)
        const currentHash = response.history.map(h => h.id).join(',');
        if (currentHash !== _lastHistoryHash) {
            _lastHistoryHash = currentHash;
            state.history = response.history; 
            renderHistory(); 
        }
    } 
}
function renderHistory() {
    const liveScroll = document.getElementById('liveHistoryScroll'); 
    if (!liveScroll) return;
    
    if (state.history.length === 0) { 
        liveScroll.innerHTML = `<div style="color:var(--txt3);font-size:12px;padding:8px 4px">Пока пусто</div>`; 
        return; 
    }
    
    // Уничтожаем старые анимации из ленты перед перерисовкой, чтобы не текла память
    const oldTgsIds = Array.from(liveScroll.querySelectorAll('[data-tgs]')).map(el => el.id);
    if(window.tgsManager && oldTgsIds.length > 0) {
        oldTgsIds.forEach(id => {
            if (_inst.has(id)) {
                try { _inst.get(id).destroy(); } catch(e){}
                _inst.delete(id);
            }
        });
    }

    liveScroll.innerHTML = '';
    
    state.history.forEach((item, index) => {
        const card = document.createElement('div'); 
        card.className = `live-history-card rarity-${item.gift?.rarity || 'common'}`;
        const giftNum = item.gift?.gift_number;
        const uniqId = `lh_tgs_${item.id}_${index}`; // Делаем ID 100% уникальным
        
        // Используем твой исправленный лимит до 200
        const imgContent = (giftNum && giftNum >= 1 && giftNum < 200) ? tgsEl(uniqId, giftNum, '48px') : `<img src="${item.gift?.image_url || '/static/images/star.png'}" style="width:48px;height:48px;object-fit:contain;flex-shrink:0">`;
        
        card.innerHTML = `${imgContent}<div class="live-history-card-name">${item.gift?.name || 'Приз'}</div><div class="live-history-card-user">${item.user?.first_name || '...'}</div>`;
        liveScroll.appendChild(card);
    });
    
    // Надежно запускаем парсинг новых анимаций после того, как они точно вставились в HTML
    setTimeout(() => { if (window.initAllTGS) window.initAllTGS(); }, 50);
}
function startHistoryPolling() { 
    setInterval(loadHistory, 3000); // Опрашиваем сервер каждые 3 секунды (без лагов, т.к. перерисовка умная)
}

// === TABS & SCREENS ===
function switchTab(tabName) {
    document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    const navTab = tabName === 'cases' ? 'main' : tabName;
    const activeTab = document.querySelector(`.nav-item[data-tab="${navTab}"]`); 
    if (activeTab) activeTab.classList.add('active');
    
    const tabContent = document.getElementById(`${tabName}-tab`); 
    if (tabContent) tabContent.classList.add('active');

    const header = document.getElementById('mainHeader');
    if (header) header.style.display = (tabName === 'profile') ? 'none' : 'flex';

    if (tg && tg.BackButton) {
        if (tabName === 'cases' || tabName === 'inventory' || tabName === 'profile') {
            tg.BackButton.show();
        } else {
            tg.BackButton.hide();
        }
    }

    // ВАЖНО: Восстанавливаем анимации при переходе во вкладку (например, в Инвентарь)
    setTimeout(() => { if (window.initAllTGS) window.initAllTGS(); }, 50);
}

function switchScreen(screenName) {
    if (window.tgsManager) window.tgsManager.destroyAll(); // Очищаем память от старого экрана
    
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenName); 
    if (screen) screen.classList.add('active');

    // ВАЖНО: Заново рендерим анимации для нового активного экрана (или при возврате на Главную)
    setTimeout(() => { if (window.initAllTGS) window.initAllTGS(); }, 50);
}

// === TOPUP ===
function showTopupScreen() { document.getElementById('topupModal').classList.add('active'); }
function closeTopupModal() { document.getElementById('topupModal').classList.remove('active'); }
function closeConfirmModal() { document.getElementById('confirmModal').classList.remove('active'); }

async function createStarsInvoice(stars) {
    // Читаем код из инпута
    const promoCode = document.getElementById('depositPromoInput')?.value.trim() || '';
    showLoader();
    try {
        const response = await apiRequest('/payment/create-invoice', 'POST', { 
            user_id: state.user.telegram_id, 
            stars: stars,
            promo_code: promoCode // Отправляем на сервер!
        });
        hideLoader();
        if (response.success && response.invoice_link) {
            closeTopupModal();
            tg.openInvoice(response.invoice_link, async (status) => {
                if (status === 'paid') {
                    if (window.playSuccessAnimation) window.playSuccessAnimation();
                    showToast(` Баланс пополнен!`);
                    setTimeout(async () => { await loadUserBalance(); }, 1500); // Чуть больше задержка для обработки сервером
                } else if (status === 'failed') showToast('❌ Ошибка оплаты');
            });
        } else {
            showToast('❌ ' + (response.error || 'Ошибка создания платежа'));
        }
    } catch (error) { hideLoader(); showToast('❌ Ошибка создания платежа'); }
}

function createCustomStarsInvoice() {
    const input = document.getElementById('customStarsAmount'); let stars = parseInt(input?.value);
    if (!stars || stars < 1) { showToast('❌ Минимальная сумма: 1 <img src="/static/images/star.png" style="width:14px;height:14px;vertical-align:middle;position:relative;top:-1px;">'); return; }
    if (stars > 100000) { showToast('❌ Максимальная сумма: 100,000 <img src="/static/images/star.png" style="width:14px;height:14px;vertical-align:middle;position:relative;top:-1px;">'); return; }
    createStarsInvoice(stars);
}
async function loadUserBalance() { const response = await apiRequest(`/user/${state.user.telegram_id}/profile`, 'GET'); if (response.success) { state.user.balance = response.profile.balance; updateUserDisplay(); } }
function showLoader() { document.getElementById('loader').classList.remove('hidden'); }
function hideLoader() { document.getElementById('loader').classList.add('hidden'); }



const ERROR_ANIMATION_JSON = {"tgs":1,"v":"5.5.2","fr":60,"ip":0,"op":180,"w":512,"h":512,"nm":"Cross Mark (@syrreel)","ddd":0,"assets":[],"layers":[{"ddd":0,"ind":3,"ty":4,"nm":"Shape Layer 3","parent":10,"sr":1,"ks":{"r":{"a":0,"k":135},"p":{"a":0,"k":[60,60,0]}},"ao":0,"shapes":[{"ind":0,"ty":"sh","ks":{"a":1,"k":[{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":0,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":10,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":17,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":23,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":28,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":33,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0,"y":1},"o":{"x":0.333,"y":0},"t":39,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":1,"y":0},"t":51,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":90,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":100,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":107,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":113,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":118,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":123,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0,"y":1},"o":{"x":0.333,"y":0},"t":129,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"t":141,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]}]},"nm":"Path 1","hd":false},{"ty":"st","c":{"a":0,"k":[0.607843137255,0.054901964524,0.054901964524,1]},"o":{"a":0,"k":100},"w":{"a":0,"k":10},"lc":2,"lj":2,"bm":0,"nm":"Stroke 1","hd":false}],"ip":0,"op":180,"st":0,"bm":0},{"ddd":0,"ind":4,"ty":4,"nm":"Shape Layer 9","parent":10,"sr":1,"ks":{"o":{"a":0,"k":40},"r":{"a":0,"k":135},"p":{"a":0,"k":[60,48.755,0]}},"ao":0,"shapes":[{"ind":0,"ty":"sh","ks":{"a":1,"k":[{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":0,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":10,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":17,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":23,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":28,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":33,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0,"y":1},"o":{"x":0.333,"y":0},"t":39,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":1,"y":0},"t":51,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":90,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":100,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":107,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":113,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":118,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":123,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0,"y":1},"o":{"x":0.333,"y":0},"t":129,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"t":141,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]}]},"nm":"Path 1","hd":false},{"ty":"tm","s":{"a":0,"k":85},"e":{"a":1,"k":[{"i":{"x":[0.667],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":0,"s":[95]},{"i":{"x":[0.667],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":10,"s":[94]},{"i":{"x":[0],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":39,"s":[94]},{"i":{"x":[0.667],"y":[1]},"o":{"x":[1],"y":[0]},"t":51,"s":[95]},{"i":{"x":[0.667],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":90,"s":[95]},{"i":{"x":[0.667],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":100,"s":[94]},{"i":{"x":[0],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":129,"s":[94]},{"t":141,"s":[95]}]},"o":{"a":0,"k":180},"m":1,"nm":"Trim Paths 2","hd":false},{"ty":"st","c":{"a":0,"k":[0.607843137255,0.054901960784,0.054901960784,1]},"o":{"a":0,"k":100},"w":{"a":0,"k":10},"lc":2,"lj":2,"bm":0,"nm":"Stroke 1","hd":false}],"ip":0,"op":180,"st":0,"bm":0},{"ddd":0,"ind":5,"ty":4,"nm":"Shape Layer 8","parent":10,"sr":1,"ks":{"o":{"a":0,"k":40},"r":{"a":0,"k":135},"p":{"a":0,"k":[60,48.755,0]}},"ao":0,"shapes":[{"ind":0,"ty":"sh","ks":{"a":1,"k":[{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":0,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":10,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":17,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":23,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":28,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":33,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0,"y":1},"o":{"x":0.333,"y":0},"t":39,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":1,"y":0},"t":51,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":90,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":100,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":107,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":113,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":118,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":123,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0,"y":1},"o":{"x":0.333,"y":0},"t":129,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"t":141,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]}]},"nm":"Path 1","hd":false},{"ty":"tm","s":{"a":0,"k":85},"e":{"a":1,"k":[{"i":{"x":[0.667],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":0,"s":[95]},{"i":{"x":[0.667],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":10,"s":[94]},{"i":{"x":[0],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":39,"s":[94]},{"i":{"x":[0.667],"y":[1]},"o":{"x":[1],"y":[0]},"t":51,"s":[95]},{"i":{"x":[0.667],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":90,"s":[95]},{"i":{"x":[0.667],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":100,"s":[94]},{"i":{"x":[0],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":129,"s":[94]},{"t":141,"s":[95]}]},"o":{"a":0,"k":326},"m":1,"nm":"Trim Paths 2","hd":false},{"ty":"st","c":{"a":0,"k":[0.607843137255,0.054901960784,0.054901960784,1]},"o":{"a":0,"k":100},"w":{"a":0,"k":10},"lc":2,"lj":2,"bm":0,"nm":"Stroke 1","hd":false}],"ip":0,"op":180,"st":0,"bm":0},{"ddd":0,"ind":6,"ty":4,"nm":"Shape Layer 7","parent":10,"sr":1,"ks":{"o":{"a":0,"k":40},"r":{"a":0,"k":135},"p":{"a":0,"k":[60,48.755,0]}},"ao":0,"shapes":[{"ind":0,"ty":"sh","ks":{"a":1,"k":[{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":0,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":10,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":17,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":23,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":28,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":33,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0,"y":1},"o":{"x":0.333,"y":0},"t":39,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":1,"y":0},"t":51,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":90,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":100,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":107,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":113,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":118,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":123,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0,"y":1},"o":{"x":0.333,"y":0},"t":129,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"t":141,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]}]},"nm":"Path 1","hd":false},{"ty":"tm","s":{"a":0,"k":47},"e":{"a":1,"k":[{"i":{"x":[0.667],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":0,"s":[74]},{"i":{"x":[0.667],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":10,"s":[73]},{"i":{"x":[0],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":39,"s":[73]},{"i":{"x":[0.667],"y":[1]},"o":{"x":[1],"y":[0]},"t":51,"s":[74]},{"i":{"x":[0.667],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":90,"s":[74]},{"i":{"x":[0.667],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":100,"s":[73]},{"i":{"x":[0],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":129,"s":[73]},{"t":141,"s":[74]}]},"o":{"a":0,"k":180},"m":1,"nm":"Trim Paths 2","hd":false},{"ty":"st","c":{"a":0,"k":[0.607843137255,0.054901960784,0.054901960784,1]},"o":{"a":0,"k":100},"w":{"a":0,"k":10},"lc":2,"lj":2,"bm":0,"nm":"Stroke 1","hd":false}],"ip":0,"op":180,"st":0,"bm":0},{"ddd":0,"ind":7,"ty":4,"nm":"Shape Layer 6","parent":10,"sr":1,"ks":{"r":{"a":0,"k":135},"p":{"a":0,"k":[60,69.444,0]}},"ao":0,"shapes":[{"ind":0,"ty":"sh","ks":{"a":1,"k":[{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":0,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":10,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":17,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":23,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":28,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":33,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0,"y":1},"o":{"x":0.333,"y":0},"t":39,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":1,"y":0},"t":51,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":90,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":100,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":107,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":113,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":118,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":123,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0,"y":1},"o":{"x":0.333,"y":0},"t":129,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"t":141,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]}]},"nm":"Path 1","hd":false},{"ty":"tm","s":{"a":0,"k":39},"e":{"a":1,"k":[{"i":{"x":[0.667],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":0,"s":[49]},{"i":{"x":[0.667],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":10,"s":[48]},{"i":{"x":[0],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":39,"s":[48]},{"i":{"x":[0.667],"y":[1]},"o":{"x":[1],"y":[0]},"t":51,"s":[49]},{"i":{"x":[0.667],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":90,"s":[49]},{"i":{"x":[0.667],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":100,"s":[48]},{"i":{"x":[0],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":129,"s":[48]},{"t":141,"s":[49]}]},"o":{"a":0,"k":167},"m":1,"nm":"Trim Paths 1","hd":false},{"ty":"st","c":{"a":0,"k":[1,0.501960813999,0.501960813999,1]},"o":{"a":0,"k":100},"w":{"a":0,"k":10},"lc":2,"lj":2,"bm":0,"nm":"Stroke 1","hd":false}],"ip":0,"op":180,"st":0,"bm":0},{"ddd":0,"ind":8,"ty":4,"nm":"Shape Layer 5","parent":10,"sr":1,"ks":{"r":{"a":0,"k":135},"p":{"a":0,"k":[60,69.444,0]}},"ao":0,"shapes":[{"ind":0,"ty":"sh","ks":{"a":1,"k":[{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":0,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":10,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":17,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":23,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":28,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":33,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0,"y":1},"o":{"x":0.333,"y":0},"t":39,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":1,"y":0},"t":51,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":90,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":100,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":107,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":113,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":118,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":123,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0,"y":1},"o":{"x":0.333,"y":0},"t":129,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"t":141,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]}]},"nm":"Path 1","hd":false},{"ty":"tm","s":{"a":0,"k":79},"e":{"a":1,"k":[{"i":{"x":[0.667],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":0,"s":[89]},{"i":{"x":[0.667],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":10,"s":[88]},{"i":{"x":[0],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":39,"s":[88]},{"i":{"x":[0.667],"y":[1]},"o":{"x":[1],"y":[0]},"t":51,"s":[89]},{"i":{"x":[0.667],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":90,"s":[89]},{"i":{"x":[0.667],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":100,"s":[88]},{"i":{"x":[0],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":129,"s":[88]},{"t":141,"s":[89]}]},"o":{"a":0,"k":167},"m":1,"nm":"Trim Paths 1","hd":false},{"ty":"st","c":{"a":0,"k":[1,0.501960813999,0.501960813999,1]},"o":{"a":0,"k":100},"w":{"a":0,"k":10},"lc":2,"lj":2,"bm":0,"nm":"Stroke 1","hd":false}],"ip":0,"op":180,"st":0,"bm":0},{"ddd":0,"ind":9,"ty":4,"nm":"Shape Layer 4","parent":10,"sr":1,"ks":{"r":{"a":0,"k":135},"p":{"a":0,"k":[60,69.444,0]}},"ao":0,"shapes":[{"ind":0,"ty":"sh","ks":{"a":1,"k":[{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":0,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":10,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":17,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":23,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":28,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":33,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0,"y":1},"o":{"x":0.333,"y":0},"t":39,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":1,"y":0},"t":51,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":90,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":100,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":107,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":113,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":118,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":123,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0,"y":1},"o":{"x":0.333,"y":0},"t":129,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"t":141,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]}]},"nm":"Path 1","hd":false},{"ty":"tm","s":{"a":0,"k":0},"e":{"a":1,"k":[{"i":{"x":[0.667],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":0,"s":[27]},{"i":{"x":[0.667],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":10,"s":[26.5]},{"i":{"x":[0],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":39,"s":[26.5]},{"i":{"x":[0.667],"y":[1]},"o":{"x":[1],"y":[0]},"t":51,"s":[27]},{"i":{"x":[0.667],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":90,"s":[27]},{"i":{"x":[0.667],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":100,"s":[26.5]},{"i":{"x":[0],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":129,"s":[26.5]},{"t":141,"s":[27]}]},"o":{"a":0,"k":169},"m":1,"nm":"Trim Paths 1","hd":false},{"ty":"st","c":{"a":0,"k":[1,0.501960813999,0.501960813999,1]},"o":{"a":0,"k":100},"w":{"a":0,"k":10},"lc":2,"lj":2,"bm":0,"nm":"Stroke 1","hd":false}],"ip":0,"op":180,"st":0,"bm":0},{"ddd":0,"ind":10,"ty":3,"nm":"NULL CONTROL","sr":1,"ks":{"o":{"a":0,"k":0},"p":{"a":1,"k":[{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":0,"s":[256,256,0],"to":[5.833,0,0],"ti":[8.167,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":10,"s":[291,256,0],"to":[-8.167,0,0],"ti":[0.333,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":17,"s":[207,256,0],"to":[-0.333,0,0],"ti":[-4,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":23,"s":[289,256,0],"to":[4,0,0],"ti":[3,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":28,"s":[231,256,0],"to":[-3,0,0],"ti":[-2.167,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":33,"s":[271,256,0],"to":[2.167,0,0],"ti":[2.5,0,0]},{"i":{"x":0,"y":1},"o":{"x":0.333,"y":0},"t":39,"s":[244,256,0],"to":[-2.5,0,0],"ti":[-2,0,0]},{"i":{"x":0.667,"y":0.667},"o":{"x":1,"y":1},"t":56,"s":[256,256,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":90,"s":[256,256,0],"to":[5.833,0,0],"ti":[8.167,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":100,"s":[291,256,0],"to":[-8.167,0,0],"ti":[0.333,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":107,"s":[207,256,0],"to":[-0.333,0,0],"ti":[-4,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":113,"s":[289,256,0],"to":[4,0,0],"ti":[3,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":118,"s":[231,256,0],"to":[-3,0,0],"ti":[-2.167,0,0]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":123,"s":[271,256,0],"to":[2.167,0,0],"ti":[2.5,0,0]},{"i":{"x":0,"y":1},"o":{"x":0.333,"y":0},"t":129,"s":[244,256,0],"to":[-2.5,0,0],"ti":[-2,0,0]},{"t":146,"s":[256,256,0]}]},"a":{"a":0,"k":[60,60,0]},"s":{"a":0,"k":[107.686,107.686,100]}},"ao":0,"ip":0,"op":180,"st":0,"bm":0},{"ddd":0,"ind":11,"ty":4,"nm":"Shape Layer 12","parent":10,"sr":1,"ks":{"r":{"a":0,"k":135},"p":{"a":0,"k":[60,60,0]}},"ao":0,"shapes":[{"ind":0,"ty":"sh","ks":{"a":1,"k":[{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":0,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":10,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":17,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":23,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":28,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":33,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0,"y":1},"o":{"x":0.333,"y":0},"t":39,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":1,"y":0},"t":51,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":90,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":100,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":107,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":113,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":118,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"i":{"x":0.667,"y":1},"o":{"x":0.333,"y":0},"t":123,"s":[{"i":[[-26.036,-8.452],[0,0],[-69.191,0.914],[0,0],[39.463,-5.888],[-4.038,-58.33],[19.358,-0.583],[-7.355,63.836],[46.156,-21.317],[3.645,17.678],[0,0],[-23.792,62.12]],"o":[[-33.5,101.15],[0,0],[4.663,15.842],[0,0],[-8.463,54.609],[-25.251,-3.333],[-3.819,-55.974],[-52.138,7.268],[-6.877,-24.067],[63.749,-21.213],[0,0],[24.072,0.583]],"v":[[82.998,-222.929],[44.5,-42.819],[230.647,-54.733],[238.168,22.391],[37.533,33.386],[31.536,237.464],[-45.285,233.929],[-41.75,44.194],[-204.077,88.099],[-227.169,-0.786],[-37.429,-35.945],[-7.573,-239.428]],"c":true}]},{"i":{"x":0,"y":1},"o":{"x":0.333,"y":0},"t":129,"s":[{"i":[[-28.59,-3.934],[0,0],[-68.798,24.877],[-3.252,-16.106],[39.463,-5.888],[24.247,-44.188],[18.376,1.184],[-7.355,63.836],[36.335,0.682],[1.484,17.874],[0,0],[0.698,86.418]],"o":[[1.462,74.044],[0,0],[4.663,15.842],[-73.766,28.874],[-6.106,55.788],[-25.251,-3.333],[19.162,-33.778],[-52.138,7.268],[-4.127,-19.353],[58.642,-5.893],[0,0],[24.072,0.583]],"v":[[54.714,-231.572],[49.214,-49.498],[212.184,-94.016],[233.651,-11.196],[41.658,35.94],[-0.677,228.822],[-86.926,212.716],[-41.161,47.533],[-228.826,62.565],[-237.776,-13.749],[-30.947,-37.32],[-22.697,-236.875]],"c":true}]},{"t":141,"s":[{"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[39,-235.5],[39,-39.677],[237.325,-38.626],[234.633,38.498],[39,39.284],[39,235.5],[-39,235.5],[-39,38.302],[-235.897,37.423],[-235.026,-38.498],[-39,-39.087],[-39,-235.5]],"c":true}]}]},"nm":"Path 1","hd":false},{"ty":"fl","c":{"a":0,"k":[1,0,0.105882360421,1]},"o":{"a":0,"k":100},"r":1,"bm":0,"nm":"Fill 1","hd":false}],"ip":0,"op":180,"st":0,"bm":0}]}; 


// 2. Обновленная функция showToast
function showToast(message) {
    const toast = document.getElementById('toast'); 
    if(!toast) return;
    
    if (window.toastTimeout) clearTimeout(window.toastTimeout);
    toast.innerHTML = ''; 
    
    // АВТОМАТИЧЕСКИ МЕНЯЕМ ВСЕ ЭМОДЗИ ЗВЕЗД НА КАРТИНКУ
    const starImg = '<img src="/static/images/star.png" style="width:16px;height:16px;vertical-align:middle;position:relative;top:-2px;">';
    let formattedMessage = message.replace(/⭐/g, starImg);
    
    if (formattedMessage.includes('❌')) {
        toast.style.display = 'flex';
        toast.style.alignItems = 'center';
        toast.style.justifyContent = 'center';
        toast.style.gap = '8px';
        
        const animDiv = document.createElement('div');
        animDiv.style.width = '24px';
        animDiv.style.height = '24px';
        animDiv.style.flexShrink = '0';
        
        const textSpan = document.createElement('span');
        // Вставляем как HTML, чтобы картинка отрендерилась
        textSpan.innerHTML = formattedMessage.replace('❌', '').trim();
        
        toast.appendChild(animDiv);
        toast.appendChild(textSpan);
        
        try {
            bodymovin.loadAnimation({
                container: animDiv,
                renderer: 'svg',
                loop: false,
                autoplay: true,
                animationData: ERROR_ANIMATION_JSON
            });
        } catch (e) {
            console.error("Ошибка загрузки Lottie-анимации:", e);
        }
    } else {
        toast.style.display = 'block'; 
        // ИСПРАВЛЕНИЕ: Используем innerHTML вместо textContent
        toast.innerHTML = formattedMessage; 
    }

    toast.classList.add('show'); 
    window.toastTimeout = setTimeout(() => toast.classList.remove('show'), 3000);
}



async function apiRequest(endpoint, method = 'GET', data = null) {
    try {
        const options = { method, headers: { 'Content-Type': 'application/json' } };
        if (data && method !== 'GET') options.body = JSON.stringify(data);
        const response = await fetch(API_URL + endpoint, options); return await response.json();
    } catch (error) { return { success: false, error: error.message }; }
}
async function checkFreeCaseAvailable() { const response = await apiRequest(`/user/${state.user.telegram_id}/free-case-check`, 'GET'); return response.available; }


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
let isMineClicking = false;

const MINES_COEFS_JS = {
    1: [1.04, 1.09, 1.14, 1.19, 1.25, 1.32, 1.39, 1.47, 1.56, 1.67, 1.79, 1.92, 2.08, 2.27, 2.50, 2.78, 3.12, 3.57, 4.17, 5.00, 6.25, 8.33, 12.50, 25.00],
    2: [1.09, 1.19, 1.3, 1.43, 1.58, 1.75, 1.96, 2.21, 2.5, 2.86, 3.3, 3.85, 4.55, 5.45, 6.67, 8.33, 10.71, 14.29, 20, 30, 50, 100, 300],
    3: [1.14, 1.3, 1.49, 1.73, 2.02, 2.37, 2.82, 3.38, 4.11, 5.05, 6.32, 8.04, 10.45, 13.94, 19.17, 27.38, 41.07, 65.71, 115, 230, 575, 2300],
    4: [1.19, 1.43, 1.73, 2.11, 2.61, 3.26, 4.13, 5.32, 6.95, 9.27, 12.64, 17.69, 25.56, 38.33, 60.24, 100.4, 180.71, 361.43, 843.33, 2530, 12650],
    5: [1.25, 1.58, 2.02, 2.61, 3.43, 4.57, 6.2, 8.59, 12.16, 17.69, 26.54, 41.28, 67.08, 115, 210.83, 421.67, 948.75, 2530, 8855, 53130],
    6: [1.32, 1.75, 2.37, 3.26, 4.57, 6.53, 9.54, 14.31, 22.12, 35.38, 58.97, 103.21, 191.67, 383.33, 843.33, 2108.33],
    7: [1.39, 1.96, 2.82, 4.13, 6.2, 9.54, 15.1, 24.72, 42.02, 74.7, 140.06, 280.13, 606.94, 1456.67, 4005.83, 13352.78],
    8: [1.47, 2.21, 3.38, 5.32, 8.59, 14.31, 24.72, 44.49, 84.04, 168.08, 360.16, 840.38, 2185, 6555, 24035, 120175, 1081575],
    9: [1.56, 2.5, 4.11, 6.95, 12.16, 22.12, 42.02, 84.04, 178.58, 408.19, 1020.47, 2857.31, 9286.25, 37145, 204297.5, 2042975],
    10: [1.67, 2.86, 5.05, 9.27, 17.69, 35.38, 74.7, 168.08, 408.19, 1088.5, 3265.49, 11429.23, 49526.67, 297160, 3268760],
    11: [1.79, 3.3, 6.32, 12.64, 26.54, 58.97, 140.06, 360.16, 1020.47, 3265.49, 12245.6, 57146.15, 371450, 4457400],
    12: [1.92, 3.85, 8.04, 17.69, 41.28, 103.21, 280.13, 840.38, 2857.31, 11429.23, 57146.15, 400023.08, 5200300],
    13: [2.08, 4.55, 10.45, 25.56, 67.08, 191.67, 606.94, 2185, 9286.25, 49526.67, 371450, 5200300],
    14: [2.27, 5.45, 13.94, 38.33, 115, 383.33, 1456.67, 6555, 37145, 297160, 4457400],
    15: [2.5, 6.67, 19.17, 60.24, 210.83, 843.33, 4005.83, 24035, 204297.5, 3268760],
    16: [2.78, 8.33, 27.38, 100.4, 421.67, 2108.33, 13352.78, 120175, 2042975],
    17: [3.13, 10.71, 41.07, 180.71, 948.75, 6325, 60087.5, 1081575],
    18: [3.57, 14.29, 65.71, 361.43, 2530, 25300, 480700],
    19: [4.17, 20, 115, 843.33, 8855, 177100],
    20: [5, 30, 230, 2530, 53130],
    21: [6.25, 50, 575, 12650],
    22: [8.33, 100, 2300],
    23: [12.5, 300],
    24: [25]
};

function showMinesScreen() {
    switchScreen('mines-screen');
    renderMinesGrid();
    renderMultipliers(0);
    document.getElementById('btnMinesAction').textContent = 'Играть';
    document.getElementById('btnMinesAction').onclick = startMines;
    document.getElementById('btnMinesAction').className = 'btn-open-case';
    minesGameActive = false;
}

function modifyBet(action, val) {
    if (minesGameActive) return;
    const input = document.getElementById('minesBet');
    let current = parseInt(input.value) || 0;
    
    if (action === 'add') current += val;
    if (action === 'mult') current = Math.floor(current * val);
    if (action === 'clear') current = 0;
    if (current < 0) current = 0;
    
    input.value = current;
    if (tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
}

function setBombs(val) {
    if (minesGameActive) return;
    document.getElementById('minesCount').value = val;
    customBombsInput();
    if (tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
}

function customBombsInput() {
    if (minesGameActive) return;
    let input = document.getElementById('minesCount');
    let val = parseInt(input.value);

    document.querySelectorAll('.bombs-buttons button').forEach(b => b.classList.remove('active'));

    if (isNaN(val)) return;
    if (val < 1) { val = 1; input.value = 1; }
    if (val > 24) { val = 24; input.value = 24; }
    
    document.querySelectorAll('.bombs-buttons button').forEach(b => {
        if (parseInt(b.textContent) === val) b.classList.add('active');
    });

    renderMultipliers(0);
}

function renderMultipliers(currentStep = 0) {
    const container = document.getElementById('minesMultipliers');
    if (!container) return;
    
    let bombs = parseInt(document.getElementById('minesCount').value) || 3; 
    const coefs = MINES_COEFS_JS[bombs] || [];

    container.innerHTML = '';
    coefs.forEach((coef, index) => {
        const stepNum = index + 1;
        const el = document.createElement('div');
        el.className = `mult-step ${index === currentStep ? 'active' : ''}`;
        el.innerHTML = `<div class="mult-step-label">Шаг ${stepNum}</div>x${coef}`;
        container.appendChild(el);

        if (index === currentStep) {
            setTimeout(() => el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }), 50);
        }
    });
}

// Крутые SVG иконки вместо эмодзи
// Чистые статичные иконки
const ICON_DIAMOND = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
<polygon points="2,14 12,4 10,14" fill="#5CE1E6"/>
<polygon points="12,4 20,4 22,14 10,14" fill="#38C6D9"/>
<polygon points="20,4 30,14 22,14" fill="#0BB0B5"/>
<polygon points="2,14 16,29 10,14" fill="#75E8EF"/>
<polygon points="10,14 16,29 22,14" fill="#4AD3E0"/>
<polygon points="22,14 16,29 30,14" fill="#29BDD0"/>
</svg>`;

const ICON_BOMB = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="12" cy="13" r="8" fill="url(#paint0_radial_bomb)"/>
<circle cx="12" cy="13" r="7.5" stroke="#1F2937" stroke-opacity="0.5"/>
<path d="M12 5V2" stroke="#78350F" stroke-width="2" stroke-linecap="round"/>
<path d="M11.5 6.5C11.5 6.5 14.5 5.5 16 7" stroke="#4B5563" stroke-width="1.5" stroke-linecap="round"/>
<path d="M12 0.5L10.5 3L12 4.5L14 3L12 0.5Z" fill="#EF4444"/>
<path d="M12 0.5L11 2.5L12 3.5L13.5 2.5L12 0.5Z" fill="#FCD34D"/>
<defs>
<radialGradient id="paint0_radial_bomb" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(9.5 10.5) rotate(56.3099) scale(9.60469)">
<stop stop-color="#4B5563"/>
<stop offset="1" stop-color="#111827"/>
</radialGradient>
</defs>
</svg>`;

function renderMinesGrid(minesArray = [], clickedArray = []) {
    const grid = document.getElementById('minesGrid');
    if (!grid) return;
    grid.innerHTML = '';
    
    for (let i = 0; i < 25; i++) {
        const cell = document.createElement('div');
        cell.className = 'mine-cell';
        cell.id = `mine-${i}`;
        
        if (minesArray.length > 0) {
            cell.classList.add('disabled');
            
            // Если это бомба
            if (minesArray.includes(i)) {
                cell.innerHTML = ICON_BOMB;
                if (clickedArray.includes(i)) {
                    cell.classList.add('bomb'); // Та самая бомба, на которой подорвались
                    cell.style.opacity = '1';
                    cell.style.transform = 'scale(1.05)';
                } else {
                    cell.style.opacity = '0.6'; // Остальные нераскрытые бомбы
                }
            } 
            // Если это алмаз
            else {
                cell.innerHTML = ICON_DIAMOND;
                if (clickedArray.includes(i)) {
                    cell.classList.add('success'); // Успешно открытый алмаз
                    cell.style.opacity = '1';
                } else {
                    // НЕОТКРЫТЫЙ АЛМАЗ (показываем полупрозрачным)
                    cell.style.opacity = '0.3';
                    cell.style.transform = 'scale(0.85)'; // Чуть уменьшаем для эффекта "осталось под землей"
                }
            }
        } else {
            // Игра идет
            cell.onclick = () => clickMine(i);
        }
        grid.appendChild(cell);
    }
}

async function startMines() {
    const bet = parseInt(document.getElementById('minesBet').value);
    const bombs = parseInt(document.getElementById('minesCount').value);
    
    if (isNaN(bet) || bet <= 0) return showToast('❌ Введите корректную ставку');
    if (isNaN(bombs) || bombs < 1 || bombs > 24) return showToast('❌ Количество мин: от 1 до 24');
    if (bet > state.user.balance) return showToast('❌ Недостаточно звезд!');

    showLoader();
    const res = await apiRequest('/mines/start', 'POST', { user_id: state.user.telegram_id, bet, bombs });
    hideLoader();

    if (res.success) {
        state.user.balance = res.balance;
        updateUserDisplay();
        minesGameActive = true;
        renderMinesGrid();
        renderMultipliers(0);
        
        const btn = document.getElementById('btnMinesAction');
        btn.innerHTML = `Забрать: ${bet} <img src="/static/images/star.png" style="width:14px;height:14px;vertical-align:middle;position:relative;top:-1px;">`;
        btn.onclick = collectMines;
        btn.className = 'btn-open-case free'; 
    } else { showToast(res.error); }
}

async function clickMine(index) {
    // Если игра не активна или уже идет обработка клика — игнорируем
    if (!minesGameActive || isMineClicking) return; 
    const cell = document.getElementById(`mine-${index}`);
    if (cell.classList.contains('success')) return;

    isMineClicking = true; // Блокируем новые клики
    cell.style.opacity = '0.5'; // Визуально показываем юзеру, что клик принят

    // УБРАЛИ showLoader();
    const res = await apiRequest('/mines/click', 'POST', { user_id: state.user.telegram_id, cell: index });
    // УБРАЛИ hideLoader();

    isMineClicking = false; // Снимаем блокировку

    if (res.success) {
        if (res.status === 'lose') {
            minesGameActive = false;
            renderMinesGrid(res.mines, res.clicked);
            
            const btn = document.getElementById('btnMinesAction');
            btn.textContent = 'Попробовать еще раз';
            btn.onclick = startMines;
            btn.className = 'btn-open-case';
            
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
        } else {
            cell.style.opacity = '1'; // Возвращаем нормальную прозрачность
            cell.classList.add('success');
            cell.innerHTML = ICON_DIAMOND;
            document.getElementById('btnMinesAction').innerHTML = `Забрать: ${res.win_amount} <img src="/static/images/star.png" style="width:18px;height:18px;vertical-align:middle;position:relative;top:-1px;">`;
            renderMultipliers(res.step); 
            if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
        }
    } else { 
        cell.style.opacity = '1'; // В случае ошибки тоже возвращаем как было
        showToast(res.error); 
    }
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
        renderMinesGrid(res.mines, res.clicked);
        
        const btn = document.getElementById('btnMinesAction');
        btn.textContent = 'Начать игру';
        btn.onclick = startMines;
        btn.className = 'btn-open-case';
        
        showToast(`Вы забрали ${res.win_amount} ⭐`);
        if (window.playSuccessAnimation) window.playSuccessAnimation();
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } else { showToast(res.error); }
}
// === ЛОГИКА CRASH (MULTIPLAYER) ===
// === ЛОГИКА CRASH (MULTIPLAYER) ===
// === ЛОГИКА CRASH (MULTIPLAYER & 3D RENDER) ===
let crashSocket = null;
let currentCrashState = 'WAITING';
let myCrashBetAmount = 0;
let didIbet = false;
let didIcashout = false;

// Переменные для 3D рендера
let crashCtx = null, crashCanvas = null;
let crashStars = [];
let crashExplosionAnim = null;
let gridZOffset = 0; 
let crashAnimFrame = null;
let crashRenderData = { multiplier: 1.00, state: 'WAITING' }; // Синхронизация данных и отрисовки

function showCrashScreen() {
    switchScreen('crash-screen');
    const balEl = document.getElementById('crashBalanceDisplay');
    if (balEl && state.user) balEl.textContent = state.user.balance || 0; 
    connectCrashWebSocket();
    initCrashCanvas();
}

function connectCrashWebSocket() {
    if (crashSocket) return; 
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    crashSocket = new WebSocket(`${protocol}//${host}/api/crash/ws`);

    crashSocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        updateCrashUI(data);
    };

    crashSocket.onclose = () => {
        crashSocket = null;
        if (document.getElementById('crash-screen').classList.contains('active')) {
            setTimeout(connectCrashWebSocket, 2000);
        }
    };
}

function updateCrashUI(data) {
    currentCrashState = data.state;
    // Обновляем данные для Canvas Loop
    crashRenderData.multiplier = data.multiplier;
    crashRenderData.state = data.state;

    const mulEl = document.getElementById('crashMultiplier');
    const timerEl = document.getElementById('crashTimer');
    const btn = document.getElementById('btnCrashAction');
    const explosion = document.getElementById('crashExplosion');

    // ГЛОБАЛЬНАЯ ПРОВЕРКА АВТОВЫВОДА
    if (didIbet && !didIcashout) {
        const myData = data.players.find(p => p.user_id === state.user.telegram_id);
        if (myData && myData.cashout !== null) {
            didIcashout = true;
            state.user.balance += myData.profit; 
            updateUserDisplay();
            const balEl = document.getElementById('crashBalanceDisplay');
            if (balEl) balEl.textContent = state.user.balance;
            
            showToast(`🚀 Автовывод! Вы забрали ${myData.profit} ⭐`);
            if (window.playSuccessAnimation) window.playSuccessAnimation();
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        }
    }

    // ЛОГИКА СОСТОЯНИЙ UI
    if (data.state === 'WAITING') {
        mulEl.style.display = 'none'; // Скрываем иксы
        mulEl.classList.remove('crashed', 'crash-anim-text');
        
        timerEl.style.display = 'block';
        timerEl.textContent = `Запуск через ${data.timer.toFixed(1)}s`;
        explosion.style.display = 'none'; // Убираем старый взрыв
        
        if (data.timer > 7.5) { didIbet = false; didIcashout = false; }

        if (!didIbet) {
            btn.textContent = 'СДЕЛАТЬ СТАВКУ';
            btn.className = 'btn-crash-main';
            btn.disabled = false;
        } else {
            btn.textContent = 'ОЖИДАНИЕ ИГРЫ...';
            btn.className = 'btn-crash-main disabled';
            btn.disabled = true;
        }
    } 
    else if (data.state === 'FLYING') {
        mulEl.style.display = 'block';
        mulEl.className = 'crash-multiplier'; // Возвращаем зеленый цвет
        mulEl.textContent = 'x' + data.multiplier.toFixed(2);
        timerEl.style.display = 'none';

        if (didIbet && !didIcashout) {
            const currentProfit = Math.floor(myCrashBetAmount * data.multiplier);
            btn.innerHTML = `ЗАБРАТЬ ${currentProfit} <img src="/static/images/star.png" style="width:16px;height:16px;vertical-align:middle;position:relative;top:-2px;">`;
            btn.className = 'btn-crash-main cashout';
            btn.disabled = false;
        } else {
            btn.textContent = 'ИДЕТ ИГРА...';
            btn.className = 'btn-crash-main disabled';
            btn.disabled = true;
        }
    } 
    else if (data.state === 'CRASHED') {
        // Если только что крашнулось
        if (!mulEl.classList.contains('crashed')) {
            mulEl.style.display = 'block';
            mulEl.textContent = 'x' + data.multiplier.toFixed(2);
            mulEl.className = 'crash-multiplier crashed crash-anim-text'; // Включаем красный текст и затухание
            
            // Включаем ВЗРЫВ на весь экран
            explosion.style.display = 'flex';
            if (crashExplosionAnim) crashExplosionAnim.goToAndPlay(0, true);

            btn.textContent = 'РАУНД ЗАВЕРШЕН';
            btn.className = 'btn-crash-main disabled';
            btn.disabled = true;
            
            if (didIbet && !didIcashout) {
                if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
                didIbet = false; 
            }
        }
    }

    // История пилюли 
    const histContainer = document.getElementById('crashHistory');
    histContainer.innerHTML = '';
    data.history.forEach((x, index) => {
        const el = document.createElement('div');
        el.className = `history-pill ${index === 0 ? 'current' : ''}`;
        el.textContent = x.toFixed(2);
        histContainer.appendChild(el);
    });

    // Список игроков (Динамический паддинг)
    document.getElementById('crashTotalPlayers').textContent = data.players.length;
    const list = document.getElementById('crashPlayersList');
    const section = document.getElementById('crashPlayersSection');
    
    // Если игроков нет, сужаем контейнер
    if (data.players.length === 0) {
        section.style.padding = '0';
    } else {
        section.style.padding = '12px 0'; // Возвращаем паддинги
    }

    list.innerHTML = '';
    const sortedPlayers = data.players.sort((a, b) => {
        if (a.cashout && !b.cashout) return -1;
        if (!a.cashout && b.cashout) return 1;
        return b.bet - a.bet;
    });

    sortedPlayers.forEach(p => {
        const pEl = document.createElement('div');
        pEl.className = 'crash-player-item';
        
        let statusHtml = `<div class="c-bet"><img src="/static/images/star.png">${p.bet}</div>`;
        let rightHtml = ``;
        
        if (p.cashout) {
            rightHtml = `<div class="c-win"><img src="/static/images/star.png">${p.profit}</div>`;
        } else if (data.state === 'CRASHED') {
            statusHtml = `<div class="c-bet" style="color:#ef4444;text-decoration:line-through"><img src="/static/images/star.png">${p.bet}</div>`;
        }
        
        const avatar = p.avatar ? `<img src="${p.avatar}">` : '👤';
        
        pEl.innerHTML = `
            <div class="c-player-info">
                <div class="c-avatar">${avatar}</div>
                <div class="c-details">
                    <div class="c-name">${p.name}</div>
                    ${statusHtml}
                </div>
            </div>
            ${rightHtml}
        `;
        list.appendChild(pEl);
    });
}

// --- 3D CANVAS LOOP ---
function initCrashCanvas() {
    crashCanvas = document.getElementById('crashCanvas');
    if (!crashCanvas) return;
    crashCtx = crashCanvas.getContext('2d');
    
    const resize = () => {
        crashCanvas.width = crashCanvas.parentElement.clientWidth;
        crashCanvas.height = crashCanvas.parentElement.clientHeight;
    };
    resize();
    window.removeEventListener('resize', resize);
    window.addEventListener('resize', resize);

    crashStars = [];
    for(let i = 0; i < 60; i++) {
        crashStars.push({
            x: (Math.random() - 0.5) * 1000,
            y: (Math.random() - 0.5) * 1000,
            z: Math.random() * 1000,
            pz: Math.random() * 1000
        });
    }

    const expEl = document.getElementById('crashExplosion');
    if (expEl && !crashExplosionAnim) {
        crashExplosionAnim = bodymovin.loadAnimation({
            container: expEl,
            renderer: 'svg',
            loop: false,
            autoplay: false,
            path: '/static/lose.json' 
        });
    }

    // Запускаем бесконечный цикл рендера
    if (!crashAnimFrame) {
        renderCrashLoop();
    }
}

function renderCrashLoop() {
    if (!crashCtx || !document.getElementById('crash-screen').classList.contains('active')) {
        crashAnimFrame = requestAnimationFrame(renderCrashLoop);
        return;
    }

    const w = crashCanvas.width;
    const h = crashCanvas.height;
    
    crashCtx.fillStyle = '#020308'; 
    crashCtx.fillRect(0, 0, w, h);

    let multiplier = crashRenderData.multiplier;
    let stateStr = crashRenderData.state;

    let speed = stateStr === 'FLYING' ? 4 + (multiplier * 2) : 1;
    if (stateStr === 'CRASHED') speed = 0;
    
    // Сетка
    const horizonY = h * 0.4;
    const vpX = w / 2; 
    
    crashCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)'; 
    crashCtx.lineWidth = 1;
    crashCtx.beginPath();
    for (let i = -15; i <= 15; i++) {
        crashCtx.moveTo(vpX, horizonY);
        crashCtx.lineTo(vpX + i * 40, h);
    }
    if (speed > 0) {
        gridZOffset -= speed;
        if (gridZOffset <= 0) gridZOffset += 40;
    }
    for (let y = gridZOffset; y < 200; y += 20) {
        let py = horizonY + Math.pow(y / 15, 1.8); 
        if (py > horizonY && py <= h) {
            crashCtx.moveTo(0, py);
            crashCtx.lineTo(w, py);
        }
    }
    crashCtx.stroke();

    // Звезды
    crashCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    crashCtx.beginPath();
    for(let star of crashStars) {
        if (speed > 0) star.z -= speed * 1.5;
        if(star.z < 1) {
            star.z = 1000; star.pz = 1000;
            star.x = (Math.random() - 0.5) * 1000;
            star.y = (Math.random() - 0.5) * 1000;
        }
        let cx = w / 2, cy = h / 2;
        let sx = (star.x / star.z) * 100 + cx;
        let sy = (star.y / star.z) * 100 + cy;
        let px = (star.x / star.pz) * 100 + cx;
        let py = (star.y / star.pz) * 100 + cy;
        star.pz = star.z;
        crashCtx.moveTo(px, py);
        crashCtx.lineTo(sx, sy);
    }
    crashCtx.stroke();

    // График и Ракета
    const rocket = document.getElementById('crashRocket');

    if (stateStr === 'WAITING') {
        if (rocket) rocket.style.display = 'none';
    } else {
        let progress = Math.min((multiplier - 1) / 2.0, 1); 
        
        const startX = -20;
        const startY = h + 20;
        const endX = w * 0.8; 
        const endY = h - 50 - (h - 100) * progress;
        const ctrlX = w * 0.4 * progress; 
        const ctrlY = h;

        const fillGrad = crashCtx.createLinearGradient(0, endY, 0, h);
        fillGrad.addColorStop(0, stateStr === 'CRASHED' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'); 
        fillGrad.addColorStop(1, 'transparent');

        crashCtx.beginPath();
        crashCtx.moveTo(startX, h);
        crashCtx.lineTo(startX, startY);
        crashCtx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
        crashCtx.lineTo(endX, h);
        crashCtx.closePath();
        crashCtx.fillStyle = fillGrad;
        crashCtx.fill();

        crashCtx.beginPath();
        crashCtx.moveTo(startX, startY);
        crashCtx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
        crashCtx.strokeStyle = stateStr === 'CRASHED' ? '#ef4444' : '#f59e0b'; 
        crashCtx.lineWidth = 4;
        crashCtx.lineCap = 'round';
        crashCtx.shadowColor = stateStr === 'CRASHED' ? '#ef4444' : '#f59e0b';
        crashCtx.shadowBlur = 10;
        crashCtx.stroke();
        crashCtx.shadowBlur = 0; 

        let prevProgress = Math.max(0, progress - 0.05);
        let prevX = startX + (w * 0.8 - startX) * prevProgress;
        let prevY = h - 50 - (h - 100) * prevProgress;
        let angleRad = Math.atan2(endY - prevY, endX - prevX);
        let angleDeg = angleRad * (180 / Math.PI);

        if (stateStr === 'FLYING') {
            if (rocket) {
                rocket.style.display = 'block';
                rocket.style.left = `${endX}px`;
                rocket.style.top = `${endY}px`;
                rocket.style.transform = `translate(-50%, -50%) rotate(${angleDeg + 25}deg)`;
            }
        } else if (stateStr === 'CRASHED') {
            if (rocket) rocket.style.display = 'none';
        }
    }

    crashAnimFrame = requestAnimationFrame(renderCrashLoop);
}

// === КНОПКА ДЕЙСТВИЯ ===
async function handleCrashMainAction() {
    if (currentCrashState === 'WAITING' && !didIbet) {
        openCrashBetModal();
    } else if (currentCrashState === 'FLYING' && didIbet && !didIcashout) {
        showLoader();
        const res = await apiRequest('/crash/cashout', 'POST', { user_id: state.user.telegram_id });
        hideLoader();
        
        if (res.success) {
            didIcashout = true;
            state.user.balance = res.balance;
            updateUserDisplay();
            const balEl = document.getElementById('crashBalanceDisplay');
            if (balEl) balEl.textContent = state.user.balance;
            
            showToast(`Вы забрали ${res.win_amount} ⭐ (x${res.multiplier})`);
            if (window.playSuccessAnimation) window.playSuccessAnimation();
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        } else {
            showToast('❌ ' + (res.error || 'Ошибка вывода'));
        }
    }
}

// === ЛОГИКА САМОЙ СТАВКИ В МОДАЛКЕ ===
async function submitCrashBet() {
    closeCrashBetModal();
    
    const bet = parseInt(document.getElementById('crashBet').value);
    if (isNaN(bet) || bet <= 0) return showToast('❌ Введите корректную ставку');
    if (bet > state.user.balance) return showToast('❌ Недостаточно звезд');

    let autoCashoutVal = null;
    if (document.getElementById('crashAutoToggle').checked) {
        autoCashoutVal = parseFloat(document.getElementById('crashAutoVal').value);
    }

    showLoader();
    const res = await apiRequest('/crash/bet', 'POST', {
        user_id: state.user.telegram_id,
        bet: bet,
        auto_cashout: autoCashoutVal
    });
    hideLoader();

    if (res.success) {
        state.user.balance = res.balance;
        updateUserDisplay();
        const balEl = document.getElementById('crashBalanceDisplay');
        if (balEl) balEl.textContent = state.user.balance;
        
        didIbet = true;
        didIcashout = false;
        myCrashBetAmount = bet;
        
        showToast('✅ Ставка принята!');
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } else {
        showToast('❌ ' + (res.error || 'Ошибка ставки'));
    }
}

// UI Логика Модалки
function openCrashBetModal() { document.getElementById('crashBetModal').classList.add('active'); }
function closeCrashBetModal() { document.getElementById('crashBetModal').classList.remove('active'); }
function modifyCrashBet(action, val) {
    const input = document.getElementById('crashBet');
    let current = parseInt(input.value) || 0;
    if (action === 'set') current = val;
    input.value = current;
    if (tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
}
function toggleCrashAuto() {
    const checked = document.getElementById('crashAutoToggle').checked;
    const controls = document.getElementById('crashAutoControls');
    if (checked) { controls.style.opacity = '1'; controls.style.pointerEvents = 'auto'; } 
    else { controls.style.opacity = '0.5'; controls.style.pointerEvents = 'none'; }
    if (tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
}
function modifyCrashAuto(val) {
    const input = document.getElementById('crashAutoVal');
    let current = parseFloat(input.value) || 2.0;
    current += val;
    if (current < 1.01) current = 1.01;
    input.value = current.toFixed(2);
    if (tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
}
function validateCrashBet() {
    const input = document.getElementById('crashBet');
    if (input.value < 0) input.value = 0;
}




// dice
// === ЛОГИКА DICE ===
let isDiceRolling = false;

function showDiceScreen() {
    switchScreen('dice-screen');
    document.getElementById('diceBalanceDisplay').textContent = state.user.balance || 0;
    updateDiceUI();
}

function modifyDiceBet(action, val) {
    if (isDiceRolling) return;
    const input = document.getElementById('diceBet');
    let current = parseInt(input.value) || 0;
    
    if (action === 'add') current += val;
    if (action === 'mult') current = Math.floor(current * val);
    if (action === 'clear') current = 1;
    
    if (current < 1) current = 1;
    input.value = current;
    updateDiceUI();
    if (tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
}

function setDiceChance(val) {
    if (isDiceRolling) return;
    document.getElementById('diceChance').value = val;
    updateDiceUI();
    if (tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
}

function updateDiceUI() {
    let bet = parseInt(document.getElementById('diceBet').value) || 1;
    let chanceInput = document.getElementById('diceChance');
    let chance = parseInt(chanceInput.value) || 80;

    if (chance < 1) chance = 1;
    if (chance > 95) chance = 95;

    // ВНЕДРИЛИ МАРЖУ 1% ДЛЯ ОТОБРАЖЕНИЯ
    const multiplier = 99 / chance;
    const possibleWin = Math.floor(bet * multiplier);

    document.getElementById('diceMultiplier').textContent = multiplier.toFixed(2) + 'x';
    document.getElementById('dicePossibleWin').textContent = possibleWin;

    // Математика шансов
    const underMax = (chance * 10000) - 1;
    const overMin = 1000000 - (chance * 10000);

    document.getElementById('diceRangeMin').textContent = underMax;
    document.getElementById('diceRangeMax').textContent = overMin;
}

async function playDice(type) {
    if (isDiceRolling) return;
    
    let bet = parseInt(document.getElementById('diceBet').value);
    let chance = parseInt(document.getElementById('diceChance').value);

    if (isNaN(bet) || bet < 1) return showToast('❌ Неверная ставка');
    if (isNaN(chance) || chance < 1 || chance > 95) {
        document.getElementById('diceChance').value = 95;
        updateDiceUI();
        return showToast('❌ Шанс от 1% до 95%');
    }
    if (bet > state.user.balance) return showToast('❌ Недостаточно звезд');

    isDiceRolling = true;
    
    // Сбрасываем стили результата и запускаем "барабан"
    const resNumber = document.getElementById('diceResultNumber');
    const resLabel = document.getElementById('diceResultLabel');
    resNumber.className = 'dice-result-number';
    resLabel.className = 'dice-result-label'; // Сбрасываем увеличенный шрифт перед новым броском
    resLabel.textContent = 'Бросаем кости...';
    resLabel.style.color = 'var(--txt3)';

    let rollInterval = setInterval(() => {
        resNumber.textContent = String(Math.floor(Math.random() * 999999)).padStart(6, '0');
    }, 40);

    const res = await apiRequest('/dice/play', 'POST', { user_id: state.user.telegram_id, bet, chance, type });

    clearInterval(rollInterval);
    isDiceRolling = false;

    if (res.success) {
        resNumber.textContent = String(res.result).padStart(6, '0');
        state.user.balance = res.balance;
        updateUserDisplay();
        document.getElementById('diceBalanceDisplay').textContent = state.user.balance;

        // Включаем класс для большого текста
        resLabel.classList.add('big-result');

        if (res.is_win) {
            resNumber.classList.add('win');
            // Вместо эмодзи теперь HTML с картинкой звезды
            resLabel.innerHTML = `ВЫИГРЫШ +${res.win_amount} <img src="/static/images/star.png" style="width:20px;height:20px;vertical-align:middle;position:relative;top:-2px;">`;
            resLabel.style.color = 'var(--green)';
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        } else {
            resNumber.classList.add('lose');
            resLabel.innerHTML = `ПРОИГРЫШ -${bet} <img src="/static/images/star.png" style="width:20px;height:20px;vertical-align:middle;position:relative;top:-2px;">`;
            resLabel.style.color = '#ef4444';
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
        }
    } else {
        resNumber.textContent = '000000';
        resLabel.className = 'dice-result-label';
        resLabel.textContent = 'Сделайте ставку';
        showToast(res.error);
    }
}
// dice close
// === ЛОГИКА ПЛИНКО ===
const PLINKO_COEFS = {
    'low': {
        8: [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
        9: [5.6, 2.0, 1.6, 1.0, 0.7, 0.7, 1.0, 1.6, 2.0, 5.6],
        10: [8.9, 3.0, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 3.0, 8.9],
        11: [8.4, 3.0, 1.9, 1.3, 1.0, 0.7, 0.7, 1.0, 1.3, 1.9, 3.0, 8.4],
        12: [10.0, 3.0, 1.6, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 1.6, 3.0, 10.0],
        13: [8.1, 4.0, 3.0, 1.9, 1.2, 0.9, 0.7, 0.7, 0.9, 1.2, 1.9, 3.0, 4.0, 8.1],
        14: [7.1, 4.0, 1.9, 1.4, 1.3, 1.1, 1.0, 0.5, 1.0, 1.1, 1.3, 1.4, 1.9, 4.0, 7.1],
        15: [15.0, 8.0, 3.0, 2.0, 1.5, 1.1, 1.0, 0.7, 0.7, 1.0, 1.1, 1.5, 2.0, 3.0, 8.0, 15.0],
        16: [16.0, 9.0, 2.0, 1.4, 1.4, 1.2, 1.1, 1.0, 0.5, 1.0, 1.1, 1.2, 1.4, 1.4, 2.0, 9.0, 16.0]
    },
    'medium': {
        8: [13.0, 3.0, 1.3, 0.7, 0.4, 0.7, 1.3, 3.0, 13.0],
        9: [18.0, 4.0, 1.7, 0.9, 0.5, 0.5, 0.9, 1.7, 4.0, 18.0],
        10: [22.0, 5.0, 2.0, 1.4, 0.6, 0.4, 0.6, 1.4, 2.0, 5.0, 22.0],
        11: [24.0, 6.0, 3.0, 1.8, 0.7, 0.5, 0.5, 0.7, 1.8, 3.0, 6.0, 24.0],
        12: [33.0, 11.0, 4.0, 2.0, 1.1, 0.6, 0.3, 0.6, 1.1, 2.0, 4.0, 11.0, 33.0],
        13: [43.0, 13.0, 6.0, 3.0, 1.3, 0.7, 0.4, 0.4, 0.7, 1.3, 3.0, 6.0, 13.0, 43.0],
        14: [58.0, 15.0, 7.0, 4.0, 1.9, 1.0, 0.5, 0.2, 0.5, 1.0, 1.9, 4.0, 7.0, 15.0, 58.0],
        15: [88.0, 18.0, 11.0, 5.0, 3.0, 1.3, 0.5, 0.3, 0.3, 0.5, 1.3, 3.0, 5.0, 11.0, 18.0, 88.0],
        16: [110.0, 41.0, 10.0, 5.0, 3.0, 1.5, 1.0, 0.5, 0.3, 0.5, 1.0, 1.5, 3.0, 5.0, 10.0, 41.0, 110.0]
    },
    'high': {
        8: [29.0, 4.0, 1.5, 0.3, 0.2, 0.3, 1.5, 4.0, 29.0],
        9: [43.0, 7.0, 2.0, 0.6, 0.2, 0.2, 0.6, 2.0, 7.0, 43.0],
        10: [76.0, 10.0, 3.0, 0.9, 0.3, 0.2, 0.3, 0.9, 3.0, 10.0, 76.0],
        11: [120.0, 14.0, 5.2, 1.4, 0.4, 0.2, 0.2, 0.4, 1.4, 5.2, 14.0, 120.0],
        12: [170.0, 24.0, 8.1, 2.0, 0.7, 0.2, 0.2, 0.2, 0.7, 2.0, 8.1, 24.0, 170.0],
        13: [260.0, 37.0, 11.0, 4.0, 1.0, 0.2, 0.2, 0.2, 0.2, 1.0, 4.0, 11.0, 37.0, 260.0],
        14: [420.0, 56.0, 18.0, 5.0, 1.9, 0.3, 0.2, 0.2, 0.2, 0.3, 1.9, 5.0, 18.0, 56.0, 420.0],
        15: [620.0, 83.0, 27.0, 8.0, 3.0, 0.5, 0.2, 0.2, 0.2, 0.2, 0.5, 3.0, 8.0, 27.0, 83.0, 620.0],
        16: [1000.0, 130.0, 26.0, 9.0, 4.0, 2.0, 0.2, 0.2, 0.2, 0.2, 0.2, 2.0, 4.0, 9.0, 26.0, 130.0, 1000.0]
    }
};

let plinkoDiff = 'low';
let plinkoPinsCount = 8;
let activePlinkoBalls = 0; // Считаем, сколько шариков сейчас летит

// Функция для блокировки/разблокировки настроек
function togglePlinkoControls(enable) {
    const opacity = enable ? '1' : '0.5';
    const pointerEvents = enable ? 'auto' : 'none';
    
    // Находим все группы контролов на экране Плинко (ставка, сложность, ряды)
    const controls = document.querySelectorAll('#plinko-screen .control-group');
    controls.forEach(c => {
        c.style.transition = 'all 0.3s ease';
        c.style.opacity = opacity;
        c.style.pointerEvents = pointerEvents;
    });
}

function showPlinkoScreen() {
    switchScreen('plinko-screen');
    document.getElementById('plinkoBalanceDisplay').textContent = state.user.balance || 0;
    setTimeout(() => { renderPlinkoBoard(); }, 50);
}

function modifyPlinkoBet(action, val) {
    if (activePlinkoBalls > 0) return; // Защита от изменения во время полета
    const input = document.getElementById('plinkoBet');
    let current = parseInt(input.value) || 0;
    if (action === 'add') current += val;
    if (action === 'mult') current = Math.floor(current * val);
    if (action === 'clear') current = 1;
    if (current < 1) current = 1;
    input.value = current;
    if (tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
}

function setPlinkoDiff(diff) {
    if (activePlinkoBalls > 0) return; // Защита
    plinkoDiff = diff;
    document.querySelectorAll('.diff-buttons button').forEach(b => b.classList.remove('active'));
    document.getElementById(`p-diff-${diff}`).classList.add('active');
    renderPlinkoBoard();
    if (tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
}

function setPlinkoPins(pins) {
    if (activePlinkoBalls > 0) return; // Защита
    plinkoPinsCount = pins;
    document.querySelectorAll('.pins-buttons button').forEach(b => b.classList.remove('active'));
    document.getElementById(`p-pins-${pins}`).classList.add('active');
    renderPlinkoBoard();
    if (tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
}

window.addEventListener('resize', () => {
    const screen = document.getElementById('plinko-screen');
    const pinsContainer = document.getElementById('plinkoPins');
    if (screen && screen.classList.contains('active') && pinsContainer && pinsContainer.clientWidth > 0) {
        renderPlinkoBoard();
    }
});
window.plinkoPhysicsPins = [];


async function playPlinko() {
    const bet = parseInt(document.getElementById('plinkoBet').value);
    if (isNaN(bet) || bet < 1) return showToast('❌ Введите ставку');
    if (bet > state.user.balance) return showToast('❌ Недостаточно звезд');

    state.user.balance -= bet;
    updateUserDisplay();
    document.getElementById('plinkoBalanceDisplay').textContent = state.user.balance;

    // Если это ПЕРВЫЙ запущенный шарик, блокируем настройки
    if (activePlinkoBalls === 0) {
        togglePlinkoControls(false);
    }
    activePlinkoBalls++; // Увеличиваем счетчик шариков на поле

    const res = await apiRequest('/plinko/play', 'POST', {
        user_id: state.user.telegram_id,
        bet: bet,
        difficulty: plinkoDiff,
        pins: plinkoPinsCount
    });

    if (res.success) {
        spawnPlinkoBall(res.path, res.bucket, res.multiplier, res.balance);
    } else {
        showToast(res.error);
        state.user.balance += bet;
        updateUserDisplay();
        document.getElementById('plinkoBalanceDisplay').textContent = state.user.balance;
        
        // Если произошла ошибка запроса, откатываем счетчик
        activePlinkoBalls--;
        if (activePlinkoBalls <= 0) {
            activePlinkoBalls = 0;
            togglePlinkoControls(true);
        }
    }
}


function renderPlinkoBoard() {
    const pinsContainer = document.getElementById('plinkoPins');
    const bucketsContainer = document.getElementById('plinkoBuckets');
    if (!pinsContainer || !bucketsContainer || pinsContainer.clientWidth === 0) return;

    pinsContainer.innerHTML = '';
    bucketsContainer.innerHTML = '';
    window.plinkoPhysicsPins = [];

    const width = pinsContainer.clientWidth;
    const height = pinsContainer.clientHeight;
    const rows = plinkoPinsCount;

    const pinSpacingX = width / (rows + 2); 
    const pinSpacingY = height / (rows + 0.8); 

    // Пины сужаются на больших рядах, чтобы шарик (12px) свободно пролетал между ними
    let pinRadius = 3;
    if (rows === 8) pinRadius = 5;
    else if (rows === 10) pinRadius = 4.5;
    else if (rows === 12) pinRadius = 3.5;
    else if (rows === 14) pinRadius = 2.5;
    else if (rows === 16) pinRadius = 2;

    for (let i = 0; i < rows; i++) {
        const numPins = i + 3;
        const startX = width / 2 - ((numPins - 1) * pinSpacingX) / 2;
        const y = (i + 1) * pinSpacingY;

        for (let j = 0; j < numPins; j++) {
            const x = startX + j * pinSpacingX;
            const pin = document.createElement('div');
            pin.className = 'plinko-pin';
            
            pin.style.width = `${pinRadius * 2}px`;
            pin.style.height = `${pinRadius * 2}px`;
            pin.style.left = `${x}px`;
            pin.style.top = `${y}px`;
            pinsContainer.appendChild(pin);
            
            window.plinkoPhysicsPins.push({ x: x, y: y, radius: pinRadius });
        }
    }

    const bucketsWidth = (rows + 1) * pinSpacingX;
    bucketsContainer.style.width = `${bucketsWidth}px`;

    const coefs = PLINKO_COEFS[plinkoDiff][plinkoPinsCount];
    coefs.forEach(c => {
        const b = document.createElement('div');
        let colorClass = 'pb-c-0'; 
        if (c < 1) colorClass = 'pb-c-0'; 
        else if (c >= 1 && c < 2) colorClass = 'pb-c-1'; 
        else if (c >= 2 && c <= 5) colorClass = 'pb-c-2'; 
        else if (c > 5) colorClass = 'pb-c-3'; 
        
        b.className = `plinko-bucket ${colorClass}`;
        b.textContent = c; 
        bucketsContainer.appendChild(b);
    });
}

function spawnPlinkoBall(path, finalBucketIndex, multiplier, finalBalance) {
    const pinsContainer = document.getElementById('plinkoPins');
    const bucketsContainer = document.getElementById('plinkoBuckets');
    if (!pinsContainer || !bucketsContainer) return;

    const width = pinsContainer.clientWidth;
    const height = pinsContainer.clientHeight;
    const rows = plinkoPinsCount;
    
    const pinSpacingX = width / (rows + 2);
    const pinSpacingY = height / (rows + 0.8);
    const ballRadius = 5; 

    const ballEl = document.createElement('div');
    ballEl.className = 'plinko-ball';
    ballEl.style.opacity = '1';
    ballEl.style.width = `${ballRadius * 2}px`;
    ballEl.style.height = `${ballRadius * 2}px`;
    pinsContainer.appendChild(ballEl);

    // ====================================================================
    // ФИКС: ГЕНЕРАТОР "БАЙТОВ" (Азартные обманки)
    // Пересобираем путь сервера визуально, не меняя итоговой лунки!
    let customPath = [];
    let rights = finalBucketIndex;            // Сколько шагов нужно сделать вправо
    let lefts = rows - finalBucketIndex;      // Сколько шагов влево

    // Если падает мусор (множитель меньше 2), с шансом 35% пугаем игрока!
    if (multiplier < 2 && Math.random() < 0.15) {
        let baitLeft = Math.random() < 0.5; // Байтим влево или вправо?
        
        // Байтим влево (если хватает шагов)
        if (baitLeft && lefts > Math.floor(rows * 0.55)) {
            let baitCount = lefts - 1; // Оставляем 1 левый шаг на финал
            for(let i=0; i<baitCount; i++) customPath.push(0); // Жестко влево
            lefts -= baitCount;
        } 
        // Байтим вправо (если хватает шагов)
        else if (!baitLeft && rights > Math.floor(rows * 0.55)) {
            let baitCount = rights - 1;
            for(let i=0; i<baitCount; i++) customPath.push(1); // Жестко вправо
            rights -= baitCount;
        }
    }

    // Добиваем оставшиеся шаги хаотично
    let remaining = [];
    for(let i=0; i<lefts; i++) remaining.push(0);
    for(let i=0; i<rights; i++) remaining.push(1);
    remaining.sort(() => Math.random() - 0.5); // Перемешиваем остаток
    
    // Подменяем путь сервера на наш новый, кинематографичный маршрут
    path = customPath.concat(remaining);
    // ====================================================================

    let points = [];
    let currentX = width / 2;
    let currentY = pinSpacingY; 
    
    const yHitOffset = 6; 
    
    points.push({ x: currentX, y: -20 });
    points.push({ x: currentX, y: currentY - yHitOffset });

    // Дальше идет старый код анимации...
    for (let i = 0; i < path.length; i++) {
        let dir = path[i];
        currentX += (dir === 0) ? -(pinSpacingX / 2) : (pinSpacingX / 2);
        currentY += pinSpacingY;
        
        if (i === path.length - 1) {
            points.push({ x: currentX, y: height - ballRadius + 2 }); 
        } else {
            let noiseX = (Math.random() - 0.5) * 4;
            points.push({ x: currentX + noiseX, y: currentY - yHitOffset });
        }
    }

    let currentSegment = 0;   
    let segmentProgress = 0;  
    let lastTime = performance.now();
    let isDone = false;
    const baseDuration = 350 - (rows * 8); 

    function animate(time) {
        if (isDone) return;
        
        let dt = time - lastTime;
        lastTime = time;
        
        let segmentDuration = baseDuration;
        if (currentSegment > 0 && currentSegment < points.length - 2) {
            segmentDuration += (Math.random() * 30 - 15); 
        }

        segmentProgress += dt / segmentDuration;

        if (segmentProgress >= 1) {
            segmentProgress = 0;
            currentSegment++;
            if (currentSegment > 0 && currentSegment < points.length - 1) {
                if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
            }
        }

        if (currentSegment >= points.length - 1) {
            isDone = true;
            finishDrop();
            return;
        }

        let p1 = points[currentSegment];
        let p2 = points[currentSegment + 1];
        let t = segmentProgress;
        let x = p1.x + (p2.x - p1.x) * t; 
        let y = p1.y + (p2.y - p1.y) * t;

        if (currentSegment === 0) {
            let easeIn = t * t; 
            y = p1.y + (p2.y - p1.y) * easeIn;
        } 
        else if (currentSegment < points.length - 2) {
            let bounceHeight = pinSpacingY * (0.70 + Math.random() * 0.15); 
            let bounceOffset = Math.sin(t * Math.PI) * bounceHeight; 
            y -= bounceOffset; 
        } 
        else {
            let easeIn = t * t;
            y = p1.y + (p2.y - p1.y) * easeIn;
        }

        ballEl.style.left = `${x - ballRadius}px`;
        ballEl.style.top = `${y - ballRadius}px`;

        requestAnimationFrame(animate);
    }

    function finishDrop() {
        const buckets = bucketsContainer.children;
        if(buckets[finalBucketIndex]) {
            buckets[finalBucketIndex].classList.add('active');
            if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
            setTimeout(() => buckets[finalBucketIndex].classList.remove('active'), 200);
        }

        ballEl.style.display = 'none';
        ballEl.remove();

        state.user.balance = finalBalance;
        updateUserDisplay();
        document.getElementById('plinkoBalanceDisplay').textContent = state.user.balance;



        activePlinkoBalls--;
        if (activePlinkoBalls <= 0) {
            activePlinkoBalls = 0;
            togglePlinkoControls(true);
        }
    }

    requestAnimationFrame(animate);
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
async function activateBalancePromo() {
    const input = document.getElementById('profilePromoInput');
    const code = input.value.trim();
    if (!code) return showToast('❌ Введите код');
    
    showLoader();
    const res = await apiRequest('/promo/activate', 'POST', { user_id: state.user.telegram_id, code: code });
    hideLoader();
    
    if (res.success) {
        input.value = '';
        state.user.balance = res.balance;
        updateUserDisplay();
        document.getElementById('profileBalance').textContent = res.balance;
        showToast(`🎉 ${res.message}`);
        if (window.playSuccessAnimation) window.playSuccessAnimation();
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } else {
        showToast('❌ ' + res.error);
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
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
        showToast(`Успешно выведено ${res.withdrawn} <img src="/static/images/star.png" style="width:17px;height:17px;vertical-align:middle;position:relative;top:-1px;"> на баланс!`);
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