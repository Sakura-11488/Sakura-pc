"use client";

import { useEffect } from "react";
import { applyTheme, getStoredTheme } from "@/lib/theme";

/** Applies persisted theme on client mount (inline script handles first paint). */
export default function ThemeProvider() {
    useEffect(() => {
        applyTheme(getStoredTheme());
    }, []);

    return null;
}
