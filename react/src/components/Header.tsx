import { useUserStore, useAppStore } from '../store/useStore';

export default function Header() {
    const { name, avatarUrl, balance } = useUserStore();
    const { setTopUpOpen } = useAppStore();

    return (
        <div className="header" id="mainHeader">
            <div className="user-section" style={{ cursor: 'pointer' }}>
                <div className="user-avatar">{avatarUrl ? <img src={avatarUrl} alt="A" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : '👤'}</div>
                <div className="user-info">
                    <div className="user-name">{name}</div>
                    <div className="user-balance">
                        <img src="/static/images/star.png" alt="⭐" className="balance-star-icon" />
                        <span>{balance}</span>
                    </div>
                </div>
            </div>
            <button className="btn-topup" onClick={() => setTopUpOpen(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                Пополнить
            </button>
        </div>
    );
}