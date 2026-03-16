import axios from 'axios';
import { useUserStore } from '../store/useStore';

const BASE_URL = '/api';

export const api = axios.create({
    baseURL: BASE_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Добавляем автоматический перехват ошибок
api.interceptors.response.use(
    (response: any) => response.data, // Сразу возвращаем внутренние данные (success, user, balance и т.д.)
    (error: any) => {
        const message = error.response?.data?.error || error.message || 'Ошибка сети';
        return Promise.reject({ success: false, error: message });
    }
);

// --- User API ---
export const initUserApi = async (userData: any) => {
    try {
        const data = await api.post('/user/init', userData) as any;
        if (data.success && data.user) {
            useUserStore.getState().setUser({
                balance: data.user.balance,
                name: data.user.first_name || 'Игрок',
                avatarUrl: data.user.photo_url || ''
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
                balance: data.profile.balance,
                openings: data.profile.total_openings,
                referrals: data.profile.total_referrals,
                deposits: data.profile.total_deposits,
            });
        }
        return data;
    } catch (e) { return e; }
};

// --- History API ---
export const fetchHistoryApi = async () => {
    try {
        return await api.get('/history/recent') as any;
    } catch (e) { return e; }
};

// --- Cases API ---
export const fetchCasesApi = async () => {
    try {
        return await api.get('/cases/list') as any;
    } catch (e) { return e; }
}

export const fetchCaseItemsApi = async (caseId: number) => {
    try {
        return await api.get(`/cases/${caseId}/items`) as any;
    } catch (e) { return e; }
}

export const openCaseApi = async (caseId: number, userId: string | number) => {
    try {
        return await api.post('/cases/open', { case_id: caseId, user_id: userId }) as any;
    } catch (e) { return e; }
}

// --- Mines API ---
export const startMinesApi = async (userId: string | number, bet: number, bombs: number) => {
    try {
        return await api.post('/mines/start', { user_id: userId, bet, bombs }) as any;
    } catch (e) { return e; }
};

export const clickMinesApi = async (userId: string | number, cell: number) => {
    try {
        return await api.post('/mines/click', { user_id: userId, cell }) as any;
    } catch (e) { return e; }
}

export const collectMinesApi = async (userId: string | number) => {
    try {
        return await api.post('/mines/collect', { user_id: userId }) as any;
    } catch (e) { return e; }
}

// --- Plinko API ---
export const playPlinkoApi = async (userId: string | number, bet: number, difficulty: string, pins: number) => {
    try {
        return await api.post('/plinko/play', { user_id: userId, bet, difficulty, pins }) as any;
    } catch (e) { return e; }
}

// --- Dice API ---
export const playDiceApi = async (userId: string | number, bet: number, chance: number, type: 'under' | 'over') => {
    try {
        return await api.post('/dice/play', { user_id: userId, bet, chance, type }) as any;
    } catch (e) { return e; }
}

// --- Crash API ---
export const crashBetApi = async (userId: string | number, bet: number, auto_cashout?: number) => {
    try {
        return await api.post('/crash/bet', { user_id: userId, bet, auto_cashout }) as any;
    } catch (e) { return e; }
}
export const crashCashoutApi = async (userId: string | number) => {
    try {
        return await api.post('/crash/cashout', { user_id: userId }) as any;
    } catch (e) { return e; }
}

// --- Inventory API ---
export const fetchInventoryApi = async (telegramId: string | number) => {
    try {
        return await api.get(`/inventory/${telegramId}`) as any;
    } catch (e) { return e; }
}

export const withdrawItemApi = async (openingId: number, userId: string | number) => {
    try {
        return await api.post('/withdraw', { opening_id: openingId, user_id: userId }) as any;
    } catch (e) { return e; }
}

export const sellItemApi = async (openingId: number, userId: string | number) => {
    try {
        return await api.post('/sell', { opening_id: openingId, user_id: userId }) as any;
    } catch (e) { return e; }
}

// --- Referrals API ---
export const fetchReferralsApi = async (telegramId: string | number) => {
    try {
        return await api.get(`/user/${telegramId}/referrals`) as any;
    } catch (e) { return e; }
}

export const withdrawReferralsApi = async (telegramId: string | number) => {
    try {
        return await api.post('/user/withdraw-referrals', { telegram_id: telegramId }) as any;
    } catch (e) { return e; }
}

// --- Promo API ---
export const activatePromoApi = async (userId: string | number, code: string) => {
    try {
        return await api.post('/promo/activate', { user_id: userId, code }) as any;
    } catch (e) { return e; }
}

// --- Payment API ---
export const createInvoiceApi = async (userId: string | number, amount: number) => {
    try {
        return await api.post('/payment/create-invoice', { user_id: userId, amount }) as any;
    } catch (e) { return e; }
}

// --- Free case check ---
export const checkFreeCaseApi = async (telegramId: string | number) => {
    try {
        return await api.get(`/user/${telegramId}/free-case-check`) as any;
    } catch (e) { return e; }
}
