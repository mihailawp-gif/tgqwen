import { useState, useEffect, useRef } from 'react';
import { useAppStore, useUserStore } from '../store/useStore';
import { fetchCasesApi, fetchCaseItemsApi, openCaseApi, fetchHistoryApi } from '../api/api';
import TgsAnimation from '../components/TgsAnimation';

interface HistoryItem {
    id: number;
    gift?: {
        name: string;
        rarity?: string;
        image_url?: string;
    };
    user?: {
        first_name?: string;
    };
}

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
    const [showConfirm, setShowConfirm] = useState(false);
    const [cases, setCases] = useState<CaseItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState<HistoryItem[]>([]);

    // Preview state
    const [previewCase, setPreviewCase] = useState<CaseItem | null>(null);
    const [previewItems, setPreviewItems] = useState<CaseGift[]>([]);
    const [showPreview, setShowPreview] = useState(false);

    // Opening state
    const [isOpening, setIsOpening] = useState(false);
    const [rouletteItems, setRouletteItems] = useState<any[]>([]);

    // Result state
    const [showResult, setShowResult] = useState(false);
    const [resultData, setResultData] = useState<any>(null);

    const rouletteTrackRef = useRef<HTMLDivElement>(null);
    const telegramId = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;

    useEffect(() => {
        loadCases();
        loadHistory();
        const interval = setInterval(loadHistory, 5000);
        return () => clearInterval(interval);
    }, []);

    const loadCases = async () => {
        setLoading(true);
        const res = await fetchCasesApi();
        if (res.success) {
            setCases(res.cases || []);
        }
        setLoading(false);
    };

    const loadHistory = async () => {
        const res = await fetchHistoryApi();
        if (res?.success) setHistory(res.history || []);
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

        const res = await openCaseApi(previewCase.id, telegramId);
        if (res.success) {
            setBalance(res.balance);
            startRoulette(res);
        } else {
            showToast('❌ ' + (res.error || 'Ошибка открытия кейса'));
        }
    };

    const startRoulette = (res: any) => {
        // Generate ~50 items for the roulette
        const items = [];
        for (let i = 0; i < 50; i++) {
            const randomItem = previewItems[Math.floor(Math.random() * previewItems.length)];
            items.push(randomItem.gift);
        }
        // Force the won item at specific position (e.g., 45th)
        items[45] = res.gift;
        setRouletteItems(items);
        setIsOpening(true);

        setTimeout(() => {
            if (rouletteTrackRef.current) {
                // Width of item (118px) + gap (8px) = 126px
                const itemWidth = 126;
                const offset = 45 * itemWidth - (window.innerWidth / 2) + (itemWidth / 2);
                const randomSmallOffset = Math.random() * 40 - 20;
                rouletteTrackRef.current.style.transform = `translateX(-${offset + randomSmallOffset}px)`;
            }
        }, 50);

        setTimeout(() => {
            setResultData(res);
            setShowResult(true);
            setIsOpening(false);
            if (rouletteTrackRef.current) rouletteTrackRef.current.style.transform = 'translateX(0)';
        }, 5500);
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
                        {resultData.gift?.image_url?.endsWith('.tgs') ? (
                            <TgsAnimation url={resultData.gift.image_url} width={120} height={120} />
                        ) : (
                            <img src={resultData.gift?.image_url || '/assets/images/star.png'} alt={resultData.gift?.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        )}
                        <div className={`item-rarity-badge ${resultData.gift?.rarity || 'common'}`}>{resultData.gift?.rarity?.toUpperCase() || 'COMMON'}</div>
                    </div>
                </div>
                <div className="won-item-details">
                    <div className="item-name">{resultData.gift?.name || 'Приз'}</div>
                    {!resultData.gift?.is_stars && (
                        <div className="item-value">
                            <span>Стоимость:</span>
                            <div className="value-amount">
                                <img src="/assets/images/star.png" className="value-icon" alt="star" />
                                {resultData.gift?.value || 0}
                            </div>
                        </div>
                    )}
                </div>
                <div className="result-actions">
                    {!resultData.gift?.is_stars && (
                        <button className="btn-action btn-sell-result" onClick={sellResult}>
                            Продать за <img src="/assets/images/star.png" className="btn-sell-star-icon" alt="star" /> {resultData.gift?.value || 0}
                        </button>
                    )}
                    <button className="btn-action btn-continue" onClick={() => { setShowResult(false); setShowPreview(false); }}>
                        Продолжить
                    </button>
                </div>
            </div>
        );
    }

    // Opening animation screen
    if (isOpening) {
        return (
            <div className="screen active" style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                height: '100dvh', 
                background: 'radial-gradient(circle at center, #1b1b2f 0%, #0d0d17 100%)', 
                justifyContent: 'center',
                alignItems: 'center'
            }}>
                <div style={{ position: 'absolute', top: '15%', textAlign: 'center' }}>
                    <div className="congrats-text" style={{ fontSize: '24px', opacity: 0.8 }}>УДАЧИ!</div>
                </div>

                <div className="roulette-wrapper" style={{ margin: '40px 0' }}>
                    <div className="roulette-indicator" style={{ height: '180px' }} />
                    <div className="roulette-track-container" style={{ height: '180px', background: 'rgba(0,0,0,0.4)', borderTop: '2px solid rgba(255,255,255,0.05)', borderBottom: '2px solid rgba(255,255,255,0.05)' }}>
                        <div ref={rouletteTrackRef} className="roulette-track" style={{ display: 'flex', gap: '8px', padding: '0 4px', height: '100%', alignItems: 'center', transition: 'transform 5s cubic-bezier(0.1, 0, 0.1, 1)' }}>
                            {rouletteItems.map((item, i) => (
                                <div key={i} className={`roulette-item rarity-${item.rarity || 'common'}`} style={{ 
                                    width: '120px', 
                                    height: '140px', 
                                    flexShrink: 0, 
                                    background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)', 
                                    borderRadius: '16px', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
                                }}>
                                    {item.image_url?.endsWith('.tgs') ? (
                                        <TgsAnimation url={item.image_url} width={90} height={90} />
                                    ) : (
                                        <img src={item.image_url || '/assets/images/star.png'} alt="" style={{ width: '90px', height: '90px', objectFit: 'contain' }} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="opening-status" style={{ textAlign: 'center', marginTop: '20px', color: '#fff', fontSize: '20px', fontWeight: 900, textShadow: '0 0 15px rgba(255,255,255,0.3)' }}>
                    ОТКРЫВАЕМ КЕЙС...
                </div>
                
                <div style={{ position: 'absolute', bottom: '15%', width: '100%', display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: '80%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)' }}></div>
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

                <div className="preview-scrollable" style={{ flex: 1, overflowY: 'auto', paddingBottom: '120px' }}>
                    {/* Рулетка превью (ПОКАЗЫВАЕМ СОДЕРЖИМОЕ) */}
                    <div className="preview-roulette-wrapper">
                        <div className="preview-roulette-track-container">
                            <div className="preview-roulette-track">
                                {[...previewItems, ...previewItems, ...previewItems].map((item, i) => (
                                    <div key={i} className={`preview-roulette-item rarity-${item.gift.rarity || 'common'}`}>
                                        {item.gift.image_url?.endsWith('.tgs') ? (
                                            <TgsAnimation url={item.gift.image_url} width={90} height={90} />
                                        ) : (
                                            <img src={item.gift.image_url || '/assets/images/star.png'} alt="" style={{ width: '90px', height: '90px', objectFit: 'contain' }} />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="preview-roulette-fade preview-roulette-fade-left"></div>
                        <div className="preview-roulette-fade preview-roulette-fade-right"></div>
                    </div>

                    {previewCase.description && (
                        <div className="case-description">{previewCase.description}</div>
                    )}

                    <div className="items-preview-section">
                        <h3>Содержимое кейса</h3>
                        <div className="preview-tiles-grid">
                            {previewItems.map((item, i) => (
                                <div key={i} className={`preview-tile rarity-${item.gift.rarity || 'common'}`}>
                                    <div className="preview-tile-tgs">
                                        {item.gift.image_url?.endsWith('.tgs') ? (
                                            <TgsAnimation url={item.gift.image_url} width={80} height={80} />
                                        ) : (
                                            <img src={item.gift.image_url || '/assets/images/star.png'} alt={item.gift.name}
                                                style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
                                        )}
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

                <div className="open-case-footer" style={{ flexShrink: 0, position: 'relative', zIndex: 10, paddingBottom: 'calc(16px + var(--safe-bottom))' }}>
                    {!previewCase.is_free && (
                        <div className="case-price-display">
                            <img src="/assets/images/star.png" className="price-icon" alt="star" />
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
                {/* МОДАЛКА ПОДТВЕРЖДЕНИЯ */}
                {showConfirm && (
                    <div className="modal active">
                        <div className="modal-overlay" onClick={() => setShowConfirm(false)}></div>
                        <div className="modal-content confirm-modal">
                            <div className="modal-handle"></div>
                            <h3>Подтверждение</h3>
                            <p>Вы уверены, что хотите открыть {previewCase.name}?</p>
                            <div className="modal-actions">
                                <button className="btn-modal btn-cancel" onClick={() => setShowConfirm(false)}>Отмена</button>
                                <button className="btn-modal btn-confirm" onClick={() => { setShowConfirm(false); handleOpenCase(); }}>Открыть</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Cases grid
    return (
        <div className="tab-content active">
            {/* Live History at the top */}
            {history.length > 0 && (
                <div className="live-history-section" style={{ margin: '0 0 16px 0', borderRadius: '0' }}>
                    <div className="live-history-header">
                        <span className="live-history-title">Последние выигрыши</span>
                        <div className="live-indicator"><span className="live-dot"></span><span>LIVE</span></div>
                    </div>
                    <div className="live-history-scroll">
                        {history.map((item) => (
                            <div key={item.id} className={`live-history-card rarity-${item.gift?.rarity || 'common'}`}>
                                {item.gift?.image_url?.endsWith('.tgs') ? (
                                    <TgsAnimation url={item.gift.image_url} width={48} height={48} />
                                ) : (
                                    <img
                                        src={item.gift?.image_url || '/assets/images/star.png'}
                                        style={{ width: '48px', height: '48px', objectFit: 'contain', flexShrink: 0 }}
                                        alt=""
                                    />
                                )}
                                <div className="live-history-card-name">{item.gift?.name || 'Приз'}</div>
                                <div className="live-history-card-user">{item.user?.first_name || '...'}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}


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
                                    <img className="case-image" src={c.image_url || '/assets/images/free-stars-case.png'} alt={c.name} />
                                </div>
                                <div className="case-info">
                                    <div className="case-name">{c.name.replace(/[^\w\s\u0400-\u04FF]/gu, '').trim()}</div>
                                    {c.is_free ? (
                                        <div className="case-price free">Открыть бесплатно</div>
                                    ) : (
                                        <div className="case-price">
                                            <img src="/assets/images/star.png" className="price-star-icon" alt="star" />
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