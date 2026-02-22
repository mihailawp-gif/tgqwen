// Telegram Web App API
let tg = window.Telegram.WebApp;
tg.expand();

// Global state
const state = {
    freeTimerInterval: null,
    freeSyncInterval: null,
    freeRemainingSeconds: 0,
    freeCaseAvailable: true,
    user: null,
    cases: [],
    inventory: [],
    history: [],
    currentCase: null,
    currentOpening: null
};

// API Base URL
const API_URL = '/api';

// === INITIALIZATION ===

document.addEventListener('DOMContentLoaded', async () => {
    console.log('App initialized');

    // Инициализация пользователя
    await initUser();

    // Загрузка данных
    await loadCases();
    await loadInventory();
    await loadHistory();
    await syncFreeTimer();   // берём время с сервера
    startFreeSyncLoop();     // resync каждые 30с

    // Запуск обновления истории в реальном времени
    startHistoryPolling();
    
    // Инициализация видимости истории (показываем только на табе кейсов)
    const liveHistorySection = document.querySelector('.live-history-section');
    if (liveHistorySection) {
        liveHistorySection.style.display = 'block';  // По умолчанию таб кейсов активный
    }
});

// === USER FUNCTIONS ===

async function initUser() {
    const initData = tg.initDataUnsafe;
    
    // Получаем реферальный код из start_param (если пользователь пришёл по реф. ссылке)
    const referrerCode = initData?.start_param || null;

    // Проверяем есть ли данные от Telegram
    if (initData.user) {
        try {
            const response = await apiRequest('/user/init', 'POST', {
                telegram_id: initData.user.id,
                username: initData.user.username,
                first_name: initData.user.first_name,
                last_name: initData.user.last_name,
                photo_url: initData.user.photo_url,
                referrer_code: referrerCode
            });

            if (response.success) {
                state.user = response.user;
                // Сохраняем URL фото из Telegram
                if (initData.user.photo_url) {
                    state.user.photo_url = initData.user.photo_url;
                }
                updateUserDisplay();
                return;
            }
        } catch (error) {
            console.error('Failed to init user from Telegram:', error);
        }
    }

    // Для локальной работы - создаем тестового пользователя
    console.log('Running in local mode - creating test user');

    try {
        const testUserId = 999999999; // Тестовый ID

        // Пытаемся создать/получить тестового пользователя
        const response = await apiRequest('/user/init', 'POST', {
            telegram_id: testUserId,
            username: 'test_user',
            first_name: 'Test User',
            last_name: '',
            photo_url: null,
            referrer_code: null
        });

        if (response.success) {
            state.user = response.user;
            console.log('Test user created/loaded:', state.user);
        } else {
            // Если API не работает, создаем локального пользователя
            state.user = {
                telegram_id: testUserId,
                first_name: 'Test User',
                balance: 0,
                username: 'test_user',
                photo_url: null
            };
            console.log('Using offline test user:', state.user);
        }
    } catch (error) {
        // Если API совсем не работает
        console.error('API not available, using offline mode');
        state.user = {
            telegram_id: 999999999,
            first_name: 'Test User',
            balance: 0,
            username: 'test_user',
            photo_url: null
        };
    }

    updateUserDisplay();
}

function updateUserDisplay() {
    const userName = document.getElementById('userName');
    const userBalance = document.getElementById('userBalance');
    const userAvatar = document.getElementById('userAvatar');

    if (state.user) {
        userName.textContent = state.user.first_name || 'Пользователь';
        userBalance.textContent = state.user.balance || 0;
        
        // Отображение аватарки из Telegram
        if (userAvatar) {
            const photoUrl = state.user.photo_url || (tg.initDataUnsafe?.user?.photo_url);
            if (photoUrl) {
                userAvatar.innerHTML = `<img src="${photoUrl}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
            } else {
                userAvatar.textContent = '👤';
            }
        }
    }
}

// === CASES FUNCTIONS ===

async function loadCases() {
    showLoader();
    
    const response = await apiRequest('/cases/list', 'GET');
    
    if (response.success) {
        state.cases = response.cases;
        renderCases();
    }
    
    hideLoader();
}


// ─────────────────────────────────────────
// FREE CASE TIMER  — только серверное время
// ─────────────────────────────────────────

async function syncFreeTimer() {
    if (!state.user?.telegram_id) return;
    try {
        const res = await apiRequest(`/user/${state.user.telegram_id}/free-case-check`, 'GET');
        const available = res.available !== false;
        const remaining = available ? 0 : Math.ceil(res.remaining_seconds || 0);

        state.freeCaseAvailable = available;
        state.freeRemainingSeconds = remaining;
        updateFreeCaseUI();

        if (!available && remaining > 0) {
            _ensureTickerRunning();
        } else {
            _stopTicker();
        }
    } catch(e) { /* сеть упала — не трогаем UI */ }
}

function _ensureTickerRunning() {
    if (state.freeTimerInterval) return; // уже тикает
    state.freeTimerInterval = setInterval(() => {
        if (state.freeRemainingSeconds > 0) {
            state.freeRemainingSeconds--;
            updateFreeCaseUI();
        }
        if (state.freeRemainingSeconds <= 0) {
            _stopTicker();
            state.freeCaseAvailable = true;
            updateFreeCaseUI();
        }
    }, 1000);
}

function _stopTicker() {
    if (state.freeTimerInterval) {
        clearInterval(state.freeTimerInterval);
        state.freeTimerInterval = null;
    }
}

function startFreeSyncLoop() {
    // Синхронизируемся с сервером каждые 30 секунд —
    // защита от смены времени на устройстве
    if (state.freeSyncInterval) clearInterval(state.freeSyncInterval);
    state.freeSyncInterval = setInterval(syncFreeTimer, 30_000);
}

function formatTimer(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function updateFreeCaseUI() {
    const available = state.freeCaseAvailable;
    const t = formatTimer(state.freeRemainingSeconds);

    // Карточки на главном экране
    state.cases.filter(c => c.is_free).forEach(c => {
        const el = document.getElementById(`card-price-${c.id}`);
        if (!el) return;
        if (available) {
            el.className = 'case-price free';
            el.textContent = 'Открыть бесплатно';
        } else {
            el.className = 'case-price timer';
            el.textContent = t;
        }
    });

    // Кнопка в экране предпросмотра (если открыт бесплатный кейс)
    if (state.currentCase?.is_free) {
        const btn = document.getElementById('btnOpenCase');
        if (!btn) return;
        if (available) {
            btn.disabled = false;
            btn.classList.add('free');
            btn.classList.remove('timer-btn');
            btn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
                Открыть бесплатно`;
        } else {
            btn.disabled = true;
            btn.classList.remove('free');
            btn.classList.add('timer-btn');
            btn.innerHTML = `<span style="font-size:15px;letter-spacing:2px">${t}</span>`;
        }
    }
}

function renderCases() {
    const grid = document.getElementById('casesGrid');
    grid.innerHTML = '';
    
    if (state.cases.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1">
                <div class="empty-state-icon">📦</div>
                <div class="empty-state-text">Пока нет доступных кейсов</div>
            </div>
        `;
        return;
    }
    
    state.cases.forEach(caseItem => {
        const card = document.createElement('div');
        card.className = 'case-card';
        card.onclick = () => showCasePreview(caseItem.id);

        const cleanName = (caseItem.name || '').replace(/[^\w\s\u0400-\u04FF]/gu, '').trim();
        const imageContent = `<img class="case-image" src="${caseItem.image_url || '/static/images/free-stars-case.png'}" alt="${cleanName}">`;

        let priceHtml;
        if (caseItem.is_free) {
            priceHtml = `<div class="case-price free" id="card-price-${caseItem.id}">Открыть бесплатно</div>`;
        } else {
            priceHtml = `<div class="case-price"><img src="/static/images/star.png" class="price-star-icon" onerror="this.outerHTML='⭐'" alt="star"> ${caseItem.price}</div>`;
        }

        card.innerHTML = `
            <div class="case-card-inner">
                <div class="case-image-wrapper">${imageContent}</div>
                <div class="case-info">
                    <div class="case-name">${cleanName}</div>
                    ${priceHtml}
                </div>
            </div>
        `;
        grid.appendChild(card);

        // Сразу применяем текущее состояние таймера к новой карточке
        if (caseItem.is_free) updateFreeCaseUI();
    });
}


// Хранилище для превью-рулетки
let _previewRouletteItems = [];

async function showCasePreview(caseId) {
    const caseItem = state.cases.find(c => c.id === caseId);
    if (!caseItem) return;
    
    state.currentCase = caseItem;
    
    const response = await apiRequest(`/cases/${caseId}/items`, 'GET');
    if (!response.success) return;

    destroyAllTGS();
    stopPreviewRoulette();

    document.getElementById('openingCaseName').textContent = caseItem.name;
    document.getElementById('openingCaseDescription').textContent = caseItem.description || '';

    // Цена
    const priceDisplay = document.getElementById('openingCasePrice');
    const btnOpenCase  = document.getElementById('btnOpenCase');
    // Название без эмодзи
    document.getElementById('openingCaseName').textContent =
        (caseItem.name || '').replace(/[^\w\s\u0400-\u04FF]/gu, '').trim();

    if (caseItem.is_free) {
        priceDisplay.innerHTML = '';
        // Состояние кнопки возьмёт updateFreeCaseUI()
        updateFreeCaseUI();
    } else {
        priceDisplay.innerHTML = `
            <img src="/static/images/star.png" class="price-icon" onerror="this.outerHTML='⭐'" alt="star">
            <span class="price-amount">${caseItem.price}</span>
        `;
        btnOpenCase.disabled = false;
        btnOpenCase.classList.remove('free', 'timer-btn');
        btnOpenCase.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
            Открыть кейс`;
    }

    // === МЕДЛЕННАЯ РУЛЕТКА В ПРЕВЬЮ ===
    _previewRouletteItems = response.items;
    buildPreviewRoulette(caseId, response.items);

    // === ПЛИТКА предметов (2 колонки) с TGS ===
    const itemsPreview = document.getElementById('caseItemsPreview');
    itemsPreview.innerHTML = '';

    response.items.forEach((item, index) => {
        const tgsNum = item.gift.gift_number || ((item.gift.id - 1) % 120) + 1;
        const tgsId  = `prev_${caseId}_${index}`;
        const tile   = document.createElement('div');
        tile.className = `preview-tile rarity-${item.gift.rarity || 'common'}`;
        tile.innerHTML = `
            <div class="preview-tile-tgs">${tgsEl(tgsId, tgsNum, '80px')}</div>
            <div class="preview-tile-name">${item.gift.name}</div>
            <div class="preview-tile-footer">
                <span class="preview-tile-chance">${item.drop_chance.toFixed(1)}%</span>
            </div>
        `;
        itemsPreview.appendChild(tile);
    });

    switchScreen('opening-screen');

    // Запускаем TGS после рендера DOM
    setTimeout(() => {
        initAllTGS();
        startPreviewRoulette();
    }, 150);
}

function buildPreviewRoulette(caseId, items) {
    const track = document.getElementById('previewRouletteTrack');
    if (!track) return;
    track.innerHTML = '';
    track.style.transition = 'none';
    track.style.transform = 'translateX(0)';

    // Заполняем 40 элементов (дублируем предметы для бесшовной прокрутки)
    const totalItems = 40;
    for (let i = 0; i < totalItems; i++) {
        const item = items[i % items.length];
        const tgsNum = item.gift.gift_number || ((item.gift.id - 1) % 120) + 1;
        const tgsId  = `prv_rou_${i}`;

        const el = document.createElement('div');
        el.className = `preview-roulette-item rarity-${item.gift.rarity || 'common'}`;
        el.innerHTML = `
            ${tgsEl(tgsId, tgsNum, '108px')}
        `;
        track.appendChild(el);
    }
}

function startPreviewRoulette() {
    const track = document.getElementById('previewRouletteTrack');
    if (!track) return;

    stopPreviewRoulette();

    const itemW = 126; // ширина элемента + gap (120px + 6px)
    const totalItems = track.children.length;
    const loopWidth = (totalItems / 2) * itemW; // ширина половины ленты для сброса
    let currentX = 0;
    const speed = 0.35; // очень медленно

    function loop() {
        currentX -= speed;
        // Бесшовный сброс: когда прокрутили половину — возвращаем в 0
        if (Math.abs(currentX) >= loopWidth) {
            currentX = 0;
        }
        track.style.transform = `translateX(${currentX}px)`;
        window._previewRAFId = requestAnimationFrame(loop);
    }

    window._previewRAFId = requestAnimationFrame(loop);
}

function stopPreviewRoulette() {
    if (window._previewRAFId) {
        cancelAnimationFrame(window._previewRAFId);
        window._previewRAFId = null;
    }
}

function closeOpeningScreen() {
    stopPreviewRoulette();
    switchScreen('main-screen');
}

async function confirmOpenCase() {
    if (!state.currentCase) return;
    
    // Проверка баланса
    if (!state.currentCase.is_free && state.user.balance < state.currentCase.price) {
        showToast('❌ Недостаточно звезд!');
        setTimeout(() => {
            showTopupScreen();
        }, 1500);
        return;
    }
    
    // Проверка бесплатного кейса
    if (state.currentCase.is_free) {
        const canOpen = await checkFreeCaseAvailable();
        if (!canOpen) {
            showToast('⏰ Бесплатный кейс доступен раз в 24 часа');
            return;
        }
    }
    
    // Модальное окно подтверждения
    const confirmText = state.currentCase.is_free
        ? `Открыть бесплатный кейс "${state.currentCase.name}"?`
        : `Открыть кейс "${state.currentCase.name}" за ${state.currentCase.price} <img src="/static/images/star.png" class="confirm-star-icon" alt="star">?`;

    showConfirmModal(confirmText);
}

async function executeOpenCase() {
    closeConfirmModal();
    showLoader();
    
    const response = await apiRequest('/cases/open', 'POST', {
        case_id: state.currentCase.id,
        user_id: state.user.telegram_id
    });
    
    hideLoader();
    
    if (response.success) {
        // Обновляем баланс
        state.user.balance = response.balance;
        updateUserDisplay();

        // Если открыли бесплатный кейс — синхронизируемся с сервером
        // (сервер записал last_free_case в БД, берём remaining оттуда)
        if (state.currentCase?.is_free) {
            syncFreeTimer();
        }

        // Сохраняем результат
        state.currentOpening = response;
        
        // Показываем анимацию
        await playOpeningAnimation(response);
    } else {
        showToast('❌ ' + (response.error || 'Ошибка открытия кейса'));
    }
}

async function playOpeningAnimation(result) {
    switchScreen('animation-screen');
    destroyAllTGS();

    const items = await apiRequest(`/cases/${state.currentCase.id}/items`, 'GET');
    if (!items.success) return;

    const track = document.getElementById('rouletteTrack');
    track.innerHTML = '';
    track.style.transition = 'none';
    track.style.transform  = 'translateX(0)';

    const itemsList  = items.items;
    const totalItems = 60;
    const wonIndex   = 48;

    const wonItemData = itemsList.find(it => it.gift.id === result.gift.id) || itemsList[0];

    for (let i = 0; i < totalItems; i++) {
        const itemData = (i === wonIndex)
            ? wonItemData
            : itemsList[Math.floor(Math.random() * itemsList.length)];

        const tgsNum = itemData.gift.gift_number || ((itemData.gift.id - 1) % 120) + 1;
        const tgsId  = `rou_${i}`;

        const itemEl = document.createElement('div');
        // НЕТ класса roulette-item-won — добавим его ПОСЛЕ остановки
        itemEl.className = 'roulette-item';
        itemEl.dataset.giftId = itemData.gift.id;
        itemEl.innerHTML = `
            ${tgsEl(tgsId, tgsNum, '90px')}
            <div class="roulette-item-bg"></div>
        `;
        track.appendChild(itemEl);
    }

    setTimeout(() => initAllTGS(), 100);

    // === ПАТТЕРНЫ АНИМАЦИИ (азарт) — 9 вариаций ===
    const patterns = [
        // 1. Точная — по центру
        { easing: 'cubic-bezier(0.15, 0, 0.25, 1)', extraOffset: 0,    duration: 5000 },
        // 2. Недолёт левый — чуть не хватило
        { easing: 'cubic-bezier(0.12, 0, 0.20, 1)', extraOffset: -55,  duration: 5500 },
        // 3. Перелёт правый — проскочило
        { easing: 'cubic-bezier(0.10, 0, 0.22, 1)', extraOffset: 52,   duration: 5200 },
        // 4. Долгий разгон — медленный старт
        { easing: 'cubic-bezier(0.05, 0, 0.18, 1)', extraOffset: 0,    duration: 6500 },
        // 5. Резкая остановка — быстро и чётко
        { easing: 'cubic-bezier(0.25, 0, 0.40, 1)', extraOffset: 0,    duration: 4000 },
        // 6. Малый недолёт — почти попало
        { easing: 'cubic-bezier(0.13, 0, 0.22, 1)', extraOffset: -28,  duration: 5800 },
        // 7. Большой перелёт — далеко улетело, долго тормозит
        { easing: 'cubic-bezier(0.08, 0, 0.16, 1)', extraOffset: 80,   duration: 6000 },
        // 8. Остановка в самом начале — сразу тормозит как добралось
        { easing: 'cubic-bezier(0.30, 0, 0.45, 1)', extraOffset: -8,   duration: 3800 },
        // 9. Плавный финиш — замедляется очень плавно
        { easing: 'cubic-bezier(0.10, 0.02, 0.20, 1)', extraOffset: 15, duration: 5600 },
    ];
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    const totalDuration = pattern.duration;

    setTimeout(() => {
        const container = document.querySelector('.roulette-track-container');
        const wonEl = track.children[wonIndex];
        if (!wonEl || !container) return;

        const containerRect = container.getBoundingClientRect();
        const wonRect       = wonEl.getBoundingClientRect();
        const currentWonCenter = wonRect.left - containerRect.left + wonRect.width / 2;
        const targetCenter     = containerRect.width / 2;
        const offset = -(currentWonCenter - targetCenter) + pattern.extraOffset;

        track.style.transition = `transform ${totalDuration}ms ${pattern.easing}`;
        track.style.transform  = `translateX(${offset}px)`;
    }, 300);

    // Добавляем золотую обводку ТОЛЬКО после полной остановки + небольшой делей
    setTimeout(() => {
        const wonEl = track.children[wonIndex];
        if (wonEl) wonEl.classList.add('roulette-item-won');
    }, totalDuration + 300 + 400); // +300 задержка старта + 400ms "пауза восхищения"

    // Показываем экран результата ещё позже — даём насладиться моментом
    setTimeout(() => showResult(result), totalDuration + 300 + 1200);
}

function showResult(result) {
    switchScreen('result-screen');
    destroyAllTGS();

    const wonItemImage  = document.getElementById('wonItemImage');
    const imageContainer = wonItemImage.parentElement;

    // Убираем старый TGS-контейнер если был
    const oldTgs = imageContainer.querySelector('[data-tgs]');
    if (oldTgs) oldTgs.remove();

    // Всегда рисуем TGS
    wonItemImage.style.display = 'none';
    const tgsNum = result.gift.gift_number || ((result.gift.id - 1) % 120) + 1;
    const div = document.createElement('div');
    div.innerHTML = tgsEl('result_tgs', tgsNum, '150px');
    imageContainer.insertBefore(div.firstElementChild, wonItemImage);

    setTimeout(() => initAllTGS(), 100);

    document.getElementById('wonItemName').textContent  = result.gift.name;
    document.getElementById('wonItemValue').textContent = result.gift.value;

    // Обновляем цену в кнопке «Продать»
    const sellPriceEl = document.getElementById('resultSellPrice');
    if (sellPriceEl) {
        sellPriceEl.textContent = result.gift.value || 0;
    }

    // Если это Stars — скрываем кнопку «Продать», показываем уведомление
    const btnSell = document.querySelector('.btn-sell-result');
    const starsNotice = document.getElementById('starsAutoNotice');
    const itemValueSection = document.querySelector('.item-value');
    
    if (result.gift.is_stars) {
        if (btnSell) btnSell.style.display = 'none';
        if (starsNotice) starsNotice.style.display = 'flex';
        if (itemValueSection) itemValueSection.style.display = 'none';  // Скрываем ценность для Stars
    } else {
        if (btnSell) btnSell.style.display = '';
        if (starsNotice) starsNotice.style.display = 'none';
        if (itemValueSection) itemValueSection.style.display = '';  // Показываем ценность
    }

    const rarityEl = document.getElementById('wonItemRarity');
    const rarity   = result.gift.rarity || 'common';
    rarityEl.className   = `item-rarity-badge ${rarity}`;
    rarityEl.textContent = getRarityText(rarity);
}

async function sellResultItem() {
    if (!state.currentOpening) return;

    showLoader();

    const response = await apiRequest('/sell', 'POST', {
        opening_id: state.currentOpening.opening_id,
        user_id: state.user.telegram_id
    });

    hideLoader();

    if (response.success) {
        state.user.balance = response.new_balance;
        updateUserDisplay();
        const value = state.currentOpening?.gift?.value || 0;
        showToast(`💰 Продано за ${value} ⭐`);
        closeResultScreen();
    } else {
        showToast('❌ ' + (response.error || 'Ошибка продажи'));
    }
}

function closeResultScreen() {
    switchScreen('main-screen');
    switchTab('inventory');
    loadInventory();
}

async function withdrawItem() {
    if (!state.currentOpening) return;
    
    showLoader();
    
    const response = await apiRequest('/withdraw', 'POST', {
        opening_id: state.currentOpening.opening_id,
        user_id: state.user.telegram_id
    });
    
    hideLoader();
    
    if (response.success) {
        showToast('✅ Приз успешно отправлен!');
        closeResultScreen();
    } else {
        showToast('❌ ' + (response.error || 'Ошибка вывода приза'));
    }
}

// === INVENTORY ===

async function loadInventory() {
    const response = await apiRequest(`/inventory/${state.user.telegram_id}`, 'GET');
    
    if (response.success) {
        state.inventory = response.inventory;
        renderInventory();
    }
}

function renderInventory() {
    const list = document.getElementById('inventoryList');
    list.innerHTML = '';

    if (state.inventory.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <img src="/static/images/tab-inventory.png" alt="inventory" class="empty-state-icon-img">
                </div>
                <div class="empty-state-text">Инвентарь пуст — открой кейс!</div>
            </div>
        `;
        return;
    }

    state.inventory.forEach((item, index) => {
        // Пропускаем проданные и выведенные (защита на случай если попали)
        if (item.is_sold || item.gift?.is_stars) return;
        
        const itemEl = document.createElement('div');
        itemEl.className = 'inventory-item';

        const rarityClass = item.gift?.rarity || 'common';

        // TGS анимация
        let imgContent;
        const gn = item.gift?.gift_number;
        if (gn >= 1 && gn <= 120) {
            const tgsId  = `inv_tgs_${index}`;
            imgContent = tgsEl(tgsId, gn, '60px');
        } else {
            imgContent = `<img src="${item.gift?.image_url || '/static/images/star.png'}"
                style="width:60px;height:60px;object-fit:contain">`;
        }

        // Кнопки действий
        let actionsHtml;
        if (item.is_withdrawn) {
            actionsHtml = `<div class="inv-done">✅ Выведено</div>`;
        } else {
            actionsHtml = `
                <div class="inv-actions">
                    <button class="btn-inv btn-inv-withdraw"
                        onclick="withdrawInventoryItem(${item.opening_id})">
                        <img src="/static/images/withdraw-icon.png"
                             class="btn-inv-withdraw-icon"
                             onerror="this.outerHTML='📤'"
                             alt="Вывести">
                        Вывести
                    </button>
                    <button class="btn-inv btn-inv-sell"
                        onclick="sellInventoryItem(${item.opening_id}, ${item.gift?.value || 0})">
                        <span class="btn-inv-sell-label">Продать за</span>
                        <span class="btn-inv-sell-row">
                            <img src="/static/images/star.png"
                                 class="btn-inv-star-icon"
                                 alt="star">
                            ${item.gift?.value || 0}
                        </span>
                    </button>
                </div>
            `;
        }

        itemEl.innerHTML = `
            <div class="inv-rarity ${rarityClass}"></div>
            <div class="inv-img">${imgContent}</div>
            <div class="inv-name">${item.gift?.name || 'Приз'}</div>
            ${actionsHtml}
        `;

        list.appendChild(itemEl);
    });

    setTimeout(() => initAllTGS(), 50);
}

async function withdrawInventoryItem(openingId) {
    showLoader();
    
    const response = await apiRequest('/withdraw', 'POST', {
        opening_id: openingId,
        user_id: state.user.telegram_id
    });
    
    hideLoader();
    
    if (response.success) {
        showToast('✅ Приз отправляется!');
        loadInventory();
    } else {
        showToast('❌ ' + (response.error || 'Ошибка вывода'));
    }
}

async function sellInventoryItem(openingId, value) {
    showLoader();
    
    const response = await apiRequest('/sell', 'POST', {
        opening_id: openingId,
        user_id: state.user.telegram_id
    });
    
    hideLoader();
    
    if (response.success) {
        state.user.balance = response.new_balance;
        updateUserDisplay();
        showToast(`💰 Продано за ${value} ⭐`);
        loadInventory();
    } else {
        showToast('❌ ' + (response.error || 'Ошибка продажи'));
    }
}

// === HISTORY ===

async function loadHistory() {
    const response = await apiRequest('/history/recent', 'GET');
    
    if (response.success) {
        state.history = response.history;
        renderHistory();
    }
}

function renderHistory() {
    const liveScroll = document.getElementById('liveHistoryScroll');
    const list = document.getElementById('historyList');
    if (list) list.innerHTML = '';
    if (!liveScroll) return;

    if (state.history.length === 0) {
        liveScroll.innerHTML = `<div style="color:var(--txt3);font-size:12px;padding:8px 4px">Пока пусто</div>`;
        return;
    }

    liveScroll.innerHTML = '';

    // Уничтожаем старые TGS инстансы для этой секции чтобы не было утечек
    for (let i = 0; i < 50; i++) {
        const oldEl = document.getElementById(`lh_tgs_${i}`);
        if (oldEl && window.renderTGS) {
            // renderTGS сам чистит предыдущий инстанс по id
        }
    }

    state.history.forEach((item, index) => {
        const card = document.createElement('div');
        const rarity = item.gift?.rarity || 'common';
        card.className = `live-history-card rarity-${rarity}`;

        const giftNum = item.gift?.gift_number;

        let imgContent;
        if (giftNum && giftNum >= 1) {
            const tgsId = `lh_tgs_${index}`;
            imgContent = tgsEl(tgsId, giftNum, '48px');
        } else {
            imgContent = `<img src="${item.gift?.image_url || '/static/images/star.png'}"
                style="width:48px;height:48px;object-fit:contain;flex-shrink:0" alt="">`;
        }

        card.innerHTML = `
            ${imgContent}
            <div class="live-history-card-name">${item.gift?.name || 'Приз'}</div>
            <div class="live-history-card-user">${item.user?.first_name || '...'}</div>
        `;
        liveScroll.appendChild(card);
    });

    // Ждём следующий тик — все карточки уже в DOM, затем рендерим каждый TGS отдельно
    // (точно так же как делают кейсы и инвентарь)
    requestAnimationFrame(() => {
        state.history.forEach((item, index) => {
            const giftNum = item.gift?.gift_number;
            if (giftNum && giftNum >= 1) {
                renderTGS(`lh_tgs_${index}`, giftNum);
            }
        });
    });
}

function startHistoryPolling() {
    setInterval(loadHistory, 5000);
}

// === TAB MANAGEMENT ===

function switchTab(tabName) {
    // Деактивируем все табы
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    // Активируем выбранный таб
    const activeTab = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeTab) activeTab.classList.add('active');

    const tabContent = document.getElementById(`${tabName}-tab`);
    if (tabContent) tabContent.classList.add('active');
    
    // Показываем "Последние выигрыши" только на табе кейсов
    const liveHistorySection = document.querySelector('.live-history-section');
    if (liveHistorySection) {
        liveHistorySection.style.display = (tabName === 'cases') ? 'block' : 'none';
    }
}

// === SCREEN MANAGEMENT ===

function switchScreen(screenName) {
    // Очищаем TGS плееры с предыдущего экрана для оптимизации
    if (window.tgsManager) {
        window.tgsManager.destroyAll();
    }
    
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    const screen = document.getElementById(screenName);
    if (screen) screen.classList.add('active');
}

// === TOPUP / PAYMENT ===

function showTopupScreen() {
    const modal = document.getElementById('topupModal');
    modal.classList.add('active');
}

function closeTopupModal() {
    const modal = document.getElementById('topupModal');
    modal.classList.remove('active');
}

async function createStarsInvoice(stars) {
    showLoader();

    try {
        // Создаем invoice через API
        const response = await apiRequest('/payment/create-invoice', 'POST', {
            user_id: state.user.telegram_id,
            stars: stars
        });

        hideLoader();

        if (response.success && response.invoice_link) {
            // Закрываем модалку
            closeTopupModal();

            // Открываем Telegram Stars Invoice
            tg.openInvoice(response.invoice_link, async (status) => {
                if (status === 'paid') {
                    // ЗАПУСКАЕМ ФЕЙЕРВЕРК 🎇
                    if (window.playSuccessAnimation) {
                        window.playSuccessAnimation();
                    }
                    
                    showToast(`✅ Баланс пополнен на ${stars} ⭐`);
                    
                    // Даем серверу 1 секунду на обработку вебхука от Telegram
                    setTimeout(async () => {
                        await loadUserBalance();
                        // Если юзер в момент оплаты находился на экране профиля — обновим и его
                        const profileScreen = document.getElementById('profile-screen');
                        if (profileScreen && profileScreen.classList.contains('active')) {
                            openProfile();
                        }
                    }, 1000);
                    
                } else if (status === 'cancelled') {
                    showToast('Оплата отменена');
                } else if (status === 'failed') {
                    showToast('❌ Ошибка оплаты');
                }
            });
        } else {
            showToast('❌ ' + (response.error || 'Ошибка создания платежа'));
        }
    } catch (error) {
        hideLoader();
        console.error('Payment error:', error);
        showToast('❌ Ошибка создания платежа');
    }
}

function createCustomStarsInvoice() {
    // Получаем сумму из поля ввода
    const input = document.getElementById('customStarsAmount');
    let stars = parseInt(input.value);
    
    // Проверяем минимальную сумму
    if (!stars || stars < 1) {
        showToast('❌ Минимальная сумма: 1 ⭐');
        if (input) input.value = 1;
        return;
    }
    
    // Проверяем максимальную сумму
    if (stars > 100000) {
        showToast('❌ Максимальная сумма: 100,000 ⭐');
        if (input) input.value = 100000;
        return;
    }
    
    // Создаем invoice
    createStarsInvoice(stars);
}

// async function loadUserBalance() {
//     const response = await apiRequest(`/user/${state.user.telegram_id}`, 'GET');
//     if (response.success) {
//         state.user.balance = response.user.balance;
//         updateUserDisplay();
//     }
// }
async function loadUserBalance() {
    // Стучимся на правильный эндпоинт /profile
    const response = await apiRequest(`/user/${state.user.telegram_id}/profile`, 'GET');
    if (response.success) {
        // Берем баланс из объекта profile
        state.user.balance = response.profile.balance;
        updateUserDisplay(); // Эта функция как раз обновляет цифру на главном экране
    } else {
        console.error('Не удалось загрузить баланс:', response.error);
    }
}

// === MODALS ===

function showConfirmModal(text) {
    document.getElementById('confirmText').innerHTML = text;
    document.getElementById('confirmModal').classList.add('active');
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.remove('active');
}

// === UI HELPERS ===

function showLoader() {
    document.getElementById('loader').classList.remove('hidden');
}

function hideLoader() {
    document.getElementById('loader').classList.add('hidden');
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// === UTILITY FUNCTIONS ===

async function apiRequest(endpoint, method = 'GET', data = null) {
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        if (data && method !== 'GET') {
            options.body = JSON.stringify(data);
        }
        
        const response = await fetch(API_URL + endpoint, options);
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        return { success: false, error: error.message };
    }
}

async function checkFreeCaseAvailable() {
    const response = await apiRequest(`/user/${state.user.telegram_id}/free-case-check`, 'GET');
    return response.available;
}

function getRarityText(rarity) {
    const rarities = {
        'common': 'Обычный',
        'rare': 'Редкий',
        'epic': 'Эпический',
        'legendary': 'Легендарный'
    };
    return rarities[rarity] || 'Обычный';
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'только что';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} мин назад`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч назад`;
    return `${Math.floor(seconds / 86400)} дн назад`;
}

// === TELEGRAM BACK BUTTON ===

tg.BackButton.onClick(() => {
    const currentScreen = document.querySelector('.screen.active');
    if (!currentScreen) return;
    
    const screenId = currentScreen.id;
    
    if (screenId === 'opening-screen') {
        closeOpeningScreen();
    } else if (screenId === 'animation-screen' || screenId === 'result-screen') {
        switchScreen('main-screen');
    }
});

// Показываем кнопку "Назад" когда не на главном экране
const observer = new MutationObserver(() => {
    const mainScreen = document.getElementById('main-screen');
    if (mainScreen && mainScreen.classList.contains('active')) {
        tg.BackButton.hide();
    } else {
        tg.BackButton.show();
    }
});

const mainScreen = document.getElementById('main-screen');
if (mainScreen) {
    observer.observe(mainScreen, {
        attributes: true,
        attributeFilter: ['class']
    });
}

// === HAPTIC FEEDBACK ===

// Добавляем вибрацию при нажатиях
document.addEventListener('click', (e) => {
    if (e.target.closest('button') || e.target.closest('.case-card')) {
        if (tg.HapticFeedback) {
            tg.HapticFeedback.impactOccurred('light');
        }
    }
});

// === CAROUSEL NAVIGATION ===

// Обработчики стрелок карусели
document.addEventListener('DOMContentLoaded', () => {

    const leftArrow = document.getElementById('carouselLeft');
    const rightArrow = document.getElementById('carouselRight');

    if (leftArrow) {
        leftArrow.addEventListener('click', () => {
            const carousel = document.getElementById('caseItemsPreview');
            if (carousel) {
                carousel.style.animationPlayState = 'paused';
                carousel.scrollBy({ left: -200, behavior: 'smooth' });
                setTimeout(() => {
                    carousel.style.animationPlayState = 'running';
                }, 1000);
            }
        });
    }

    if (rightArrow) {
        rightArrow.addEventListener('click', () => {
            const carousel = document.getElementById('caseItemsPreview');
            if (carousel) {
                carousel.style.animationPlayState = 'paused';
                carousel.scrollBy({ left: 200, behavior: 'smooth' });
                setTimeout(() => {
                    carousel.style.animationPlayState = 'running';
                }, 1000);
            }
        });
    }
});

// === PROFILE FUNCTIONS ===

function openProfile() {
    if (!state.user?.telegram_id) {
        console.error('No user telegram_id');
        return;
    }
    
    showLoader();
    
    apiRequest(`/user/${state.user.telegram_id}/profile`, 'GET')
        .then(response => {
            if (response.success) {
                const profile = response.profile;
                
                // Аватарка
                const avatar = document.getElementById('profileAvatar');
                if (profile.photo_url) {
                    avatar.innerHTML = `<img src="${profile.photo_url}" alt="avatar">`;
                } else {
                    avatar.textContent = '👤';
                }
                
                // Заполняем данные профиля
                document.getElementById('profileName').textContent = profile.first_name || 'Пользователь';
                document.getElementById('profileUsername').textContent = profile.username ? `@${profile.username}` : '';
                document.getElementById('profileBalance').textContent = profile.balance || 0;
                document.getElementById('profileOpenings').textContent = profile.total_openings || 0;
                document.getElementById('profileReferrals').textContent = profile.total_referrals || 0;
                document.getElementById('profileEarnings').textContent = profile.total_referral_earnings || 0;
                
                // ВСЁ! Строку с referralCode мы просто удалили навсегда, так как её больше нет в HTML.
                
                switchScreen('profile-screen');
            } else {
                showToast('❌ Ошибка загрузки профиля: ' + (response.error || 'Неизвестная ошибка'));
            }
        })
        .catch(error => showToast('❌ Ошибка: ' + error.message))
        .finally(() => hideLoader());
}

function closeProfile() {
    switchScreen('main-screen');
}



// --- НОВАЯ ЛОГИКА РЕФЕРАЛОВ ---
async function showReferralsList() {
    if (!state.user?.telegram_id) return;
    
    document.getElementById('referralsModal').classList.add('active');
    const listContainer = document.getElementById('referralsList');
    listContainer.innerHTML = '<div class="loader-spinner" style="margin: 20px auto"></div>';

    // Заполняем баланс
    document.getElementById('refModalBalance').innerText = state.user.balance || 0;

    // Генерируем ссылку
    const botUsername = 'ludomihabot'; // Твой бот
    const refLink = `https://t.me/${botUsername}?start=${state.user.referral_code}`;
    document.getElementById('refModalLinkInput').value = refLink;

    // Сначала получаем профиль для статы
    const profileRes = await apiRequest(`/user/${state.user.telegram_id}/profile`, 'GET');
    if (profileRes.success) {
        document.getElementById('refModalEarned').innerText = profileRes.profile.total_referral_earnings || 0;
        document.getElementById('refModalCount').innerText = profileRes.profile.total_referrals || 0;
    }

    // Получаем сам список людей
    const response = await apiRequest(`/user/${state.user.telegram_id}/referrals`, 'GET');
    if (response.success) {
        renderReferrals(response.referrals);
    } else {
        listContainer.innerHTML = '<div class="empty-state">Ошибка загрузки данных</div>';
    }
}

function renderReferrals(referralsArray) {
    const listContainer = document.getElementById('referralsList');
    listContainer.innerHTML = '';

    if (!referralsArray || referralsArray.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state" style="padding-top:20px;">
                <div style="font-size:40px;margin-bottom:10px;opacity:0.5;">👥</div>
                Пока нет рефералов<br><span style="font-size:12px;color:#888;">Поделитесь ссылкой с друзьями, чтобы заработать звезды</span>
            </div>`;
        return;
    }

    referralsArray.forEach(ref => {
        // Красивая дата регистрации
        const regDate = new Date(ref.joined_at || new Date()).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
        // Аватарка или смайлик
        const avatarHtml = ref.photo_url ? `<img src="${ref.photo_url}" style="width:100%;height:100%;object-fit:cover;">` : `👤`;
        
        listContainer.innerHTML += `
            <div class="modern-list-item">
                <div class="ml-left">
                    <div class="ml-avatar">${avatarHtml}</div>
                    <div class="ml-info">
                        <div class="ml-title">${ref.first_name || 'Игрок'}</div>
                        <div class="ml-subtitle">Регистрация: ${regDate}</div>
                    </div>
                </div>
                <div class="ml-right">
                    <div class="ml-value positive">+${ref.total_earned || 0} ⭐</div>
                </div>
            </div>
        `;
    });
}

function copyReferralLinkModal() {
    const input = document.getElementById('refModalLinkInput');
    input.select();
    document.execCommand('copy');
    showToast('📋 Ссылка скопирована!');
    if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
}

function shareReferralLink() {
    const input = document.getElementById('refModalLinkInput').value;
    const text = encodeURIComponent('🎁 Привет залетай скорее! Открывай бесплатный кейс с реальными NFT Гифтами!');
    if (tg && tg.openTelegramLink) {
        tg.openTelegramLink(`https://t.me/share/url?url=${input}&text=${text}`);
    } else {
        window.open(`https://t.me/share/url?url=${input}&text=${text}`, '_blank');
    }
}

function closeReferralsModal() {
    document.getElementById('referralsModal').classList.remove('active');
}



