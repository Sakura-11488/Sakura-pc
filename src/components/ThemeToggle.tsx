"use client";

import { useEffect, useState } from "react";
import { applyTheme, getStoredTheme, setStoredTheme, type AppTheme } from "@/lib/theme";

function useThemeState() {
    const [theme, setTheme] = useState<AppTheme>("dark");

    useEffect(() => {
        setTheme(getStoredTheme());
    }, []);

    const setAppTheme = (next: AppTheme) => {
        setTheme(next);
        setStoredTheme(next);
        applyTheme(next);
    };

    return { theme, setAppTheme };
}

interface ThemeToggleProps {
    className?: string;
    compact?: boolean;
}

export default function ThemeToggle({ className = "", compact = false }: ThemeToggleProps) {
    const { theme, setAppTheme } = useThemeState();

    const toggle = () => setAppTheme(theme === "dark" ? "light" : "dark");

    return (
        <button
            type="button"
            className={`theme-toggle ${compact ? "theme-toggle--compact" : ""} ${className}`.trim()}
            onClick={toggle}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
            {theme === "dark" ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
            ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
            )}
            {!compact && <span>{theme === "dark" ? "Light" : "Dark"}</span>}
        </button>
    );
}

export function ThemeSegmentControl() {
    const { theme, setAppTheme } = useThemeState();

    return (
        <div className="theme-segment">
            <button
                type="button"
                className={theme === "dark" ? "active" : ""}
                onClick={() => setAppTheme("dark")}
            >
                Dark
            </button>
            <button
                type="button"
                className={theme === "light" ? "active" : ""}
                onClick={() => setAppTheme("light")}
            >
                Light
            </button>
        </div>
    );
}
