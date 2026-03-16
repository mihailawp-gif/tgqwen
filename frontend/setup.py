import os

# Create folders
folders = [
    "src/components",
    "src/components/Modals",
    "src/components/Games",
    "src/pages",
    "src/api",
    "src/store",
    "src/utils"
]

for folder in folders:
    os.makedirs(folder, exist_ok=True)

# Generate basic files
files = {
    "src/api/api.ts": """
import axios from 'axios';

const api = axios.create({
    baseURL: '/api'
});

export const initUser = (data: any) => api.post('/user/init', data);
// ... will add others
""",
    "src/App.tsx": """
import { useEffect } from 'react';
import { useAppStore, useUserStore } from './store/useStore';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import MainPage from './pages/MainPage';
import CasesPage from './pages/CasesPage';
import InventoryPage from './pages/InventoryPage';
import ProfilePage from './pages/ProfilePage';
import CrashScreen from './pages/CrashScreen';
import MinesScreen from './pages/MinesScreen';
import PlinkoScreen from './pages/PlinkoScreen';
import DiceScreen from './pages/DiceScreen';
import DesktopGuard from './components/DesktopGuard';

function App() {
  const { activeScreen, activeTab, loaderVisible, toast, desktopGuardVisible } = useAppStore();

  useEffect(() => {
    // init telegram app logic
    const tg = (window as any).Telegram?.WebApp;
    if (tg && tg.initData !== "") {
        useAppStore.getState().setDesktopGuardVisible(false);
    }
  }, []);

  if (desktopGuardVisible) return <DesktopGuard />;

  return (
    <>
      <div className={`screen ${activeScreen === 'main-screen' ? 'active' : ''}`}>
        <Header />
        
        {activeTab === 'main' && <MainPage />}
        {activeTab === 'cases' && <CasesPage />}
        {activeTab === 'inventory' && <InventoryPage />}
        {activeTab === 'profile' && <ProfilePage />}

        <BottomNav />
      </div>

      <div className={`screen ${activeScreen === 'crash-screen' ? 'active' : ''}`}><CrashScreen /></div>
      <div className={`screen ${activeScreen === 'mines-screen' ? 'active' : ''}`}><MinesScreen /></div>
      <div className={`screen ${activeScreen === 'plinko-screen' ? 'active' : ''}`}><PlinkoScreen /></div>
      <div className={`screen ${activeScreen === 'dice-screen' ? 'active' : ''}`}><DiceScreen /></div>
      
      {/* Toast & Loaders */}
      {loaderVisible && <div className="loader"><div className="loader-spinner"></div></div>}
      {toast?.visible && <div className="toast show">{toast.message}</div>}
    </>
  );
}

export default App;
""",
    "src/components/Header.tsx": """
import React from 'react';
import { useUserStore } from '../store/useStore';

export default function Header() {
    const { name, avatarUrl, balance } = useUserStore();

    return (
        <div className="header" id="mainHeader">
            <div className="user-section" style={{ cursor: 'pointer' }}>
                <div className="user-avatar">{avatarUrl ? <img src={avatarUrl} alt="A" /> : '👤'}</div>
                <div className="user-info">
                    <div className="user-name">{name}</div>
                    <div className="user-balance">
                        <img src="/static/images/star.png" alt="⭐" className="balance-star-icon" />
                        <span id="userBalance">{balance}</span>
                    </div>
                </div>
            </div>
            <button className="btn-topup">
                Пополнить
            </button>
        </div>
    );
}
""",
    "src/components/BottomNav.tsx": """
import React from 'react';
import { useAppStore } from '../store/useStore';

export default function BottomNav() {
    const { activeTab, setActiveTab } = useAppStore();

    return (
        <div className="bottom-nav">
            <button className={`nav-item ${activeTab === 'main' ? 'active' : ''}`} onClick={() => setActiveTab('main')}>
                <span className="nav-label">Играть</span>
            </button>
            <button className={`nav-item ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>
                <span className="nav-label">Инвентарь</span>
            </button>
            <button className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
                <span className="nav-label">Профиль</span>
            </button>
        </div>
    );
}
""",
    "src/pages/MainPage.tsx": """
import React from 'react';
import { useAppStore } from '../store/useStore';

export default function MainPage() {
    const { setActiveScreen, setActiveTab } = useAppStore();

    return (
        <div id="main-tab" className="tab-content active">
            <div className="main-games-grid">
                <div className="game-block block-crash align-right" onClick={() => setActiveScreen('crash-screen')}>
                    <div className="info"><h2>КРАШ</h2><p>УМНОЖЬ ЗВЁЗДЫ</p></div>
                </div>
                <div className="game-block block-mines align-right" onClick={() => setActiveScreen('mines-screen')}>
                    <div className="info"><h2>МИНЫ</h2><p>ОБХОДИ БОМБЫ</p></div>
                </div>
                <div className="game-block block-cases align-right" onClick={() => setActiveTab('cases')}>
                    <div className="info"><h2>КЕЙСЫ</h2><p>ИСПЫТАЙ УДАЧУ</p></div>
                </div>
                <div className="game-block block-dice align-right" onClick={() => setActiveScreen('dice-screen')}>
                    <div className="info"><h2>ДАЙС</h2><p>УГАДАЙ ЧИСЛО</p></div>
                </div>
                <div className="game-block block-plinko align-right" onClick={() => setActiveScreen('plinko-screen')}>
                    <div className="info"><h2>ПЛИНКО</h2><p>БРОСАЙ ШАРИКИ</p></div>
                </div>
            </div>
        </div>
    );
}
""",
    "src/pages/CasesPage.tsx": """export default function CasesPage() { return <div className="tab-content active">Cases</div>; }""",
    "src/pages/InventoryPage.tsx": """export default function InventoryPage() { return <div className="tab-content active">Inventory</div>; }""",
    "src/pages/ProfilePage.tsx": """export default function ProfilePage() { return <div className="tab-content active">Profile</div>; }""",
    "src/pages/CrashScreen.tsx": """
import React from 'react';
import { useAppStore } from '../store/useStore';

export default function CrashScreen() {
    const { setActiveScreen } = useAppStore();
    return <div className="crash-container"><button onClick={() => setActiveScreen('main-screen')}>Back</button> Crash</div>;
}""",
    "src/pages/MinesScreen.tsx": """
import React from 'react';
import { useAppStore } from '../store/useStore';

export default function MinesScreen() {
    const { setActiveScreen } = useAppStore();
    return <div><button onClick={() => setActiveScreen('main-screen')}>Back</button> Mines</div>;
}""",
    "src/pages/PlinkoScreen.tsx": """
import React from 'react';
import { useAppStore } from '../store/useStore';

export default function PlinkoScreen() {
    const { setActiveScreen } = useAppStore();
    return <div><button onClick={() => setActiveScreen('main-screen')}>Back</button> Plinko</div>;
}""",
    "src/pages/DiceScreen.tsx": """
import React from 'react';
import { useAppStore } from '../store/useStore';

export default function DiceScreen() {
    const { setActiveScreen } = useAppStore();
    return <div><button onClick={() => setActiveScreen('main-screen')}>Back</button> Dice</div>;
}""",
    "src/components/DesktopGuard.tsx": """
export default function DesktopGuard() {
    return (
        <div id="desktop-guard" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: '#0d0d17', zIndex: 9999999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'white', textAlign: 'center', padding: '20px' }}>
            <h2>Доступ закрыт</h2>
            <p>Пожалуйста, запустите это приложение через нашего бота внутри Telegram.</p>
        </div>
    );
}
"""
}

for path, content in files.items():
    with open(path, "w", encoding="utf-8") as f:
        f.write(content.strip())

print("Files created successfully.")
