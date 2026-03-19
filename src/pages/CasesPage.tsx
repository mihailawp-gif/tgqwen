import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore, useUserStore } from '../store/useStore';
import { fetchCasesApi, fetchCaseItemsApi, openCaseApi, fetchHistoryApi } from '../api/api';
import TgsAnimation from '../components/TgsAnimation';

interface HistoryItem {
    id: number;
    gift?: { name: string; rarity?: string; image_url?: string; };
    user?: { first_name?: string; };
}
interface CaseItem {
    id: number; name: string; price: number; is_free: boolean;
    image_url?: string; description?: string;
}
interface CaseGift {
    gift: {
        id: number; name: string; gift_number: number;
        rarity?: string; value?: number; image_url?: string; is_stars?: boolean;
    };
    drop_chance: number;
}

// Animation phases
type AnimPhase = 'idle' | 'dimming' | 'spinning' | 'result';

// Spin patterns — each returns a final CSS transform for the track
type SpinPattern = 'center' | 'undershoot' | 'overshoot' | 'edge' | 'snap';

export default function CasesPage() {
    const { showToast, setLoaderVisible, setCasePreviewOpen } = useAppStore();
    const { balance, setBalance } = useUserStore();
    const [showConfirm, setShowConfirm] = useState(false);
    const [cases, setCases] = useState<CaseItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState<HistoryItem[]>([]);

    const [previewCase, setPreviewCase] = useState<CaseItem | null>(null);
    const [previewItems, setPreviewItems] = useState<CaseGift[]>([]);
    const [showPreview, setShowPreview] = useState(false);

    // New animation state
    const [animPhase, setAnimPhase] = useState<AnimPhase>('idle');
    const [rouletteItems, setRouletteItems] = useState<any[]>([]);
    const [spinPattern, setSpinPattern] = useState<SpinPattern>('center');
    const [wonItemIndex, setWonItemIndex] = useState(45);

    const [showResult, setShowResult] = useState(false);
    const [resultData, setResultData] = useState<any>(null);

    const rouletteTrackRef = useRef<HTMLDivElement>(null);
    const previewRouletteRef = useRef<HTMLDivElement>(null);
    const previewWrapperRef = useRef<HTMLDivElement>(null);
    const telegramId = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;

    // Item dimensions
    const ITEM_W = 120;
    const ITEM_GAP = 6;
    const ITEM_STEP = ITEM_W + ITEM_GAP;

    useEffect(() => {
        loadCases();
        loadHistory();
        const interval = setInterval(loadHistory, 5000);
        return () => clearInterval(interval);
    }, []);

    const loadCases = async () => {
        setLoading(true);
        const res = await fetchCasesApi();
        if (res.success) setCases(res.cases || []);
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
            setCasePreviewOpen(true);
            setAnimPhase('idle');
        }
    };

    // Build roulette items list, placing won gift at target index
    const buildRouletteItems = useCallback((wonGift: any, items: CaseGift[], targetIdx: number) => {
        const list: any[] = [];
        for (let i = 0; i < 60; i++) {
            const r = items[Math.floor(Math.random() * items.length)];
            list.push(r.gift);
        }
        list[targetIdx] = wonGift;
        return list;
    }, []);

    const handleOpenCase = async () => {
        if (!previewCase) return;
        if (!previewCase.is_free && balance < previewCase.price) {
            return showToast('❌ Недостаточно звезд!');
        }

        // Pick random spin pattern
        const patterns: SpinPattern[] = ['center', 'center', 'undershoot', 'overshoot', 'edge', 'snap'];
        const pattern = patterns[Math.floor(Math.random() * patterns.length)];
        setSpinPattern(pattern);

        // Target item position: ~45 out of 60 gives enough runway
        const TARGET_IDX = 45;
        setWonItemIndex(TARGET_IDX);

        // PHASE 1: dim everything — start API call simultaneously
        setAnimPhase('dimming');
        const resPromise = openCaseApi(previewCase.id, telegramId);

        // After 600ms dimming, move to spinning
        await new Promise(r => setTimeout(r, 600));

        const res = await resPromise;
        if (!res.success) {
            setAnimPhase('idle');
            return showToast('❌ ' + (res.error || 'Ошибка открытия кейса'));
        }

        setBalance(res.balance);

        // Build roulette with the real won item
        const items = buildRouletteItems(res.gift, previewItems, TARGET_IDX);
        setRouletteItems(items);
        setResultData(res);
        setAnimPhase('spinning');

        // Wait a tick for DOM to render, then apply transform
        await new Promise(r => setTimeout(r, 60));

        applySpinTransform(pattern, TARGET_IDX);

        // PATTERN-specific total durations
        const durations: Record<SpinPattern, number> = {
            center: 5200,
            undershoot: 5500,
            overshoot: 5800,
            edge: 5000,
            snap: 4800,
        };

        await new Promise(r => setTimeout(r, durations[pattern]));

        // PHASE 3: show result
        setAnimPhase('result');
        setShowResult(true);
    };

    const getBaseOffset = (targetIdx: number) => {
        const screenCenter = window.innerWidth / 2;
        return targetIdx * ITEM_STEP - screenCenter + ITEM_W / 2;
    };

    const applySpinTransform = (pattern: SpinPattern, targetIdx: number) => {
        const track = rouletteTrackRef.current;
        if (!track) return;

        const base = getBaseOffset(targetIdx);

        // Remove transition first to reset
        track.style.transition = 'none';
        track.style.transform = 'translateX(0)';

        // Force reflow
        track.getBoundingClientRect();

        const eases: Record<SpinPattern, string> = {
            center:    'cubic-bezier(0.08, 0.82, 0.17, 1)',
            undershoot:'cubic-bezier(0.06, 0.9, 0.2, 1)',
            overshoot: 'cubic-bezier(0.05, 0.85, 0.15, 1)',
            edge:      'cubic-bezier(0.1, 0.8, 0.12, 1)',
            snap:      'cubic-bezier(0.12, 0, 0.08, 1)',
        };

        // Offset tweaks per pattern
        let finalOffset = base;
        if (pattern === 'center') {
            // Land exactly in the center ± tiny random
            finalOffset = base + (Math.random() * 10 - 5);
        } else if (pattern === 'undershoot') {
            // Stop ~half an item short — looks like "almost!"
            finalOffset = base - ITEM_W * 0.55;
        } else if (pattern === 'overshoot') {
            // Go past center by about half an item
            finalOffset = base + ITEM_W * 0.52;
        } else if (pattern === 'edge') {
            // Stop so item is near the edge of the indicator
            finalOffset = base - ITEM_W * 0.38;
        } else if (pattern === 'snap') {
            // Rush, then snap hard onto center
            finalOffset = base + (Math.random() * 6 - 3);
        }

        const durations: Record<SpinPattern, string> = {
            center:    '5s',
            undershoot:'5.2s',
            overshoot: '5.5s',
            edge:      '4.8s',
            snap:      '4.5s',
        };

        track.style.transition = `transform ${durations[pattern]} ${eases[pattern]}`;
        track.style.transform = `translateX(-${finalOffset}px)`;
    };

    const sellResult = async () => {
        if (!resultData) return;
        setLoaderVisible(true);
        const res = await (await import('../api/api')).api.post('/sell', {
            opening_id: resultData.opening_id, user_id: telegramId
        }) as any;
        setLoaderVisible(false);
        if (res.success) {
            setBalance(res.new_balance);
            showToast(`Продано за ${resultData.gift?.value || 0} ⭐`);
            setShowResult(false);
            setShowPreview(false);
            setCasePreviewOpen(false);
            setAnimPhase('idle');
        } else {
            showToast('❌ ' + (res.error || 'Ошибка продажи'));
        }
    };

    const closeResult = () => {
        setShowResult(false);
        setShowPreview(false);
        setCasePreviewOpen(false);
        setAnimPhase('idle');
    };

    // ── RESULT SCREEN ──────────────────────────────────────────────────────────
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
                            <img src={resultData.gift?.image_url || '/assets/images/star.png'} alt={resultData.gift?.name}
                                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        )}
                        <div className={`item-rarity-badge ${resultData.gift?.rarity || 'common'}`}>
                            {resultData.gift?.rarity?.toUpperCase() || 'COMMON'}
                        </div>
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
                    <button className="btn-action btn-continue" onClick={closeResult}>
                        Продолжить
                    </button>
                </div>
            </div>
        );
    }

    // ── PREVIEW SCREEN ─────────────────────────────────────────────────────────
    if (showPreview && previewCase) {
        const isDimming  = animPhase === 'dimming';
        const isSpinning = animPhase === 'spinning';
        const isActive   = isDimming || isSpinning;

        return (
            <div
                id="opening-screen"
                className="screen active"
                style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', position: 'relative' }}
            >
                {/* ── HEADER ── */}
                <div className="preview-header" style={{
                    transition: 'opacity 0.5s',
                    opacity: isActive ? 0 : 1,
                    pointerEvents: isActive ? 'none' : 'auto',
                }}>
                    <button className="btn-back" onClick={() => { setShowPreview(false); setCasePreviewOpen(false); }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M19 12H5M12 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <h2>{previewCase.name}</h2>
                </div>

                {/* ── FULL-SCREEN DIM OVERLAY when spinning ── */}
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 10,
                    background: 'rgba(5,5,12,0.88)',
                    opacity: isActive ? 1 : 0,
                    transition: 'opacity 0.5s ease',
                    pointerEvents: isActive ? 'auto' : 'none',
                }} />

                {/* ── ROULETTE (always mounted, animates to center when active) ── */}
                <div
                    ref={previewWrapperRef}
                    style={{
                        position: isActive ? 'absolute' : 'relative',
                        top: isActive ? '50%' : undefined,
                        left: isActive ? 0 : undefined,
                        right: isActive ? 0 : undefined,
                        transform: isActive ? 'translateY(-50%)' : 'none',
                        zIndex: isActive ? 20 : 1,
                        transition: 'top 0.5s cubic-bezier(0.4,0,0.2,1), transform 0.5s cubic-bezier(0.4,0,0.2,1)',
                        width: '100%',
                    }}
                >
                    {/* Preview static roulette (shown when idle/dimming) */}
                    {!isSpinning && (
                        <div className="preview-roulette-wrapper" ref={previewRouletteRef}>
                            <div className="preview-roulette-track-container">
                                <div className="preview-roulette-track">
                                    {[...previewItems, ...previewItems, ...previewItems].map((item, i) => (
                                        <div key={i} className={`preview-roulette-item rarity-${item.gift.rarity || 'common'}`}>
                                            {item.gift.image_url?.endsWith('.tgs') ? (
                                                <TgsAnimation url={item.gift.image_url} width={90} height={90} />
                                            ) : (
                                                <img src={item.gift.image_url || '/assets/images/star.png'} alt=""
                                                    style={{ width: '90px', height: '90px', objectFit: 'contain' }} />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="preview-roulette-fade preview-roulette-fade-left" />
                            <div className="preview-roulette-fade preview-roulette-fade-right" />
                        </div>
                    )}

                    {/* Spinning roulette (shown when spinning) */}
                    {isSpinning && (
                        <div style={{ position: 'relative', width: '100%' }}>
                            {/* Gold indicator */}
                            <div style={{
                                position: 'absolute', top: 0, bottom: 0,
                                left: '50%', transform: 'translateX(-50%)',
                                width: '3px',
                                background: 'var(--gold)',
                                boxShadow: '0 0 12px var(--gold)',
                                zIndex: 6, pointerEvents: 'none',
                            }} />
                            {/* Top arrow */}
                            <div style={{
                                position: 'absolute', top: 0, left: '50%',
                                transform: 'translateX(-50%)',
                                width: 0, height: 0,
                                borderLeft: '7px solid transparent',
                                borderRight: '7px solid transparent',
                                borderTop: '9px solid var(--gold)',
                                zIndex: 7, pointerEvents: 'none',
                            }} />
                            {/* Bottom arrow */}
                            <div style={{
                                position: 'absolute', bottom: 0, left: '50%',
                                transform: 'translateX(-50%)',
                                width: 0, height: 0,
                                borderLeft: '7px solid transparent',
                                borderRight: '7px solid transparent',
                                borderBottom: '9px solid var(--gold)',
                                zIndex: 7, pointerEvents: 'none',
                            }} />

                            <div style={{
                                overflow: 'hidden', height: '152px',
                                background: 'rgba(0,0,0,0.5)',
                                borderTop: '1px solid rgba(255,255,255,0.06)',
                                borderBottom: '1px solid rgba(255,255,255,0.06)',
                            }}>
                                <div
                                    ref={rouletteTrackRef}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        height: '100%',
                                        gap: `${ITEM_GAP}px`,
                                        padding: `0 ${ITEM_GAP}px`,
                                        willChange: 'transform',
                                    }}
                                >
                                    {rouletteItems.map((item, i) => (
                                        <div
                                            key={i}
                                            style={{
                                                width: `${ITEM_W}px`,
                                                height: '132px',
                                                flexShrink: 0,
                                                background: i === wonItemIndex
                                                    ? 'linear-gradient(180deg, rgba(245,158,11,0.15) 0%, rgba(245,158,11,0.05) 100%)'
                                                    : 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
                                                borderRadius: '14px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                border: `1px solid ${i === wonItemIndex ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.08)'}`,
                                                boxShadow: i === wonItemIndex ? '0 0 16px rgba(245,158,11,0.25)' : 'none',
                                            }}
                                        >
                                            {item.image_url?.endsWith('.tgs') ? (
                                                <TgsAnimation url={item.image_url} width={86} height={86} />
                                            ) : (
                                                <img src={item.image_url || '/assets/images/star.png'} alt=""
                                                    style={{ width: '86px', height: '86px', objectFit: 'contain' }} />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Fade edges */}
                            <div style={{
                                position: 'absolute', top: 0, bottom: 0, left: 0, width: '80px', zIndex: 2, pointerEvents: 'none',
                                background: 'linear-gradient(to right, rgba(5,5,12,0.9), transparent)',
                            }} />
                            <div style={{
                                position: 'absolute', top: 0, bottom: 0, right: 0, width: '80px', zIndex: 2, pointerEvents: 'none',
                                background: 'linear-gradient(to left, rgba(5,5,12,0.9), transparent)',
                            }} />

                            {/* Spinning label */}
                            <div style={{
                                textAlign: 'center', marginTop: '20px',
                                color: '#fff', fontSize: '16px', fontWeight: 900,
                                fontFamily: "'Exo 2', sans-serif",
                                letterSpacing: '2px', textTransform: 'uppercase',
                                opacity: 0.7,
                            }}>
                                {spinPattern === 'snap' ? 'БЫСТРОЕ ОТКРЫТИЕ!' : 'ОТКРЫВАЕМ...'}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── SCROLLABLE CONTENT (dims and disappears) ── */}
                <div className="preview-scrollable" style={{
                    flex: 1, overflowY: 'auto', paddingBottom: '16px',
                    transition: 'opacity 0.4s',
                    opacity: isActive ? 0 : 1,
                    pointerEvents: isActive ? 'none' : 'auto',
                }}>
                    {/* spacer since roulette is in separate container */}
                    <div style={{ height: '8px' }} />

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

                {/* ── FOOTER ── */}
                <div className="open-case-footer" style={{
                    flexShrink: 0, position: 'relative', zIndex: 10,
                    paddingBottom: 'calc(16px + var(--safe-bottom))',
                    transition: 'opacity 0.4s',
                    opacity: isActive ? 0 : 1,
                    pointerEvents: isActive ? 'none' : 'auto',
                }}>
                    {!previewCase.is_free && (
                        <div className="case-price-display">
                            <img src="/assets/images/star.png" className="price-icon" alt="star" />
                            <span>{previewCase.price}</span>
                        </div>
                    )}
                    <button
                        className={`btn-open-case ${previewCase.is_free ? 'free' : ''}`}
                        onClick={handleOpenCase}
                        disabled={isActive}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                        {previewCase.is_free ? 'Открыть бесплатно' : 'Открыть кейс'}
                    </button>
                </div>

                {showConfirm && (
                    <div className="modal active">
                        <div className="modal-overlay" onClick={() => setShowConfirm(false)} />
                        <div className="modal-content confirm-modal">
                            <div className="modal-handle" />
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

    // ── CASES GRID ─────────────────────────────────────────────────────────────
    return (
        <div className="tab-content active">
            {history.length > 0 && (
                <div className="live-history-section" style={{ margin: '0 0 16px 0', borderRadius: '0' }}>
                    <div className="live-history-header">
                        <span className="live-history-title">Последние выигрыши</span>
                        <div className="live-indicator"><span className="live-dot" /><span>LIVE</span></div>
                    </div>
                    <div className="live-history-scroll">
                        {history.map((item) => (
                            <div key={item.id} className={`live-history-card rarity-${item.gift?.rarity || 'common'}`}>
                                {item.gift?.image_url?.endsWith('.tgs') ? (
                                    <TgsAnimation url={item.gift.image_url} width={48} height={48} />
                                ) : (
                                    <img src={item.gift?.image_url || '/assets/images/star.png'}
                                        style={{ width: '48px', height: '48px', objectFit: 'contain', flexShrink: 0 }} alt="" />
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
