import { useState, useEffect } from 'react';
import { useAppStore, useUserStore } from '../store/useStore';
import { api } from '../api/api';
import TgsAnimation from '../components/TgsAnimation';

interface InventoryItem {
    opening_id: number;
    is_sold: boolean;
    status?: string;
    gift?: {
        id: number;
        name: string;
        gift_number?: number;
        image_url?: string;
        rarity?: string;
        value?: number;
        is_stars?: boolean;
    };
}

export default function InventoryPage() {
    const { showToast, setLoaderVisible } = useAppStore();
    const { setBalance } = useUserStore();

    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    const telegramId = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;

    useEffect(() => {
        loadInventory();
    }, []);

    const loadInventory = async () => {
        if (!telegramId) return;
        setLoading(true);
        try {
            const res = await api.get(`/inventory/${telegramId}`) as any;
            if (res.success) {
                setInventory(res.inventory || []);
            }
        } catch (e) { }
        setLoading(false);
    };

    const withdrawItem = async (openingId: number) => {
        setLoaderVisible(true);
        try {
            const res = await api.post('/withdraw', { opening_id: openingId, user_id: telegramId }) as any;
            if (res.success) {
                showToast('⏳ Заявка отправлена! Ожидайте обработки.');
                loadInventory();
            } else {
                showToast('❌ ' + (res.error || 'Ошибка вывода'));
            }
        } catch (e) {
            showToast('❌ Ошибка сети');
        }
        setLoaderVisible(false);
    };

    const sellItem = async (openingId: number, value: number) => {
        setLoaderVisible(true);
        try {
            const res = await api.post('/sell', { opening_id: openingId, user_id: telegramId }) as any;
            if (res.success) {
                setBalance(res.new_balance);
                showToast(`Продано за ${value} ⭐`);
                loadInventory();
            } else {
                showToast('❌ ' + (res.error || 'Ошибка продажи'));
            }
        } catch (e) {
            showToast('❌ Ошибка сети');
        }
        setLoaderVisible(false);
    };

    const filteredInventory = inventory.filter(item => !item.is_sold && !item.gift?.is_stars);

    return (
        <div className="tab-content active">
            <div className="inventory-container">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="loader-spinner" />
                    </div>
                ) : filteredInventory.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">
                            <img src="/assets/images/tab-inventory.png" className="empty-state-icon-img" alt="" />
                        </div>
                        <div className="empty-state-text">Инвентарь пуст — открой кейс!</div>
                    </div>
                ) : (
                    <div className="inventory-grid">
                        {filteredInventory.map((item) => (
                            <div key={item.opening_id} className="inventory-item">
                                <div className={`inv-rarity ${item.gift?.rarity || 'unique'}`} />
                                <div className="inv-badge-unique">UNIQUE</div>
                                <div className="inv-img">
                                    {item.gift?.image_url?.endsWith('.tgs') ? (
                                        <TgsAnimation url={item.gift.image_url} width={70} height={70} fps={30} />
                                    ) : (
                                        <img src={item.gift?.image_url || '/assets/images/star.png'}
                                            style={{ width: '70px', height: '70px', objectFit: 'contain' }}
                                            alt={item.gift?.name} />
                                    )}
                                </div>
                                <div className="inv-name" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <span>{item.gift?.name || 'Приз'}</span>
                                    {item.status === 'rejected' && (
                                        <div style={{ color: '#ef4444', fontSize: '9px', marginTop: '2px' }}>Отклонено! Обратитесь в поддержку</div>
                                    )}
                                </div>

                                {item.status === 'pending' ? (
                                    <div className="inv-done">⏳ Обработка вывода...</div>
                                ) : (
                                    <div className="inv-actions">
                                        <button className="btn-inv btn-inv-withdraw" onClick={() => withdrawItem(item.opening_id)}>
                                            <svg className="icon-withdraw-svg" viewBox="0 0 24 24" style={{ width: '14px', height: '14px', stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}>
                                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                <polyline points="17 8 12 3 7 8" />
                                                <line x1="12" y1="3" x2="12" y2="15" />
                                            </svg>
                                            Вывести
                                        </button>
                                        <button className="btn-inv btn-inv-sell" onClick={() => sellItem(item.opening_id, item.gift?.value || 0)}>
                                            <span className="btn-inv-sell-label">Продать за</span>
                                            <span className="btn-inv-sell-row">
                                                <img src="/assets/images/star.png" className="btn-inv-star-icon" alt="star" />
                                                {item.gift?.value || 0}
                                            </span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}