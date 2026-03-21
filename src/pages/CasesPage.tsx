import { useState, useEffect, useRef, useCallback, memo } from 'react';
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

type AnimPhase = 'idle' | 'dimming' | 'spinning' | 'done';
type SpinPattern = 'center' | 'undershoot' | 'overshoot' | 'edge' | 'snap';

const ITEM_W   = 120;
const ITEM_GAP = 6;
const ITEM_STEP = ITEM_W + ITEM_GAP;
// Won item is placed at index 46 — enough runway after the track resets
const TARGET_IDX = 46;

// Memoized roulette cell — re-renders only when `item` or `isSpinning` changes.
// Во время спина TGS-анимации паузятся — убирает 60 одновременных RAF loop'ов.
const RouletteCell = memo(function RouletteCell({
    item, itemW, isSpinning,
}: { item: any; itemW: number; isSpinning: boolean }) {
    const isTgs = item?.image_url?.endsWith('.tgs');
    return (
        <div style={{
            width: `${itemW}px`, height: '132px', flexShrink: 0,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.02) 100%)',
            borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(255,255,255,0.08)',
            contain: 'layout style paint',
        }}>
            {isTgs ? (
                <TgsAnimation
                    url={item.image_url}
                    width={88}
                    height={88}
                    loop={!isSpinning}
                    autoplay={!isSpinning}
                    alwaysPlay={false}
                />
            ) : (
                <img src={item?.image_url || '/assets/images/star.png'} alt=""
                    style={{ width: '88px', height: '88px', objectFit: 'contain' }} />
            )}
        </div>
    );
});

export default function CasesPage() {
    const { showToast, setLoaderVisible, setCasePreviewOpen } = useAppStore();
    const { balance, setBalance } = useUserStore();
    const [showConfirm, setShowConfirm] = useState(false);
    const [cases, setCases]   = useState<CaseItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState<HistoryItem[]>([]);

    const [previewCase,  setPreviewCase]  = useState<CaseItem | null>(null);
    const [previewItems, setPreviewItems] = useState<CaseGift[]>([]);
    const [showPreview,  setShowPreview]  = useState(false);

    const [animPhase,     setAnimPhase]     = useState<AnimPhase>('idle');
    // Single roulette item list — pre-built from previewItems, won item slotted in
    const [rouletteItems, setRouletteItems] = useState<any[]>([]);
    const [showResult,    setShowResult]    = useState(false);
    const [resultData,    setResultData]    = useState<any>(null);

    // ref to the roulette track (always rendered inside preview screen)
    const rouletteTrackRef    = useRef<HTMLDivElement>(null);
    // remembers the pixel offset of the roulette wrapper from viewport top (for the "fly to center" trick)
    const rouletteWrapperRef  = useRef<HTMLDivElement>(null);
    const savedTopRef         = useRef<number>(0);
    const spinPatternRef      = useRef<SpinPattern>('center');

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
            // Pre-build a static roulette track from preview items (no won item yet)
            const list: any[] = [];
            const gifts = res.items || [];
            for (let i = 0; i < 60; i++) {
                list.push(gifts[Math.floor(Math.random() * gifts.length)].gift);
            }
            setRouletteItems(list);
            setShowPreview(true);
            setCasePreviewOpen(true);
            setAnimPhase('idle');
        }
    };

    // ── Core spin logic ────────────────────────────────────────────────────────
    const handleOpenCase = async () => {
        if (!previewCase) return;
        if (!previewCase.is_free && balance < previewCase.price) {
            return showToast('❌ Недостаточно звезд!');
        }

        // Save the current top position of the roulette wrapper so we can
        // smoothly translate it to the viewport center without layout jumps.
        if (rouletteWrapperRef.current) {
            const rect = rouletteWrapperRef.current.getBoundingClientRect();
            savedTopRef.current = rect.top;
        }

        // Pick pattern — all 5 equally likely
        const patterns: SpinPattern[] = ['center', 'undershoot', 'overshoot', 'snap', 'edge'];
        const pattern = patterns[Math.floor(Math.random() * patterns.length)];
        spinPatternRef.current = pattern;

        // PHASE 1 — dim, fire API
        setAnimPhase('dimming');
        const resPromise = openCaseApi(previewCase.id, telegramId);

        // Wait for dim + API
        const [res] = await Promise.all([resPromise, new Promise(r => setTimeout(r, 700))]);

        if (!res.success) {
            setAnimPhase('idle');
            return showToast('❌ ' + (res.error || 'Ошибка открытия кейса'));
        }

        setBalance(res.balance);
        setResultData(res);

        // Update the roulette list with the won gift at TARGET_IDX
        // Use a new array built fresh so React always sees a change
        setRouletteItems(prev => {
            const next = [...prev];
            next[TARGET_IDX] = res.gift;
            return next;
        });

        // Wait for React to flush the state update before starting animation
        await new Promise<void>(resolve => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });

        // PHASE 2 — spinning
        setAnimPhase('spinning');

        // Extra delay to ensure React has flushed setRouletteItems AND setAnimPhase
        // before we read the DOM for applySpinTransform
        await new Promise(r => setTimeout(r, 80));

        applySpinTransform(pattern);

        const spinMs: Record<SpinPattern, number> = {
            center:    5200,
            undershoot:5400,
            overshoot: 5600,
            snap:      4600,
            // unused but needed for type
            edge:      5000,
        };

        await new Promise(r => setTimeout(r, spinMs[pattern]));

        setAnimPhase('done');
        setShowResult(true);
    };

    const applySpinTransform = (pattern: SpinPattern) => {
        const track = rouletteTrackRef.current;
        if (!track) return;

        // Base offset: scroll so TARGET_IDX is perfectly centered in viewport.
        // Track starts with padding: ITEM_GAP px on the left.
        // Left edge of cell i  = ITEM_GAP + i * ITEM_STEP
        // Center of cell i     = ITEM_GAP + i * ITEM_STEP + ITEM_W / 2
        // We want that to equal screenCenter, so offset = center_of_cell - screenCenter
        // Use the actual container width, not window.innerWidth.
        // On PC Telegram the window is wider than the app container (max-width: 480px).
        const container = track.parentElement;
        const containerWidth = container ? container.clientWidth : track.getBoundingClientRect().width;
        const screenCenter = containerWidth / 2;
        const cellCenter = ITEM_GAP + TARGET_IDX * ITEM_STEP + ITEM_W / 2;
        const base = cellCenter - screenCenter;

        // ALL patterns center exactly on TARGET_IDX.
        // Drama comes purely from the easing curve, NOT from pixel offset to a different cell.
        // Max jitter is ±(ITEM_W/2 - 4)px so the item stays visibly under the indicator.
        const halfItem = ITEM_W / 2 - 4; // 56px — won't reach neighbour cell edge
        const jitters: Record<SpinPattern, number> = {
            center:     Math.random() * 8 - 4,          // ±4px  — dead center
            undershoot: -(halfItem * 0.85),              // -52px — indicator near left edge of item
            overshoot:   (halfItem * 0.85),              // +52px — indicator near right edge of item
            snap:        Math.random() * 6 - 3,          // ±3px  — snappy center
            edge:       -(halfItem * 0.6),               // -34px — slightly left
        };

        const eases: Record<SpinPattern, string> = {
            center:    'cubic-bezier(0.06, 0.87, 0.13, 1)',
            undershoot:'cubic-bezier(0.06, 0.92, 0.18, 1)',
            overshoot: 'cubic-bezier(0.06, 0.90, 0.16, 1)',
            snap:      'cubic-bezier(0.14, 0.02, 0.06, 1)',
            edge:      'cubic-bezier(0.08, 0.88, 0.15, 1)',
        };

        const durations: Record<SpinPattern, string> = {
            center:    '5s',
            undershoot:'5.2s',
            overshoot: '5.4s',
            snap:      '4.4s',
            edge:      '4.8s',
        };

        // Reset without transition
        track.style.transition = 'none';
        track.style.transform  = 'translate3d(0, 0, 0)';
        track.getBoundingClientRect(); // force reflow

        // Apply spin
        track.style.transition = `transform ${durations[pattern]} ${eases[pattern]}`;
        track.style.transform  = `translate3d(-${base + jitters[pattern]}px, 0, 0)`;
    };

    // ── Sell / close ──────────────────────────────────────────────────────────
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
            closeAll();
        } else {
            showToast('❌ ' + (res.error || 'Ошибка продажи'));
        }
    };

    const closeAll = useCallback(() => {
        setShowResult(false);
        setShowPreview(false);
        setCasePreviewOpen(false);
        setAnimPhase('idle');
        // Reset track position for next open
        if (rouletteTrackRef.current) {
            rouletteTrackRef.current.style.transition = 'none';
            rouletteTrackRef.current.style.transform  = 'translate3d(0, 0, 0)';
        }
    }, [setCasePreviewOpen]);

    // ── RESULT SCREEN ─────────────────────────────────────────────────────────
    if (showResult && resultData) {
        return (
            <div className="result-container">
                <div className="congrats-text">ПОЗДРАВЛЯЕМ!</div>
                <div className="won-item-showcase">
                    <div className="item-glow-effect" />
                    <div className="won-item-card">
                        {resultData.gift?.image_url?.endsWith('.tgs') ? (
                            <TgsAnimation url={resultData.gift.image_url} width={120} height={120} alwaysPlay />
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
                    <button className="btn-action btn-continue" onClick={closeAll}>Продолжить</button>
                </div>
            </div>
        );
    }

    // ── PREVIEW SCREEN ────────────────────────────────────────────────────────
    if (showPreview && previewCase) {
        const isActive = animPhase === 'dimming' || animPhase === 'spinning' || animPhase === 'done';

        // Translate roulette to viewport center when active
        const vh = window.innerHeight;
        const rouletteH = 152;
        const targetTranslateY = isActive
            ? `calc(${vh / 2 - savedTopRef.current - rouletteH / 2}px)`
            : '0px';



        return (
            <div
                id="opening-screen"
                className="screen active"
                style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', position: 'relative' }}
            >
                {/* ── HEADER ── */}
                <div className="preview-header" style={{
                    transition: 'opacity 0.45s',
                    opacity: isActive ? 0 : 1,
                    pointerEvents: isActive ? 'none' : 'auto',
                    flexShrink: 0,
                }}>
                    <button className="btn-back" onClick={() => { setShowPreview(false); setCasePreviewOpen(false); }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M19 12H5M12 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <h2>{previewCase.name}</h2>
                </div>

                {/* ── DIM OVERLAY ── */}
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 10,
                    background: 'rgba(5,5,14,0.92)',
                    opacity: isActive ? 1 : 0,
                    transition: 'opacity 0.45s ease',
                    pointerEvents: isActive ? 'auto' : 'none',
                }} />

                {/* ── ROULETTE WRAPPER ── */}
                <div
                    ref={rouletteWrapperRef}
                    style={{
                        position: 'relative',
                        flexShrink: 0,
                        zIndex: isActive ? 20 : 1,
                        transform: `translateY(${targetTranslateY})`,
                        transition: isActive ? 'transform 0.5s cubic-bezier(0.4,0,0.2,1)' : 'none',
                        willChange: 'transform',
                    }}
                >
                    {/* Gold indicator — only while active */}
                    {isActive && (<>
                        <div style={{
                            position: 'absolute', top: 0, bottom: 0,
                            left: '50%', transform: 'translateX(-50%)',
                            width: '3px',
                            background: 'linear-gradient(to bottom, transparent 0%, var(--gold) 20%, var(--gold) 80%, transparent 100%)',
                            boxShadow: '0 0 10px var(--gold)',
                            zIndex: 6, pointerEvents: 'none',
                        }} />
                        <div style={{
                            position: 'absolute', top: '-1px', left: '50%', transform: 'translateX(-50%)',
                            width: 0, height: 0,
                            borderLeft: '7px solid transparent', borderRight: '7px solid transparent',
                            borderTop: '9px solid var(--gold)', zIndex: 7,
                        }} />
                        <div style={{
                            position: 'absolute', bottom: '-1px', left: '50%', transform: 'translateX(-50%)',
                            width: 0, height: 0,
                            borderLeft: '7px solid transparent', borderRight: '7px solid transparent',
                            borderBottom: '9px solid var(--gold)', zIndex: 7,
                        }} />
                    </>)}

                    {/* Roulette track */}
                    <div style={{
                        overflow: 'hidden',
                        height: isActive ? '152px' : '148px',
                        background: isActive ? 'rgba(0,0,0,0.55)' : '#0c0d12',
                        borderTop: `1px solid ${isActive ? 'rgba(255,255,255,0.07)' : 'var(--border)'}`,
                        borderBottom: `1px solid ${isActive ? 'rgba(255,255,255,0.07)' : 'var(--border)'}`,
                        transition: 'height 0.3s, background 0.4s',
                        position: 'relative',
                    }}>
                        <div
                            ref={rouletteTrackRef}
                            style={{
                                display: 'flex', alignItems: 'center', height: '100%',
                                gap: `${ITEM_GAP}px`, padding: `0 ${ITEM_GAP}px`,
                                willChange: 'transform',
                            }}
                        >
                            {rouletteItems.map((item, i) => (
                                <RouletteCell key={i} item={item} itemW={ITEM_W} isSpinning={animPhase === 'spinning'} />
                            ))}
                        </div>
                        <div style={{
                            position: 'absolute', top: 0, bottom: 0, left: 0, width: '70px', zIndex: 3, pointerEvents: 'none',
                            background: `linear-gradient(to right, ${isActive ? 'rgba(5,5,14,0.9)' : '#0c0d12'}, transparent)`,
                            transition: 'background 0.4s',
                        }} />
                        <div style={{
                            position: 'absolute', top: 0, bottom: 0, right: 0, width: '70px', zIndex: 3, pointerEvents: 'none',
                            background: `linear-gradient(to left, ${isActive ? 'rgba(5,5,14,0.9)' : '#0c0d12'}, transparent)`,
                            transition: 'background 0.4s',
                        }} />
                    </div>
                </div>

                {/* ── STATUS LABEL — right under roulette, always takes space ── */}
                <div style={{
                    flexShrink: 0,
                    textAlign: 'center',
                    padding: '10px 16px',
                    minHeight: '38px',
                    position: 'relative',
                    zIndex: isActive ? 20 : 1,
                    transition: 'opacity 0.3s',
                }}>
                    {animPhase === 'spinning' && (
                        <span style={{
                            color: 'rgba(255,255,255,0.55)', fontSize: '13px',
                            fontWeight: 700, fontFamily: "'Exo 2', sans-serif",
                            letterSpacing: '2px', textTransform: 'uppercase',
                        }}>
                            ОТКРЫВАЕМ...
                        </span>
                    )}
                </div>

                {/* ── OPEN BUTTON — right under roulette+label ── */}
                <div style={{
                    flexShrink: 0,
                    padding: '0 16px',
                    position: 'relative',
                    zIndex: isActive ? 20 : 1,
                    opacity: isActive ? 0 : 1,
                    transition: 'opacity 0.4s',
                    pointerEvents: isActive ? 'none' : 'auto',
                }}>
                    <button
                        className={`btn-open-case ${previewCase.is_free ? 'free' : ''}`}
                        onClick={handleOpenCase}
                        disabled={isActive}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                        {previewCase.is_free
                            ? 'Открыть бесплатно'
                            : <>Открыть за&nbsp;<img src="/assets/images/star.png" style={{ width: '18px', height: '18px', verticalAlign: 'middle', position: 'relative', top: '-1px' }} alt="star" />&nbsp;{previewCase.price}</>
                        }
                    </button>
                </div>

                {/* ── SCROLLABLE CONTENT — items list ── */}
                <div className="preview-scrollable" style={{
                    flex: 1, overflowY: 'auto', paddingBottom: '16px',
                    opacity: isActive ? 0 : 1,
                    transition: 'opacity 0.4s',
                    pointerEvents: isActive ? 'none' : 'auto',
                    marginTop: '12px',
                }}>
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

    // ── CASES GRID ────────────────────────────────────────────────────────────
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
                    <div className="flex items-center justify-center py-20"><div className="loader-spinner" /></div>
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
