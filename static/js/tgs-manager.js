/**
 * TGS Manager v13 — LAZY LOAD & ANTI-BLANK FIX
 */

const _inst  = new Map();
const _cache = new Map();

// Наблюдатель: ставит на паузу анимации, которые ушли за пределы экрана при скролле
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
}, { rootMargin: '200px', threshold: 0 });

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
        const batch = _renderQueue.splice(0, 5); // Рендерим по 5 штук за кадр
        batch.forEach(task => task());
        await new Promise(r => requestAnimationFrame(r));
    }
    _queueRunning = false;
}

async function renderTGS(id, num) {
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
        if (!document.getElementById(id)) return;

        _renderQueue.push(() => {
            const targetEl = document.getElementById(id);
            if (!targetEl) return;
            
            targetEl.innerHTML = '';
            Object.assign(targetEl.style, {
                width: px+'px', height: px+'px',
                display: 'block', overflow: 'hidden', flexShrink: '0',
            });

            const anim = window.lottie.loadAnimation({
                container: targetEl,
                renderer: 'svg',
                loop: true,
                autoplay: true, // Запускаем сразу, чтобы не было пустых черных дыр
                animationData: data,
                rendererSettings: { preserveAspectRatio: 'xMidYMid meet' }
            });

            const fixSvg = () => {
                const svg = targetEl.querySelector('svg');
                if (!svg) return;
                svg.setAttribute('width', px);
                svg.setAttribute('height', px);
                svg.style.cssText = `width:${px}px;height:${px}px;display:block;transform:translate3d(0,0,0);`;
            };

            anim.addEventListener('DOMLoaded', () => {
                fixSvg();
                _obs.observe(targetEl);
            });

            _inst.set(id, anim);
        });
        _processQueue();

    } catch(e) {
        console.warn('[TGS]', num, e.message);
        if (document.getElementById(id)) {
            document.getElementById(id).innerHTML = `<img src="/static/images/star.png" style="width:60%;height:60%;margin:20%;opacity:.35;display:block">`;
        }
    }
}

function initAllTGS() {
    document.querySelectorAll('[data-tgs]').forEach(el => {
        // МЕГА-ФИКС: Игнорируем гифты, которые сейчас спрятаны на других вкладках/экранах!
        if (el.closest('.screen:not(.active)') || el.closest('.tab-content:not(.active)')) return;

        // Если у контейнера нет id (например, в инвентаре), генерируем случайный
        if (!el.id) el.id = 'tgs_' + Math.random().toString(36).substr(2, 9);
        
        if (_inst.has(el.id)) return;
        const n = parseInt(el.dataset.tgs, 10);
        if (n >= 1) renderTGS(el.id, n);
    });
}

function destroyAllTGS() {
    _inst.forEach((anim, id) => {
        try { anim.destroy(); } catch(_){}
        const el = document.getElementById(id);
        if (el) { _obs.unobserve(el); el.innerHTML=''; }
    });
    _inst.clear();
    _renderQueue.length = 0;
}

function tgsEl(id, num, size='80px') {
    const px = parseInt(size) || 80;
    return `<div id="${id}" data-tgs="${num}" data-sz="${px}" style="width:${px}px;height:${px}px;display:block;overflow:hidden;flex-shrink:0;"></div>`;
}

window.tgsManager    = { initAllOnPage: initAllTGS, destroyAll: destroyAllTGS };
window.renderTGS     = renderTGS;
window.initAllTGS    = initAllTGS;
window.destroyAllTGS = destroyAllTGS;
window.tgsEl         = tgsEl;

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