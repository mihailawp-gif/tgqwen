import { useEffect } from 'react';
import { useAppStore } from '../store/useStore';
import TgsAnimation, { preloadTgs } from '../components/TgsAnimation';

export default function MainPage() {
    const { setActiveScreen, setActiveTab } = useAppStore();

    // Прогреваем кэш TGS-файлов до рендера — загрузка в фоне
    useEffect(() => {
        preloadTgs([
            '/assets/images/crash.tgs',
            '/assets/images/dice.tgs',
            '/assets/images/gift_limited_22.tgs',
        ]);
    }, []);

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
                                    <circle cx="35" cy="20" r="1.5" /><circle cx="45" cy="20" r="1.5" /><circle cx="55" cy="20" r="1.5" /><circle cx="65" cy="20" r="1.5" />
                                    <circle cx="30" cy="30" r="1.5" /><circle cx="40" cy="30" r="1.5" /><circle cx="50" cy="30" r="1.5" /><circle cx="60" cy="30" r="1.5" /><circle cx="70" cy="30" r="1.5" />
                                    <circle cx="25" cy="40" r="1.5" /><circle cx="35" cy="40" r="1.5" /><circle cx="45" cy="40" r="1.5" /><circle cx="55" cy="40" r="1.5" /><circle cx="65" cy="40" r="1.5" /><circle cx="75" cy="40" r="1.5" />
                                    <circle cx="20" cy="50" r="1.5" /><circle cx="30" cy="50" r="1.5" /><circle cx="40" cy="50" r="1.5" /><circle cx="50" cy="50" r="1.5" /><circle cx="60" cy="50" r="1.5" /><circle cx="70" cy="50" r="1.5" /><circle cx="80" cy="50" r="1.5" />
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

                <div className="game-block block-upgrade align-right" onClick={() => setActiveScreen('upgrade-screen')} style={{ background: 'linear-gradient(135deg, #1c2028, #2a2e38)' }}>
                    <div className="art-left">
                        <div className="upgrade-anim-wrapper">
                            <svg className="upgrade-circle-bg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="50" cy="50" r="40" stroke="rgba(255, 255, 255, 0.2)" strokeWidth="6" fill="none" />
                                <circle className="upgrade-chance-circle" cx="50" cy="50" r="40" stroke="#ffffff" strokeWidth="6" fill="none" strokeDasharray="251.3" strokeDashoffset="200" strokeLinecap="round" />
                            </svg>
                            <div className="upgrade-gift-wrapper">
                                <img src="/assets/gift-silhouette.png" alt="Gift" className="upgrade-gift-img" />
                            </div>
                            <div className="upgrade-arrow-wrapper">
                                <img src="/arrow.svg" alt="Arrow" className="upgrade-arrow-img" />
                            </div>
                        </div>
                    </div>
                    <div className="info">
                        <h2 style={{ color: '#22c55e' }}>АПГРЕЙД</h2>
                        <p>УЛУЧШАЙ ПОДАРКИ</p>
                    </div>
                </div>
            </div>

        </div>
    );
}