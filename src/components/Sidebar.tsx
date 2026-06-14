"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSakuraWalletModal } from "./SakuraWalletModal";
import { useSakuraAI } from "./SakuraAIModal";
import { useWallet } from "@solana/wallet-adapter-react";
import LottieIcon from "./LottieIcon";
import { truncateAddress } from "@/lib/solana";
import { getLocal, setLocal, STORAGE_KEYS } from "@/lib/storage";

interface NavItem {
  href: string;
  label: string;
  lottieFile: string;
  activePrefix?: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", lottieFile: "/icons/wired-outline-1652-mortgage-loan-hover-pinch.json" },
  { href: "/manga", label: "Manga", lottieFile: "/icons/wired-outline-1384-page-view-array-hover-pinch.json" },
  { href: "/comics", label: "Comics", lottieFile: "/icons/wired-outline-779-books-hover-hit.json" },
  { href: "/novel", label: "Novel", lottieFile: "/icons/wired-outline-471-ebook-reader-hover-pinch.json" },
  { href: "/anime", label: "Anime", lottieFile: "/icons/wired-outline-2440-goku-hover-pinch.json" },
  { href: "/library", label: "Library", lottieFile: "/icons/wired-outline-3140-book-open-hover-pinch.json" },
  { href: "/history", label: "History", lottieFile: "/icons/wired-outline-24-approved-checked-hover-loading.json" },
  { href: "/downloads", label: "Downloads", lottieFile: "/icons/wired-outline-199-download-2-hover-pointing.json" },
  { href: "/creator/apply", label: "Creator", lottieFile: "/icons/wired-outline-674-painter-hover-pinch.json", activePrefix: "/creator" },
  { href: "/settings", label: "Settings", lottieFile: "/icons/wired-outline-39-cog-hover-mechanic.json" },
];

const HIDDEN_PATHS = ["/chapter", "/anime/watch", "/novel/read"];

export default function Sidebar() {
  const pathname = usePathname();
  const { setVisible } = useSakuraWalletModal();
  const { setVisible: setSakuraAiVisible } = useSakuraAI();
  const { publicKey } = useWallet();
  const [expanded, setExpanded] = useState(true);
  const isHiddenPath = HIDDEN_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    setExpanded(getLocal<boolean>(STORAGE_KEYS.SIDEBAR_EXPANDED, true));
  }, []);

  useEffect(() => {
    const nextState = isHiddenPath ? "hidden" : expanded ? "expanded" : "collapsed";
    document.documentElement.setAttribute("data-sidebar", nextState);
    if (!isHiddenPath) {
      setLocal(STORAGE_KEYS.SIDEBAR_EXPANDED, expanded);
    }
  }, [expanded, isHiddenPath]);

  if (isHiddenPath) {
    return null;
  }

  const isPassActive = pathname.startsWith("/pass");

  return (
    <aside className={`sidebar ${expanded ? "expanded" : "collapsed"}`}>
      <div className="sidebar-top">
        <div className="sidebar-brand">
          <Link href="/" className="sidebar-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/sakura.png" alt="Sakura" width={32} height={32} />
          </Link>
          {expanded && (
            <Link href="/" className="sidebar-wordmark">
              SAKURA
            </Link>
          )}
        </div>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={() => setExpanded((value) => !value)}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          aria-pressed={expanded}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {expanded ? (
              <path d="M15 18l-6-6 6-6" />
            ) : (
              <path d="M9 18l6-6-6-6" />
            )}
          </svg>
        </button>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const matchPrefix = item.activePrefix || item.href;
          const isActive = matchPrefix === "/"
            ? pathname === "/"
            : pathname.startsWith(matchPrefix);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-nav-item ${isActive ? "active" : ""}`}
            >
              {isActive && <span className="sidebar-active-bar" />}
              <LottieIcon
                src={item.lottieFile}
                size={22}
                tone={isActive ? "on-accent" : "dim"}
                {...(isActive ? { replayIntervalMs: 3000, autoplay: true } : { playOnMount: true })}
              />
              <span className="sidebar-label">{item.label}</span>
              <span className="sidebar-tooltip">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-bottom">
        <Link
          href="/pass"
          className={`sidebar-nav-item ${isPassActive ? "active" : ""}`}
        >
          <LottieIcon
            src="/icons/wired-outline-1652-mortgage-loan-hover-pinch.json"
            size={22}
            tone={isPassActive ? "on-accent" : "dim"}
            playOnMount
          />
          <span className="sidebar-label">Pass</span>
          <span className="sidebar-tooltip">Pass</span>
        </Link>

        <button
          type="button"
          className="sidebar-nav-item"
          onClick={() => setSakuraAiVisible(true)}
          aria-label="Open Sakura AI"
        >
          <LottieIcon
            src="/icons/wired-outline-145-envelope-mail-hover-pinch.json"
            size={22}
            tone="dim"
            playOnMount
          />
          <span className="sidebar-label">Sakura AI</span>
          <span className="sidebar-tooltip">Sakura AI</span>
        </button>

        <button
          type="button"
          className={`sidebar-nav-item sidebar-wallet-btn ${publicKey ? "active" : "sidebar-connect-btn"}`}
          onClick={() => setVisible(true)}
        >
          <LottieIcon
            src="/icons/wired-outline-421-wallet-purse-hover-pinch.json"
            size={22}
            tone="on-accent"
            playOnMount
          />
          <span className="sidebar-label">
            {publicKey ? truncateAddress(publicKey.toBase58()) : "Connect"}
          </span>
          <span className="sidebar-tooltip">
            {publicKey ? "Wallet" : "Connect"}
          </span>
        </button>
      </div>
    </aside>
  );
}
