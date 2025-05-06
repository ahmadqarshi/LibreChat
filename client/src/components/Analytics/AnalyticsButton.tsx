import { BarChart2 } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { useLocalize } from "~/hooks";
import { useNavigate } from "react-router-dom";

export const Analytics = memo(() => {
    const localize = useLocalize();
    const navigate = useNavigate();
    const [theme, setTheme] = useState<'light' | 'dark'>('light');

    useEffect(() => {
        const getCurrentTheme = () => {
            const storedTheme = localStorage.getItem('color-theme');
            return (storedTheme === 'dark' || storedTheme === 'light') ? storedTheme : 'light';
        };
        setTheme(getCurrentTheme());
        const observer = new MutationObserver(() => {
            setTheme(getCurrentTheme());
        });
        if (document.documentElement) {
            observer.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['class', 'data-theme']
            });
        }
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'color-theme') {
                const newTheme = e.newValue as 'light' | 'dark';
                if (newTheme === 'light' || newTheme === 'dark') {
                    setTheme(newTheme);
                }
            }
        };

        window.addEventListener('storage', handleStorageChange);
        const handleThemeChange = () => {
            setTheme(getCurrentTheme());
        };
        window.addEventListener('themeChange', handleThemeChange);
        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('themeChange', handleThemeChange);
            observer.disconnect();
        };
    }, []);

    const handleAnalyticsClick = () => {
        navigate('/analytics', { replace: true });
    };
    const iconColor = theme === 'dark' ? '#ffffff' : '#000000';

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={handleAnalyticsClick}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    handleAnalyticsClick();
                }
            }}
            aria-label={localize('com_nav_analytics')}
            className="mt-text-sm flex h-auto w-full items-center gap-2 rounded-xl p-2 text-sm transition-all duration-200 ease-in-out hover:bg-surface-hover"
        >
            <BarChart2
                className="icon-md"
                color={iconColor}
                aria-hidden="true"
            />
            <span className="rmt-2 grow overflow-hidden text-ellipsis whitespace-nowrap text-left text-text-primary">{localize('com_nav_analytics')}</span>
        </div>
    );
});