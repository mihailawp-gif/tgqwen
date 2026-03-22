import { useState, useEffect } from 'react';
import { useAppStore, useUserStore } from '../store/useStore';
import { fetchProfileApi, api } from '../api/api';

export default function ProfilePage() {
    const { showToast, setLoaderVisible } = useAppStore();
    const { balance, setBalance, name, avatarUrl } = useUserStore();

    const [profileData, setProfileData] = useState<any>(null);
    const [showReferrals, setShowReferrals] = useState(false);
    const [referrals, setReferrals] = useState<any[]>([]);
    const [refEarned, setRefEarned] = useState(0);
    const [refCount, setRefCount] = useState(0);
    const [promoCode, setPromoCode] = useState('');

    const telegramId = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;
    const botUsername = 'ludomihabot';

    useEffect(() => {
        loadProfile();
    }, []);

    const loadProfile = async () => {
        if (!telegramId) return;
        setLoaderVisible(true);
        try {
            const res = await fetchProfileApi(telegramId);
            if (res.success) {
                setProfileData(res.profile);
            }
        } catch (e) { }
        setLoaderVisible(false);
    };

    const loadReferrals = async () => {
        if (!telegramId) return;
        setShowReferrals(true);

        try {
            const profileRes = await api.get(`/user/${telegramId}/profile`) as any;
            if (profileRes.success) {
                setRefEarned(profileRes.profile.available_referral_earnings || 0);
                setRefCount(profileRes.profile.total_referrals || 0);
            }

            const res = await api.get(`/user/${telegramId}/referrals`) as any;
            if (res.success) {
                setReferrals(res.referrals || []);
            }
        } catch (e) { }
    };

    const withdrawReferralEarnings = async () => {
        if (!telegramId) return;
        setLoaderVisible(true);
        try {
            const res = await api.post('/user/withdraw-referrals', { telegram_id: telegramId }) as any;
            if (res.success) {
                setBalance(res.new_balance);
                setRefEarned(0);
                showToast(`Успешно выведено ${res.withdrawn} ⭐ на баланс!`);
            } else {
                showToast('❌ ' + (res.error || 'Ошибка вывода'));
            }
        } catch (e) {
            showToast('❌ Ошибка сети');
        }
        setLoaderVisible(false);
    };

    const copyReferralLink = () => {
        const link = `https://t.me/${botUsername}?start=${profileData?.referral_code || ''}`;
        navigator.clipboard.writeText(link).then(() => {
            showToast('📋 Ссылка скопирована!');
        }).catch(() => {
            showToast('❌ Не удалось скопировать');
        });
    };

    const shareReferralLink = () => {
        const link = `https://t.me/${botUsername}?start=${profileData?.referral_code || ''}`;
        const text = encodeURIComponent('🎁 Залетай скорей! Открывай бесплатный кейс и выигрывай Telegram NFT!');
        const tg = (window as any).Telegram?.WebApp;
        if (tg && tg.openTelegramLink) {
            tg.openTelegramLink(`https://t.me/share/url?url=${link}&text=${text}`);
        } else {
            window.open(`https://t.me/share/url?url=${link}&text=${text}`, '_blank');
        }
    };

    const activatePromo = async () => {
        if (!promoCode.trim()) return showToast('❌ Введите код');
        setLoaderVisible(true);
        try {
            const res = await api.post('/promo/activate', { user_id: telegramId, code: promoCode.trim() }) as any;
            if (res.success) {
                setPromoCode('');
                setBalance(res.balance);
                if (profileData) setProfileData({ ...profileData, balance: res.balance });
                showToast(`🎉 ${res.message}`);
            } else {
                showToast('❌ ' + res.error);
            }
        } catch (e) {
            showToast('❌ Ошибка сети');
        }
        setLoaderVisible(false);
    };

    // Referrals modal
    if (showReferrals) {
        return (
            <div className="tab-content active" style={{ minHeight: '100vh' }}>
                <div className="modal active" style={{ display: 'flex' }}>
                    <div className="modal-overlay" onClick={() => setShowReferrals(false)} />
                    <div className="modal-content ref-new-modal">
                        <div className="ref-header">
                            <h2>Рефералы</h2>
                            <div className="ref-balance-badge">
                                <img src="/assets/images/star.png" style={{ width: '16px', height: '16px' }} alt="star" />
                                {balance}
                            </div>
                        </div>

                        <div className="ref-body">
                            <div className="ref-block">
                                <div className="ref-title-sm">ВАША ССЫЛКА</div>
                                <div className="ref-desc">
                                    Приглашайте друзей и получайте <span className="text-blue">10%</span> от их пополнений!
                                </div>
                                <div className="ref-input-group">
                                    <input readOnly value={`https://t.me/${botUsername}?start=${profileData?.referral_code || ''}`} />
                                    <button className="btn-ref-copy" onClick={copyReferralLink}>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                        </svg>
                                    </button>
                                </div>
                                <button className="btn-ref-share" onClick={shareReferralLink}>Поделиться</button>
                            </div>

                            <div className="ref-stats-flex">
                                <div className="ref-stat-box">
                                    <div className="ref-stat-label">ДОСТУПНО</div>
                                    <div className="ref-stat-value">
                                        <img src="/assets/images/star.png" style={{ width: '20px', height: '20px' }} alt="star" />
                                        {refEarned}
                                    </div>
                                </div>
                                <div className="ref-stat-box">
                                    <div className="ref-stat-label">РЕФЕРАЛОВ</div>
                                    <div className="ref-stat-value">{refCount}</div>
                                </div>
                            </div>

                            <button className="btn-ref-withdraw" onClick={withdrawReferralEarnings} disabled={refEarned <= 0}>
                                Вывести на баланс
                            </button>

                            <div className="ref-list-title">Ваши рефералы</div>
                            {referrals.length === 0 ? (
                                <div className="empty-state" style={{ paddingTop: '20px' }}>
                                    <div style={{ fontSize: '40px', marginBottom: '10px', opacity: 0.5 }}>
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                            <circle cx="9" cy="7" r="4" />
                                            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                        </svg>
                                    </div>
                                    Пока нет рефералов
                                    <br />
                                    <span style={{ fontSize: '12px', color: '#888' }}>Поделитесь ссылкой с друзьями, чтобы заработать звезды</span>
                                </div>
                            ) : (
                                referrals.map((ref, i) => {
                                    const regDate = new Date(ref.joined_at || new Date()).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
                                    return (
                                        <div key={i} className="modern-list-item">
                                            <div className="ml-left">
                                                <div className="ml-avatar">
                                                    {ref.photo_url ? <img src={ref.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👤'}
                                                </div>
                                                <div className="ml-info">
                                                    <div className="ml-title">{ref.first_name || 'Игрок'}</div>
                                                    <div className="ml-subtitle">Регистрация: {regDate}</div>
                                                </div>
                                            </div>
                                            <div className="ml-right">
                                                <div className="ml-value positive">
                                                    +{ref.total_earned || 0}
                                                    <img src="/assets/images/star.png" style={{ width: '14px', height: '14px', verticalAlign: 'middle' }} alt="star" />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="tab-content active">
            <div className="profile-content">
                <div className="profile-avatar-section">
                    <div className="profile-avatar" id="profileAvatar">
                        {avatarUrl ? (
                            <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : '👤'}
                    </div>
                    <h3>{profileData?.first_name || name || 'Пользователь'}</h3>
                    <div className="profile-username">
                        {profileData?.username ? `@${profileData.username}` : ''}
                    </div>
                </div>

                <div className="profile-balance-card">
                    <div className="balance-label">Баланс</div>
                    <div className="balance-amount">
                        <img src="/assets/images/star.png" className="profile-star-icon" alt="star" />
                        <span>{profileData?.balance ?? balance}</span>
                    </div>
                </div>

                <div className="profile-stats-grid">
                    <div className="stat-card">
                        <div className="stat-value">{profileData?.total_openings || 0}</div>
                        <div className="stat-label">Открытий</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{profileData?.total_referrals || 0}</div>
                        <div className="stat-label">Рефералов</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{profileData?.total_deposits || 0}</div>
                        <div className="stat-label">Депозитов</div>
                    </div>
                </div>

                <button className="btn-profile-action" onClick={loadReferrals}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    Рефералы и заработок
                </button>

                {/* Promo code */}
                <div style={{ marginTop: '8px' }}>
                    <div className="custom-amount-input" style={{ gap: '10px' }}>
                        <input
                            type="text"
                            placeholder="Введите промокод"
                            value={promoCode}
                            onChange={(e) => setPromoCode(e.target.value)}
                            style={{
                                flex: 1, background: 'var(--card2)', border: '1px solid var(--border)',
                                borderRadius: '16px', padding: '16px', color: 'var(--txt)',
                                fontFamily: "'Exo 2', sans-serif", fontSize: '16px', fontWeight: 700, outline: 'none'
                            }}
                        />
                        <button className="btn-custom-amount" onClick={activatePromo}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                                <path d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}