import { useState, useRef, useEffect } from 'react';
import { useAppStore, useUserStore } from '../store/useStore';
import { startMinesApi, clickMinesApi, collectMinesApi } from '../api/api';

const ICON_DIAMOND = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
<polygon points="2,14 12,4 10,14" fill="#5CE1E6"/>
<polygon points="12,4 20,4 22,14 10,14" fill="#38C6D9"/>
<polygon points="20,4 30,14 22,14" fill="#0BB0B5"/>
<polygon points="2,14 16,29 10,14" fill="#75E8EF"/>
<polygon points="10,14 16,29 22,14" fill="#4AD3E0"/>
<polygon points="22,14 16,29 30,14" fill="#29BDD0"/>
</svg>`;

const ICON_BOMB = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="12" cy="13" r="8" fill="url(#paint0_radial_bomb)"/>
<circle cx="12" cy="13" r="7.5" stroke="#1F2937" stroke-opacity="0.5"/>
<path d="M12 5V2" stroke="#78350F" stroke-width="2" stroke-linecap="round"/>
<path d="M11.5 6.5C11.5 6.5 14.5 5.5 16 7" stroke="#4B5563" stroke-width="1.5" stroke-linecap="round"/>
<path d="M12 0.5L10.5 3L12 4.5L14 3L12 0.5Z" fill="#EF4444"/>
<path d="M12 0.5L11 2.5L12 3.5L13.5 2.5L12 0.5Z" fill="#FCD34D"/>
<defs>
<radialGradient id="paint0_radial_bomb" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(9.5 10.5) rotate(56.3099) scale(9.60469)">
<stop stop-color="#4B5563"/>
<stop offset="1" stop-color="#111827"/>
</radialGradient>
</defs>
</svg>`;

const MINES_COEFS_JS: Record<number, number[]> = {
    1: [1.04, 1.09, 1.14, 1.19, 1.25, 1.32, 1.39, 1.47, 1.56, 1.67, 1.79, 1.92, 2.08, 2.27, 2.50, 2.78, 3.12, 3.57, 4.17, 5.00, 6.25, 8.33, 12.50, 25.00],
    2: [1.09, 1.19, 1.3, 1.43, 1.58, 1.75, 1.96, 2.21, 2.5, 2.86, 3.3, 3.85, 4.55, 5.45, 6.67, 8.33, 10.71, 14.29, 20, 30, 50, 100, 300],
    3: [1.14, 1.3, 1.49, 1.73, 2.02, 2.37, 2.82, 3.38, 4.11, 5.05, 6.32, 8.04, 10.45, 13.94, 19.17, 27.38, 41.07, 65.71, 115, 230, 575, 2300],
    4: [1.19, 1.43, 1.73, 2.11, 2.61, 3.26, 4.13, 5.32, 6.95, 9.27, 12.64, 17.69, 25.56, 38.33, 60.24, 100.4, 180.71, 361.43, 843.33, 2530, 12650],
    5: [1.25, 1.58, 2.02, 2.61, 3.43, 4.57, 6.2, 8.59, 12.16, 17.69, 26.54, 41.28, 67.08, 115, 210.83, 421.67, 948.75, 2530, 8855, 53130],
    6: [1.32, 1.75, 2.37, 3.26, 4.57, 6.53, 9.54, 14.31, 22.12, 35.38, 58.97, 103.21, 191.67, 383.33, 843.33, 2108.33],
    7: [1.39, 1.96, 2.82, 4.13, 6.2, 9.54, 15.1, 24.72, 42.02, 74.7, 140.06, 280.13, 606.94, 1456.67, 4005.83, 13352.78],
    8: [1.47, 2.21, 3.38, 5.32, 8.59, 14.31, 24.72, 44.49, 84.04, 168.08, 360.16, 840.38, 2185, 6555, 24035, 120175, 1081575],
    9: [1.56, 2.5, 4.11, 6.95, 12.16, 22.12, 42.02, 84.04, 178.58, 408.19, 1020.47, 2857.31, 9286.25, 37145, 204297.5, 2042975],
    10: [1.67, 2.86, 5.05, 9.27, 17.69, 35.38, 74.7, 168.08, 408.19, 1088.5, 3265.49, 11429.23, 49526.67, 297160, 3268760],
    11: [1.79, 3.3, 6.32, 12.64, 26.54, 58.97, 140.06, 360.16, 1020.47, 3265.49, 12245.6, 57146.15, 371450, 4457400],
    12: [1.92, 3.85, 8.04, 17.69, 41.28, 103.21, 280.13, 840.38, 2857.31, 11429.23, 57146.15, 400023.08, 5200300],
    13: [2.08, 4.55, 10.45, 25.56, 67.08, 191.67, 606.94, 2185, 9286.25, 49526.67, 371450, 5200300],
    14: [2.27, 5.45, 13.94, 38.33, 115, 383.33, 1456.67, 6555, 37145, 297160, 4457400],
    15: [2.5, 6.67, 19.17, 60.24, 210.83, 843.33, 4005.83, 24035, 204297.5, 3268760],
    16: [2.78, 8.33, 27.38, 100.4, 421.67, 2108.33, 13352.78, 120175, 2042975],
    17: [3.13, 10.71, 41.07, 180.71, 948.75, 6325, 60087.5, 1081575],
    18: [3.57, 14.29, 65.71, 361.43, 2530, 25300, 480700],
    19: [4.17, 20, 115, 843.33, 8855, 177100],
    20: [5, 30, 230, 2530, 53130],
    21: [6.25, 50, 575, 12650],
    22: [8.33, 100, 2300],
    23: [12.5, 300],
    24: [25]
};

export default function MinesScreen() {
    const { setActiveScreen, showToast, setLoaderVisible } = useAppStore();
    const { balance, setBalance } = useUserStore();

    const [bet, setBet] = useState(10);
    const [bombs, setBombs] = useState(3);
    const [gameActive, setGameActive] = useState(false);
    const [isMineClicking, setIsMineClicking] = useState(false);
    const [minesGrid, setMinesGrid] = useState<number[]>([]);
    const [clickedGrid, setClickedGrid] = useState<number[]>([]);
    const [step, setStep] = useState(0);
    const [winAmount, setWinAmount] = useState(0);
    const multipliersRef = useRef<HTMLDivElement>(null);

    // Auto-scroll the active step into view
    useEffect(() => {
        if (!multipliersRef.current) return;
        const activeEl = multipliersRef.current.querySelector('.mult-step.active');
        if (activeEl) {
            activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    }, [step]);

    const telegramId = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;

    const modifyBet = (action: string, val?: number) => {
        if (gameActive) return;
        let current = bet;
        if (action === 'add' && val) current += val;
        if (action === 'mult' && val) current = Math.floor(current * val);
        if (action === 'clear') current = 0;
        if (current < 0) current = 0;
        setBet(current);
        // telegram haptic
        if ((window as any).Telegram?.WebApp?.HapticFeedback) {
            (window as any).Telegram?.WebApp.HapticFeedback.selectionChanged();
        }
    };

    const handleStartMines = async () => {
        if (bet <= 0) return showToast('❌ Введите корректную ставку');
        if (bombs < 1 || bombs > 24) return showToast('❌ Количество мин: от 1 до 24');
        if (bet > balance) return showToast('❌ Недостаточно звезд!');

        setLoaderVisible(true);
        const res = await startMinesApi(telegramId, bet, bombs);
        setLoaderVisible(false);

        if (res.success) {
            setBalance(res.balance);
            setGameActive(true);
            setMinesGrid([]);
            setClickedGrid([]);
            setStep(0);
            setWinAmount(0);
        } else {
            showToast(res.error);
        }
    };

    const handleClickMine = async (index: number) => {
        if (!gameActive || isMineClicking) return;
        if (clickedGrid.includes(index)) return;

        setIsMineClicking(true);
        const res = await clickMinesApi(telegramId, index);
        setIsMineClicking(false);

        if (res.success) {
            if (res.status === 'lose') {
                setGameActive(false);
                setMinesGrid(res.mines);
                setClickedGrid(res.clicked);
                if ((window as any).Telegram?.WebApp?.HapticFeedback) {
                    (window as any).Telegram?.WebApp.HapticFeedback.notificationOccurred('error');
                }
            } else {
                setClickedGrid(prev => [...prev, index]);
                setWinAmount(res.win_amount);
                setStep(res.step);
                if ((window as any).Telegram?.WebApp?.HapticFeedback) {
                    (window as any).Telegram?.WebApp.HapticFeedback.impactOccurred('light');
                }
            }
        } else {
            showToast(res.error);
        }
    };

    const handleCollectMines = async () => {
        if (!gameActive) return;

        setLoaderVisible(true);
        const res = await collectMinesApi(telegramId);
        setLoaderVisible(false);

        if (res.success) {
            setGameActive(false);
            setBalance(res.balance);
            setMinesGrid(res.mines);
            setClickedGrid(res.clicked);
            showToast(`Вы забрали ${res.win_amount} ⭐`);
        } else {
            showToast(res.error);
        }
    };

    return (
        <div className="flex flex-col min-h-screen pb-10 bg-[#13151c] text-white">
            {/* Header */}
            <div className="p-4 flex flex-col items-center justify-center z-10 sticky top-0 relative">
                <button className="absolute left-4 top-4 p-2 rounded-full bg-white/5" onClick={() => setActiveScreen('main-screen')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                </button>
                <div className="flex items-center gap-2">
                    <h2 className="font-bold text-xl tracking-wide">MINES</h2>
                </div>
                <div className="absolute right-4 top-4 flex bg-[#1c1f28] rounded-full px-3 py-1.5 border border-white/5 shadow-sm text-yellow-500 z-20 items-center gap-1 font-bold text-sm">
                    {balance} <img src="/assets/images/star.png" alt="star" className="w-4 h-4"/>
                </div>
            </div>

            <div className="flex-1 px-4 flex flex-col items-center pt-2 overflow-y-auto">
                {/* Control Panel */}
                <div className={`w-full max-w-[400px] flex flex-col gap-2 transition-all duration-300 ${gameActive ? 'opacity-50 pointer-events-none' : ''}`}>
                    
                    <div className="w-full bg-[#1a1d27] mt-2 p-5 rounded-3xl border border-white/5 shrink-0 flex flex-col gap-3">
                        <div className="flex justify-between items-center text-sm text-gray-400 font-bold px-2">
                            <span>Сумма ставки</span>
                            <div className="text-yellow-500 flex items-center gap-1.5">
                                <input type="number" value={bet} onChange={(e) => setBet(Math.max(0, Number(e.target.value)))} className="bg-transparent border-none outline-none text-right text-yellow-500 text-xl w-24 font-black" />
                                <img src="/assets/images/star.png" className="w-5 h-5 object-contain" alt="star" />
                            </div>
                        </div>
                    </div>

                    <div className="w-full flex gap-2 justify-center bg-[#1a1d27] rounded-3xl p-1.5 border border-white/5 shrink-0">
                        <button onClick={() => modifyBet('clear')} className="bg-transparent hover:bg-white/10 active:bg-white/20 text-gray-300 text-sm font-bold py-3 flex-1 rounded-2xl transition-all">Min</button>
                        <button onClick={() => modifyBet('add', 10)} className="bg-transparent hover:bg-white/10 active:bg-white/20 text-gray-300 text-sm font-bold py-3 flex-1 rounded-2xl transition-all">+10</button>
                        <button onClick={() => modifyBet('add', 50)} className="bg-transparent hover:bg-white/10 active:bg-white/20 text-gray-300 text-sm font-bold py-3 flex-1 rounded-2xl transition-all">+50</button>
                        <button onClick={() => modifyBet('mult', 2)} className="bg-transparent hover:bg-white/10 active:bg-white/20 text-gray-300 text-sm font-bold py-3 flex-1 rounded-2xl transition-all">x2</button>
                        <button onClick={() => modifyBet('mult', 0.5)} className="bg-transparent hover:bg-white/10 active:bg-white/20 text-gray-300 text-sm font-bold py-3 flex-1 rounded-2xl transition-all">/2</button>
                    </div>

                    <div className="w-full bg-[#1a1d27] mt-2 p-5 rounded-3xl border border-white/5 shrink-0 flex flex-col gap-3">
                        <div className="flex justify-between items-center text-sm text-gray-400 font-bold px-2">
                            <span>Бомбы</span>
                            <div className="text-white flex items-center gap-1.5">
                                <input type="number" value={bombs} onChange={(e) => setBombs(Math.max(1, Math.min(24, Number(e.target.value))))} className="bg-transparent border-none outline-none text-right text-white text-xl w-20 font-black" />
                            </div>
                        </div>
                    </div>

                    <div className="w-full flex gap-2 justify-center bg-[#1a1d27] rounded-3xl p-1.5 border border-white/5 shrink-0 mt-1">
                        {[3, 5, 10, 24].map((b) => (
                            <button key={b} onClick={() => setBombs(b)} className={`text-sm font-bold py-3 flex-1 rounded-2xl transition-all ${bombs === b ? 'bg-[#2563eb] text-white shadow-[0_4px_12px_rgba(37,99,235,0.4)]' : 'bg-transparent text-gray-300 hover:bg-white/10 active:bg-white/20'}`}>
                                {b}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Multipliers Tape */}
                <div className="w-full max-w-[400px] flex gap-2 overflow-x-auto py-4 scrollbar-none" id="minesMultipliers" ref={multipliersRef} style={{ scrollbarWidth: 'none' }}>
                    {MINES_COEFS_JS[bombs]?.map((coef, index) => (
                        <div key={index} className={`relative shrink-0 border border-white/5 rounded-xl px-3 py-2 min-w-[70px] text-center font-bold text-sm transition-all duration-300 ${index === step ? 'bg-[#2563eb]/20 border-[#2563eb] text-[#3b82f6] shadow-[0_4px_12px_rgba(37,99,235,0.2)] scale-105 z-10' : 'bg-[#1a1d27] text-gray-500'}`}>
                            <div className="absolute -top-2 left-2 px-1 text-[9px] font-semibold text-gray-500 bg-[#13151c] rounded">Шаг {index + 1}</div>
                            x{coef}
                        </div>
                    ))}
                </div>

                {/* Mines Grid */}
                <div className="w-full max-w-[400px] flex justify-center mt-auto mb-auto bg-[#1a1d27] p-2 rounded-3xl border border-white/5">
                    <div className="grid grid-cols-5 gap-1.5 w-full">
                        {Array.from({ length: 25 }).map((_, i) => {
                            const isClicked = clickedGrid.includes(i);
                            const isMineRevealed = minesGrid.includes(i);

                            let cellContent = null;
                            let cellClasses = 'aspect-square bg-[#13151c] rounded-xl border border-white/5 flex items-center justify-center cursor-pointer transition-all shadow-[0_4px_12px_rgba(0,0,0,0.4)] active:scale-95';
                            let cellStyles: React.CSSProperties = {};

                            if (!gameActive && minesGrid.length > 0) {
                                // Game over render state
                                cellClasses += ' pointer-events-none opacity-60';
                                if (isMineRevealed) {
                                    cellContent = <div dangerouslySetInnerHTML={{ __html: ICON_BOMB }} className="w-full h-full flex items-center justify-center p-1.5" />;
                                    if (isClicked) {
                                        cellClasses = 'aspect-square bg-gradient-to-br from-red-500 to-red-700 rounded-xl border border-red-400 flex items-center justify-center transition-all opacity-100 scale-105';
                                    }
                                } else {
                                    cellContent = <div dangerouslySetInnerHTML={{ __html: ICON_DIAMOND }} className="w-full h-full flex items-center justify-center p-1.5" />;
                                    if (isClicked) {
                                        cellClasses = 'aspect-square bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl border border-emerald-400 flex items-center justify-center transition-all opacity-100 scale-105';
                                    } else {
                                        cellStyles.opacity = 0.3;
                                        cellStyles.transform = 'scale(0.85)';
                                    }
                                }
                            } else if (gameActive && isClicked) {
                                // Currently playing, revealed diamond
                                cellClasses = 'aspect-square bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl border border-emerald-400 flex items-center justify-center transition-all opacity-100 shadow-[0_4px_12px_rgba(16,185,129,0.3)] scale-105 pointer-events-none';
                                cellContent = <div dangerouslySetInnerHTML={{ __html: ICON_DIAMOND }} className="w-full h-full flex items-center justify-center p-1.5" />;
                            }

                            return (
                                <div
                                    key={i}
                                    className={cellClasses}
                                    style={cellStyles}
                                    onClick={() => handleClickMine(i)}
                                >
                                    {cellContent}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Action Area */}
                <div className="w-full flex justify-center mt-6">
                    {!gameActive ? (
                        <button onClick={handleStartMines} className="w-full max-w-[400px] shrink-0 bg-[#2563eb] text-white border-none font-bold text-lg py-4 rounded-3xl transition-all active:scale-[0.98] flex items-center justify-center shadow-[0_8px_24px_rgba(37,99,235,0.4)]">
                            {minesGrid.length > 0 ? 'ПОПРОБОВАТЬ СНОВА' : 'ИГРАТЬ'}
                        </button>
                    ) : (
                        <button onClick={handleCollectMines} className="w-full max-w-[400px] shrink-0 bg-[#22c55e] text-white border-none font-bold text-lg py-4 rounded-3xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-[0_8px_24px_rgba(34,197,94,0.4)]">
                            ЗАБРАТЬ: {winAmount || bet} <img src="/assets/images/star.png" style={{ width: '22px', height: '22px' }} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}