import { useState, useRef } from 'react';
import { useAppStore, useUserStore } from '../store/useStore';
import { playPlinkoApi } from '../api/api';

const PLINKO_COEFS: Record<string, Record<number, number[]>> = {
    'low': {
        8: [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
        9: [5.6, 2.0, 1.6, 1.0, 0.7, 0.7, 1.0, 1.6, 2.0, 5.6],
        10: [8.9, 3.0, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 3.0, 8.9],
        11: [8.4, 3.0, 1.9, 1.3, 1.0, 0.7, 0.7, 1.0, 1.3, 1.9, 3.0, 8.4],
        12: [10.0, 3.0, 1.6, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 1.6, 3.0, 10.0],
        13: [8.1, 4.0, 3.0, 1.9, 1.2, 0.9, 0.7, 0.7, 0.9, 1.2, 1.9, 3.0, 4.0, 8.1],
        14: [7.1, 4.0, 1.9, 1.4, 1.3, 1.1, 1.0, 0.5, 1.0, 1.1, 1.3, 1.4, 1.9, 4.0, 7.1],
        15: [15.0, 8.0, 3.0, 2.0, 1.5, 1.1, 1.0, 0.7, 0.7, 1.0, 1.1, 1.5, 2.0, 3.0, 8.0, 15.0],
        16: [16.0, 9.0, 2.0, 1.4, 1.4, 1.2, 1.1, 1.0, 0.5, 1.0, 1.1, 1.2, 1.4, 1.4, 2.0, 9.0, 16.0]
    },
    'medium': {
        8: [13.0, 3.0, 1.3, 0.7, 0.4, 0.7, 1.3, 3.0, 13.0],
        9: [18.0, 4.0, 1.7, 0.9, 0.5, 0.5, 0.9, 1.7, 4.0, 18.0],
        10: [22.0, 5.0, 2.0, 1.4, 0.6, 0.4, 0.6, 1.4, 2.0, 5.0, 22.0],
        11: [24.0, 6.0, 3.0, 1.8, 0.7, 0.5, 0.5, 0.7, 1.8, 3.0, 6.0, 24.0],
        12: [33.0, 11.0, 4.0, 2.0, 1.1, 0.6, 0.3, 0.6, 1.1, 2.0, 4.0, 11.0, 33.0],
        13: [43.0, 13.0, 6.0, 3.0, 1.3, 0.7, 0.4, 0.4, 0.7, 1.3, 3.0, 6.0, 13.0, 43.0],
        14: [58.0, 15.0, 7.0, 4.0, 1.9, 1.0, 0.5, 0.2, 0.5, 1.0, 1.9, 4.0, 7.0, 15.0, 58.0],
        15: [88.0, 18.0, 11.0, 5.0, 3.0, 1.3, 0.5, 0.3, 0.3, 0.5, 1.3, 3.0, 5.0, 11.0, 18.0, 88.0],
        16: [110.0, 41.0, 10.0, 5.0, 3.0, 1.5, 1.0, 0.5, 0.3, 0.5, 1.0, 1.5, 3.0, 5.0, 10.0, 41.0, 110.0]
    },
    'high': {
        8: [29.0, 4.0, 1.5, 0.3, 0.2, 0.3, 1.5, 4.0, 29.0],
        9: [43.0, 7.0, 2.0, 0.6, 0.2, 0.2, 0.6, 2.0, 7.0, 43.0],
        10: [76.0, 10.0, 3.0, 0.9, 0.3, 0.2, 0.3, 0.9, 3.0, 10.0, 76.0],
        11: [120.0, 14.0, 5.2, 1.4, 0.4, 0.2, 0.2, 0.4, 1.4, 5.2, 14.0, 120.0],
        12: [170.0, 24.0, 8.1, 2.0, 0.7, 0.2, 0.2, 0.2, 0.7, 2.0, 8.1, 24.0, 170.0],
        13: [260.0, 37.0, 11.0, 4.0, 1.0, 0.2, 0.2, 0.2, 0.2, 1.0, 4.0, 11.0, 37.0, 260.0],
        14: [420.0, 56.0, 18.0, 5.0, 1.9, 0.3, 0.2, 0.2, 0.2, 0.3, 1.9, 5.0, 18.0, 56.0, 420.0],
        15: [620.0, 83.0, 27.0, 8.0, 3.0, 0.5, 0.2, 0.2, 0.2, 0.2, 0.5, 3.0, 8.0, 27.0, 83.0, 620.0],
        16: [1000.0, 130.0, 26.0, 9.0, 4.0, 2.0, 0.2, 0.2, 0.2, 0.2, 0.2, 2.0, 4.0, 9.0, 26.0, 130.0, 1000.0]
    }
};

export default function PlinkoScreen() {
    const { setActiveScreen, showToast } = useAppStore();
    const { balance, setBalance } = useUserStore();

    const [bet, setBet] = useState(10);
    const [difficulty, setDifficulty] = useState<'low' | 'medium' | 'high'>('low');
    const [pins, setPins] = useState(8);
    const [activeBalls, setActiveBalls] = useState(0);
    const [lastResult, setLastResult] = useState<{ bucket: number; multiplier: number } | null>(null);

    const pinsContainerRef = useRef<HTMLDivElement>(null);
    const bucketsContainerRef = useRef<HTMLDivElement>(null);

    const telegramId = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;

    const currentMultipliers = PLINKO_COEFS[difficulty]?.[pins] || [];

    const modifyBet = (action: string, val?: number) => {
        if (activeBalls > 0) return;
        setBet(prev => {
            let current = prev;
            if (action === 'add' && val) current += val;
            if (action === 'mult' && val) current = Math.floor(current * val);
            if (action === 'clear') current = 1;
            if (current < 1) current = 1;
            return current;
        });
    };

    const handlePlay = async () => {
        if (bet < 1) return showToast('❌ Введите ставку');
        if (bet > balance) return showToast('❌ Недостаточно звезд');

        setBalance(balance - bet);
        setActiveBalls(prev => prev + 1);

        const res = await playPlinkoApi(telegramId, bet, difficulty, pins);

        if (res.success) {
            setLastResult({ bucket: res.bucket, multiplier: res.multiplier });
            // Animate ball drop with a timeout to simulate the physics
            setTimeout(() => {
                setBalance(res.balance);
                setActiveBalls(prev => {
                    const next = prev - 1;
                    return Math.max(0, next);
                });
                if (res.multiplier >= 2) {
                    showToast(`🎉 x${res.multiplier}! Вы выиграли ${Math.floor(bet * res.multiplier)} ⭐`);
                    if ((window as any).Telegram?.WebApp?.HapticFeedback) {
                        (window as any).Telegram.WebApp.HapticFeedback.notificationOccurred('success');
                    }
                }
            }, 2000);
        } else {
            showToast(res.error);
            setBalance(balance); // Revert
            setActiveBalls(prev => Math.max(0, prev - 1));
        }
    };

    const controlsDisabled = activeBalls > 0;

    return (
        <div className="flex flex-col min-h-screen bg-[var(--bg)]">
            {/* Header */}
            <div className="preview-header">
                <button className="btn-back" onClick={() => setActiveScreen('main-screen')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                </button>
                <h2>PLINKO</h2>
                <div className="mines-balance-badge">
                    <img src="/static/images/star.png" alt="⭐" />
                    <span>{balance}</span>
                </div>
            </div>

            <div className="flex-1 p-4 flex flex-col gap-3 overflow-y-auto">
                {/* Controls */}
                <div style={{ opacity: controlsDisabled ? 0.5 : 1, pointerEvents: controlsDisabled ? 'none' : 'auto', transition: 'all 0.3s ease' }}>
                    <div className="mines-controls-panel">
                        <div className="control-group">
                            <label>Ставка</label>
                            <div className="input-with-icon">
                                <input type="number" value={bet} onChange={(e) => setBet(Math.max(1, Number(e.target.value)))} />
                                <img src="/static/images/star.png" alt="star" />
                            </div>
                            <div className="quick-buttons">
                                <button onClick={() => modifyBet('add', 10)}>+10</button>
                                <button onClick={() => modifyBet('add', 50)}>+50</button>
                                <button onClick={() => modifyBet('mult', 2)}>X2</button>
                                <button onClick={() => modifyBet('mult', 0.5)}>/2</button>
                                <button onClick={() => modifyBet('clear')}>MIN</button>
                            </div>
                        </div>

                        <div className="control-group">
                            <label>Сложность</label>
                            <div className="quick-buttons diff-buttons">
                                {(['low', 'medium', 'high'] as const).map(d => (
                                    <button key={d} className={difficulty === d ? 'active' : ''} onClick={() => setDifficulty(d)}>
                                        {d === 'low' ? 'Низкая' : d === 'medium' ? 'Средняя' : 'Высокая'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="control-group">
                            <label>Количество рядов</label>
                            <div className="quick-buttons pins-buttons">
                                {[8, 10, 12, 14, 16].map(p => (
                                    <button key={p} className={pins === p ? 'active' : ''} onClick={() => setPins(p)}>
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Plinko Board (simplified visual) */}
                <div ref={pinsContainerRef} className="flex-1 flex flex-col items-center justify-center gap-2 min-h-[200px] relative"
                    style={{ background: 'radial-gradient(circle at center, rgba(139, 92, 246, 0.08) 0%, transparent 70%)', borderRadius: '24px', padding: '16px' }}>
                    {/* Pin rows */}
                    {Array.from({ length: pins }).map((_, row) => (
                        <div key={row} className="flex gap-1 justify-center" style={{ width: '100%' }}>
                            {Array.from({ length: row + 3 }).map((_, col) => (
                                <div key={col} className="rounded-full"
                                    style={{
                                        width: Math.max(4, 10 - pins * 0.3) + 'px',
                                        height: Math.max(4, 10 - pins * 0.3) + 'px',
                                        background: 'rgba(255, 255, 255, 0.3)',
                                        boxShadow: '0 0 4px rgba(255,255,255,0.15)',
                                        flexShrink: 0,
                                    }}
                                />
                            ))}
                        </div>
                    ))}

                    {/* Last result indicator */}
                    {lastResult && (
                        <div className="absolute top-2 right-2 px-3 py-1 rounded-full text-sm font-bold"
                            style={{
                                background: lastResult.multiplier >= 2 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                color: lastResult.multiplier >= 2 ? 'var(--green)' : 'var(--txt2)',
                                border: `1px solid ${lastResult.multiplier >= 2 ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
                                fontFamily: "'Exo 2', sans-serif",
                            }}>
                            x{lastResult.multiplier}
                        </div>
                    )}
                </div>

                {/* Multiplier Buckets */}
                <div ref={bucketsContainerRef} className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                    {currentMultipliers.map((m, i) => {
                        const isHighlight = lastResult && lastResult.bucket === i;
                        const isHigh = m >= 5;
                        const isMed = m >= 2;
                        return (
                            <div key={i} className="flex-shrink-0 text-center rounded-lg px-1 py-2"
                                style={{
                                    minWidth: `${Math.max(100 / (currentMultipliers.length + 1), 5)}%`,
                                    fontSize: '10px',
                                    fontWeight: 800,
                                    fontFamily: "'Exo 2', sans-serif",
                                    background: isHighlight ? (isHigh ? 'rgba(245,158,11,0.3)' : 'rgba(59,130,246,0.2)') : 'rgba(255,255,255,0.03)',
                                    color: isHigh ? '#f59e0b' : isMed ? 'var(--blue)' : 'var(--txt3)',
                                    border: isHighlight ? '1px solid rgba(245,158,11,0.5)' : '1px solid var(--border)',
                                    transition: 'all 0.3s',
                                    transform: isHighlight ? 'scale(1.1)' : undefined,
                                }}>
                                {m}x
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Play button */}
            <div className="open-case-footer">
                <button className="btn-open-case w-full" onClick={handlePlay}>
                    {activeBalls > 0 ? `Шариков в полете: ${activeBalls}` : 'Бросить шарик'}
                </button>
            </div>
        </div>
    );
}