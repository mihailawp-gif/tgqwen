/**
 * TGS Manager v14 — ANTI-LAG (120 FPS) & RACE-CONDITION FIX
 */

const _inst  = new Map();
const _cache = new Map();
let _currentSession = 0; // Глобальный счетчик сессий (для отмены зависших загрузок)

const _obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
        const it = _inst.get(e.target.id);
        if (!it) return;
        try {
            if (e.isIntersecting) {
                it.play();
            } else {
                it.pause();
            }
        } catch(_){}
    });
}, { rootMargin: '300px', threshold: 0 });

async function _gunzip(buf) {
    if (typeof DecompressionStream !== 'undefined') {
        try {
            const ds = new DecompressionStream('gzip');
            const w  = ds.writable.getWriter();
            const r  = ds.readable.getReader();
            w.write(new Uint8Array(buf));
            w.close();
            const out = [];
            for (;;) {
                const {done,value} = await r.read();
                if (done) break;
                out.push(value);
            }
            const merged = new Uint8Array(out.reduce((n,c)=>n+c.length,0));
            let i = 0; for (const c of out) { merged.set(c,i); i+=c.length; }
            return new TextDecoder().decode(merged);
        } catch(e) { /* fallthrough */ }
    }
    if (window.fflate) {
        return new Promise((res,rej) =>
            fflate.gunzip(new Uint8Array(buf), (e,d) => e ? rej(e) : res(new TextDecoder().decode(d)))
        );
    }
    throw new Error('no decompressor');
}

function _load(url) {
    if (!_cache.has(url)) {
        const promise = fetch(url, { cache: 'force-cache', priority: 'high' })
            .then(r => {
                if (!r.ok) throw new Error('HTTP '+r.status);
                return r.arrayBuffer();
            })
            .then(_gunzip)
            .then(JSON.parse)
            .catch(e => {
                _cache.delete(url);
                throw e;
            });
        _cache.set(url, promise);
    }
    return _cache.get(url);
}

const _renderQueue = [];
let _queueRunning = false;

async function _processQueue() {
    if (_queueRunning) return;
    _queueRunning = true;
    while (_renderQueue.length > 0) {
        // Выдаем строго по 2 анимации за 1 кадр экрана. 
        // Это полностью убирает фризы процессора при спавне рулетки.
        const batch = _renderQueue.splice(0, 2); 
        batch.forEach(task => task());
        await new Promise(r => requestAnimationFrame(r));
    }
    _queueRunning = false;
}

async function renderTGS(id, num) {
    const mySession = _currentSession; // Запоминаем номер сессии при старте функции

    if (_inst.has(id)) {
        try { _inst.get(id).destroy(); } catch(_) {}
        const el = document.getElementById(id);
        if (el) { _obs.unobserve(el); el.innerHTML=''; }
        _inst.delete(id);
    }

    const el = document.getElementById(id);
    if (!el || !window.lottie) return;

    let px = parseInt(el.dataset.sz || el.style.width) || 80;

    try {
        const data = await _load(`/static/images/gift_limited_${num}.tgs`);
        
        // РЕШАЕТ ПРОБЛЕМУ ИНВЕНТАРЯ:
        // Если пока мы качали файл, юзер нажал "Назад" - мы отменяем рендер!
        if (mySession !== _currentSession) return; 
        if (!document.getElementById(id)) return;

        _renderQueue.push(() => {
            // Двойная проверка прямо перед вставкой в DOM
            if (mySession !== _currentSession) return; 
            const targetEl = document.getElementById(id);
            if (!targetEl) return;
            
            // Если элемент ушел в скрытую вкладку - пропускаем
            if (targetEl.closest('.screen:not(.active)') || targetEl.closest('.tab-content:not(.active)')) return;

            targetEl.innerHTML = '';
            Object.assign(targetEl.style, {
                width: px+'px', height: px+'px',
                display: 'block', overflow: 'hidden', flexShrink: '0',
            });

            const anim = window.lottie.loadAnimation({
                container: targetEl,
                renderer: 'svg',
                loop: true,
                autoplay: true, 
                animationData: data,
                rendererSettings: { preserveAspectRatio: 'xMidYMid meet' }
            });

            const fixSvg = () => {
                const svg = targetEl.querySelector('svg');
                if (!svg) return;
                svg.setAttribute('width', px);
                svg.setAttribute('height', px);
                // Включаем аппаратное ускорение для SVG
                svg.style.cssText = `width:${px}px;height:${px}px;display:block;transform:translateZ(0);`;
            };

            anim.addEventListener('DOMLoaded', () => {
                fixSvg();
                _obs.observe(targetEl);
            });

            _inst.set(id, anim);
        });
        _processQueue();

    } catch(e) {
        if (mySession === _currentSession && document.getElementById(id)) {
            document.getElementById(id).innerHTML = `<img src="/static/images/star.png" style="width:60%;height:60%;margin:20%;opacity:.35;display:block">`;
        }
    }
}

function initAllTGS() {
    document.querySelectorAll('[data-tgs]').forEach(el => {
        if (el.closest('.screen:not(.active)') || el.closest('.tab-content:not(.active)')) return;
        if (!el.id) el.id = 'tgs_' + Math.random().toString(36).substr(2, 9);
        
        if (_inst.has(el.id)) return;
        const n = parseInt(el.dataset.tgs, 10);
        if (n >= 1) renderTGS(el.id, n);
    });
}

function destroyAllTGS() {
    _currentSession++; // Краш старых загрузок!
    _inst.forEach((anim, id) => {
        try { anim.destroy(); } catch(_){}
        const el = document.getElementById(id);
        if (el) { _obs.unobserve(el); el.innerHTML=''; }
    });
    _inst.clear();
    _renderQueue.length = 0;
}

function preloadTGS(nums) {
    const unique = [...new Set(nums)].filter(n => n >= 1);
    unique.forEach(n => _load(`/static/images/gift_limited_${n}.tgs`).catch(()=>{}));
}

function tgsEl(id, num, size='80px') {
    const px = parseInt(size) || 80;
    return `<div id="${id}" data-tgs="${num}" data-sz="${px}" style="width:${px}px;height:${px}px;display:block;overflow:hidden;flex-shrink:0;"></div>`;
}

window.tgsManager    = { initAllOnPage: initAllTGS, destroyAll: destroyAllTGS, preload: preloadTGS };
window.renderTGS     = renderTGS;
window.initAllTGS    = initAllTGS;
window.destroyAllTGS = destroyAllTGS;
window.tgsEl         = tgsEl;
window.preloadTGS    = preloadTGS;

// ── SUCCESS ANIMATION (FIREWORKS) ──
function playSuccessAnimation() {
    let container = document.getElementById('celebration-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'celebration-container';
        Object.assign(container.style, {
            position: 'fixed', top: '0', left: '0', right: '0', bottom: '0',
            pointerEvents: 'none', zIndex: '99999', display: 'flex',
            justifyContent: 'center', alignItems: 'center', opacity: '0',
            transition: 'opacity 0.3s ease'
        });
        document.body.appendChild(container);
    } else {
        container.innerHTML = ''; 
    }

    const lottieDiv = document.createElement('div');
    Object.assign(lottieDiv.style, { width: '80%', height: '80%' });
    container.appendChild(lottieDiv);
    
    requestAnimationFrame(() => { container.style.opacity = '1'; });

    if (window.lottie) {
        window.lottie.loadAnimation({
            container: lottieDiv, 
            renderer: 'svg', loop: false, autoplay: true,
            path: '/static/images/success.json' 
        });
    }

    setTimeout(() => {
        container.style.opacity = '0';
        setTimeout(() => { container.innerHTML = ''; }, 300);
    }, 2500);
}
window.playSuccessAnimation = playSuccessAnimation;