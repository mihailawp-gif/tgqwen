import { useState, useEffect, useMemo } from 'react';
import { useAppStore, useUserStore } from '../store/useStore';
import { fetchInventoryApi, fetchUpgradeGiftsApi, upgradeBetApi } from '../api/api';

export default function UpgradeScreen() {
    const { setActiveScreen, showToast } = useAppStore();
    const { balance, setBalance } = useUserStore();

    const [inventory, setInventory] = useState<any[]>([]);
    const [targetGifts, setTargetGifts] = useState<any[]>([]);
    const [selectedInventoryItemIds, setSelectedInventoryItemIds] = useState<number[]>([]);
    const [selectedTargetGiftId, setSelectedTargetGiftId] = useState<number | null>(null);
    const [addedBalance, setAddedBalance] = useState(0);
    const [isFast, setIsFast] = useState(false);
    
    const [isRolling, setIsRolling] = useState(false);
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
            // Cleanup selected if they disappeared
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

    const rawChance = targetValue > 0 ? ((inventoryValue + addedBalance) / targetValue * 100) * 0.95 : 0;
    const chance = targetValue > 0 ? Math.min(85, Math.max(0, rawChance)) : 0;

    const maxAddedBalanceTarget = targetValue > 0 ? Math.ceil((85 / 0.95 / 100) * targetValue) - inventoryValue : 0;
    const maxAddedBalance = Math.max(0, Math.min(balance, maxAddedBalanceTarget));

    // Reset added balance if it exceeds max allowed after target changes
    useEffect(() => {
        if (addedBalance > maxAddedBalance) {
            setAddedBalance(maxAddedBalance);
        }
    }, [maxAddedBalance, addedBalance]);

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

    const handleMultiplier = (type: string, val: number) => {
        if (inventoryValue === 0) return showToast('❌ Сначала выберите предметы из инвентаря');
        
        let targetV = 0;
        if (type === 'mult') targetV = inventoryValue * val;
        if (type === 'chance') targetV = (inventoryValue / (val / 0.95 / 100)); // val is desired chance in %

        if (targetV <= 0) return;

        // Find closest gift to targetV
        let closest = targetGifts[0];
        let minDiff = Infinity;
        for (const g of targetGifts) {
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
        const res = await upgradeBetApi(selectedInventoryItemIds, selectedTargetGiftId, addedBalance);
        
        if (res.success) {
            setBalance(res.balance);
            if (!isFast) {
                const finalDeg = (res.roll / 100) * 360;
                setNeedleRotation(prev => prev + 360 * 5 + (finalDeg - (prev % 360)));
                
                setTimeout(() => {
                    handleResultStatus(res);
                }, 3500); // Wait for css transition
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
        // Deselect items and reload
        setSelectedInventoryItemIds([]);
        loadData();
    };

    const radius = 90;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (chance / 100) * circumference;

    return (
        <div className="flex flex-col min-h-screen bg-[#13161c] text-white">
            {/* Header */}
            <div className="p-4 flex items-center justify-between z-10 sticky top-0 bg-[#0f1115] border-b border-gray-800">
                <button className="p-2 rounded-lg bg-gray-800" onClick={() => setActiveScreen('main-screen')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                </button>
                <h2 className="font-bold text-lg">Апгрейд</h2>
                <div className="flex items-center gap-1 bg-yellow-500/10 text-yellow-500 px-3 py-1 rounded-full text-sm font-bold">
                    <img src="/assets/images/star.png" alt="star" className="w-4 h-4" />
                    <span>{balance}</span>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center">
                
                {/* Roulette Area */}
                <div className="relative w-[280px] h-[280px] flex items-center justify-center mt-4">
                    {/* Background Circle */}
                    <svg className="absolute w-[220px] h-[220px] -rotate-90" viewBox="0 0 200 200">
                        <circle cx="100" cy="100" r={radius} fill="none" stroke="#2a2e38" strokeWidth="12" />
                        <circle 
                            cx="100" cy="100" r={radius} 
                            fill="none" 
                            stroke="#22c55e" 
                            strokeWidth="12" 
                            strokeLinecap="round"
                            strokeDasharray={circumference} 
                            strokeDashoffset={strokeDashoffset} 
                            style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }} 
                        />
                    </svg>

                    {/* Needle */}
                    <div className="absolute top-0 left-0 w-full h-full p-2 pointer-events-none z-10" style={{ transform: `rotate(${needleRotation}deg)`, transition: isRolling && !isFast ? 'transform 3.5s cubic-bezier(0.1, 0.7, 0.1, 1)' : 'none' }}>
                        <div className="absolute top-2 left-1/2 -translate-x-1/2">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="#facc15" stroke="#000" strokeWidth="2" strokeLinejoin="round">
                                <path d="M12 2L2 22h20L12 2z"/>
                            </svg>
                        </div>
                    </div>

                    {/* Center Info */}
                    <div className="absolute flex flex-col items-center justify-center text-center">
                        <span className="text-3xl font-black">{chance.toFixed(2)}%</span>
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1">ШАНС АПГРЕЙДА</span>
                        
                        <label className="flex items-center gap-2 mt-3 text-xs text-gray-400 font-bold cursor-pointer bg-[#1c2028] px-3 py-1.5 rounded-full z-20 pointer-events-auto shadow-md">
                            <span>БЫСТРО</span>
                            <div className={`w-8 h-4 rounded-full relative transition-colors ${isFast ? 'bg-blue-500' : 'bg-gray-600'}`}>
                                <div className={`absolute top-[2px] left-[2px] w-3 h-3 bg-white rounded-full transition-transform ${isFast ? 'translate-x-4' : 'translate-x-0'}`} />
                            </div>
                            <input type="checkbox" className="hidden" checked={isFast} onChange={() => setIsFast(!isFast)} disabled={isRolling} />
                        </label>
                    </div>
                </div>

                {/* Quick Multipliers */}
                <div className="flex flex-wrap gap-2 justify-center mt-6 w-full max-w-[400px]">
                    {[{t:'mult', v:1.5, l:'x1.5'}, {t:'mult', v:2, l:'x2'}, {t:'mult', v:3, l:'x3'}, {t:'mult', v:5, l:'x5'}, {t:'mult', v:10, l:'x10'}].map((item, i) => (
                        <button key={i} onClick={() => handleMultiplier(item.t, item.v)} disabled={isRolling} className="bg-[#1c2028] hover:bg-[#252a34] text-gray-300 text-xs font-bold py-2.5 px-2 rounded-lg flex-1 min-w-[50px] transition-colors border border-gray-800">{item.l}</button>
                    ))}
                </div>
                <div className="flex flex-wrap gap-2 justify-center mt-2 w-full max-w-[400px]">
                    {[{t:'chance', v:30, l:'30%'}, {t:'chance', v:50, l:'50%'}, {t:'chance', v:75, l:'75%'}].map((item, i) => (
                        <button key={`c${i}`} onClick={() => handleMultiplier(item.t, item.v)} disabled={isRolling} className="bg-[#1c2028] hover:bg-[#252a34] text-gray-300 text-xs font-bold py-2.5 px-2 rounded-lg flex-1 min-w-[50px] transition-colors border border-gray-800">{item.l}</button>
                    ))}
                </div>

                {/* Balance Slider */}
                <div className="w-full max-w-[400px] bg-[#1c2028] mt-4 p-4 rounded-xl border border-gray-800 shrink-0">
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

                {/* Selection Boxes */}
                <div className="flex w-full max-w-[400px] gap-3 mt-4 h-36 border-t border-b border-gray-800/50 py-4 shrink-0 overflow-visible">
                    <div onClick={() => !isRolling && setInventoryModalOpen(true)} className="flex-1 bg-[#1a1d24] border border-gray-800 hover:border-gray-600 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors relative overflow-hidden p-2">
                        {inventoryItems.length > 0 ? (
                            <div className="flex flex-col items-center w-full">
                                <span className="text-yellow-500 text-sm font-bold">{inventoryValue} ⭐</span>
                                <div className="flex flex-wrap gap-1 mt-2 justify-center w-full px-1">
                                    {inventoryItems.slice(0,4).map((i, idx) => (
                                        <img key={idx} src={i.gift.image_url} className="w-8 h-8 object-contain" />
                                    ))}
                                    {inventoryItems.length > 4 && <div className="text-xs text-gray-500 mt-2 font-black">+{inventoryItems.length - 4}</div>}
                                </div>
                            </div>
                        ) : (
                            <>
                                <span className="text-4xl text-gray-600 mb-1">+</span>
                                <span className="text-[10px] uppercase text-gray-500 font-bold text-center">Подарок<br/>из инвентаря</span>
                            </>
                        )}
                    </div>
                    
                    <div className="flex items-center text-gray-600">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
                    </div>

                    <div onClick={() => !isRolling && setTargetModalOpen(true)} className="flex-1 bg-[#1a1d24] border border-gray-800 hover:border-gray-600 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors relative overflow-hidden p-2">
                        {targetGift ? (
                            <div className="flex flex-col items-center justify-center absolute inset-0 text-center px-1">
                                <img src={targetGift.image_url} alt="" className="w-16 h-16 object-contain drop-shadow" />
                                <span className="mt-1 text-[10px] font-bold text-center leading-[1.1] text-gray-300 px-1 truncate w-[85%]">{targetGift.name}</span>
                                <span className="text-[10px] text-yellow-500 font-bold mt-1">{targetGift.value} ⭐</span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center w-full h-full">
                                <span className="text-4xl text-gray-600 mb-1">+</span>
                                <span className="text-[10px] uppercase text-gray-500 font-bold text-center">На что<br/>улучшить</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Upgrade Button */}
                <button 
                    onClick={playUpgrade} 
                    disabled={isRolling} 
                    className="w-full max-w-[400px] shrink-0 bg-[#8c734b] hover:bg-[#a68a5c] text-white font-black text-lg tracking-wider py-4 rounded-xl mt-4 mb-8 shadow-[0_0_20px_rgba(140,115,75,0.2)] transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                >
                    АПГРЕЙД 
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                </button>
            </div>

            {/* Inventory Modal */}
            {inventoryModalOpen && (
                <div className="fixed inset-0 z-50 bg-[#0f1115] flex flex-col">
                    <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#13161c]">
                        <h3 className="font-bold">Выбрано: {selectedInventoryItemIds.length}/6</h3>
                        <button onClick={() => setInventoryModalOpen(false)} className="bg-gray-800 px-4 py-1.5 rounded-lg text-sm text-gray-300 font-bold">Готово</button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 grid grid-cols-3 gap-3 content-start">
                        {inventory.length === 0 ? (
                            <div className="col-span-3 text-center text-gray-500 mt-10">Инвентарь пуст</div>
                        ) : inventory.map((item, idx) => (
                            <div 
                                key={idx} 
                                onClick={() => toggleInventoryItem(item.opening_id)}
                                className={`bg-[#1c2028] rounded-xl p-2 flex flex-col items-center border-[2px] transition-all cursor-pointer ${selectedInventoryItemIds.includes(item.opening_id) ? 'border-yellow-500 bg-[#252a34]' : 'border-gray-800 hover:border-gray-600'}`}
                            >
                                <img src={item.gift.image_url} className="w-12 h-12 object-contain" />
                                <div className="text-[10px] text-gray-400 truncate w-full text-center mt-1">{item.gift.name}</div>
                                <div className="text-xs font-bold text-yellow-500 flex items-center gap-1 justify-center mt-1"><img src="/assets/images/star.png" className="w-3 h-3"/>{item.gift.value}</div>
                                
                                {selectedInventoryItemIds.includes(item.opening_id) && (
                                    <div className="absolute top-1 right-1 w-4 h-4 bg-yellow-500 rounded-full flex items-center justify-center">
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><path d="M5 12l5 5L20 7"/></svg>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Target Modal */}
            {targetModalOpen && (
                <div className="fixed inset-0 z-50 bg-[#0f1115] flex flex-col">
                    <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#13161c]">
                        <h3 className="font-bold">Целевой подарок</h3>
                        <button onClick={() => setTargetModalOpen(false)} className="text-gray-400 hover:text-white font-bold p-2">Закрыть</button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 grid grid-cols-3 gap-3 content-start">
                        {targetGifts.map((g, idx) => (
                            <div 
                                key={idx} 
                                onClick={() => { setSelectedTargetGiftId(g.id); setAddedBalance(0); setTargetModalOpen(false); }}
                                className={`bg-[#1c2028] rounded-xl p-2 flex flex-col items-center border-[2px] transition-colors cursor-pointer ${selectedTargetGiftId === g.id ? 'border-yellow-500' : 'border-gray-800 hover:border-gray-600'}`}
                            >
                                <img src={g.image_url} className="w-12 h-12 object-contain" />
                                <div className="text-[10px] text-gray-400 truncate w-full text-center mt-1">{g.name}</div>
                                <div className="text-xs font-bold text-yellow-500 flex items-center justify-center gap-1 mt-1"><img src="/assets/images/star.png" className="w-3 h-3"/>{g.value}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Win Overlay Animation */}
            {winOverlayOpen && wonItem && (
                <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-6 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="flex flex-col items-center animate-in slide-in-from-bottom-20 duration-500 w-full max-w-[400px]">
                        <div className="text-yellow-500 text-3xl font-black mb-8 drop-shadow-[0_0_15px_rgba(234,179,8,0.8)] tracking-wide">
                            УСПЕШНО!
                        </div>
                        <div className="relative w-48 h-48 flex items-center justify-center">
                            <div className="absolute inset-0 bg-green-500/20 blur-[50px] rounded-full animate-pulse"></div>
                            <img src={wonItem.image_url} alt="" className="w-full h-full object-contain filter drop-shadow-[0_0_20px_rgba(34,197,94,0.6)] animate-[bounce_2s_infinite]" />
                        </div>
                        <div className="text-2xl font-bold mt-6 text-center">{wonItem.name}</div>
                        <div className="text-yellow-500 font-bold mt-2 text-xl flex items-center gap-1"><img src="/assets/images/star.png" className="w-5 h-5"/>{wonItem.value}</div>

                        <button 
                            onClick={() => setWinOverlayOpen(false)}
                            className="w-full bg-green-500 hover:bg-green-400 text-white font-bold text-lg py-4 rounded-xl mt-12 shadow-[0_0_20px_rgba(34,197,94,0.3)] active:scale-[0.98] transition-all"
                        >
                            ПРОДОЛЖИТЬ
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
