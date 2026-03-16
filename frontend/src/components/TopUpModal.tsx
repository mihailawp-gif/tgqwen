import { useState } from 'react';
import { useAppStore, useUserStore } from '../store/useStore';
import { createInvoiceApi } from '../api/api';

interface TopUpModalProps {
    open: boolean;
    onClose: () => void;
}

const AMOUNTS = [200, 500, 1000, 2500, 5000, 10000];

export default function TopUpModal({ open, onClose }: TopUpModalProps) {
    const { showToast, setLoaderVisible } = useAppStore();
    const { setBalance } = useUserStore();
    const [customAmount, setCustomAmount] = useState(100);

    const telegramId = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;

    const createInvoice = async (amount: number) => {
        if (amount < 1) return showToast('❌ Минимальная сумма 1 ⭐');
        setLoaderVisible(true);
        try {
            const res = await createInvoiceApi(telegramId, amount);
            if (res.success && res.invoice_url) {
                const tg = (window as any).Telegram?.WebApp;
                if (tg && tg.openInvoice) {
                    tg.openInvoice(res.invoice_url, (status: string) => {
                        if (status === 'paid') {
                            showToast(`✅ Баланс пополнен на ${amount} ⭐`);
                            if (res.new_balance) setBalance(res.new_balance);
                        }
                    });
                } else {
                    window.open(res.invoice_url, '_blank');
                }
            } else {
                showToast('❌ ' + (res.error || 'Ошибка создания счета'));
            }
        } catch (e) {
            showToast('❌ Ошибка сети');
        }
        setLoaderVisible(false);
    };

    if (!open) return null;

    return (
        <div className="modal active">
            <div className="modal-overlay" onClick={onClose} />
            <div className="modal-content topup-modal">
                <div className="modal-handle" />
                <div className="modal-header">
                    <h3>Пополнение баланса</h3>
                    <button className="btn-close" onClick={onClose}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="payment-options">
                    <div className="payment-header">
                        <img src="/static/images/star.png" className="stars-icon-large" alt="star" />
                        <p>Выберите количество звёзд</p>
                    </div>

                    <div className="amounts-grid">
                        {AMOUNTS.map(amount => (
                            <button key={amount} className="amount-card" onClick={() => createInvoice(amount)}>
                                <div className="amount-stars">
                                    <img src="/static/images/star.png" className="amount-star-icon" alt="star" />
                                    {amount}
                                </div>
                            </button>
                        ))}
                    </div>

                    <div className="custom-amount-section">
                        <p className="custom-amount-label">Или введите свою сумму:</p>
                        <div className="custom-amount-input">
                            <input
                                type="number"
                                placeholder="Мин. 1"
                                min={1}
                                max={100000}
                                value={customAmount}
                                onChange={(e) => setCustomAmount(Number(e.target.value))}
                            />
                            <button className="btn-custom-amount" onClick={() => createInvoice(customAmount)}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M12 5v14M5 12h14" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
