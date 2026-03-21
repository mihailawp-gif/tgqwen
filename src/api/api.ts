import axios from 'axios';
import { useUserStore } from '../store/useStore';

const BASE_URL = '/api';

// ─────────────────────────────────────────────────────────────────────────────
// Telegram initData — получаем один раз при загрузке страницы.
// Это подписанная Telegram строка — её нельзя подделать без знания BOT_TOKEN.
// Отправляем в каждый запрос как X-Telegram-Init-Data, сервер верифицирует
// HMAC-SHA256 подпись и достаёт telegram_id из неё — не из тела запроса.
// ─────────────────────────────────────────────────────────────────────────────
const getTgInitData = (): string => {
    try {
        return (window as any).Telegram?.WebApp?.initData || '';
    } catch {
        return '';
    }
};

export const api = axios.create({
    baseURL: BASE_URL,
    headers: { 'Content-Type': 'application/json' },
});

// Интерцептор запросов: добавляем X-Telegram-Init-Data в каждый запрос
api.interceptors.request.use((config) => {
    const initData = getTgInitData();
    if (initData) {
        config.headers['X-Telegram-Init-Data'] = initData;
    }
    return config;
});

// Интерцептор ответов
api.interceptors.response.use(
    (response: any) => response.data,
    (error: any) => {
        const message = error.response?.data?.error || error.message || 'Ошибка сети';
        return Promise.reject({ success: false, error: message });
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// User API
// ─────────────────────────────────────────────────────────────────────────────
export const initUserApi = async (userData: any) => {
    try {
        // user_id больше не нужен в теле — сервер берёт его из initData
        // Передаём только photo_url (его нет в initData) и referrer_code
        const payload: any = {};
        if (userData.photo_url)    payload.photo_url    = userData.photo_url;
        if (userData.referrer_code) payload.referrer_code = userData.referrer_code;

        const data = await api.post('/user/init', payload) as any;
        if (data.success && data.user) {
            useUserStore.getState().setUser({
                balance:   data.user.balance,
                name:      data.user.first_name || 'Игрок',
                avatarUrl: data.user.photo_url || '',
            });
        }
        return data;
    } catch (e) {
        return e;
    }
};

export const fetchProfileApi = async (telegramId: string | number) => {
    try {
        const data = await api.get(`/user/${telegramId}/profile`) as any;
        if (data.success && data.profile) {
            useUserStore.getState().setUser({
                balance:   data.profile.balance,
                openings:  data.profile.total_openings,
                referrals: data.profile.total_referrals,
                deposits:  data.profile.total_deposits,
            });
        }
        return data;
    } catch (e) { return e; }
};

// ─────────────────────────────────────────────────────────────────────────────
// History API (публичный, без auth)
// ─────────────────────────────────────────────────────────────────────────────
export const fetchHistoryApi = async () => {
    try { return await api.get('/history/recent') as any; }
    catch (e) { return e; }
};

// ─────────────────────────────────────────────────────────────────────────────
// Cases API
// ─────────────────────────────────────────────────────────────────────────────
export const fetchCasesApi = async () => {
    try { return await api.get('/cases/list') as any; }
    catch (e) { return e; }
};

export const fetchCaseItemsApi = async (caseId: number) => {
    try { return await api.get(`/cases/${caseId}/items`) as any; }
    catch (e) { return e; }
};

export const openCaseApi = async (caseId: number, _userId?: string | number) => {
    // user_id из тела больше не нужен — сервер берёт из initData
    try { return await api.post('/cases/open', { case_id: caseId }) as any; }
    catch (e) { return e; }
};

// ─────────────────────────────────────────────────────────────────────────────
// Mines API
// ─────────────────────────────────────────────────────────────────────────────
export const startMinesApi = async (_userId: string | number, bet: number, bombs: number) => {
    try { return await api.post('/mines/start', { bet, bombs }) as any; }
    catch (e) { return e; }
};

export const clickMinesApi = async (_userId: string | number, cell: number) => {
    try { return await api.post('/mines/click', { cell }) as any; }
    catch (e) { return e; }
};

export const collectMinesApi = async (_userId?: string | number) => {
    try { return await api.post('/mines/collect', {}) as any; }
    catch (e) { return e; }
};

// ─────────────────────────────────────────────────────────────────────────────
// Plinko API
// ─────────────────────────────────────────────────────────────────────────────
export const playPlinkoApi = async (_userId: string | number, bet: number, difficulty: string, pins: number) => {
    try { return await api.post('/plinko/play', { bet, difficulty, pins }) as any; }
    catch (e) { return e; }
};

// ─────────────────────────────────────────────────────────────────────────────
// Dice API
// ─────────────────────────────────────────────────────────────────────────────
export const playDiceApi = async (_userId: string | number, bet: number, chance: number, type: 'under' | 'over') => {
    try { return await api.post('/dice/play', { bet, chance, type }) as any; }
    catch (e) { return e; }
};

// ─────────────────────────────────────────────────────────────────────────────
// Crash API
// ─────────────────────────────────────────────────────────────────────────────
export const crashBetApi = async (_userId: string | number, bet: number, auto_cashout?: number) => {
    try { return await api.post('/crash/bet', { bet, auto_cashout }) as any; }
    catch (e) { return e; }
};

export const crashCashoutApi = async (_userId?: string | number) => {
    try { return await api.post('/crash/cashout', {}) as any; }
    catch (e) { return e; }
};

// ─────────────────────────────────────────────────────────────────────────────
// Inventory API
// ─────────────────────────────────────────────────────────────────────────────
export const fetchInventoryApi = async (telegramId: string | number) => {
    try { return await api.get(`/inventory/${telegramId}`) as any; }
    catch (e) { return e; }
};

export const withdrawItemApi = async (openingId: number, _userId?: string | number) => {
    try { return await api.post('/withdraw', { opening_id: openingId }) as any; }
    catch (e) { return e; }
};

export const sellItemApi = async (openingId: number, _userId?: string | number) => {
    try { return await api.post('/sell', { opening_id: openingId }) as any; }
    catch (e) { return e; }
};

// ─────────────────────────────────────────────────────────────────────────────
// Referrals API
// ─────────────────────────────────────────────────────────────────────────────
export const fetchReferralsApi = async (telegramId: string | number) => {
    try { return await api.get(`/user/${telegramId}/referrals`) as any; }
    catch (e) { return e; }
};

export const withdrawReferralsApi = async (_telegramId?: string | number) => {
    try { return await api.post('/user/withdraw-referrals', {}) as any; }
    catch (e) { return e; }
};

// ─────────────────────────────────────────────────────────────────────────────
// Promo API
// ─────────────────────────────────────────────────────────────────────────────
export const activatePromoApi = async (_userId: string | number, code: string) => {
    try { return await api.post('/promo/activate', { code }) as any; }
    catch (e) { return e; }
};

// ─────────────────────────────────────────────────────────────────────────────
// Payment API
// ─────────────────────────────────────────────────────────────────────────────
export const createInvoiceApi = async (_userId: string | number, amount: number) => {
    try { return await api.post('/payment/create-invoice', { stars: amount }) as any; }
    catch (e) { return e; }
};

// ─────────────────────────────────────────────────────────────────────────────
// Free case check (публичный)
// ─────────────────────────────────────────────────────────────────────────────
export const checkFreeCaseApi = async (telegramId: string | number) => {
    try { return await api.get(`/user/${telegramId}/free-case-check`) as any; }
    catch (e) { return e; }
};

// ─────────────────────────────────────────────────────────────────────────────
// Upgrade API
// ─────────────────────────────────────────────────────────────────────────────
export const fetchUpgradeGiftsApi = async () => {
    try { return await api.get('/upgrade/gifts') as any; }
    catch (e) { return e; }
};

export const upgradeBetApi = async (inventory_item_ids: number[], target_gift_id: number, added_balance: number) => {
    try { return await api.post('/upgrade/bet', { inventory_item_ids, target_gift_id, added_balance }) as any; }
    catch (e) { return e; }
};
