// Тип для глобального window.lottie (загружается через CDN или bundled)
interface LottieAnimationItem {
    play: () => void;
    pause: () => void;
    destroy: () => void;
    addEventListener: (event: string, cb: () => void) => void;
    setSpeed: (speed: number) => void;
    setSubframe: (val: boolean) => void;
}

interface LottiePlayer {
    loadAnimation: (params: {
        container: HTMLElement;
        renderer: 'svg' | 'canvas' | 'html';
        loop: boolean;
        autoplay: boolean;
        animationData?: object;
        path?: string;
        rendererSettings?: {
            preserveAspectRatio?: string;
            progressiveLoad?: boolean;
            hideOnTransparent?: boolean;
        };
    }) => LottieAnimationItem;
}

interface Window {
    lottie: LottiePlayer;
}
