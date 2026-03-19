import React, { useEffect, useState, useRef, memo } from 'react';
import Lottie from 'lottie-react';
import { gunzipSync } from 'fflate';

// ── Global cache: url → parsed animation data ──────────────────────────────
// Shared across all TgsAnimation instances so each .tgs file is fetched
// and decompressed exactly once per session.
const tgsCache = new Map<string, any>();
const tgsLoading = new Map<string, Promise<any>>();

async function loadTgsData(url: string): Promise<any> {
    if (tgsCache.has(url)) return tgsCache.get(url);

    if (tgsLoading.has(url)) return tgsLoading.get(url);

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

interface TgsAnimationProps {
    url: string;
    width?: number | string;
    height?: number | string;
    loop?: boolean;
    autoplay?: boolean;
    className?: string;
    style?: React.CSSProperties;
}

const TgsAnimation = memo(function TgsAnimation({
    url,
    width = '100%',
    height = '100%',
    loop = true,
    autoplay = true,
    className,
    style,
}: TgsAnimationProps) {
    const [animationData, setAnimationData] = useState<any>(() => tgsCache.get(url) ?? null);
    const [error, setError] = useState(false);
    const lottieRef = useRef<any>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        // Already in cache — nothing to do (state initialised above)
        if (tgsCache.has(url)) {
            setAnimationData(tgsCache.get(url));
            return;
        }
        loadTgsData(url)
            .then(data => { if (mountedRef.current) setAnimationData(data); })
            .catch(() => { if (mountedRef.current) setError(true); });
        return () => { mountedRef.current = false; };
    }, [url]);

    const LottieComponent = (Lottie as any).default ?? Lottie;

    if (error) {
        return (
            <div className={className}
                style={{ ...style, width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
                ⚠️
            </div>
        );
    }

    if (!animationData || typeof LottieComponent === 'undefined') {
        return <div className={className} style={{ ...style, width, height }} />;
    }

    return (
        <div className={className} style={{ ...style, width, height, willChange: 'transform' }}>
            <LottieComponent
                lottieRef={lottieRef}
                animationData={animationData}
                loop={loop}
                autoplay={autoplay}
                // Cap renderer fps — Lottie default is RAF (unlimited).
                // rendererSettings doesn't expose fps cap, but we can use
                // the renderer canvas with image smoothing off for perf.
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
