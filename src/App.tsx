import { useEffect, useRef, useState } from 'react';
import Lottie from 'lottie-react';
import loseAnimation from './assets/error.json';
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

const LottieAny = Lottie as any;
const LottieComp = LottieAny.default || LottieAny;

/* ─── Toast ──────────────────────────────────────────────── */
const SmartToast = () => {
  const { toast } = useAppStore();
  if (!toast?.visible) return null;
  const isError = toast.message.includes('❌');
  const cleanMsg = toast.message.replace('❌', '').trim();
  const parts = cleanMsg.split('⭐');
  return (
    <div className="toast show" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
      {isError && loseAnimation && (
        <div style={{ width: '24px', height: '24px', flexShrink: 0 }}>
          <LottieComp animationData={loseAnimation} loop={false} />
        </div>
      )}
      <span style={{ display: 'flex', alignItems: 'center' }}>
        {parts.map((part, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center' }}>
            {part}
            {i < parts.length - 1 && (
              <img src="/assets/images/star.png" style={{ width: '16px', height: '16px', margin: '0 4px', position: 'relative', top: '-1px' }} alt="star" />
            )}
          </span>
        ))}
      </span>
    </div>
  );
};

/* ─── Animated Screen ─────────────────────────────────────
   Рендерит экран всегда в DOM, переключает через opacity/transform.
   slideUp=true для игровых экранов (слайд снизу).
*/
interface AnimatedScreenProps {
  active: boolean;
  slideUp?: boolean;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}
const AnimatedScreen = ({ active, slideUp, children, className = '', style }: AnimatedScreenProps) => {
  const cls = ['screen', slideUp ? 'slide-up' : '', active ? 'active' : '', className]
    .filter(Boolean).join(' ');
  return (
    <div className={cls} style={style}>
      {children}
    </div>
  );
};

/* ─── Animated Tab ────────────────────────────────────────
   Таб всегда в DOM, переключается через opacity/transform.
   Используем ключ чтобы перезапускать stagger-анимации при смене таба.
*/
interface AnimatedTabProps {
  active: boolean;
  tabKey: string;
  children: React.ReactNode;
}
const AnimatedTab = ({ active, tabKey, children }: AnimatedTabProps) => (
  <div
    key={active ? tabKey : undefined}
    className={`tab-content${active ? ' active' : ''}`}
  >
    {children}
  </div>
);

/* ─── Animated Modal ──────────────────────────────────────
   Bottom sheet с анимацией открытия и закрытия.
*/
interface AnimatedModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}
export const AnimatedModal = ({ open, onClose, children }: AnimatedModalProps) => {
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      setClosing(true);
      const t = setTimeout(() => { setMounted(false); setClosing(false); }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!mounted) return null;

  return (
    <div className={`modal${open && !closing ? ' active' : ''}${closing ? ' closing' : ''}`}>
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal-content topup-modal">
        {children}
      </div>
    </div>
  );
};

/* ─── App ─────────────────────────────────────────────────── */
function App() {
  const { activeScreen, activeTab, loaderVisible, desktopGuardVisible, topUpOpen, setTopUpOpen } = useAppStore();
  const prevTab = useRef(activeTab);

  useEffect(() => { prevTab.current = activeTab; }, [activeTab]);

  useEffect(() => {
    const initApp = async () => {
      useAppStore.getState().setLoaderVisible(true);
      try {
        let user: any = null;
        const tg = (window as any).Telegram?.WebApp;

        try {
          const lp = retrieveLaunchParams() as any;
          if (lp?.initData?.user) user = lp.initData.user;
        } catch { console.warn('SDK Init failed, trying fallback...'); }

        if (!user && tg?.initDataUnsafe?.user) {
          const u = tg.initDataUnsafe.user;
          user = { id: u.id, username: u.username, firstName: u.first_name, lastName: u.last_name, photoUrl: u.photo_url };
        }

        if (!user) {
          const hash = window.location.hash.substring(1);
          const search = window.location.search.substring(1);
          const combinedParams = new URLSearchParams(hash + '&' + search);
          const initData = combinedParams.get('tgWebAppData');
          if (initData) {
            const params = new URLSearchParams(initData);
            const userJson = params.get('user');
            if (userJson) {
              try { const u = JSON.parse(userJson); user = { id: u.id, username: u.username, firstName: u.first_name, lastName: u.last_name, photoUrl: u.photo_url }; } catch { }
            }
          }
        }

        const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

        if (user || isLocal) {
          useAppStore.getState().setDesktopGuardVisible(false);
          const finalUser = user || { id: 12345678, username: 'local_debug', firstName: 'Local', lastName: 'Tester' };
          await initUserApi({ telegram_id: finalUser.id, username: finalUser.username, first_name: finalUser.firstName, last_name: finalUser.lastName, photo_url: finalUser.photoUrl });
          if (tg) { tg.expand?.(); tg.ready?.(); }
        } else {
          useAppStore.getState().setDesktopGuardVisible(true);
        }
      } catch (e) {
        console.error('Final Init Error:', e);
        if (!['localhost', '127.0.0.1'].includes(window.location.hostname)) {
          useAppStore.getState().setDesktopGuardVisible(true);
        }
      } finally {
        useAppStore.getState().setLoaderVisible(false);
      }
    };
    initApp();
  }, []);

  if (desktopGuardVisible) return <DesktopGuard />;

  const isMainScreen = activeScreen === 'main-screen';

  return (
    <div className="bg-background min-h-screen text-text overflow-x-hidden font-inter select-none">

      {/* ── Главный экран (tabs) ── */}
      <AnimatedScreen active={isMainScreen}>
        <Header />
        {/* Контейнер табов — relative нужен для absolute-позиционирования скрытых табов */}
        <div style={{ position: 'relative' }}>
          <AnimatedTab active={activeTab === 'main'}      tabKey="main">      <MainPage />      </AnimatedTab>
          <AnimatedTab active={activeTab === 'cases'}     tabKey="cases">     <CasesPage />     </AnimatedTab>
          <AnimatedTab active={activeTab === 'inventory'} tabKey="inventory"> <InventoryPage /> </AnimatedTab>
          <AnimatedTab active={activeTab === 'profile'}   tabKey="profile">   <ProfilePage />   </AnimatedTab>
        </div>
        <BottomNav />
      </AnimatedScreen>

      {/* ── Игровые экраны — слайд снизу ── */}
      <AnimatedScreen active={activeScreen === 'crash-screen'} slideUp>
        <CrashScreen />
      </AnimatedScreen>
      <AnimatedScreen active={activeScreen === 'mines-screen'} slideUp>
        <MinesScreen />
      </AnimatedScreen>
      <AnimatedScreen active={activeScreen === 'plinko-screen'} slideUp>
        <PlinkoScreen />
      </AnimatedScreen>
      <AnimatedScreen active={activeScreen === 'dice-screen'} slideUp>
        <DiceScreen />
      </AnimatedScreen>

      {/* ── Модалка пополнения ── */}
      <TopUpModal open={topUpOpen} onClose={() => setTopUpOpen(false)} />

      {/* ── Toast ── */}
      <SmartToast />

      {/* ── Глобальный лоадер ── */}
      {loaderVisible && (
        <div className="loader">
          <div className="loader-spinner" />
        </div>
      )}
    </div>
  );
}

export default App;
