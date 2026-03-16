import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useStore';
import { fetchHistoryApi } from '../api/api';
import TgsAnimation from '../components/TgsAnimation';

interface HistoryItem {
    id: number;
    gift?: {
        name: string;
        gift_number?: number;
        rarity?: string;
        image_url?: string;
    };
    user?: {
        first_name?: string;
    };
}

export default function MainPage() {
    const { setActiveScreen, setActiveTab } = useAppStore();
    const [history, setHistory] = useState<HistoryItem[]>([]);

    useEffect(() => {
        loadHistory();
        const interval = setInterval(loadHistory, 5000);
        return () => clearInterval(interval);
    }, []);

    const loadHistory = async () => {
        const res = await fetchHistoryApi();
        if (res?.success) {
            setHistory(res.history || []);
        }
    };

    return (
        <div id="main-tab" className="tab-content active">
            {/* Game Cards Grid */}
            <div className="main-games-grid">
                <div className="game-block block-crash align-right" onClick={() => setActiveScreen('crash-screen')}>
                    <div className="art-left">
                        <TgsAnimation url="/assets/images/crash.tgs" width={110} height={110} />
                    </div>
                    <div className="info">
                        <h2>КРАШ</h2>
                        <p>УМНОЖЬ ЗВЁЗДЫ</p>
                        <div className="badge">ОНЛАЙН-ИГРА</div>
                    </div>
                </div>

                <div className="game-block block-mines align-right" onClick={() => setActiveScreen('mines-screen')}>
                    <div className="art-left">
                        <div className="mines-menu-anim">
                            <div className="gem-wrapper">
                                <img src="/assets/images/diamond.png" alt="Diamond" className="gem-img" />
                                <div className="mine-shadow gem-shadow" />
                            </div>
                            <div className="bomb-wrapper">
                                <img src="/assets/images/bomb.png" alt="Bomb" className="bomb-img" />
                                <div className="mine-shadow bomb-shadow" />
                            </div>
                        </div>
                    </div>
                    <div className="info">
                        <h2>МИНЫ</h2>
                        <p>ОБХОДИ БОМБЫ</p>
                    </div>
                </div>

                <div className="game-block block-cases align-right" onClick={() => setActiveTab('cases')}>
                    <div className="art-left">
                        <TgsAnimation url="/assets/images/gift_limited_22.tgs" width={110} height={110} />
                    </div>
                    <div className="info">
                        <h2>КЕЙСЫ</h2>
                        <p>ИСПЫТАЙ УДАЧУ</p>
                        <div className="badge-gold">ДОСТУПЕН БЕСПЛАТНЫЙ КЕЙС</div>
                    </div>
                </div>

                <div className="game-block block-dice align-right" onClick={() => setActiveScreen('dice-screen')}>
                    <div className="art-left">
                        <TgsAnimation url="/assets/images/dice.tgs" width={100} height={100} />
                    </div>
                    <div className="info">
                        <h2>ДАЙС</h2>
                        <p>УГАДАЙ ЧИСЛО</p>
                    </div>
                </div>

                <div className="game-block block-plinko align-right" onClick={() => setActiveScreen('plinko-screen')}>
                    <div className="art-left">
                        <div className="plinko-anim-wrapper">
                            <svg className="plinko-bg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                                <g fill="rgba(255, 255, 255, 0.25)">
                                    <circle cx="35" cy="20" r="1.5"/><circle cx="45" cy="20" r="1.5"/><circle cx="55" cy="20" r="1.5"/><circle cx="65" cy="20" r="1.5"/>
                                    <circle cx="30" cy="30" r="1.5"/><circle cx="40" cy="30" r="1.5"/><circle cx="50" cy="30" r="1.5"/><circle cx="60" cy="30" r="1.5"/><circle cx="70" cy="30" r="1.5"/>
                                    <circle cx="25" cy="40" r="1.5"/><circle cx="35" cy="40" r="1.5"/><circle cx="45" cy="40" r="1.5"/><circle cx="55" cy="40" r="1.5"/><circle cx="65" cy="40" r="1.5"/><circle cx="75" cy="40" r="1.5"/>
                                    <circle cx="20" cy="50" r="1.5"/><circle cx="30" cy="50" r="1.5"/><circle cx="40" cy="50" r="1.5"/><circle cx="50" cy="50" r="1.5"/><circle cx="60" cy="50" r="1.5"/><circle cx="70" cy="50" r="1.5"/><circle cx="80" cy="50" r="1.5"/>
                                </g>
                            </svg>
                            <div className="plinko-menu-ball pb-1" />
                            <div className="plinko-menu-ball pb-2" />
                            <div className="plinko-menu-ball pb-3" />
                        </div>
                    </div>
                    <div className="info">
                        <h2>ПЛИНКО</h2>
                        <p>БРОСАЙ ШАРИКИ</p>
                    </div>
                </div>
            </div>

            {/* Live History */}
            {history.length > 0 && (
                <div className="live-history-section">
                    <div className="live-history-header">
                        <span>🔴 Последние выигрыши</span>
                    </div>
                    <div className="live-history-scroll" id="liveHistoryScroll">
                        {history.map((item) => (
                            <div key={item.id} className={`live-history-card rarity-${item.gift?.rarity || 'common'}`}>
                                <img
                                    src={item.gift?.image_url || '/assets/images/star.png'}
                                    style={{ width: '48px', height: '48px', objectFit: 'contain', flexShrink: 0 }}
                                    alt={item.gift?.name || ''}
                                />
                                <div className="live-history-card-name">{item.gift?.name || 'Приз'}</div>
                                <div className="live-history-card-user">{item.user?.first_name || '...'}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}