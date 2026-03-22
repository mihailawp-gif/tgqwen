/**
 * TgsAnimation — React-порт tgs-manager.js
 *
 * Сохранены все ключевые оптимизации оригинала:
 *  • DecompressionStream (нативный браузерный gzip) → fflate fallback
 *  • fetch force-cache + priority:high
 *  • Глобальный кэш промисов — каждый .tgs декомпрессируется ровно раз
 *  • Render-очередь: батчинг по 3 анимации за RAF-тик
 *  • Session-ID: отменяет рендер если компонент размонтирован до загрузки
 *  • Один глобальный IntersectionObserver (rootMargin 100px) — пауза вне viewport
 *  • SVG патч: translateZ(0) напрямую на svg-элемент после DOMLoaded
 *  • Fallback: img /assets/images/star.png при ошибке
 */

import { useEffect, useRef, memo } from 'react';
import lottie from 'lottie-web';
import type { AnimationItem } from 'lottie-web';
import { gunzipSync } from 'fflate';

// ─────────────────────────────────────────────────────────────────────────────
// Глобальный кэш (вне компонента — живёт весь сеанс)
// ─────────────────────────────────────────────────────────────────────────────
const _cache = new Map<string, Promise<object>>();

// ─────────────────────────────────────────────────────────────────────────────
// Декомпрессор: DecompressionStream (нативный) → fflate (fallback)
// ─────────────────────────────────────────────────────────────────────────────
async function _gunzip(buf: ArrayBuffer): Promise<string> {
    if (typeof DecompressionStream !== 'undefined') {
        try {
            const ds = new DecompressionStream('gzip');
            const w = ds.writable.getWriter();
            const r = ds.readable.getReader();
            w.write(new Uint8Array(buf));
            w.close();
            const chunks: Uint8Array[] = [];
            for (; ;) {
                const { done, value } = await r.read();
                if (done) break;
                chunks.push(value);
            }
            const total = chunks.reduce((n, c) => n + c.length, 0);
            const merged = new Uint8Array(total);
            let offset = 0;
            for (const c of chunks) { merged.set(c, offset); offset += c.length; }
            return new TextDecoder().decode(merged);
        } catch (_) { /* fall through to fflate */ }
    }
    // fflate fallback (синхронно, ~1-3ms для типичного TGS)
    return new TextDecoder().decode(gunzipSync(new Uint8Array(buf)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Загрузка + декомпрессия (дедупликация промисов)
// ─────────────────────────────────────────────────────────────────────────────
function _load(url: string): Promise<object> {
    if (!_cache.has(url)) {
        const p = fetch(url, {
            cache: 'force-cache',
            // @ts-ignore — Fetch Priority API (Chrome 101+, Safari 17.2+)
            priority: 'high',
        })
            .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
            .then(_gunzip)
            .then(text => JSON.parse(text))
            .catch(e => { _cache.delete(url); throw e; });
        _cache.set(url, p);
    }
    return _cache.get(url)!;
}

// ─────────────────────────────────────────────────────────────────────────────
// Render-очередь: батчинг по 3 задачи за RAF-тик (как в tgs-manager.js)
// Не даём браузеру жевать 60 lottie.loadAnimation() за один кадр
// ─────────────────────────────────────────────────────────────────────────────
const _queue: Array<() => void> = [];
let _queueRunning = false;

async function _processQueue() {
    if (_queueRunning) return;
    _queueRunning = true;
    while (_queue.length > 0) {
        const batch = _queue.splice(0, 3);
        batch.forEach(t => t());
        await new Promise<void>(r => requestAnimationFrame(() => r()));
    }
    _queueRunning = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Один глобальный IntersectionObserver на всё приложение
// ─────────────────────────────────────────────────────────────────────────────
const _instances = new Map<string, AnimationItem>();

const _observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
        const anim = _instances.get((e.target as HTMLElement).dataset.tgsId!);
        if (!anim) return;
        try { e.isIntersecting ? anim.play() : anim.pause(); } catch (_) { }
    });
}, { rootMargin: '100px', threshold: 0 });

// ─────────────────────────────────────────────────────────────────────────────
// Preload — вызывай из родителя чтобы прогреть кэш до маунта
// ─────────────────────────────────────────────────────────────────────────────
export function preloadTgs(urls: string[]) {
    urls.forEach(url => { if (url.endsWith('.tgs')) _load(url).catch(() => { }); });
}

// ─────────────────────────────────────────────────────────────────────────────
// Компонент
// ─────────────────────────────────────────────────────────────────────────────
interface TgsAnimationProps {
    url: string;
    width?: number | string;
    height?: number | string;
    loop?: boolean;
    autoplay?: boolean;
    className?: string;
    style?: React.CSSProperties;
    /**
     * true  — анимация играет всегда (hero-элементы, результат кейса)
     * false — пауза когда элемент вне viewport (дефолт, для гридов и рулетки)
     */
    alwaysPlay?: boolean;
    hoverPlay?: boolean;
}

let _idCounter = 0;

const TgsAnimation = memo(function TgsAnimation({
    url,
    width = 80,
    height: _height = 80,
    loop = true,
    autoplay = true,
    className,
    style,
    alwaysPlay = false,
    hoverPlay = false,
}: TgsAnimationProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const instanceId = useRef<string>('tgs_' + (++_idCounter));
    // sessionRef — инкрементируется при каждом изменении url или размонтировании
    const sessionRef = useRef<number>(0);

    const px = typeof width === 'number' ? width : parseInt(String(width)) || 80;

    useEffect(() => {
        const id = instanceId.current;
        const el = containerRef.current;
        if (!el) return;

        const mySession = ++sessionRef.current;

        // Убиваем предыдущую анимацию (смена url)
        const prev = _instances.get(id);
        if (prev) {
            try { prev.destroy(); } catch (_) { }
            _observer.unobserve(el);
            el.innerHTML = '';
            _instances.delete(id);
        }

        if (!url.endsWith('.tgs')) return;

        _load(url)
            .then(data => {
                // Компонент размонтирован или url ещё раз сменился → выходим
                if (mySession !== sessionRef.current || !containerRef.current) return;

                _queue.push(() => {
                    if (mySession !== sessionRef.current) return;
                    const target = containerRef.current;
                    if (!target) return;

                    target.innerHTML = '';
                    target.dataset.tgsId = id;

                    const anim = lottie.loadAnimation({
                        container: target,
                        renderer: 'svg',
                        loop,
                        // play/pause отдаём observer'у; если alwaysPlay — стартуем сразу
                        autoplay: autoplay && alwaysPlay,
                        animationData: data as object,
                        rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
                    });

                    anim.addEventListener('DOMLoaded', () => {
                        // Убран патч translateZ(0) для Web/Desktop багов прозрачности
                        const svg = target.querySelector('svg');
                        if (svg) {
                            svg.setAttribute('width', String(px));
                            svg.setAttribute('height', String(px));
                            svg.style.cssText = `width:${px}px;height:${px}px;display:block;`;
                        }
                        if (hoverPlay) {
                            anim.goToAndStop(0, true);
                        } else if (!alwaysPlay) {
                            // Отдаём управление play/pause IntersectionObserver'у
                            _observer.observe(target);
                        }
                    });

                    _instances.set(id, anim);
                });

                _processQueue();
            })
            .catch(() => {
                if (mySession !== sessionRef.current || !containerRef.current) return;
                containerRef.current.innerHTML =
                    `<img src="/assets/images/star.png" style="width:60%;height:60%;margin:20%;opacity:.35;display:block">`;
            });

        return () => {
            sessionRef.current++;
            const anim = _instances.get(id);
            if (anim) {
                try { anim.destroy(); } catch (_) { }
                if (el) _observer.unobserve(el);
                _instances.delete(id);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url, loop, alwaysPlay, px]);

    // Реагируем на изменение autoplay-пропа без перезагрузки анимации
    // Используется рулеткой: isSpinning → autoplay=false паузит все ячейки
    useEffect(() => {
        if (hoverPlay) return;
        const anim = _instances.get(instanceId.current);
        if (!anim) return;
        try { autoplay ? anim.play() : anim.pause(); } catch (_) { }
    }, [autoplay, hoverPlay]);

    const handleMouseEnter = () => {
        if (!hoverPlay) return;
        const anim = _instances.get(instanceId.current);
        if (anim) try { anim.play(); } catch (_) { }
    };

    const handleMouseLeave = () => {
        if (!hoverPlay) return;
        const anim = _instances.get(instanceId.current);
        if (anim) try { anim.goToAndStop(0, true); } catch (_) { }
    };

    return (
        <div
            ref={containerRef}
            className={className}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{
                width: px,
                height: px,
                display: 'block',
                overflow: 'hidden',
                flexShrink: 0,
                contain: 'layout style paint',
                ...style,
            }}
        />
    );
});

export default TgsAnimation;
