import { useAppStore } from '../store/useStore';

export default function BottomNav() {
    const { activeTab, setActiveTab, casePreviewOpen } = useAppStore();

    if (casePreviewOpen) return null;

    return (
        <div className="bottom-nav">
            <button className={`nav-item ${activeTab === 'main' ? 'active' : ''}`} onClick={() => setActiveTab('main')}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"></rect><path d="M12 12h.01M16 12h.01M8 12h.01M6 12v.01"></path></svg>
                <span className="nav-label">Играть</span>
            </button>
            <button className={`nav-item ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>
                <img src="/assets/images/tab-inventory.png" alt="" style={{ width: '24px', height: '24px' }} />
                <span className="nav-label">Инвентарь</span>
            </button>
            <button className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                <span className="nav-label">Профиль</span>
            </button>
        </div>
    );
}
