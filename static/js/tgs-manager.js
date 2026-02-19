/**
 * TGS Manager v11 — bulletproof fix
 */

const _inst  = new Map();
const _cache = new Map();

const _obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
        const it = _inst.get(e.target.id);
        if (!it) return;
        try { e.isIntersecting ? it.play() : it.pause(); } catch(_){}
    });
}, { rootMargin: '400px', threshold: 0 });

// ── gunzip: DecompressionStream → fflate ──
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
    if (!_cache.has(url))
        _cache.set(url, fetch(url).then(r => {
            if (!r.ok) throw new Error('HTTP '+r.status);
            return r.arrayBuffer();
        }).then(_gunzip).then(JSON.parse));
    return _cache.get(url);
}

// ── CORE: render into element ──
async function renderTGS(id, num) {
    // cleanup old
    if (_inst.has(id)) {
        try { _inst.get(id).destroy(); } catch(_) {}
        const el = document.getElementById(id);
        if (el) { _obs.unobserve(el); el.innerHTML=''; }
        _inst.delete(id);
    }

    const el = document.getElementById(id);
    if (!el || !window.lottie) return;

    // Get pixel size from data attr or computed style
    let px = parseInt(el.dataset.sz || el.style.width) || 80;

    try {
        const data = await _load(`/static/images/gift_limited_${num}.tgs`);

        el.innerHTML = '';

        // Container must have explicit size — Lottie inherits it
        Object.assign(el.style, {
            width:    px+'px',
            height:   px+'px',
            display:  'block',
            overflow: 'hidden',
            flexShrink: '0',
        });

        const anim = lottie.loadAnimation({
            container: el,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            animationData: data,
            rendererSettings: {
                preserveAspectRatio: 'xMidYMid meet',
            }
        });

        // Force SVG to fill the box after lottie creates it
        const fixSvg = () => {
            const svg = el.querySelector('svg');
            if (!svg) return;
            svg.setAttribute('width',  px);
            svg.setAttribute('height', px);
            svg.style.cssText = `width:${px}px;height:${px}px;display:block;`;
        };

        anim.addEventListener('DOMLoaded', fixSvg);
        // also try after a frame — some versions fire DOMLoaded before SVG is in DOM
        anim.addEventListener('enterFrame', () => { fixSvg(); });

        _inst.set(id, anim);
        _obs.observe(el);

    } catch(e) {
        console.warn('[TGS]', num, e.message);
        el.innerHTML = `<img src="/static/images/star.png"
            style="width:60%;height:60%;margin:20%;opacity:.35;display:block">`;
    }
}

// ── init all [data-tgs] ──
function initAllTGS() {
    document.querySelectorAll('[data-tgs]').forEach(el => {
        if (!el.id || _inst.has(el.id)) return;
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
}

// size encoded in data-sz attribute
function tgsEl(id, num, size='80px') {
    const px = parseInt(size) || 80;
    return `<div id="${id}" data-tgs="${num}" data-sz="${px}"
        style="width:${px}px;height:${px}px;display:block;overflow:hidden;flex-shrink:0;"></div>`;
}

window.tgsManager    = { initAllOnPage: initAllTGS, destroyAll: destroyAllTGS };
window.renderTGS     = renderTGS;
window.initAllTGS    = initAllTGS;
window.destroyAllTGS = destroyAllTGS;
window.tgsEl         = tgsEl;

function playSuccessAnimation() {
    let container = document.getElementById('celebration-container');
    
    // Создаем контейнер-оверлей при первом вызове
    if (!container) {
        container = document.createElement('div');
        container.id = 'celebration-container';
        // Накидываем стили прямо через JS, чтобы не пачкать CSS
        Object.assign(container.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100vw',
            height: '100vh',
            pointerEvents: 'none', // Чтобы клики проходили насквозь
            zIndex: '9999',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            opacity: '0',
            transition: 'opacity 0.3s ease'
        });
        document.body.appendChild(container);
    }

    // Вставляем див для самой анимации
    container.innerHTML = '<div id="celeb-lottie" style="width: 100%; height: 100%;"></div>';
    
    // Проявляем контейнер
    requestAnimationFrame(() => {
        container.style.opacity = '1';
    });

    // Запускаем через УЖЕ существующий window.lottie
    if (window.lottie) {
        window.lottie.loadAnimation({
            container: document.getElementById('celeb-lottie'),
            renderer: 'svg',
            loop: false, // Нам нужно, чтобы бахнуло один раз
            autoplay: true,
            path: 'https://lottie.host/575a8789-0493-44ed-9a9d-686480357f78/2pY6l7w6iW.json'
        });
    }

    // Плавно скрываем через 2.5 секунды
    setTimeout(() => {
        container.style.opacity = '0';
        setTimeout(() => {
            container.innerHTML = ''; // Чистим DOM
        }, 300);
    }, 2500);
}

// Экспортируем функцию в глобальный window
window.playSuccessAnimation = playSuccessAnimation;