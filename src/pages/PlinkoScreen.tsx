import { useState, useRef, useEffect } from 'react';
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

interface Point {
    x: number;
    y: number;
}

export default function PlinkoScreen() {
    const { setActiveScreen, showToast } = useAppStore();
    const { balance, setBalance } = useUserStore();

    const [bet, setBet] = useState(10);
    const [difficulty, setDifficulty] = useState<'low' | 'medium' | 'high'>('low');
    const [pinsCount, setPinsCount] = useState(8);
    const [activeBalls, setActiveBalls] = useState(0);

    const pinsContainerRef = useRef<HTMLDivElement>(null);
    const bucketsContainerRef = useRef<HTMLDivElement>(null);
    const observerRef = useRef<ResizeObserver | null>(null);

    const telegramId = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;

    useEffect(() => {
        window.addEventListener('resize', renderPlinkoBoard);

        // Use ResizeObserver to trigger render as soon as the container has a real size
        if (pinsContainerRef.current) {
            observerRef.current = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    if (entry.contentRect.width > 0) {
                        renderPlinkoBoard();
                    }
                }
            });
            observerRef.current.observe(pinsContainerRef.current);
        }

        // Also try immediately and with a fallback timeout
        renderPlinkoBoard();
        const timer = setTimeout(renderPlinkoBoard, 100);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', renderPlinkoBoard);
            observerRef.current?.disconnect();
        };
    }, [pinsCount, difficulty]);

    const renderPlinkoBoard = () => {
        if (!pinsContainerRef.current || !bucketsContainerRef.current) return;

        const pinsContainer = pinsContainerRef.current;
        const bucketsContainer = bucketsContainerRef.current;

        pinsContainer.innerHTML = '';
        bucketsContainer.innerHTML = '';

        const width = pinsContainer.clientWidth;
        const height = pinsContainer.clientHeight;
        const rows = pinsCount;

        if (width === 0) return;

        const pinSpacingX = width / (rows + 2);
        const pinSpacingY = height / (rows + 0.8);

        let pinRadius = 3;
        if (rows === 8) pinRadius = 5;
        else if (rows === 10) pinRadius = 4.5;
        else if (rows === 12) pinRadius = 3.5;
        else if (rows === 14) pinRadius = 2.5;
        else if (rows === 16) pinRadius = 2;

        for (let i = 0; i < rows; i++) {
            const numPins = i + 3;
            const startX = width / 2 - ((numPins - 1) * pinSpacingX) / 2;
            const y = (i + 1) * pinSpacingY;

            for (let j = 0; j < numPins; j++) {
                const x = startX + j * pinSpacingX;
                const pin = document.createElement('div');
                pin.className = 'plinko-pin';
                pin.style.width = `${pinRadius * 2}px`;
                pin.style.height = `${pinRadius * 2}px`;
                pin.style.left = `${x}px`;
                pin.style.top = `${y}px`;
                pinsContainer.appendChild(pin);
            }
        }

        const bucketsWidth = (rows + 1) * pinSpacingX;
        bucketsContainer.style.width = `${bucketsWidth}px`;

        const coefs = PLINKO_COEFS[difficulty][pinsCount];
        coefs.forEach(c => {
            const b = document.createElement('div');
            let colorClass = 'pb-c-0';
            if (c >= 1 && c < 2) colorClass = 'pb-c-1';
            else if (c >= 2 && c <= 5) colorClass = 'pb-c-2';
            else if (c > 5) colorClass = 'pb-c-3';

            b.className = `plinko-bucket ${colorClass}`;
            b.textContent = c.toString();
            bucketsContainer.appendChild(b);
        });
    };

    const spawnBall = (path: number[], finalBucketIndex: number, multiplier: number, finalBalance: number) => {
        const pinsContainer = pinsContainerRef.current;
        const bucketsContainer = bucketsContainerRef.current;
        if (!pinsContainer || !bucketsContainer) return;

        const width = pinsContainer.clientWidth;
        const height = pinsContainer.clientHeight;
        const rows = pinsCount;

        const pinSpacingX = width / (rows + 2);
        const pinSpacingY = height / (rows + 0.8);
        const ballRadius = 5;

        const ballEl = document.createElement('div');
        ballEl.className = 'plinko-ball';
        ballEl.style.opacity = '1';
        ballEl.style.width = `${ballRadius * 2}px`;
        ballEl.style.height = `${ballRadius * 2}px`;
        pinsContainer.appendChild(ballEl);

        const points: Point[] = [];
        let currentX = width / 2;
        let currentY = pinSpacingY;
        const yHitOffset = 6;

        points.push({ x: currentX, y: -20 });
        points.push({ x: currentX, y: currentY - yHitOffset });

        for (let i = 0; i < path.length; i++) {
            let dir = path[i];
            currentX += (dir === 0) ? -(pinSpacingX / 2) : (pinSpacingX / 2);
            currentY += pinSpacingY;

            if (i === path.length - 1) {
                points.push({ x: currentX, y: height - ballRadius + 2 });
            } else {
                let noiseX = (Math.random() - 0.5) * 4;
                points.push({ x: currentX + noiseX, y: currentY - yHitOffset });
            }
        }

        let currentSegment = 0;
        let segmentProgress = 0;
        let lastTime = performance.now();
        const baseDuration = 350 - (rows * 8);

        function animate(time: number) {
            let dt = time - lastTime;
            lastTime = time;

            let segmentDuration = baseDuration + (Math.random() * 30 - 15);
            segmentProgress += dt / segmentDuration;

            if (segmentProgress >= 1) {
                segmentProgress = 0;
                currentSegment++;
                if ((window as any).Telegram?.WebApp?.HapticFeedback) {
                    (window as any).Telegram.WebApp.HapticFeedback.impactOccurred('light');
                }
            }

            if (currentSegment >= points.length - 1) {
                finishDrop();
                return;
            }

            let p1 = points[currentSegment];
            let p2 = points[currentSegment + 1];
            let t = segmentProgress;
            let x = p1.x + (p2.x - p1.x) * t;
            let y = p1.y + (p2.y - p1.y) * t;

            if (currentSegment === 0) {
                y = p1.y + (p2.y - p1.y) * (t * t);
            } else if (currentSegment < points.length - 2) {
                let bounceHeight = pinSpacingY * (0.70 + Math.random() * 0.15);
                let bounceOffset = Math.sin(t * Math.PI) * bounceHeight;
                y -= bounceOffset;
            } else {
                y = p1.y + (p2.y - p1.y) * (t * t);
            }

            ballEl.style.left = `${x - ballRadius}px`;
            ballEl.style.top = `${y - ballRadius}px`;
            requestAnimationFrame(animate);
        }

        function finishDrop() {
            const container = bucketsContainerRef.current;
            if (container) {
                const buckets = container.children;
                if (buckets[finalBucketIndex]) {
                    buckets[finalBucketIndex].classList.add('active');
                    if ((window as any).Telegram?.WebApp?.HapticFeedback) {
                        (window as any).Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                    }
                    setTimeout(() => buckets[finalBucketIndex].classList.remove('active'), 200);
                }
            }
            ballEl.remove();
            setBalance(finalBalance);
            setActiveBalls(prev => Math.max(0, prev - 1));

        }

        requestAnimationFrame(animate);
    };

    const handlePlay = async () => {
        if (bet < 1) return showToast('❌ Введите ставку');
        if (bet > balance) return showToast('❌ Недостаточно звезд');

        setBalance(balance - bet);
        setActiveBalls(prev => prev + 1);

        const res = await playPlinkoApi(telegramId, bet, difficulty, pinsCount);
        if (res.success) {
            spawnBall(res.path, res.bucket, res.multiplier, res.balance);
        } else {
            showToast(res.error);
            setBalance(balance);
            setActiveBalls(prev => Math.max(0, prev - 1));
        }
    };

    return (
        <div className="flex flex-col min-h-screen bg-[var(--bg)]">
            <div className="preview-header">
                <button className="btn-back" onClick={() => setActiveScreen('main-screen')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                </button>
                <h2>Плинко</h2>
                <div className="mines-balance-badge">
                    <img src="/assets/images/star.png" alt="⭐" />
                    <span>{balance}</span>
                </div>
            </div>

            <div className="flex-1 p-4 flex flex-col gap-3 overflow-y-auto">
                <div className="plinko-game-area" style={{ position: 'relative', height: '420px', flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: '12px' }}>
                    <div ref={pinsContainerRef} id="plinkoPins" style={{ width: '100%', height: 'calc(100% - 60px)', position: 'absolute', top: 0 }}></div>
                    <div ref={bucketsContainerRef} id="plinkoBuckets" className="plinko-buckets" style={{ position: 'relative', zIndex: 5 }}></div>
                </div>

                <div className="mines-controls-panel" style={{ opacity: activeBalls > 0 ? 0.5 : 1, pointerEvents: activeBalls > 0 ? 'none' : 'auto' }}>
                    <div className="control-group">
                        <label>Сумма ставки</label>
                        <div className="input-with-icon">
                            <input type="number" value={bet} onChange={(e) => setBet(Math.max(1, Number(e.target.value)))} />
                            <img src="/assets/images/star.png" alt="star" />
                        </div>
                        <div className="quick-buttons">
                            <button onClick={() => setBet(prev => prev + 10)}>+10</button>
                            <button onClick={() => setBet(prev => prev + 50)}>+50</button>
                            <button onClick={() => setBet(prev => Math.floor(prev * 2))}>x2</button>
                            <button onClick={() => setBet(prev => Math.max(1, Math.floor(prev / 2)))}>/2</button>
                        </div>
                    </div>

                    <div className="control-group">
                        <label>Сложность</label>
                        <div className="quick-buttons diff-buttons">
                            {(['low', 'medium', 'high'] as const).map(d => (
                                <button key={d} className={difficulty === d ? 'active' : ''} onClick={() => setDifficulty(d)}>
                                    {d === 'low' ? 'Легко' : d === 'medium' ? 'Средне' : 'Сложно'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="control-group">
                        <label>Количество рядов</label>
                        <div className="quick-buttons pins-buttons">
                            {[8, 10, 12, 14, 16].map(p => (
                                <button key={p} className={pinsCount === p ? 'active' : ''} onClick={() => setPinsCount(p)}>
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="open-case-footer">
                <button className="btn-open-case w-full" onClick={handlePlay}>
                    {activeBalls > 0 ? `Шариков в полете: ${activeBalls}` : 'ИГРАТЬ'}
                </button>
            </div>
        </div>
    );
}
