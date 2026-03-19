import { useState, useEffect, useRef } from 'react';
import { useAppStore, useUserStore } from '../store/useStore';
import { crashBetApi, crashCashoutApi } from '../api/api';

interface CrashPlayer {
    user_id: number;
    name: string;
    avatar?: string;
    bet: number;
    cashout: number | null;
    profit: number;
    auto_cashout?: number;
}

interface CrashData {
    state: 'WAITING' | 'FLYING' | 'CRASHED';
    multiplier: number;
    timer: number;
    players: CrashPlayer[];
    history: number[];
}

export default function CrashScreen() {
    const { setActiveScreen, showToast, setLoaderVisible } = useAppStore();
    const { balance, setBalance } = useUserStore();

    const [crashState, setCrashState] = useState<'WAITING' | 'FLYING' | 'CRASHED'>('WAITING');
    const [multiplier, setMultiplier] = useState(1.00);
    const [timer, setTimer] = useState(0);
    const [players, setPlayers] = useState<CrashPlayer[]>([]);
    const [history, setHistory] = useState<number[]>([]);
    const [didIBet, setDidIBet] = useState(false);
    const [didICashout, setDidICashout] = useState(false);
    const [myBetAmount, setMyBetAmount] = useState(0);

    // Bet modal
    const [betModalOpen, setBetModalOpen] = useState(false);
    const [betInput, setBetInput] = useState(50);
    const [autoEnabled, setAutoEnabled] = useState(false);
    const [autoVal, setAutoVal] = useState(2.0);

    // Canvas
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const socketRef = useRef<WebSocket | null>(null);
    const crashStarsRef = useRef<any[]>([]);
    const gridZOffsetRef = useRef(0);
    const animFrameRef = useRef<number | null>(null);
    const renderDataRef = useRef({ multiplier: 1.00, state: 'WAITING', isCrashed: false, flightStartTime: 0 });

    const telegramId = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;

    // Connect WebSocket
    useEffect(() => {
        const connect = () => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.host;
            const ws = new WebSocket(`${protocol}//${host}/api/crash/ws`);

            ws.onmessage = (event) => {
                const data: CrashData = JSON.parse(event.data);
                setCrashState(data.state);
                setMultiplier(data.multiplier);
                setTimer(data.timer);
                setPlayers(data.players);
                setHistory(data.history);

                renderDataRef.current.multiplier = data.multiplier;
                renderDataRef.current.state = data.state;

                if (data.state === 'WAITING') {
                    renderDataRef.current.isCrashed = false;
                    renderDataRef.current.flightStartTime = 0;
                    if (data.timer > 7.5) {
                        setDidIBet(false);
                        setDidICashout(false);
                    }
                } else if (data.state === 'CRASHED') {
                    renderDataRef.current.flightStartTime = 0;
                    if (!renderDataRef.current.isCrashed) {
                        renderDataRef.current.isCrashed = true;
                    }
                }
            };

            ws.onclose = () => {
                socketRef.current = null;
                setTimeout(connect, 2000);
            };

            socketRef.current = ws;
        };

        connect();

        // Init stars
        const stars = [];
        for (let i = 0; i < 60; i++) {
            stars.push({
                x: (Math.random() - 0.5) * 1000,
                y: (Math.random() - 0.5) * 1000,
                z: Math.random() * 1000,
                pz: Math.random() * 1000
            });
        }
        crashStarsRef.current = stars;

        return () => {
            if (socketRef.current) socketRef.current.close();
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, []);

    // Auto-cashout detection  
    useEffect(() => {
        if (didIBet && !didICashout && telegramId) {
            const myData = players.find(p => p.user_id === telegramId);
            if (myData && myData.cashout !== null) {
                setDidICashout(true);
                setBalance(balance + myData.profit);
                showToast(`🚀 Автовывод! Вы забрали ${myData.profit} ⭐`);
            }
        }
    }, [players, didIBet, didICashout, telegramId]);

    // Canvas render loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const resize = () => {
            if (canvas.parentElement) {
                canvas.width = canvas.parentElement.clientWidth;
                canvas.height = canvas.parentElement.clientHeight;
            }
        };
        resize();
        window.addEventListener('resize', resize);

        const renderLoop = () => {
            const canvas = canvasRef.current;
            if (!canvas || !canvas.parentElement) {
                animFrameRef.current = requestAnimationFrame(renderLoop);
                return;
            }

            // ФИКС: Динамически растягиваем канвас, если открыли вкладку
            if (canvas.width !== canvas.parentElement.clientWidth) {
                canvas.width = canvas.parentElement.clientWidth;
                canvas.height = canvas.parentElement.clientHeight;
            }

            const w = canvas.width;
            const h = canvas.height;

            // Если канвас всё ещё 0 - ждем
            if (w === 0 || h === 0) {
                animFrameRef.current = requestAnimationFrame(renderLoop);
                return;
            }

            ctx.fillStyle = '#020308';
            ctx.fillRect(0, 0, w, h);

            const mul = renderDataRef.current.multiplier;
            const stateStr = renderDataRef.current.state;

            let speed = stateStr === 'FLYING' ? 4 + (mul * 2) : 1;
            if (stateStr === 'CRASHED') speed = 0;

            const horizonY = h * 0.4;
            const vpX = w / 2;

            // Grid
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = -15; i <= 15; i++) {
                ctx.moveTo(vpX, horizonY);
                ctx.lineTo(vpX + i * 40, h);
            }
            if (speed > 0) {
                gridZOffsetRef.current -= speed;
                if (gridZOffsetRef.current <= 0) gridZOffsetRef.current += 40;
            }
            for (let y = gridZOffsetRef.current; y < 200; y += 20) {
                let py = horizonY + Math.pow(y / 15, 1.8);
                if (py > horizonY && py <= h) {
                    ctx.moveTo(0, py);
                    ctx.lineTo(w, py);
                }
            }
            ctx.stroke();

            // Stars
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.beginPath();
            for (const star of crashStarsRef.current) {
                if (speed > 0) star.z -= speed * 1.5;
                if (star.z < 1) {
                    star.z = 1000; star.pz = 1000;
                    star.x = (Math.random() - 0.5) * 1000;
                    star.y = (Math.random() - 0.5) * 1000;
                }
                let cx = w / 2, cy = h / 2;
                let sx = (star.x / star.z) * 100 + cx;
                let sy = (star.y / star.z) * 100 + cy;
                let px = (star.x / star.pz) * 100 + cx;
                let py = (star.y / star.pz) * 100 + cy;
                star.pz = star.z;
                ctx.moveTo(px, py);
                ctx.lineTo(sx, sy);
            }
            ctx.stroke();

            // Flight path
            if (stateStr === 'FLYING') {
                if (renderDataRef.current.flightStartTime === 0) {
                    renderDataRef.current.flightStartTime = performance.now();
                }
                let elapsed = performance.now() - renderDataRef.current.flightStartTime;
                let flyProgress = Math.min(elapsed / 1200, 1);
                let easeProgress = 1 - Math.pow(1 - flyProgress, 4);

                const startX = 0;
                const startY = h;
                const targetX = w * 0.65;
                const targetY = h * 0.70;

                let wobbleX = 0, wobbleY = 0;
                if (flyProgress === 1) {
                    let time = performance.now() * 0.002;
                    wobbleX = Math.sin(time) * 8;
                    wobbleY = Math.cos(time * 1.3) * 6;
                }

                const endX = startX + (targetX - startX) * easeProgress + wobbleX;
                const endY = startY + (targetY - startY) * easeProgress + wobbleY;
                const ctrlX = startX + (endX - startX) * 0.4;
                const ctrlY = h;

                const fillGrad = ctx.createLinearGradient(0, endY, 0, h);
                fillGrad.addColorStop(0, 'rgba(245, 158, 11, 0.4)');
                fillGrad.addColorStop(1, 'transparent');

                ctx.beginPath();
                ctx.moveTo(startX, h);
                ctx.lineTo(startX, startY);
                ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
                ctx.lineTo(endX, h);
                ctx.closePath();
                ctx.fillStyle = fillGrad;
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
                ctx.strokeStyle = '#f59e0b';
                ctx.lineWidth = 5;
                ctx.lineCap = 'round';
                ctx.shadowColor = '#f59e0b';
                ctx.shadowBlur = 15;
                ctx.stroke();
                ctx.shadowBlur = 0;

                // Rocket logic
                const rocket = document.getElementById('crashRocket');
                if (rocket) {
                    // ФИКС УГЛА: Больше никакой дерготни! Жестко ставим -25 градусов + легкая турбулентность
                    let tilt = -25 + (flyProgress === 1 ? Math.sin(performance.now() * 0.0016) * 3 : 0);
                    rocket.style.display = 'block';
                    rocket.style.left = `${endX}px`;
                    rocket.style.top = `${endY}px`;
                    // ФИКС СТЫКА: translate(-15%, -85%) гарантированно ставит ракету выхлопной трубой на конец линии!
                    rocket.style.transform = `translate(-15%, -85%) rotate(${tilt}deg)`;
                }
            } else {
                const rocket = document.getElementById('crashRocket');
                if (rocket) rocket.style.display = 'none';
            }

            animFrameRef.current = requestAnimationFrame(renderLoop);
        };

        animFrameRef.current = requestAnimationFrame(renderLoop);

        return () => {
            window.removeEventListener('resize', resize);
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, []);

    // Submit bet
    const submitBet = async () => {
        setBetModalOpen(false);
        if (betInput <= 0) return showToast('❌ Введите корректную ставку');
        if (betInput > balance) return showToast('❌ Недостаточно звезд');

        setLoaderVisible(true);
        const res = await crashBetApi(telegramId, betInput, autoEnabled ? autoVal : undefined);
        setLoaderVisible(false);

        if (res.success) {
            setBalance(res.balance);
            setDidIBet(true);
            setDidICashout(false);
            setMyBetAmount(betInput);
            showToast('✅ Ставка принята!');
        } else {
            showToast('❌ ' + (res.error || 'Ошибка ставки'));
        }
    };

    // Cashout
    const handleCashout = async () => {
        setLoaderVisible(true);
        const res = await crashCashoutApi(telegramId);
        setLoaderVisible(false);

        if (res.success) {
            setDidICashout(true);
            setBalance(res.balance);
            showToast(`Вы забрали ${res.win_amount} ⭐ (x${res.multiplier})`);
        } else {
            showToast('❌ ' + (res.error || 'Ошибка вывода'));
        }
    };

    // Main action button
    const handleMainAction = () => {
        if (crashState === 'WAITING' && !didIBet) {
            setBetModalOpen(true);
        } else if (crashState === 'FLYING' && didIBet && !didICashout) {
            handleCashout();
        }
    };

    const getButtonText = () => {
        if (crashState === 'WAITING') {
            if (didIBet) return 'ОЖИДАНИЕ ИГРЫ...';
            return 'СДЕЛАТЬ СТАВКУ';
        }
        if (crashState === 'FLYING') {
            if (didIBet && !didICashout) {
                const currentProfit = Math.floor(myBetAmount * multiplier);
                return `ЗАБРАТЬ ${currentProfit}`;
            }
            return 'ИДЕТ ИГРА...';
        }
        return 'РАУНД ЗАВЕРШЕН';
    };

    const getButtonClass = () => {
        if (crashState === 'FLYING' && didIBet && !didICashout) return 'btn-crash-main cashout';
        if (crashState === 'WAITING' && !didIBet) return 'btn-crash-main';
        return 'btn-crash-main disabled';
    };

    const totalBets = players.reduce((sum, p) => sum + p.bet, 0);
    const sortedPlayers = [...players].sort((a, b) => {
        if (a.cashout && !b.cashout) return -1;
        if (!a.cashout && b.cashout) return 1;
        return b.bet - a.bet;
    });

    return (
        <div className="flex flex-col min-h-screen" style={{ background: '#000' }}>
            {/* Header */}
            <div className="preview-header crash-header">
                <button className="btn-back" onClick={() => setActiveScreen('main-screen')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                </button>
                <h2>CRASH</h2>
                <div className="mines-balance-badge">
                    <img src="/assets/images/star.png" alt="⭐" />
                    <span>{balance}</span>
                </div>
            </div>

            {/* Game Area */}
            <div className="crash-game-area">
                <canvas ref={canvasRef} id="crashCanvas" />
                <div className="crash-status-overlay">
                    {crashState === 'WAITING' && (
                        <div className="crash-timer">Запуск через {timer.toFixed(1)}s</div>
                    )}
                    {crashState === 'FLYING' && (
                        <div id="crashMultiplier" className="crash-multiplier">x{multiplier.toFixed(2)}</div>
                    )}
                    {crashState === 'CRASHED' && (
                        <div id="crashMultiplier" className="crash-multiplier crashed">x{multiplier.toFixed(2)}</div>
                    )}
                </div>

                <img id="crashRocket" src="/assets/images/rocket.gif" alt="Rocket" style={{ display: 'none' }} />
                <div id="crashExplosion" style={{ display: crashState === 'CRASHED' ? 'flex' : 'none' }}></div>
            </div>

            {/* History pills */}
            <div className="crash-history-wrapper">
                <div className="crash-history-pills">
                    {history.map((x, i) => (
                        <div key={i} className={`history-pill ${i === 0 ? 'current' : ''}`}>
                            {x.toFixed(2)}
                        </div>
                    ))}
                </div>
            </div>

            {/* Action Button */}
            <div className="crash-action-container">
                <button className={getButtonClass()} onClick={handleMainAction} disabled={
                    (crashState === 'WAITING' && didIBet) || crashState === 'CRASHED' || (crashState === 'FLYING' && (!didIBet || didICashout))
                }>
                    {getButtonText()}
                    {crashState === 'FLYING' && didIBet && !didICashout && (
                        <img src="/assets/images/star.png" style={{ width: '16px', height: '16px', verticalAlign: 'middle', marginLeft: '4px' }} />
                    )}
                </button>
            </div>

            {/* Players */}
            <div className="crash-players-section" id="crashPlayersSection" style={{ padding: players.length ? '12px 16px' : '0' }}>
                <div className="crash-total-bets"> <img src="/assets/images/star.png" style={{ width: '14px', marginRight: '5px' }} />Всего ставок: {totalBets}</div>
                <div className="crash-players-list">
                    {sortedPlayers.map((p, i) => (
                        <div key={i} className="crash-player-item">
                            <div className="c-player-info">
                                <div className="c-avatar">
                                    {p.avatar ? <img src={p.avatar} alt="" /> : '👤'}
                                </div>
                                <div className="c-details">
                                    <div className="c-name">{p.name}</div>
                                    <div className="c-bet" style={crashState === 'CRASHED' && !p.cashout ? { color: '#ef4444', textDecoration: 'line-through' } : undefined}>
                                        <img src="/assets/images/star.png" style={{ width: '14px' }} />{p.bet}
                                    </div>
                                </div>
                            </div>
                            {p.cashout ? (
                                <div className="c-win success">
                                    <img src="/assets/images/star.png" />{p.profit}
                                </div>
                            ) : crashState === 'CRASHED' ? (
                                <div className="c-win danger">
                                    -{p.bet} <img src="/assets/images/star.png" />
                                </div>
                            ) : (
                                <div className="c-win flying">
                                    <img src="/assets/images/star.png" />{Math.floor(p.bet * multiplier)}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Bet Modal */}
            {betModalOpen && (
                <div className="modal active">
                    <div className="modal-overlay" onClick={() => setBetModalOpen(false)} />
                    <div className="modal-content crash-bet-modal">
                        <div className="modal-handle" />
                        <div className="crash-bet-header">
                            <h3>Ваша ставка</h3>
                            <button className="btn-close" onClick={() => setBetModalOpen(false)}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="crash-big-input-wrapper">
                            <input type="number" value={betInput} onChange={(e) => setBetInput(Number(e.target.value))} />
                            <img src="/assets/images/star.png" alt="star" />
                        </div>

                        <div className="crash-quick-amounts">
                            {[10, 50, 100, 500].map(v => (
                                <button key={v} onClick={() => setBetInput(v)}>
                                    {v} <img src="/assets/images/star.png" />
                                </button>
                            ))}
                        </div>

                        <div className="crash-auto-row">
                            <label className="crash-checkbox" onClick={() => setAutoEnabled(!autoEnabled)}>
                                <input type="checkbox" checked={autoEnabled} readOnly />
                                <span className="checkmark">{autoEnabled && '✓'}</span>
                                Автовывод
                            </label>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', opacity: autoEnabled ? 1 : 0.5, pointerEvents: autoEnabled ? 'auto' : 'none' }}>
                                <button onClick={() => setAutoVal(Math.max(1.01, autoVal - 0.5))} style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px', padding: '8px 12px' }}>-</button>
                                <input type="number" value={autoVal.toFixed(2)} onChange={(e) => setAutoVal(Math.max(1.01, Number(e.target.value)))}
                                    style={{ background: 'transparent', border: 'none', color: '#fff', fontFamily: "'Exo 2'", fontSize: '18px', fontWeight: 800, width: '60px', textAlign: 'center', outline: 'none' }} />
                                <button onClick={() => setAutoVal(autoVal + 0.5)} style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px', padding: '8px 12px' }}>+</button>
                            </div>
                        </div>

                        <div style={{ padding: '0 20px 20px' }}>
                            <button className="btn-crash-main" onClick={submitBet} style={{ width: '100%' }}>
                                ПОСТАВИТЬ {betInput} ⭐
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}