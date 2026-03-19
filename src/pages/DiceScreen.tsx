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
        <div className="flex flex-col min-h-screen bg-[var(--bg)]">
            {/* Header */}
            <div className="preview-header">
                <button className="btn-back" onClick={() => setActiveScreen('main-screen')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                </button>
                <h2>Дайс</h2>
                <div className="mines-balance-badge">
                    <img src="/assets/images/star.png" alt="star" />
                    <span>{balance}</span>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 p-4 flex flex-col gap-4">
                {/* Result Box */}
                <div className="dice-result-box">
                    <div className={`dice-result-number ${resultStatus === 'win' ? 'win' : resultStatus === 'lose' ? 'lose' : ''}`}>
                        {resultNumber}
                    </div>
                    <div
                        className={`dice-result-label ${resultStatus !== 'idle' ? 'big-result' : ''}`}
                        style={{ color: resultStatus === 'win' ? 'var(--green)' : resultStatus === 'lose' ? '#ef4444' : 'var(--txt3)' }}
                    >
                        {resultLabel}
                        {resultStatus !== 'idle' && (
                            <img src="/assets/images/star.png" style={{ width: '20px', height: '20px', verticalAlign: 'middle', position: 'relative', top: '-2px', marginLeft: '4px' }} />
                        )}
                    </div>
                </div>

                {/* Controls */}
                <div className="mines-controls-panel" style={{ marginBottom: 0 }}>
                    <div className="control-group">
                        <label>Сумма ставки</label>
                        <div className="input-with-icon">
                            <input type="number" value={bet} onChange={(e) => setBet(Math.max(1, Number(e.target.value)))} />
                            <img src="/assets/images/star.png" alt="star" />
                        </div>
                        <div className="quick-buttons">
                            <button onClick={() => modifyBet('add', 10)}>+10</button>
                            <button onClick={() => modifyBet('add', 100)}>+100</button>
                            <button onClick={() => modifyBet('mult', 2)}>x2</button>
                            <button onClick={() => modifyBet('mult', 0.5)}>/2</button>
                            <button onClick={() => modifyBet('clear')}>Min</button>
                        </div>
                    </div>

                    <div className="control-group">
                        <label>Шанс выигрыша (%)</label>
                        <div className="input-with-icon">
                            <input
                                type="number"
                                value={chance}
                                min={1}
                                max={95}
                                onChange={(e) => setDiceChance(Number(e.target.value))}
                            />
                            <span style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', fontFamily: "'Exo 2', sans-serif", fontWeight: 800, color: 'var(--txt3)' }}>%</span>
                        </div>
                        <div className="quick-buttons">
                            {[10, 33, 50, 80, 95].map(v => (
                                <button key={v} onClick={() => setDiceChance(v)}>{v}%</button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Множитель + Выигрыш + кнопки — всё вместе внизу */}
                <div className="flex flex-col gap-3 mt-auto">
                    <div className="dice-info-row">
                        <div className="dice-info-box">
                            <span>Множитель</span>
                            <div>{multiplier.toFixed(2)}x</div>
                        </div>
                        <div className="dice-info-box">
                            <span>Выигрыш</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <span>{possibleWin}</span>
                                <img src="/assets/images/star.png" style={{ width: '18px', height: '18px', verticalAlign: 'middle', position: 'relative', top: '-1px' }} />
                            </div>
                        </div>
                    </div>

                    <div className="dice-actions">
                        <button className="btn-dice btn-dice-under" onClick={() => playDice('under')} disabled={isRolling}>
                            <div className="dice-btn-title">МЕНЬШЕ</div>
                            <div className="dice-btn-range">0 - <span>{underMax}</span></div>
                        </button>
                        <button className="btn-dice btn-dice-over" onClick={() => playDice('over')} disabled={isRolling}>
                            <div className="dice-btn-title">БОЛЬШЕ</div>
                            <div className="dice-btn-range"><span>{overMin}</span> - 999999</div>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
