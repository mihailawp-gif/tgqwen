import { useState, useEffect, useMemo } from 'react';
import { useAppStore, useUserStore } from '../store/useStore';
import { fetchInventoryApi, fetchUpgradeGiftsApi, upgradeBetApi } from '../api/api';
import TgsAnimation from '../components/TgsAnimation';

function GiftIcon({ url, className, size = 60, hoverPlay = false }: { url: string, className?: string, size?: number, hoverPlay?: boolean }) {
    if (!url) return null;
    if (url.endsWith('.tgs')) {
        return (
            <div className={`flex items-center justify-center ${className}`}>
                <TgsAnimation url={url} width={size} height={size} autoplay={!hoverPlay} alwaysPlay={!hoverPlay} hoverPlay={hoverPlay} />
            </div>
        );
    }
    return <img src={url} className={`object-contain ${className}`} style={{ width: size, height: size }} alt="gift" />;
}

export default function UpgradeScreen() {
    const { activeScreen, setActiveScreen, showToast, setLoaderVisible } = useAppStore();
    const { balance, setBalance } = useUserStore();

    const [inventory, setInventory] = useState<any[]>([]);
    const [targetGifts, setTargetGifts] = useState<any[]>([]);
    const [selectedInventoryItemIds, setSelectedInventoryItemIds] = useState<number[]>([]);
    const [selectedTargetGiftId, setSelectedTargetGiftId] = useState<number | null>(null);
    const [addedBalance, setAddedBalance] = useState(0);
    
    const [isRolling, setIsRolling] = useState(false);
    const [isFast] = useState(false);
    const [needleRotation, setNeedleRotation] = useState(0);

    const [inventoryModalOpen, setInventoryModalOpen] = useState(false);
    const [targetModalOpen, setTargetModalOpen] = useState(false);
    
    const [winOverlayOpen, setWinOverlayOpen] = useState(false);
    const [wonItem, setWonItem] = useState<any>(null);

    const telegramId = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;

    const loadData = async () => {
        if (!telegramId) return;
        const [invRes, giftsRes] = await Promise.all([
            fetchInventoryApi(telegramId),
            fetchUpgradeGiftsApi()
        ]);
        if (invRes.success) {
            setInventory(invRes.inventory.filter((item: any) => !item.status || item.status !== 'pending' && !item.is_sold));
            setSelectedInventoryItemIds(prev => prev.filter(id => invRes.inventory.some((i: any) => i.opening_id === id)));
        }
        if (giftsRes.success) {
            setTargetGifts(giftsRes.gifts);
        }
    };

    useEffect(() => {
        if (activeScreen === 'upgrade-screen') {
            loadData();
        }
    }, [telegramId, activeScreen]);

    const inventoryItems = useMemo(() => {
        return inventory.filter(i => selectedInventoryItemIds.includes(i.opening_id));
    }, [inventory, selectedInventoryItemIds]);

    const inventoryValue = useMemo(() => {
        return inventoryItems.reduce((acc, curr) => acc + (curr.gift.value || 0), 0);
    }, [inventoryItems]);

    const targetGift = useMemo(() => {
        return targetGifts.find(g => g.id === selectedTargetGiftId) || null;
    }, [targetGifts, selectedTargetGiftId]);

    const targetValue = targetGift?.value || 0;

    const maxAddedBalanceTarget = targetValue > 0 ? Math.ceil((85 / 0.95 / 100) * targetValue) - inventoryValue : 0;
    const maxAddedBalance = Math.max(0, Math.min(balance || 0, maxAddedBalanceTarget));

    const rawChance = targetValue > 0 ? ((inventoryValue + addedBalance) / targetValue * 100) * 0.95 : 0;
    const chance = targetValue > 0 ? Math.min(85, Math.max(0, rawChance)) : 0;

    useEffect(() => {
        if (addedBalance > maxAddedBalance) {
            setAddedBalance(maxAddedBalance);
        }
    }, [maxAddedBalance, addedBalance]);

    const availableTargetGifts = useMemo(() => {
        let filtered = targetGifts.filter(g => !g.name.toLowerCase().startsWith('star'));
        if (inventoryValue === 0) return filtered;
        return filtered.filter(g => g.value > inventoryValue);
    }, [targetGifts, inventoryValue]);

    const toggleInventoryItem = (id: number) => {
        if (selectedInventoryItemIds.includes(id)) {
            setSelectedInventoryItemIds(prev => prev.filter(i => i !== id));
        } else {
            if (selectedInventoryItemIds.length >= 6) {
                showToast('❌ Максимум 6 предметов');
                return;
            }
            setSelectedInventoryItemIds(prev => [...prev, id]);
        }
    };

    const handleMultiplier = (val: number) => {
        if (inventoryValue === 0) return showToast('❌ Сначала выберите предметы из инвентаря');
        
        let targetV = inventoryValue * val;

        if (targetV <= 0) return;

        let closest = targetGifts[0];
        let minDiff = Infinity;
        for (const g of availableTargetGifts) {
            const diff = Math.abs(g.value - targetV);
            if (diff < minDiff) {
                minDiff = diff;
                closest = g;
            }
        }
        if (closest) {
            setSelectedTargetGiftId(closest.id);
            setAddedBalance(0);
        }
    };

    const playUpgrade = async () => {
        if (isRolling) return;
        if (selectedInventoryItemIds.length === 0) return showToast('❌ Выберите свою ставку');
        if (!selectedTargetGiftId) return showToast('❌ Выберите желаемый подарок');
        if (targetValue <= inventoryValue) return showToast('❌ Желаемый подарок должен быть дороже твоей ставки');
        
        setIsRolling(true);
        setLoaderVisible(true);
        const res = await upgradeBetApi(selectedInventoryItemIds, selectedTargetGiftId, addedBalance);
        setLoaderVisible(false);

        if (res.success) {
            setBalance(res.balance);
            if (!isFast) {
                const finalDeg = (res.roll / 100) * 360;
                setNeedleRotation(prev => prev + 360 * 5 + (finalDeg - (prev % 360)));
                setTimeout(() => {
                    handleResultStatus(res);
                }, 3500); // 3.5s transition
            } else {
                setNeedleRotation((res.roll / 100) * 360);
                handleResultStatus(res);
            }
        } else {
            setIsRolling(false);
            showToast(res.error || 'Ошибка');
        }
    };

    const handleResultStatus = (res: any) => {
        setIsRolling(false);
        if (res.is_successful) {
            if ((window as any).Telegram?.WebApp?.HapticFeedback) {
                (window as any).Telegram.WebApp.HapticFeedback.notificationOccurred('success');
            }
            setWonItem(res.new_item.gift);
            setWinOverlayOpen(true);
        } else {
            showToast('❌ Апгрейд не удался');
            if ((window as any).Telegram?.WebApp?.HapticFeedback) {
                (window as any).Telegram.WebApp.HapticFeedback.notificationOccurred('error');
            }
        }
        setSelectedInventoryItemIds([]);
        loadData();
    };

    return (
        <div className="flex flex-col min-h-screen bg-[#13151c] text-white">
            {/* Header */}
            <div className="p-4 flex flex-col items-center justify-center z-10 sticky top-0 relative">
                <button className="absolute left-4 top-4 p-2 rounded-full bg-white/5" onClick={() => setActiveScreen('main-screen')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                </button>
                <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="4"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                    </div>
                    <h2 className="font-bold text-xl tracking-wide">Апгрейд</h2>
                </div>
                
                <div className="flex bg-[#1c1f28] rounded-full p-1 border border-white/5 shadow-sm transform hover:scale-105 transition-all text-gray-400 mt-2 z-20">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9l6 6 6-6" />
                    </svg>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 flex flex-col items-center pb-24">
                
                {/* Circle Silhouette Area */}
                <div className="relative w-[300px] h-[300px] flex items-center justify-center mt-[-10px]">
                    {/* Textured Dark Rings */}
                    <div className="absolute inset-4 rounded-full border border-white/5 bg-[#171a22]" />
                    <div className="absolute inset-10 rounded-full border border-white/5 bg-[#1b1f28]" />
                    <div className="absolute inset-16 rounded-full border border-white/5 bg-[#1e222d]" />
                    
                    {/* SVG Chance Ring */}
                    <svg className="absolute w-[280px] h-[280px] -rotate-90 pointer-events-none z-10" viewBox="0 0 280 280">
                        <circle cx="140" cy="140" r="130" fill="none" stroke="#2a2d36" strokeWidth="8" />
                        <circle cx="140" cy="140" r="130" fill="none" stroke="#22c55e" strokeWidth="8" strokeLinecap="round"
                            strokeDasharray={2 * Math.PI * 130} 
                            strokeDashoffset={(2 * Math.PI * 130) * (1 - chance / 100)} 
                            style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }} 
                        />
                    </svg>

                    {/* Needle */}
                    <div className="absolute top-0 left-0 w-full h-full p-2 pointer-events-none z-20" style={{ transform: `rotate(${needleRotation}deg)`, transition: isRolling && !isFast ? 'transform 3.5s cubic-bezier(0.1, 0.7, 0.1, 1)' : 'none' }}>
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 drop-shadow-md rotate-180">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="#ffffff" stroke="#ffffff" strokeWidth="2" strokeLinejoin="round">
                                <path d="M12 2L2 22h20L12 2z"/>
                            </svg>
                        </div>
                    </div>

                    {/* Center Silhouette or Target */}
                    <div className="relative w-36 h-36 flex flex-col items-center justify-center z-10 mt-4">
                        {targetGift ? (
                            <GiftIcon url={targetGift.image_url} size={110} className="drop-shadow-2xl" />
                        ) : (
                            <img src="/assets/gift-silhouette.png" alt="Silhouette" className="w-[100px] h-[100px] object-contain opacity-20 filter grayscale blur-[1px]" />
                        )}
                        <span className="text-xl font-black mt-1 text-gray-200">{chance.toFixed(2)}%</span>
                    </div>
                </div>

                {/* Multipliers */}
                <div className="flex gap-2 justify-center w-full max-w-[400px] bg-[#1a1d27] rounded-3xl p-1.5 mt-8 border border-white/5">
                    {[{v:1.5, l:'x1.5'}, {v:2, l:'x2'}, {v:3, l:'x3'}, {v:5, l:'x5'}, {v:10, l:'x10'}].map((item, i) => (
                        <button key={i} onClick={() => handleMultiplier(item.v)} disabled={isRolling} className="bg-transparent hover:bg-white/10 active:bg-white/20 text-gray-300 text-sm font-bold py-3 flex-1 rounded-2xl transition-all">
                            {item.l}
                        </button>
                    ))}
                </div>

                {/* Balance Slider */}
                <div className="w-full max-w-[400px] bg-[#1a1d27] mt-4 p-4 rounded-3xl border border-white/5 shrink-0">
                    <div className="flex justify-between items-center text-xs text-gray-400 font-bold mb-3 px-1">
                        <span>Докинуть звезд</span>
                        <div className="text-yellow-500 flex items-center gap-1">
                            {addedBalance} <img src="/assets/images/star.png" className="w-3.5 h-3.5" alt="star" />
                        </div>
                    </div>
                    <input 
                        type="range" 
                        min="0" 
                        max={maxAddedBalance || 0} 
                        value={addedBalance} 
                        onChange={(e) => setAddedBalance(Number(e.target.value))} 
                        disabled={isRolling || !selectedTargetGiftId || maxAddedBalance === 0}
                        className="w-full accent-yellow-500" 
                    />
                </div>

                {/* Selection Cards */}
                <div className="flex w-full max-w-[400px] gap-4 mt-6 h-40 shrink-0">
                    <div onClick={() => !isRolling && setInventoryModalOpen(true)} className="flex-1 bg-[#1a1d27] border border-white/5 hover:border-white/20 rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all active:scale-95 p-4 shadow-lg relative">
                        {inventoryItems.length > 0 ? (
                            <div className="flex flex-col items-center w-full h-full justify-center">
                                {inventoryItems.length === 1 ? (
                                    <>
                                        <GiftIcon url={inventoryItems[0].gift.image_url} size={64} className="mb-2" />
                                        <div className="flex items-center gap-1 justify-center">
                                            <span className="text-yellow-500 font-bold text-sm">{inventoryValue}</span>
                                            <img src="/assets/images/star.png" className="w-4 h-4" alt="star" />
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex flex-wrap gap-1 justify-center w-full">
                                            {inventoryItems.slice(0,3).map((i, idx) => (
                                                <GiftIcon key={idx} url={i.gift.image_url} size={36} />
                                            ))}
                                            {inventoryItems.length > 3 && <div className="text-sm font-bold text-gray-500 mt-2">+{inventoryItems.length - 3}</div>}
                                        </div>
                                        <div className="flex items-center gap-1 justify-center mt-2">
                                            <span className="text-yellow-500 font-bold text-sm">{inventoryValue}</span>
                                            <img src="/assets/images/star.png" className="w-4 h-4" alt="star" />
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center gap-3 w-full h-full opacity-60">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><path d="M12 5v14m-7-7h14" /></svg>
                                <span className="text-xs text-gray-400 font-bold text-center leading-tight">Подарок из<br/>инвентаря</span>
                            </div>
                        )}
                    </div>
                    
                    <div onClick={() => !isRolling && setTargetModalOpen(true)} className="flex-1 bg-[#1a1d27] border border-white/5 hover:border-white/20 rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all active:scale-95 p-4 shadow-lg relative">
                        {targetGift ? (
                            <div className="flex flex-col items-center justify-center w-full h-full">
                                <GiftIcon url={targetGift.image_url} size={64} className="mb-2" />
                                <span className="text-[10px] uppercase text-gray-400 font-bold text-center truncate w-full">{targetGift.name}</span>
                                <div className="flex items-center gap-1 justify-center mt-1">
                                    <span className="text-yellow-500 font-bold text-sm">{targetGift.value}</span>
                                    <img src="/assets/images/star.png" className="w-4 h-4" alt="star" />
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center gap-3 w-full h-full opacity-60">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><path d="M12 5v14m-7-7h14" /></svg>
                                <span className="text-xs text-gray-400 font-bold text-center leading-tight">На что<br/>улучшить</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Upgrade Button */}
                <button 
                    onClick={playUpgrade} 
                    disabled={isRolling || selectedInventoryItemIds.length === 0 || !selectedTargetGiftId} 
                    className="w-full max-w-[400px] shrink-0 bg-[#2b2d38] text-gray-500 border border-white/5 font-bold text-lg py-4 rounded-3xl mt-6 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center shadow-md"
                    style={selectedInventoryItemIds.length > 0 && selectedTargetGiftId ? { background: '#2563eb', color: '#fff', border: 'none', boxShadow: '0 8px 24px rgba(37,99,235,0.4)' } : {}}
                >
                    Апгрейд
                </button>
            </div>

            {/* Bottom-sheet Animations */}
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes slideUpModal {
                    from { transform: translateY(100%); }
                    to { transform: translateY(0); }
                }
                .bottom-sheet-anim {
                    animation: slideUpModal 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
            `}} />

            {/* Inventory Bottom Sheet Modal */}
            {inventoryModalOpen && (
                <div className="fixed inset-0 z-50 bg-[#090a0f]/80 backdrop-blur-sm flex flex-col justify-end" onClick={() => setInventoryModalOpen(false)}>
                    <div className="w-full bg-[#1c1f28] rounded-t-[32px] pt-4 pb-8 flex flex-col max-h-[85vh] bottom-sheet-anim shadow-[0_-10px_40px_rgba(0,0,0,0.5)]" onClick={e => e.stopPropagation()}>
                        <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-4" />
                        <h3 className="font-bold text-center text-xl mb-4">Ваши подарки</h3>
                        <div className="text-center text-sm text-gray-400 font-medium mb-6">Выбрано: {selectedInventoryItemIds.length}/6</div>
                        
                        <div className="flex-1 overflow-y-auto px-4 grid grid-cols-3 gap-3 content-start pb-20">
                            {inventory.length === 0 ? (
                                <div className="col-span-3 text-center text-gray-500 mt-6 font-bold pb-20">Нет подарков в инвентаре</div>
                            ) : inventory.map((item, idx) => (
                                <div 
                                    key={idx} 
                                    onClick={() => toggleInventoryItem(item.opening_id)}
                                    className={`bg-[#171a22] rounded-3xl p-3 flex flex-col items-center border-[2.5px] transition-all cursor-pointer relative shadow-sm ${selectedInventoryItemIds.includes(item.opening_id) ? 'border-yellow-500 bg-[#252a34]' : 'border-transparent hover:border-white/10'}`}
                                >
                                    <GiftIcon url={item.gift.image_url} size={48} className="my-2" hoverPlay />
                                    <div className="text-[10px] text-gray-400 truncate w-full text-center mt-1 font-bold uppercase">{item.gift.name}</div>
                                    <div className="text-xs font-black text-yellow-500 mt-1 mb-1 flex justify-center items-center gap-1">
                                        {item.gift.value} <img src="/assets/images/star.png" className="w-3.5 h-3.5" alt="star" />
                                    </div>
                                    
                                    {selectedInventoryItemIds.includes(item.opening_id) && (
                                        <div className="absolute top-2 right-2 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center text-black shadow-md">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Button pinned slightly at the bottom if needed, or close button */}
                        <div className="px-4 mt-auto w-full max-w-[400px] absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none">
                            <button onClick={() => setInventoryModalOpen(false)} className="w-full bg-[#2a2d36] text-white font-bold text-lg py-4 rounded-3xl shadow-lg border border-white/5 active:scale-95 transition-transform pointer-events-auto">
                                Апгрейд
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Target Modal (Market) Bottom Sheet */}
            {targetModalOpen && (
                <div className="fixed inset-0 z-50 bg-[#090a0f]/80 backdrop-blur-sm flex flex-col justify-end" onClick={() => setTargetModalOpen(false)}>
                    <div className="w-full bg-[#1c1f28] rounded-t-[32px] pt-4 pb-8 flex flex-col max-h-[85vh] bottom-sheet-anim shadow-[0_-10px_40px_rgba(0,0,0,0.5)]" onClick={e => e.stopPropagation()}>
                        <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-4" />
                        <h3 className="font-bold text-center text-xl mb-6">Выбор подарка</h3>
                        
                        <div className="flex-1 overflow-y-auto px-4 grid grid-cols-3 gap-3 content-start pb-20">
                            {availableTargetGifts.length === 0 ? (
                                <div className="col-span-3 text-center text-gray-500 mt-10 font-bold pb-20">Нет доступных подарков для вашей ставки</div>
                            ) : availableTargetGifts.map((g, idx) => (
                                <div 
                                    key={idx} 
                                    onClick={() => { setSelectedTargetGiftId(g.id); setAddedBalance(0); setTargetModalOpen(false); }}
                                    className={`bg-[#171a22] rounded-3xl p-3 flex flex-col items-center border-[2.5px] transition-all cursor-pointer relative shadow-sm ${selectedTargetGiftId === g.id ? 'border-blue-500 bg-[#20283d]' : 'border-transparent hover:border-white/10'}`}
                                >
                                    <GiftIcon url={g.image_url} size={48} className="my-2" hoverPlay />
                                    <div className="text-[10px] text-gray-400 truncate w-full text-center mt-1 font-bold uppercase">{g.name}</div>
                                    <div className="text-xs font-black text-yellow-500 mt-1 mb-1 flex items-center justify-center gap-1">
                                        {g.value} <img src="/assets/images/star.png" className="w-3.5 h-3.5" alt="star" />
                                    </div>
                                    
                                    {selectedTargetGiftId === g.id && (
                                        <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white shadow-md">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Win Overlay Animation */}
            {winOverlayOpen && wonItem && (
                <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-6 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="flex flex-col items-center animate-in zoom-in-95 duration-500 w-full max-w-[400px]">
                        <div className="text-green-400 text-3xl font-black mb-8 tracking-wider drop-shadow-[0_0_20px_rgba(74,222,128,0.5)]">
                            АПГРЕЙД УСПЕШЕН!
                        </div>
                        <div className="relative w-56 h-56 flex items-center justify-center">
                            <div className="absolute inset-0 bg-blue-500/20 blur-[60px] rounded-full animate-pulse"></div>
                            <GiftIcon url={wonItem.image_url} size={160} className="filter drop-shadow-[0_0_30px_rgba(59,130,246,0.6)] animate-[bounce_3s_infinite]" />
                        </div>
                        <div className="text-2xl font-bold mt-8 text-center">{wonItem.name}</div>
                        <div className="text-yellow-500 font-bold mt-2 text-2xl flex items-center justify-center gap-2">
                            {wonItem.value} <img src="/assets/images/star.png" className="w-6 h-6" alt="star" />
                        </div>

                        <button 
                            onClick={() => setWinOverlayOpen(false)}
                            className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold text-lg py-4 rounded-3xl mt-12 shadow-[0_8px_30px_rgba(59,130,246,0.4)] active:scale-95 transition-all"
                        >
                            ПРОДОЛЖИТЬ
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
