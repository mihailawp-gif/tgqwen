import { useState, useRef, useCallback, useMemo } from 'react';
import { useAppStore, useUserStore } from '../store/useStore';
import { playDiceApi } from '../api/api';

export default function DiceScreen() {
    const { setActiveScreen, showToast } = useAppStore();
    const { balance, setBalance } = useUserStore();

    const [bet, setBet] = useState(10);
    const [chance, setChance] = useState(80);
    const [isRolling, setIsRolling] = useState(false);
    const [resultNumber, setResultNumber] = useState('000000');
    const [resultLabel, setResultLabel] = useState('Сделайте ставку');
    const [resultStatus, setResultStatus] = useState<'idle' | 'win' | 'lose'>('idle');
    const rollIntervalRef = useRef<number | null>(null);

    const telegramId = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;

    const clampedChance = Math.max(1, Math.min(95, chance));
    const multiplier = useMemo(() => (99 / clampedChance), [clampedChance]);
    const possibleWin = useMemo(() => Math.floor(bet * multiplier), [bet, multiplier]);
    const underMax = useMemo(() => (clampedChance * 10000) - 1, [clampedChance]);
    const overMin = useMemo(() => 1000000 - (clampedChance * 10000), [clampedChance]);

    const modifyBet = useCallback((action: string, val?: number) => {
        if (isRolling) return;
        setBet(prev => {
            let current = prev;
            if (action === 'add' && val) current += val;
            if (action === 'mult' && val) current = Math.floor(current * val);
            if (action === 'clear') current = 1;
            if (current < 1) current = 1;
            return current;
        });
    }, [isRolling]);

    const setDiceChance = useCallback((val: number) => {
        if (isRolling) return;
        setChance(Math.max(1, Math.min(95, val)));
    }, [isRolling]);

    const playDice = useCallback(async (type: 'under' | 'over') => {
        if (isRolling) return;
        if (bet < 1) return showToast('❌ Неверная ставка');
        if (clampedChance < 1 || clampedChance > 95) {
            setChance(95);
            return showToast('❌ Шанс от 1% до 95%');
        }
        if (bet > balance) return showToast('❌ Недостаточно звезд');

        setIsRolling(true);
        setResultStatus('idle');
        setResultLabel('Бросаем кости...');

        rollIntervalRef.current = window.setInterval(() => {
            setResultNumber(String(Math.floor(Math.random() * 999999)).padStart(6, '0'));
        }, 40);

        const res = await playDiceApi(telegramId, bet, clampedChance, type);

        if (rollIntervalRef.current) {
            clearInterval(rollIntervalRef.current);
            rollIntervalRef.current = null;
        }
        setIsRolling(false);

        if (res.success) {
            setResultNumber(String(res.result).padStart(6, '0'));
            setBalance(res.balance);
            if (res.is_win) {
                setResultStatus('win');
                setResultLabel(`ВЫИГРЫШ +${res.win_amount}`);
                if ((window as any).Telegram?.WebApp?.HapticFeedback) {
                    (window as any).Telegram.WebApp.HapticFeedback.notificationOccurred('success');
                }
            } else {
                setResultStatus('lose');
                setResultLabel(`ПРОИГРЫШ -${bet}`);
                if ((window as any).Telegram?.WebApp?.HapticFeedback) {
                    (window as any).Telegram.WebApp.HapticFeedback.notificationOccurred('error');
                }
            }
        } else {
            setResultNumber('000000');
            setResultStatus('idle');
            setResultLabel('Сделайте ставку');
            showToast(res.error);
        }
    }, [isRolling, bet, clampedChance, balance, telegramId, showToast, setBalance]);

    return (
        <div className="flex flex-col min-h-screen bg-[#13151c] text-white">
            {/* Header */}
            <div className="p-4 flex flex-col items-center justify-center z-10 sticky top-0 relative">
                <button className="absolute left-4 top-4 p-2 rounded-full bg-white/5" onClick={() => setActiveScreen('main-screen')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                </button>
                <div className="flex items-center gap-2">
                    <h2 className="font-bold text-xl tracking-wide">Дайс</h2>
                </div>
                <div className="absolute right-4 top-4 flex bg-[#1c1f28] rounded-full px-3 py-1.5 border border-white/5 shadow-sm text-yellow-500 z-20 items-center gap-1 font-bold text-sm">
                    {balance} <img src="/assets/images/star.png" alt="star" className="w-4 h-4"/>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 px-4 pb-10 flex flex-col items-center gap-4 overflow-y-auto">
                {/* Result Box */}
                <div className="w-full max-w-[400px] flex flex-col items-center mt-2 mb-4">
                    <div className={`text-5xl font-black tracking-widest ${resultStatus === 'win' ? 'text-green-500 drop-shadow-[0_0_15px_rgba(34,197,94,0.5)]' : resultStatus === 'lose' ? 'text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'text-gray-300'} pb-2`}>
                        {resultNumber}
                    </div>
                    <div
                        className={`text-sm font-bold flex items-center gap-1 ${resultStatus !== 'idle' ? 'text-lg' : ''}`}
                        style={{ color: resultStatus === 'win' ? '#22c55e' : resultStatus === 'lose' ? '#ef4444' : '#6b7280' }}
                    >
                        {resultLabel}
                        {resultStatus !== 'idle' && (
                            <img src="/assets/images/star.png" className="w-5 h-5 flex-shrink-0" />
                        )}
                    </div>
                </div>

                {/* Controls */}
                <div className="w-full max-w-[400px] flex gap-2 justify-center bg-[#1a1d27] rounded-3xl p-1.5 border border-white/5 shrink-0">
                    <button onClick={() => modifyBet('clear')} className="bg-transparent hover:bg-white/10 active:bg-white/20 text-gray-300 text-sm font-bold py-3 flex-1 rounded-2xl transition-all">Min</button>
                    <button onClick={() => modifyBet('add', 10)} className="bg-transparent hover:bg-white/10 active:bg-white/20 text-gray-300 text-sm font-bold py-3 flex-1 rounded-2xl transition-all">+10</button>
                    <button onClick={() => modifyBet('add', 100)} className="bg-transparent hover:bg-white/10 active:bg-white/20 text-gray-300 text-sm font-bold py-3 flex-1 rounded-2xl transition-all">+100</button>
                    <button onClick={() => modifyBet('mult', 2)} className="bg-transparent hover:bg-white/10 active:bg-white/20 text-gray-300 text-sm font-bold py-3 flex-1 rounded-2xl transition-all">x2</button>
                    <button onClick={() => modifyBet('mult', 0.5)} className="bg-transparent hover:bg-white/10 active:bg-white/20 text-gray-300 text-sm font-bold py-3 flex-1 rounded-2xl transition-all">/2</button>
                </div>

                <div className="w-full max-w-[400px] bg-[#1a1d27] mt-2 p-5 rounded-3xl border border-white/5 shrink-0 flex flex-col gap-3">
                    <div className="flex justify-between items-center text-sm text-gray-400 font-bold px-2">
                        <span>Сумма ставки</span>
                        <div className="text-yellow-500 flex items-center gap-1.5">
                            <input type="number" value={bet} onChange={(e) => setBet(Math.max(1, Number(e.target.value)))} className="bg-transparent border-none outline-none text-right text-yellow-500 text-xl w-24 font-black" />
                            <img src="/assets/images/star.png" className="w-5 h-5 object-contain" alt="star" />
                        </div>
                    </div>
                </div>

                <div className="w-full max-w-[400px] bg-[#1a1d27] mt-2 p-5 rounded-3xl border border-white/5 shrink-0 flex flex-col gap-3">
                    <div className="flex justify-between items-center text-sm text-gray-400 font-bold px-2">
                        <span>Шанс выигрыша (%)</span>
                        <div className="text-white flex items-center gap-1.5">
                            <input type="number" value={chance} min={1} max={95} onChange={(e) => setDiceChance(Number(e.target.value))} className="bg-transparent border-none outline-none text-right text-white text-xl w-20 font-black" />
                            <span className="font-black text-xl">%</span>
                        </div>
                    </div>
                </div>

                <div className="w-full max-w-[400px] flex gap-2 justify-center bg-[#1a1d27] rounded-3xl p-1.5 border border-white/5 shrink-0 mt-2">
                    {[10, 33, 50, 80, 95].map(v => (
                        <button key={v} onClick={() => setDiceChance(v)} className="bg-transparent hover:bg-white/10 active:bg-white/20 text-gray-300 text-sm font-bold py-3 flex-1 rounded-2xl transition-all">{v}%</button>
                    ))}
                </div>

                {/* Info Boxes */}
                <div className="w-full max-w-[400px] flex gap-4 mt-6 h-28 shrink-0">
                    <div className="flex-1 bg-[#1a1d27] border border-white/5 rounded-3xl flex flex-col items-center justify-center p-4">
                        <span className="text-xs text-gray-400 font-bold text-center leading-tight mb-2">Множитель</span>
                        <div className="text-white font-black text-xl">{multiplier.toFixed(2)}x</div>
                    </div>
                    <div className="flex-1 bg-[#1a1d27] border border-white/5 rounded-3xl flex flex-col items-center justify-center p-4">
                        <span className="text-xs text-gray-400 font-bold text-center leading-tight mb-2">Выигрыш</span>
                        <div className="flex items-center gap-1 justify-center">
                            <span className="text-yellow-500 font-black text-xl">{possibleWin}</span>
                            <img src="/assets/images/star.png" className="w-5 h-5 object-contain" alt="star" />
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex w-full max-w-[400px] gap-4 mt-6 shrink-0">
                    <button
                        onClick={() => playDice('under')}
                        disabled={isRolling}
                        className="flex-1 bg-[#2563eb] text-white border-none font-bold text-lg py-4 rounded-3xl transition-all active:scale-[0.98] disabled:opacity-50 flex flex-col items-center justify-center shadow-[0_8px_24px_rgba(37,99,235,0.4)]"
                    >
                        <span>МЕНЬШЕ</span>
                        <span className="text-xs font-medium opacity-80 mt-1">0 - {underMax}</span>
                    </button>
                    <button
                        onClick={() => playDice('over')}
                        disabled={isRolling}
                        className="flex-1 bg-[#2563eb] text-white border-none font-bold text-lg py-4 rounded-3xl transition-all active:scale-[0.98] disabled:opacity-50 flex flex-col items-center justify-center shadow-[0_8px_24px_rgba(37,99,235,0.4)]"
                    >
                        <span>БОЛЬШЕ</span>
                        <span className="text-xs font-medium opacity-80 mt-1">{overMin} - 999999</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
