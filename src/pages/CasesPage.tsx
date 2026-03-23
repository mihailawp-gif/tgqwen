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

const ITEM_W = 120;
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
    const [cases, setCases] = useState<CaseItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState<HistoryItem[]>([]);

    const [previewCase, setPreviewCase] = useState<CaseItem | null>(null);
    const [previewItems, setPreviewItems] = useState<CaseGift[]>([]);
    const [showPreview, setShowPreview] = useState(false);

    const [animPhase, setAnimPhase] = useState<AnimPhase>('idle');
    // Single roulette item list — pre-built from previewItems, won item slotted in
    const [rouletteItems, setRouletteItems] = useState<any[]>([]);
    const [showResult, setShowResult] = useState(false);
    const [resultData, setResultData] = useState<any>(null);

    // ref to the roulette track (always rendered inside preview screen)
    const rouletteTrackRef = useRef<HTMLDivElement>(null);
    // remembers the pixel offset of the roulette wrapper from viewport top (for the "fly to center" trick)
    const rouletteWrapperRef = useRef<HTMLDivElement>(null);
    const savedTopRef = useRef<number>(0);
    const spinPatternRef = useRef<SpinPattern>('center');

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
        // setLoaderVisible(true);
        const res = await fetchCaseItemsApi(caseItem.id);
        // setLoaderVisible(false);
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
            center: 5200,
            undershoot: 5400,
            overshoot: 5600,
            snap: 4600,
            // unused but needed for type
            edge: 5000,
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
            center: Math.random() * 8 - 4,          // ±4px  — dead center
            undershoot: -(halfItem * 0.85),              // -52px — indicator near left edge of item
            overshoot: (halfItem * 0.85),              // +52px — indicator near right edge of item
            snap: Math.random() * 6 - 3,          // ±3px  — snappy center
            edge: -(halfItem * 0.6),               // -34px — slightly left
        };

        const eases: Record<SpinPattern, string> = {
            center: 'cubic-bezier(0.06, 0.87, 0.13, 1)',
            undershoot: 'cubic-bezier(0.06, 0.92, 0.18, 1)',
            overshoot: 'cubic-bezier(0.06, 0.90, 0.16, 1)',
            snap: 'cubic-bezier(0.14, 0.02, 0.06, 1)',
            edge: 'cubic-bezier(0.08, 0.88, 0.15, 1)',
        };

        const durations: Record<SpinPattern, string> = {
            center: '5s',
            undershoot: '5.2s',
            overshoot: '5.4s',
            snap: '4.4s',
            edge: '4.8s',
        };

        // Reset without transition
        track.style.transition = 'none';
        track.style.transform = 'translateX(0)';
        track.getBoundingClientRect(); // force reflow

        // Apply spin
        track.style.transition = `transform ${durations[pattern]} ${eases[pattern]}`;
        track.style.transform = `translateX(-${base + jitters[pattern]}px)`;
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
            rouletteTrackRef.current.style.transform = 'translateX(0)';
        }
    }, [setCasePreviewOpen]);

    // ── RESULT SCREEN ─────────────────────────────────────────────────────────
    if (showResult && resultData) {
        return (
            <div className="fixed inset-0 bg-[#0c0d12]/95 backdrop-blur-md text-white flex flex-col items-center justify-center z-[100] px-4">
                <div className="text-3xl font-black text-[#2563eb] tracking-widest mb-10 drop-shadow-[0_0_20px_rgba(37,99,235,0.4)]">ВЫИГРЫШ!</div>

                <div className="w-full max-w-[320px] bg-[#1a1d27] rounded-[3rem] p-8 border border-white/10 flex flex-col items-center shadow-[0_20px_60px_rgba(37,99,235,0.2)] relative">
                    <div className="absolute -inset-1 bg-gradient-to-b from-[#2563eb]/20 to-transparent rounded-[3rem] blur-xl -z-10"></div>
                    <div className="w-32 h-32 flex items-center justify-center mb-6 relative">
                        <div className="absolute inset-0 bg-[#3b82f6]/20 rounded-full blur-2xl animate-pulse"></div>
                        {resultData.gift?.image_url?.endsWith('.tgs') ? (
                            <TgsAnimation url={resultData.gift.image_url} width={128} height={128} alwaysPlay />
                        ) : (
                            <img src={resultData.gift?.image_url || '/assets/images/star.png'} alt={resultData.gift?.name} className="w-full h-full object-contain relative z-10 drop-shadow-[0_0_25px_rgba(255,255,255,0.2)]" />
                        )}
                    </div>

                    <div className="text-xl font-bold text-center">{resultData.gift?.name || 'Приз'}</div>

                    {!resultData.gift?.is_stars && (
                        <div className="flex items-center gap-1.5 text-yellow-500 font-black text-xl mt-3">
                            {resultData.gift?.value || 0}
                            <img src="/assets/images/star.png" className="w-6 h-6 object-contain" alt="star" />
                        </div>
                    )}
                </div>

                <div className="w-full max-w-[320px] flex flex-col gap-3 mt-8">
                    {!resultData.gift?.is_stars && (
                        <button className="w-full bg-[#2563eb] text-white border-none font-bold text-lg py-4 rounded-3xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-[0_8px_24px_rgba(37,99,235,0.4)]" onClick={sellResult}>
                            ПРОДАТЬ ЗА {resultData.gift?.value || 0} <img src="/assets/images/star.png" className="w-5 h-5" alt="star" />
                        </button>
                    )}
                    <button className="w-full bg-[#1a1d27] text-white border border-white/10 font-bold text-lg py-4 rounded-3xl transition-all active:scale-[0.98]" onClick={closeAll}>
                        ЗАБРАТЬ
                    </button>
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
                style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', position: 'relative', background: '#13151c', color: 'white' }}
            >
                {/* ── HEADER ── */}
                <div className="p-4 flex flex-col items-center justify-center z-20 sticky top-0 relative shrink-0" style={{
                    transition: 'opacity 0.45s',
                    opacity: isActive ? 0 : 1,
                    pointerEvents: isActive ? 'none' : 'auto',
                }}>
                    <button className="absolute left-4 top-4 p-2 rounded-full bg-white/5" onClick={() => { setShowPreview(false); setCasePreviewOpen(false); }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M19 12H5M12 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div className="flex items-center gap-2">
                        <h2 className="font-bold text-xl tracking-wide">{previewCase.name}</h2>
                    </div>
                    <div className="absolute right-4 top-4 flex bg-[#1c1f28] rounded-full px-3 py-1.5 border border-white/5 shadow-sm text-yellow-500 z-20 items-center gap-1 font-bold text-sm">
                        {balance} <img src="/assets/images/star.png" alt="star" className="w-4 h-4" />
                    </div>
                </div>

                {/* ── DIM OVERLAY ── */}
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 10,
                    background: 'rgba(19,21,28,0.92)',
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
                            background: 'linear-gradient(to bottom, transparent 0%, #3b82f6 20%, #3b82f6 80%, transparent 100%)',
                            boxShadow: '0 0 15px rgba(59,130,246,0.6)',
                            zIndex: 6, pointerEvents: 'none',
                        }} />
                        <div style={{
                            position: 'absolute', top: '-1px', left: '50%', transform: 'translateX(-50%)',
                            width: 0, height: 0,
                            borderLeft: '7px solid transparent', borderRight: '7px solid transparent',
                            borderTop: '9px solid #3b82f6', zIndex: 7,
                        }} />
                        <div style={{
                            position: 'absolute', bottom: '-1px', left: '50%', transform: 'translateX(-50%)',
                            width: 0, height: 0,
                            borderLeft: '7px solid transparent', borderRight: '7px solid transparent',
                            borderBottom: '9px solid #3b82f6', zIndex: 7,
                        }} />
                    </>)}

                    {/* Roulette track */}
                    <div style={{
                        overflow: 'hidden',
                        height: isActive ? '152px' : '148px',
                        background: isActive ? 'rgba(0,0,0,0.55)' : '#13151c',
                        borderTop: `1px solid rgba(255,255,255,0.05)`,
                        borderBottom: `1px solid rgba(255,255,255,0.05)`,
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
                            background: `linear-gradient(to right, ${isActive ? 'rgba(19,21,28,0.9)' : '#13151c'}, transparent)`,
                            transition: 'background 0.4s',
                        }} />
                        <div style={{
                            position: 'absolute', top: 0, bottom: 0, right: 0, width: '70px', zIndex: 3, pointerEvents: 'none',
                            background: `linear-gradient(to left, ${isActive ? 'rgba(19,21,28,0.9)' : '#13151c'}, transparent)`,
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
                }} className="w-full max-w-[400px] mx-auto flex flex-col items-center">
                    <button
                        className="w-full shrink-0 bg-[#2563eb] text-white border-none font-bold text-lg py-4 rounded-3xl mt-2 transition-all active:scale-[0.98] flex items-center justify-center shadow-[0_8px_24px_rgba(37,99,235,0.4)] disabled:opacity-50"
                        onClick={handleOpenCase}
                        disabled={isActive}
                    >
                        {previewCase.is_free
                            ? 'ОТКРЫТЬ БЕСПЛАТНО'
                            : <div className="flex items-center gap-1.5 uppercase font-black">ОТКРЫТЬ ЗА <img src="/assets/images/star.png" className="w-5 h-5 mx-0.5" /> {previewCase.price}</div>
                        }
                    </button>
                </div>

                {/* ── SCROLLABLE CONTENT — items list ── */}
                <div style={{
                    flex: 1, overflowY: 'auto', paddingBottom: '32px',
                    opacity: isActive ? 0 : 1,
                    transition: 'opacity 0.4s',
                    pointerEvents: isActive ? 'none' : 'auto',
                    marginTop: '24px',
                    width: '100%',
                    paddingLeft: '16px',
                    paddingRight: '16px',
                }}>
                    <div className="w-full max-w-[400px] mx-auto bg-[#1a1d27] p-5 rounded-3xl border border-white/5 flex flex-col gap-3">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-bold text-gray-400 px-2 uppercase tracking-widest">Содержимое кейса</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {previewItems.map((item, i) => (
                                <div key={i} className="bg-[#13151c] rounded-2xl p-3 border border-white/5 flex flex-col items-center justify-center relative overflow-hidden group">
                                    <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <div className="aspect-square w-12 h-12 flex items-center justify-center mb-1 z-10 transition-transform group-hover:scale-110">
                                        {item.gift.image_url?.endsWith('.tgs') ? (
                                            <TgsAnimation url={item.gift.image_url} width={48} height={48} />
                                        ) : (
                                            <img src={item.gift.image_url || '/assets/images/star.png'} alt={item.gift.name} style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
                                        )}
                                    </div>
                                    <div className="text-[10px] font-bold text-center text-gray-300 z-10 w-full whitespace-nowrap overflow-hidden text-ellipsis">{item.gift.name}</div>
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
        <div className="flex flex-col min-h-screen bg-[#13151c] text-white pb-24">
            {history.length > 0 && (
                <div className="w-full bg-[#1a1d27] p-4 border-b border-white/5 mb-4">
                    <div className="flex items-center justify-between mx-auto max-w-[400px] mb-3">
                        <span className="font-bold text-sm text-gray-400 uppercase tracking-widest">Последние выигрыши</span>
                        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /><span className="text-red-500 text-xs font-black tracking-widest">LIVE</span></div>
                    </div>
                    <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1 mx-auto max-w-[400px]" style={{ scrollbarWidth: 'none' }}>
                        {history.map((item, index) => (
                            <div key={index} className="relative flex-shrink-0 bg-[#13151c] rounded-2xl p-2 border border-white/5 flex flex-col items-center w-24">
                                <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent rounded-2xl"></div>
                                <div className="aspect-square flex items-center justify-center mb-1 z-10 w-12 h-12">
                                    {item.gift?.image_url?.endsWith('.tgs') ? (
                                        <TgsAnimation url={item.gift.image_url} width={48} height={48} />
                                    ) : (
                                        <img src={item.gift?.image_url || '/assets/images/star.png'} style={{ maxWidth: '48px', maxHeight: '48px', objectFit: 'contain' }} alt="" />
                                    )}
                                </div>
                                <div className="text-[10px] font-bold text-gray-300 z-10 w-full whitespace-nowrap overflow-hidden text-ellipsis text-center">{item.gift?.name || 'Приз'}</div>
                                <div className="text-[9px] font-black text-[#2563eb] mt-0.5 z-10 w-full whitespace-nowrap overflow-hidden text-ellipsis text-center">{item.user?.first_name || '...'}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <div className="px-4 w-full flex flex-col items-center">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-8 h-8 rounded-full border-4 border-white/10 border-t-[#2563eb] animate-spin"></div>
                    </div>
                ) : cases.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                        <div className="text-4xl mb-4 opacity-50">📦</div>
                        <div className="font-bold tracking-wide">Пока нет доступных кейсов</div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4 w-full max-w-[400px]">
                        {cases.map(c => (
                            <div key={c.id} className="bg-[#1a1d27] rounded-[2rem] p-4 border border-white/5 flex flex-col items-center justify-center relative cursor-pointer hover:bg-white/5 active:scale-95 transition-all shadow-[0_4px_20px_rgba(0,0,0,0.2)] group" onClick={() => openPreview(c)}>
                                <div className="aspect-square w-full mb-2 flex items-center justify-center relative">
                                    <div className="absolute inset-0 bg-[#2563eb]/5 rounded-full blur-xl group-hover:bg-[#2563eb]/10 transition-colors"></div>
                                    <img className="max-w-[100px] max-h-[100px] object-contain relative z-10 drop-shadow-[0_0_15px_rgba(255,255,255,0.05)] group-hover:drop-shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all group-hover:scale-105" src={c.image_url || '/assets/images/free-stars-case.png'} alt={c.name} />
                                </div>
                                <div className="font-bold text-sm text-center leading-tight tracking-wide z-10 text-white truncate w-full px-1">{c.name.replace(/[^\w\s\u0400-\u04FF]/gu, '').trim()}</div>
                                {c.is_free ? (
                                    <div className="text-[#3b82f6] text-[10px] font-black mt-2 uppercase tracking-widest bg-[#2563eb]/10 px-3 py-1.5 rounded-full w-full text-center">БЕСПЛАТНО</div>
                                ) : (
                                    <div className="flex items-center justify-center gap-1.5 mt-2 bg-yellow-500/10 text-yellow-500 font-black text-xs px-3 py-1.5 rounded-full border border-yellow-500/20 w-full">
                                        <img src="/assets/images/star.png" className="w-4 h-4" alt="star" />
                                        {c.price}
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
