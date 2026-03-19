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

type AnimPhase = 'idle' | 'dimming' | 'spinning' | 'done';
type SpinPattern = 'center' | 'undershoot' | 'overshoot' | 'edge' | 'snap';

const ITEM_W   = 120;
const ITEM_GAP = 6;
const ITEM_STEP = ITEM_W + ITEM_GAP;
// Won item is placed at index 46 — enough runway after the track resets
const TARGET_IDX = 46;

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

        // Pick pattern
        const patterns: SpinPattern[] = ['center', 'center', 'center', 'undershoot', 'overshoot', 'snap'];
        const pattern = patterns[Math.floor(Math.random() * patterns.length)];

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

        // Slot the real won gift into TARGET_IDX.
        // All patterns stop the VISUAL center of the roulette exactly on this slot
        // (with a tiny sub-item random jitter for "center", ±few px).
        // For undershoot / overshoot we just adjust the jitter, NOT which index is centered.
        const updatedList = [...rouletteItems];
        updatedList[TARGET_IDX] = res.gift;
        setRouletteItems(updatedList);

        // PHASE 2 — spinning (roulette already in DOM, just add the transition)
        setAnimPhase('spinning');

        // One RAF to let React flush the list update
        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => requestAnimationFrame(r));

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
        const screenCenter = window.innerWidth / 2;
        const cellCenter = ITEM_GAP + TARGET_IDX * ITEM_STEP + ITEM_W / 2;
        const base = cellCenter - screenCenter;

        // Pattern jitters — all land on the SAME item (TARGET_IDX),
        // just with slightly different pixel precision for drama.
        // This way the visual "winner" is always exactly res.gift.
        const jitters: Record<SpinPattern, number> = {
            center:    Math.random() * 6 - 3,       // ±3 px  — perfectly centered
            undershoot:-(ITEM_W * 0.42),             // stop ~half item before center
            overshoot:  (ITEM_W * 0.44),             // stop ~half item after center
            snap:       Math.random() * 4 - 2,       // quick snap, near-center
            edge:       -(ITEM_W * 0.3),
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
        track.style.transform  = 'translateX(0)';
        track.getBoundingClientRect(); // force reflow

        // Apply spin
        track.style.transition = `transform ${durations[pattern]} ${eases[pattern]}`;
        track.style.transform  = `translateX(-${base + jitters[pattern]}px)`;
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
            rouletteTrackRef.current.style.transform  = 'translateX(0)';
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
                    <button className="btn-action btn-continue" onClick={closeAll}>Продолжить</button>
                </div>
            </div>
        );
    }

    // ── PREVIEW SCREEN ────────────────────────────────────────────────────────
    if (showPreview && previewCase) {
        const isActive = animPhase === 'dimming' || animPhase === 'spinning' || animPhase === 'done';

        // How far the roulette wrapper needs to translate to reach vertical center
        const vh = window.innerHeight;
        const rouletteH = 152; // height of the spinning strip
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

                {/* ── ROULETTE WRAPPER — always in the document, translates to center ── */}
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
                    {/* Gold indicator lines — only visible while spinning */}
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

                    {/* The one shared roulette track — pre-loaded images, no re-mount */}
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
                                        background: 'linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.02) 100%)',
                                        borderRadius: '14px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                    }}
                                >
                                    {item?.image_url?.endsWith('.tgs') ? (
                                        <TgsAnimation url={item.image_url} width={88} height={88} />
                                    ) : (
                                        <img
                                            src={item?.image_url || '/assets/images/star.png'}
                                            alt=""
                                            style={{ width: '88px', height: '88px', objectFit: 'contain' }}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Fade edges — always shown */}
                        <div style={{
                            position: 'absolute', top: 0, bottom: 0, left: 0, width: '70px',
                            background: `linear-gradient(to right, ${isActive ? 'rgba(5,5,14,0.9)' : '#0c0d12'}, transparent)`,
                            zIndex: 3, pointerEvents: 'none', transition: 'background 0.4s',
                        }} />
                        <div style={{
                            position: 'absolute', top: 0, bottom: 0, right: 0, width: '70px',
                            background: `linear-gradient(to left, ${isActive ? 'rgba(5,5,14,0.9)' : '#0c0d12'}, transparent)`,
                            zIndex: 3, pointerEvents: 'none', transition: 'background 0.4s',
                        }} />
                    </div>

                    {/* "Spinning" label shown only when spinning — outside wrapper to not affect height */}
                </div>
                {animPhase === 'spinning' && (
                    <div style={{
                        textAlign: 'center', padding: '12px 0',
                        color: 'rgba(255,255,255,0.5)', fontSize: '13px',
                        fontWeight: 700, fontFamily: "'Exo 2', sans-serif",
                        letterSpacing: '2px', textTransform: 'uppercase',
                        position: 'relative', zIndex: 20,
                        flexShrink: 0,
                    }}>
                        ОТКРЫВАЕМ...
                    </div>
                )}

                {/* ── SCROLLABLE CONTENT ── */}
                <div className="preview-scrollable" style={{
                    flex: 1, overflowY: 'auto', paddingBottom: '16px',
                    opacity: isActive ? 0 : 1,
                    transition: 'opacity 0.4s',
                    pointerEvents: isActive ? 'none' : 'auto',
                }}>
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

                {/* ── FOOTER with price ON the button ── */}
                <div className="open-case-footer" style={{
                    flexShrink: 0, position: 'relative', zIndex: 10,
                    paddingBottom: 'calc(16px + var(--safe-bottom))',
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
                            : <>
                                Открыть за&nbsp;
                                <img src="/assets/images/star.png" style={{ width: '18px', height: '18px', verticalAlign: 'middle', position: 'relative', top: '-1px' }} alt="star" />
                                &nbsp;{previewCase.price}
                              </>
                        }
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
