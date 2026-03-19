import React, { useEffect, useState, useRef, memo } from 'react';
import Lottie from 'lottie-react';
import { gunzipSync } from 'fflate';

// ── Global cache ──────────────────────────────────────────────────────────────
const tgsCache = new Map<string, any>();
const tgsInflight = new Map<string, Promise<any>>();

async function loadTgsData(url: string): Promise<any> {
    if (tgsCache.has(url)) return tgsCache.get(url);
    if (tgsInflight.has(url)) return tgsInflight.get(url)!;
    const p = fetch(url)
        .then(r => { if (!r.ok) throw new Error(r.statusText); return r.arrayBuffer(); })
        .then(buf => {
            const data = JSON.parse(new TextDecoder().decode(gunzipSync(new Uint8Array(buf))));
            tgsCache.set(url, data);
            tgsInflight.delete(url);
            return data;
        })
        .catch(e => { tgsInflight.delete(url); throw e; });
    tgsInflight.set(url, p);
    return p;
}

// Preload a list of URLs in background without blocking render
export function preloadTgs(urls: string[]) {
    urls.forEach(url => { if (url?.endsWith('.tgs')) loadTgsData(url).catch(() => {}); });
}

interface TgsAnimationProps {
    url: string;
    width?: number | string;
    height?: number | string;
    loop?: boolean;
    autoplay?: boolean;
    // When true, only start playing once visible in viewport
    lazyPlay?: boolean;
    className?: string;
    style?: React.CSSProperties;
}

const TgsAnimation = memo(function TgsAnimation({
    url, width = '100%', height = '100%',
    loop = true, autoplay = true, lazyPlay = false,
    className, style,
}: TgsAnimationProps) {
    const [data, setData] = useState<any>(() => tgsCache.get(url) ?? null);
    const [error, setError] = useState(false);
    const [visible, setVisible] = useState(!lazyPlay);
    const containerRef = useRef<HTMLDivElement>(null);
    const mountedRef = useRef(true);

    // Load data
    useEffect(() => {
        mountedRef.current = true;
        if (tgsCache.has(url)) { setData(tgsCache.get(url)); return; }
        loadTgsData(url)
            .then(d => { if (mountedRef.current) setData(d); })
            .catch(() => { if (mountedRef.current) setError(true); });
        return () => { mountedRef.current = false; };
    }, [url]);

    // Intersection observer for lazy play
    useEffect(() => {
        if (!lazyPlay || !containerRef.current) return;
        const obs = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
            { rootMargin: '100px' }
        );
        obs.observe(containerRef.current);
        return () => obs.disconnect();
    }, [lazyPlay]);

    const LottieComponent = (Lottie as any).default ?? Lottie;

    const boxStyle: React.CSSProperties = {
        ...style, width, height,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        willChange: 'transform',
    };

    if (error) return <div ref={containerRef} className={className} style={{ ...boxStyle, color: '#555' }}>⚠️</div>;
    if (!data || !visible) return <div ref={containerRef} className={className} style={boxStyle} />;

    return (
        <div ref={containerRef} className={className} style={boxStyle}>
            <LottieComponent
                animationData={data}
                loop={loop}
                autoplay={autoplay}
                rendererSettings={{
                    preserveAspectRatio: 'xMidYMid meet',
                    progressiveLoad: true,
                    hideOnTransparent: true,
                }}
                style={{ width: '100%', height: '100%' }}
            />
        </div>
    );
});

export default TgsAnimation;
