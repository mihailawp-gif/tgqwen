import React, { useEffect, useState, useRef } from 'react';
import Lottie from 'lottie-react';
import { gunzipSync } from 'fflate';

interface TgsAnimationProps {
    url: string;
    width?: number | string;
    height?: number | string;
    loop?: boolean;
    autoplay?: boolean;
    className?: string;
    style?: React.CSSProperties;
}

export default function TgsAnimation({ 
    url, 
    width = '100%', 
    height = '100%', 
    loop = true, 
    autoplay = true,
    className,
    style
}: TgsAnimationProps) {
    const [animationData, setAnimationData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const lottieRef = useRef<any>(null);

    useEffect(() => {
        let isMounted = true;

        const loadTgs = async () => {
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Failed to fetch TGS: ${response.statusText}`);
                
                const buffer = await response.arrayBuffer();
                const uint8Array = new Uint8Array(buffer);
                
                // Unzip TGS (it's basically Gzipped JSON)
                const decompressed = gunzipSync(uint8Array);
                const jsonString = new TextDecoder().decode(decompressed);
                const data = JSON.parse(jsonString);

                if (isMounted) {
                    setAnimationData(data);
                }
            } catch (err: any) {
                console.error('Error loading TGS animation:', err);
                if (isMounted) {
                    setError(err.message);
                }
            }
        };

        loadTgs();

        return () => {
            isMounted = false;
        };
    }, [url]);

    // Защита от странных импортов lottie в Vite (иногда приходит как { default: Component })
    const LottieComponent = (Lottie as any).default || Lottie;

    if (error) {
        return (
            <div className={className} style={{ ...style, width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
                ⚠️
            </div>
        );
    }

    if (!animationData || typeof LottieComponent !== 'function' && typeof LottieComponent !== 'object') {
        return <div className={className} style={{ ...style, width, height }} />;
    }

    return (
        <div className={className} style={{ ...style, width, height }}>
            <LottieComponent
                lottieRef={lottieRef}
                animationData={animationData}
                loop={loop}
                autoplay={autoplay}
                style={{ width: '100%', height: '100%' }}
            />
        </div>
    );
}
