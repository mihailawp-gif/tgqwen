import { useState, useEffect } from 'react';
import { useAppStore, useUserStore } from '../store/useStore';
import { fetchCasesApi, fetchCaseItemsApi, openCaseApi } from '../api/api';

interface CaseItem {
    id: number;
    name: string;
    price: number;
    is_free: boolean;
    image_url?: string;
    description?: string;
}

interface CaseGift {
    gift: {
        id: number;
        name: string;
        gift_number: number;
        rarity?: string;
        value?: number;
        image_url?: string;
        is_stars?: boolean;
    };
    drop_chance: number;
}

export default function CasesPage() {
    const { showToast, setLoaderVisible } = useAppStore();
    const { balance, setBalance } = useUserStore();

    const [cases, setCases] = useState<CaseItem[]>([]);
    const [loading, setLoading] = useState(true);

    // Preview state
    const [previewCase, setPreviewCase] = useState<CaseItem | null>(null);
    const [previewItems, setPreviewItems] = useState<CaseGift[]>([]);
    const [showPreview, setShowPreview] = useState(false);

    // Result state
    const [showResult, setShowResult] = useState(false);
    const [resultData, setResultData] = useState<any>(null);

    const telegramId = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;

    useEffect(() => {
        loadCases();
    }, []);

    const loadCases = async () => {
        setLoading(true);
        const res = await fetchCasesApi();
        if (res.success) {
            setCases(res.cases || []);
        }
        setLoading(false);
    };

    const openPreview = async (caseItem: CaseItem) => {
        setPreviewCase(caseItem);
        setLoaderVisible(true);
        const res = await fetchCaseItemsApi(caseItem.id);
        setLoaderVisible(false);
        if (res.success) {
            setPreviewItems(res.items || []);
            setShowPreview(true);
        }
    };

    const handleOpenCase = async () => {
        if (!previewCase) return;
        if (!previewCase.is_free && balance < previewCase.price) {
            return showToast('❌ Недостаточно звезд!');
        }

        setLoaderVisible(true);
        const res = await openCaseApi(previewCase.id, telegramId);
        setLoaderVisible(false);

        if (res.success) {
            setBalance(res.balance);
            setResultData(res);
            setShowResult(true);
        } else {
            showToast('❌ ' + (res.error || 'Ошибка открытия кейса'));
        }
    };

    const sellResult = async () => {
        if (!resultData) return;
        setLoaderVisible(true);
        const res = await (await import('../api/api')).api.post('/sell', { opening_id: resultData.opening_id, user_id: telegramId }) as any;
        setLoaderVisible(false);
        if (res.success) {
            setBalance(res.new_balance);
            showToast(`Продано за ${resultData.gift?.value || 0} ⭐`);
            setShowResult(false);
            setShowPreview(false);
        } else {
            showToast('❌ ' + (res.error || 'Ошибка продажи'));
        }
    };

    // Result screen
    if (showResult && resultData) {
        return (
            <div className="result-container">
                <div className="congrats-text">ПОЗДРАВЛЯЕМ!</div>
                <div className="won-item-showcase">
                    <div className="item-glow-effect" />
                    <div className="won-item-card">
                        <img src={resultData.gift?.image_url || '/static/images/star.png'} alt={resultData.gift?.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        <div className="item-rarity-badge unique">LIMITED</div>
                    </div>
                </div>
                <div className="won-item-details">
                    <div className="item-name">{resultData.gift?.name || 'Приз'}</div>
                    {!resultData.gift?.is_stars && (
                        <div className="item-value">
                            <span>Стоимость:</span>
                            <div className="value-amount">
                                <img src="/static/images/star.png" className="value-icon" alt="star" />
                                {resultData.gift?.value || 0}
                            </div>
                        </div>
                    )}
                </div>
                <div className="result-actions">
                    {!resultData.gift?.is_stars && (
                        <button className="btn-action btn-sell-result" onClick={sellResult}>
                            Продать за <img src="/static/images/star.png" className="btn-sell-star-icon" alt="star" /> {resultData.gift?.value || 0}
                        </button>
                    )}
                    <button className="btn-action btn-continue" onClick={() => { setShowResult(false); setShowPreview(false); }}>
                        Продолжить
                    </button>
                </div>
            </div>
        );
    }

    // Preview screen
    if (showPreview && previewCase) {
        return (
            <div id="opening-screen" className="screen active" style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
                <div className="preview-header">
                    <button className="btn-back" onClick={() => setShowPreview(false)}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M19 12H5M12 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <h2>{previewCase.name}</h2>
                </div>

                <div className="preview-scrollable" style={{ flex: 1, overflowY: 'auto', paddingBottom: '8px' }}>
                    {previewCase.description && (
                        <div className="case-description">{previewCase.description}</div>
                    )}

                    <div className="items-preview-section">
                        <h3>Содержимое кейса</h3>
                        <div className="preview-tiles-grid">
                            {previewItems.map((item, i) => (
                                <div key={i} className="preview-tile rarity-unique">
                                    <div className="preview-tile-tgs">
                                        <img src={item.gift.image_url || '/static/images/star.png'} alt={item.gift.name}
                                            style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
                                    </div>
                                    <div className="preview-tile-name">{item.gift.name}</div>
                                    <div className="preview-tile-footer">
                                        <span className="preview-tile-chance">{item.drop_chance.toFixed(1)}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="open-case-footer">
                    {!previewCase.is_free && (
                        <div className="case-price-display">
                            <img src="/static/images/star.png" className="price-icon" alt="star" />
                            <span>{previewCase.price}</span>
                        </div>
                    )}
                    <button className={`btn-open-case ${previewCase.is_free ? 'free' : ''}`} onClick={handleOpenCase}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                        {previewCase.is_free ? 'Открыть бесплатно' : 'Открыть кейс'}
                    </button>
                </div>
            </div>
        );
    }

    // Cases grid
    return (
        <div className="tab-content active">
            <div className="cases-container">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="loader-spinner" />
                    </div>
                ) : cases.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">📦</div>
                        <div className="empty-state-text">Пока нет доступных кейсов</div>
                    </div>
                ) : (
                    <div className="cases-grid">
                        {cases.map(c => (
                            <div key={c.id} className="case-card" onClick={() => openPreview(c)}>
                                <div className="case-image-wrapper">
                                    <img className="case-image" src={c.image_url || '/static/images/free-stars-case.png'} alt={c.name} />
                                </div>
                                <div className="case-info">
                                    <div className="case-name">{c.name.replace(/[^\w\s\u0400-\u04FF]/gu, '').trim()}</div>
                                    {c.is_free ? (
                                        <div className="case-price free">Открыть бесплатно</div>
                                    ) : (
                                        <div className="case-price">
                                            <img src="/static/images/star.png" className="price-star-icon" alt="star" />
                                            {c.price}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}