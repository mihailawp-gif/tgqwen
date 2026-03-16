import { useEffect } from 'react';
import { useAppStore } from './store/useStore';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import TopUpModal from './components/TopUpModal';
import MainPage from './pages/MainPage';
import CasesPage from './pages/CasesPage';
import InventoryPage from './pages/InventoryPage';
import ProfilePage from './pages/ProfilePage';
import CrashScreen from './pages/CrashScreen';
import MinesScreen from './pages/MinesScreen';
import PlinkoScreen from './pages/PlinkoScreen';
import DiceScreen from './pages/DiceScreen';
import DesktopGuard from './components/DesktopGuard';
import { initUserApi } from './api/api';
import { retrieveLaunchParams } from '@telegram-apps/sdk-react';

function App() {
  const { activeScreen, activeTab, loaderVisible, toast, desktopGuardVisible, topUpOpen, setTopUpOpen } = useAppStore();

  useEffect(() => {
    const initApp = async () => {
      useAppStore.getState().setLoaderVisible(true);
      try {
        const lp: any = retrieveLaunchParams();
        if (lp && lp.initData && lp.initData.user) {
          useAppStore.getState().setDesktopGuardVisible(false);
          await initUserApi({
            telegram_id: lp.initData.user.id,
            username: lp.initData.user.username,
            first_name: lp.initData.user.firstName,
            last_name: lp.initData.user.lastName,
            photo_url: lp.initData.user.photoUrl
          });
        } else {
          useAppStore.getState().setDesktopGuardVisible(true);
        }
      } catch (e) {
        useAppStore.getState().setDesktopGuardVisible(true);
      } finally {
        useAppStore.getState().setLoaderVisible(false);
      }
    }
    initApp();
  }, []);

  if (desktopGuardVisible) return <DesktopGuard />;

  return (
    <div className="bg-background min-h-screen text-text overflow-x-hidden font-inter select-none">
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

      {/* TopUp Modal */}
      <TopUpModal open={topUpOpen} onClose={() => setTopUpOpen(false)} />

      {/* Toast & Loaders */}
      {loaderVisible && <div className="loader"><div className="loader-spinner"></div></div>}
      {toast?.visible && <div className="toast show">{toast.message}</div>}
    </div>
  );
}

export default App;