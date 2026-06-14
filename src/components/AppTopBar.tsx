"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useSakuraWalletModal } from "./SakuraWalletModal";
import ThemeToggle from "./ThemeToggle";
import { truncateAddress } from "@/lib/solana";

const PAGE_TITLES: Record<string, string> = {
    "/": "Home",
    "/manga": "Manga",
    "/comics": "Comics",
    "/novel": "Novels",
    "/anime": "Anime",
    "/library": "Library",
    "/history": "History",
    "/downloads": "Downloads",
    "/settings": "Settings",
    "/pass": "Sakura Pass",
    "/creator": "Creator",
    "/creator/apply": "Become a Creator",
    "/trade": "Trade",
    "/favorites": "Favorites",
    "/admin": "Admin",
};

function getPageTitle(pathname: string): string {
    if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
    if (pathname.startsWith("/title")) return "Series";
    if (pathname.startsWith("/anime/details")) return "Anime Details";
    if (pathname.startsWith("/novel/details")) return "Novel";
    if (pathname.startsWith("/creator")) return "Creator";
    if (pathname.startsWith("/profile")) return "Profile";
    return "Sakura";
}

const HIDDEN_PATHS = ["/chapter", "/anime/watch", "/novel/read", "/novel/details", "/title"];

export default function AppTopBar() {
    const pathname = usePathname();
    const { publicKey } = useWallet();
    const { setVisible } = useSakuraWalletModal();

    if (HIDDEN_PATHS.some((p) => pathname.startsWith(p))) {
        return null;
    }

    const title = getPageTitle(pathname);

    return (
        <header className="app-topbar">
            <div className="app-topbar-start">
                <h1 className="app-topbar-title">{title}</h1>
            </div>
            <div className="app-topbar-actions">
                <Link href="/pass" className="app-topbar-chip">
                    Pass
                </Link>
                <ThemeToggle compact />
                <button
                    type="button"
                    className="app-topbar-wallet"
                    onClick={() => setVisible(true)}
                >
                    {publicKey ? truncateAddress(publicKey.toBase58()) : "Connect"}
                </button>
            </div>
        </header>
    );
}
