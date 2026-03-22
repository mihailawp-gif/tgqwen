import { useState, useEffect, useMemo } from 'react';
import { useAppStore, useUserStore } from '../store/useStore';
import { fetchInventoryApi, fetchUpgradeGiftsApi, upgradeBetApi } from '../api/api';
import TgsAnimation from '../components/TgsAnimation';

function GiftIcon({ url, className, size = 60 }: { url: string, className?: string, size?: number }) {
    if (!url) return null;
    if (url.endsWith('.tgs')) {
        return (
            <div className={`flex items-center justify-center ${className}`}>
                <TgsAnimation url={url} width={size} height={size} autoplay loop alwaysPlay />
            </div>
        );
    }
    return <img src={url} className={`object-contain ${className}`} style={{ width: size, height: size }} alt="gift" />;
}

export default function UpgradeScreen() {
    const { setActiveScreen, showToast, setLoaderVisible } = useAppStore();
    const { balance, setBalance } = useUserStore();

    const [inventory, setInventory] = useState<any[]>([]);
    const [targetGifts, setTargetGifts] = useState<any[]>([]);
    const [selectedInventoryItemIds, setSelectedInventoryItemIds] = useState<number[]>([]);
    const [selectedTargetGiftId, setSelectedTargetGiftId] = useState<number | null>(null);
    const [addedBalance, setAddedBalance] = useState(0);
    
    const [isRolling, setIsRolling] = useState(false);

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
        loadData();
    }, [telegramId]);

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

    useEffect(() => {
        if (addedBalance > maxAddedBalance) {
            setAddedBalance(maxAddedBalance);
        }
    }, [maxAddedBalance, addedBalance]);

    const availableTargetGifts = useMemo(() => {
        if (inventoryValue === 0) return targetGifts;
        return targetGifts.filter(g => g.value > inventoryValue);
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
            handleResultStatus(res);
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
                
                <img src="/arrow.svg" alt="Arrow Down" className="w-6 h-6 mt-4 opacity-80" />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 flex flex-col items-center pb-24">
                
                {/* Circle Silhouette Area */}
                <div className="relative w-[260px] h-[260px] flex items-center justify-center mt-2">
                    {/* Dark Rings */}
                    <div className="absolute inset-0 rounded-full border-2 border-white/5" />
                    <div className="absolute inset-4 rounded-full border border-white/5" />
                    
                    {/* Center Silhouette or Target */}
                    <div className="relative w-32 h-32 flex items-center justify-center z-10">
                        {targetGift ? (
                            <GiftIcon url={targetGift.image_url} size={100} className="drop-shadow-2xl" />
                        ) : (
                            <img src="/assets/gift-silhouette.png" alt="Silhouette" className="w-full h-full object-contain opacity-20 filter grayscale blur-[1px]" />
                        )}
                    </div>
                </div>

                {/* Multipliers */}
                <div className="flex gap-2 justify-center w-full max-w-[400px] bg-[#1a1d27] rounded-2xl p-1.5 mt-8 border border-white/5">
                    {[{v:1.5, l:'x1.5'}, {v:2, l:'x2'}, {v:3, l:'x3'}, {v:5, l:'x5'}, {v:10, l:'x10'}].map((item, i) => (
                        <button key={i} onClick={() => handleMultiplier(item.v)} disabled={isRolling} className="bg-transparent hover:bg-white/10 active:bg-white/20 text-gray-300 text-sm font-bold py-2.5 flex-1 rounded-xl transition-all">
                            {item.l}
                        </button>
                    ))}
                </div>

                {/* Balance Slider */}
                <div className="w-full max-w-[400px] bg-[#1a1d27] mt-4 p-4 rounded-3xl border border-white/5 shrink-0">
                    <div className="flex justify-between text-xs text-gray-400 font-bold mb-3">
                        <span>Докинуть звезд</span>
                        <span className="text-yellow-500">{addedBalance} ⭐</span>
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
                    <div onClick={() => !isRolling && setInventoryModalOpen(true)} className="flex-1 bg-[#1a1d27] border border-white/5 hover:border-white/20 rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all active:scale-95 p-4">
                        {inventoryItems.length > 0 ? (
                            <div className="flex flex-col items-center w-full h-full justify-center">
                                <div className="flex flex-wrap gap-1 justify-center w-full">
                                    {inventoryItems.slice(0,3).map((i, idx) => (
                                        <GiftIcon key={idx} url={i.gift.image_url} size={36} />
                                    ))}
                                    {inventoryItems.length > 3 && <div className="text-sm font-bold text-gray-500 mt-2">+{inventoryItems.length - 3}</div>}
                                </div>
                                <span className="text-yellow-500 text-sm font-bold mt-2">{inventoryValue} ⭐</span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center gap-3 w-full h-full opacity-60">
                                <img src="/plus.svg" alt="Plus" className="w-8 h-8" />
                                <span className="text-xs text-gray-400 font-bold text-center leading-tight">Подарок из<br/>инвентаря</span>
                            </div>
                        )}
                    </div>
                    
                    <div onClick={() => !isRolling && setTargetModalOpen(true)} className="flex-1 bg-[#1a1d27] border border-white/5 hover:border-white/20 rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all active:scale-95 p-4">
                        {targetGift ? (
                            <div className="flex flex-col items-center justify-center w-full h-full">
                                <GiftIcon url={targetGift.image_url} size={64} className="mb-2" />
                                <span className="text-[10px] uppercase text-gray-400 font-bold text-center truncate w-full">{targetGift.name}</span>
                                <span className="text-xs text-yellow-500 font-bold mt-1">{targetGift.value} ⭐</span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center gap-3 w-full h-full opacity-60">
                                <img src="/plus.svg" alt="Plus" className="w-8 h-8" />
                                <span className="text-xs text-gray-400 font-bold text-center leading-tight">На что<br/>улучшить</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Upgrade Button */}
                <button 
                    onClick={playUpgrade} 
                    disabled={isRolling || selectedInventoryItemIds.length === 0 || !selectedTargetGiftId} 
                    className="w-full max-w-[400px] shrink-0 bg-[#1a1d27] text-white/50 border border-white/5 font-bold text-lg py-4 rounded-3xl mt-6 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center"
                    style={selectedInventoryItemIds.length > 0 && selectedTargetGiftId ? { background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', border: 'none', boxShadow: '0 8px 24px rgba(59,130,246,0.4)' } : {}}
                >
                    Апгрейд
                </button>
            </div>

            {/* Inventory Modal */}
            {inventoryModalOpen && (
                <div className="fixed inset-0 z-50 bg-[#090a0f]/90 backdrop-blur-md flex flex-col">
                    <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[#13151c]">
                        <h3 className="font-bold">Выбрано: {selectedInventoryItemIds.length}/6</h3>
                        <button onClick={() => setInventoryModalOpen(false)} className="bg-white/10 px-4 py-2 rounded-xl text-sm font-bold">Готово</button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 grid grid-cols-3 gap-3 content-start">
                        {inventory.length === 0 ? (
                            <div className="col-span-3 text-center text-gray-500 mt-10 font-bold">Инвентарь пуст</div>
                        ) : inventory.map((item, idx) => (
                            <div 
                                key={idx} 
                                onClick={() => toggleInventoryItem(item.opening_id)}
                                className={`bg-[#1a1d27] rounded-2xl p-2 flex flex-col items-center border-2 transition-all cursor-pointer relative ${selectedInventoryItemIds.includes(item.opening_id) ? 'border-yellow-500 bg-yellow-500/10' : 'border-transparent hover:border-white/10'}`}
                            >
                                <GiftIcon url={item.gift.image_url} size={48} className="my-2" />
                                <div className="text-[10px] text-gray-400 truncate w-full text-center mt-1 font-bold">{item.gift.name}</div>
                                <div className="text-xs font-black text-yellow-500 mt-1 mb-2">{item.gift.value} ⭐</div>
                                
                                {selectedInventoryItemIds.includes(item.opening_id) && (
                                    <div className="absolute top-2 right-2 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center text-black">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M5 12l5 5L20 7"/></svg>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Target Modal (Market) */}
            {targetModalOpen && (
                <div className="fixed inset-0 z-50 bg-[#090a0f]/90 backdrop-blur-md flex flex-col">
                    <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[#13151c]">
                        <h3 className="font-bold">Выбор подарка (Маркет)</h3>
                        <button onClick={() => setTargetModalOpen(false)} className="bg-white/10 px-4 py-2 rounded-xl text-sm font-bold">Закрыть</button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 grid grid-cols-3 gap-3 content-start">
                        {availableTargetGifts.length === 0 ? (
                            <div className="col-span-3 text-center text-gray-500 mt-10 font-bold">Нет доступных подарков для вашей ставки</div>
                        ) : availableTargetGifts.map((g, idx) => (
                            <div 
                                key={idx} 
                                onClick={() => { setSelectedTargetGiftId(g.id); setAddedBalance(0); setTargetModalOpen(false); }}
                                className={`bg-[#1a1d27] rounded-2xl p-2 flex flex-col items-center border-2 transition-all cursor-pointer ${selectedTargetGiftId === g.id ? 'border-blue-500 bg-blue-500/10' : 'border-transparent hover:border-white/10'}`}
                            >
                                <GiftIcon url={g.image_url} size={48} className="my-2" />
                                <div className="text-[10px] text-gray-400 truncate w-full text-center mt-1 font-bold">{g.name}</div>
                                <div className="text-xs font-black text-yellow-500 mt-1 mb-2">{g.value} ⭐</div>
                            </div>
                        ))}
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
                        <div className="text-yellow-500 font-bold mt-2 text-2xl">{wonItem.value} ⭐</div>

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
