export default function DesktopGuard() {
    return (
        <div id="desktop-guard" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: '#0d0d17', zIndex: 9999999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'white', textAlign: 'center', padding: '20px' }}>
            <h2>Доступ закрыт</h2>
            <p>Пожалуйста, запустите это приложение через нашего бота внутри Telegram.</p>
        </div>
    );
}