import { getLocal, setLocal, STORAGE_KEYS } from "./storage";

export type AppTheme = "dark" | "light";

export function getStoredTheme(): AppTheme {
    if (typeof window === "undefined") return "dark";
    const settings = getLocal<{ theme?: AppTheme }>(STORAGE_KEYS.SETTINGS, {});
    if (settings.theme === "light" || settings.theme === "dark") return settings.theme;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function setStoredTheme(theme: AppTheme): void {
    const current = getLocal<Record<string, unknown>>(STORAGE_KEYS.SETTINGS, {});
    setLocal(STORAGE_KEYS.SETTINGS, { ...current, theme });
}

export function applyTheme(theme: AppTheme): void {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
}
