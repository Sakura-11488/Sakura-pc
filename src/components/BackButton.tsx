"use client";

import { useRouter } from "next/navigation";

type BackButtonProps = {
    /** When set, always navigate here instead of browser history (avoids returning to reader/watcher). */
    href?: string;
};

export default function BackButton({ href }: BackButtonProps) {
    const router = useRouter();
    return (
        <button
            className="page-back-btn"
            onClick={() => (href ? router.push(href) : router.back())}
            aria-label="Go back"
        >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
            </svg>
        </button>
    );
}
