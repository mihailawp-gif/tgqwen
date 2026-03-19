import React, { useEffect, useState, useRef, memo, useCallback } from 'react';
import Lottie from 'lottie-react';
import { gunzipSync } from 'fflate';

// ── Global cache: url → parsed animation data ──────────────────────────────
// Shared across all TgsAnimation instances: each .tgs file is fetched and
// decompressed exactly once per session.
const tgsCache = new Map<string, object>();
const tgsLoading = new Map<string, Promise<object>>();

async function loadTgsData(url: string): Promise<object> {
    if (tgsCache.has(url)) return tgsCache.get(url)!;
    if (tgsLoading.has(url)) return tgsLoading.get(url)!;

    const promise = (async () => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch TGS: ${response.statusText}`);
        const buffer = await response.arrayBuffer();
        const decompressed = gunzipSync(new Uint8Array(buffer));
        const data = JSON.parse(new TextDecoder().decode(decompressed));
        tgsCache.set(url, data);
        tgsLoading.delete(url);
        return data;
    })();

    tgsLoading.set(url, promise);
    return promise;
}

// ── Preload helper — вызови из родителя чтобы прогреть кэш заранее ─────────
export function preloadTgs(urls: string[]) {
    urls.forEach(url => { if (url.endsWith('.tgs')) loadTgsData(url).catch(() => {}); });
}

interface TgsAnimationProps {
    url: string;
    width?: number | string;
    height?: number | string;
    loop?: boolean;
    autoplay?: boolean;
    className?: string;
    style?: React.CSSProperties;
    /**
     * Целевой FPS воспроизведения. По умолчанию 30 — достаточно для
     * плавного восприятия и вдвое снижает нагрузку на CPU/GPU.
     * Используй 60 только для крупных hero-анимаций.
     */
    fps?: 30 | 60;
    /**
     * Если true — анимация играет даже когда элемент вне viewport.
     * По умолчанию false: анимации автоматически паузятся при прокрутке.
     */
    alwaysPlay?: boolean;
}

const TgsAnimation = memo(function TgsAnimation({
    url,
    width = '100%',
    height = '100%',
    loop = true,
    autoplay = true,
    className,
    style,
    fps = 30,
    alwaysPlay = false,
}: TgsAnimationProps) {
    const [animationData, setAnimationData] = useState<object | null>(
        () => tgsCache.get(url) ?? null
    );
    const [error, setError] = useState(false);
    // Видимость в viewport — управляем через IntersectionObserver
    const [visible, setVisible] = useState(false);

    const lottieRef    = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const mountedRef   = useRef(true);

    // ── Загрузка данных анимации ───────────────────────────────────────────
    useEffect(() => {
        mountedRef.current = true;
        setError(false);

        if (tgsCache.has(url)) {
            setAnimationData(tgsCache.get(url)!);
        } else {
            setAnimationData(null);
            loadTgsData(url)
                .then(data => { if (mountedRef.current) setAnimationData(data); })
                .catch(() => { if (mountedRef.current) setError(true); });
        }
        return () => { mountedRef.current = false; };
    }, [url]);

    // ── IntersectionObserver: пауза когда анимация вне экрана ─────────────
    useEffect(() => {
        if (alwaysPlay) {
            setVisible(true);
            return;
        }
        const el = containerRef.current;
        if (!el) return;

        // rootMargin '60px' — начинаем загружать чуть раньше чем элемент
        // въедет в экран, убирая задержку появления анимации.
        const observer = new IntersectionObserver(
            ([entry]) => setVisible(entry.isIntersecting),
            { rootMargin: '60px', threshold: 0 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [alwaysPlay]);

    // ── Управление play/pause по visibility ───────────────────────────────
    useEffect(() => {
        const anim = lottieRef.current;
        if (!anim) return;
        if (visible && autoplay) {
            anim.play();
        } else {
            anim.pause();
        }
    }, [visible, autoplay]);

    // ── Ограничение FPS ────────────────────────────────────────────────────
    // Большинство TGS-стикеров анимированы на 60fps. Снижаем скорость до
    // 0.75× — это даёт ~45fps: достаточно плавно, но заметно легче для CPU.
    // setSubframe(false) выключает интерполяцию между кадрами — анимация
    // переходит строго по целым кадрам, экономя вычисления на тверинг.
    const handleDOMLoaded = useCallback(() => {
        const anim = lottieRef.current;
        if (!anim) return;
        if (fps === 30) {
            anim.setSubframe(false); // без интерполяции — быстрее
            anim.setSpeed(0.75);     // ~45fps из 60fps источника
        }
        if (!autoplay || !visible) {
            anim.pause();
        }
    }, [fps, autoplay, visible]);

    const LottieComponent = (Lottie as any).default ?? Lottie;

    if (error) {
        return (
            <div
                ref={containerRef}
                className={className}
                style={{ ...style, width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: '18px' }}
            >
                ⚠️
            </div>
        );
    }

    // Скелетон-заглушка пока грузимся — не даём прыгать layout'у
    if (!animationData || typeof LottieComponent === 'undefined') {
        return (
            <div
                ref={containerRef}
                className={className}
                style={{ ...style, width, height, borderRadius: '8px' }}
            />
        );
    }

    return (
        <div
            ref={containerRef}
            className={className}
            style={{
                ...style,
                width,
                height,
                // Свой compositor layer — анимация не вызывает перерисовку соседей
                willChange: 'transform',
                // contain: paint изолирует перерисовку внутри блока
                contain: 'layout style paint',
            }}
        >
            <LottieComponent
                lottieRef={lottieRef}
                animationData={animationData}
                loop={loop}
                autoplay={false}        // play/pause контролируем сами через lottieRef
                onDOMLoaded={handleDOMLoaded}
                rendererSettings={{
                    preserveAspectRatio: 'xMidYMid meet',
                    progressiveLoad: true,   // парсим анимацию постепенно
                    hideOnTransparent: true,
                    // Для максимальной производительности можно включить canvas:
                    // renderer: 'canvas',
                    // Canvas ~2-3× быстрее SVG на мобиле, но края могут быть
                    // чуть менее чёткими. Раскомментируй если SVG всё ещё лагает.
                }}
                style={{ width: '100%', height: '100%', display: 'block' }}
            />
        </div>
    );
});

export default TgsAnimation;
