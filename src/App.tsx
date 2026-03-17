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
        let user: any = null;
        const tg = (window as any).Telegram?.WebApp;
        
        // 1. Попытка через SDK
        try {
          const lp = retrieveLaunchParams() as any;
          if (lp && lp.initData && lp.initData.user) {
            user = lp.initData.user;
          }
        } catch (sdkError) {
          console.warn('SDK Init failed, trying fallback...');
        }

        // 2. Фолбек на классический window.Telegram.WebApp
        if (!user && tg?.initDataUnsafe?.user) {
          const u = tg.initDataUnsafe.user;
          user = {
            id: u.id,
            username: u.username,
            firstName: u.first_name,
            lastName: u.last_name,
            photoUrl: u.photo_url
          };
        }

        // 3. Последний шанс: если мы внутри iframe и есть initData в URL (hash или search)
        if (!user) {
            const hash = window.location.hash.substring(1);
            const search = window.location.search.substring(1);
            const combinedParams = new URLSearchParams(hash + '&' + search);
            const initData = combinedParams.get('tgWebAppData');
            if (initData) {
                const params = new URLSearchParams(initData);
                const userJson = params.get('user');
                if (userJson) {
                    try {
                        const u = JSON.parse(userJson);
                        user = {
                            id: u.id,
                            username: u.username,
                            firstName: u.first_name,
                            lastName: u.last_name,
                            photoUrl: u.photo_url
                        };
                    } catch(e) {}
                }
            }
        }

        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        
        if (user || isLocal) {
          useAppStore.getState().setDesktopGuardVisible(false);
          const finalUser = user || { id: 12345678, username: 'local_debug', firstName: 'Local', lastName: 'Tester' };

          await initUserApi({
            telegram_id: finalUser.id,
            username: finalUser.username,
            first_name: finalUser.firstName,
            last_name: finalUser.lastName,
            photo_url: finalUser.photoUrl
          });
          
          if (tg) {
            tg.expand?.();
            tg.ready?.();
          }
        } else {
          useAppStore.getState().setDesktopGuardVisible(true);
        }
      } catch (e) {
        console.error('Final Init Error:', e);
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
           useAppStore.getState().setDesktopGuardVisible(true);
        }
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