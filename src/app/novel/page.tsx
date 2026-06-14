"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import PosterCard from "@/components/PosterCard";
import HorizontalScroll from "@/components/HorizontalScroll";
import { getNovels, type Novel } from "@/lib/novel";
import {
    fetchPopularNovels,
    searchNovels as searchExternal,
    enhanceCovers,
    type AllNovelItem,
} from "@/lib/allnovel";
import { toUnified, externalToUnified, type UnifiedNovel } from "@/lib/novel-browse";
import { getLocal, setLocalAndSyncSearches, STORAGE_KEYS } from "@/lib/storage";
import { imageOrPlaceholder } from "@/lib/media-fallback";
import dynamic from "next/dynamic";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

function useDebounce(value: string, delay: number) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}

const MAX_RECENT_SEARCHES = 8;

function BookIcon({ size = 48 }: { size?: number }) {
    const [animData, setAnimData] = useState<object | null>(null);
    useEffect(() => {
        fetch("/icons/wired-outline-779-books-hover-hit.json").then(r => r.json()).then(setAnimData).catch(() => {});
    }, []);
    if (!animData) return null;
    return <Lottie animationData={animData} loop autoplay style={{ width: size, height: size, opacity: 0.4 }} />;
}

function NovelCard({ novel }: { novel: UnifiedNovel }) {
    const [imgSrc, setImgSrc] = useState(novel.cover || "");
    const [errored, setErrored] = useState(false);

    useEffect(() => { setImgSrc(novel.cover || ""); setErrored(false); }, [novel.cover]);

    const handleError = () => {
        if (!errored && novel.originalCover && novel.originalCover !== imgSrc) {
            setImgSrc(novel.originalCover);
            setErrored(true);
        }
    };

    const hasCover = !!imgSrc;

    return (
        <Link href={novel.href} style={{ textDecoration: "none" }}>
            <div className="glass-card" style={{ borderRadius: "var(--radius-md)", overflow: "hidden", transition: "transform 0.3s ease, box-shadow 0.3s ease" }}>
                <div style={{ position: "relative", aspectRatio: "2/3", background: "linear-gradient(135deg, #1a0a2e, #0a0812)" }}>
                    {hasCover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={imgSrc}
                            alt={novel.title}
                            loading="lazy"
                            onError={handleError}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                    ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <BookIcon size={32} />
                        </div>
                    )}
                    {novel.status && (
                        <div style={{ position: "absolute", top: 6, right: 6, background: novel.status === "completed" ? "rgba(74,222,128,0.9)" : novel.status === "hiatus" ? "rgba(251,191,36,0.9)" : "var(--sakura-pink)", color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 10, textTransform: "capitalize" }}>
                            {novel.status}
                        </div>
                    )}
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(0,0,0,0.85))", padding: "32px 10px 10px" }}>
                        <p style={{ margin: 0, color: "#fff", fontSize: 13, fontWeight: 700, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                            {novel.title}
                        </p>
                        {novel.genres.length > 0 && (
                            <p style={{ margin: "4px 0 0", color: "rgba(255,255,255,0.5)", fontSize: 10 }}>
                                {novel.genres.slice(0, 2).join(" · ")}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </Link>
    );
}

function FeaturedNovelCarousel({ items }: { items: UnifiedNovel[] }) {
    const [current, setCurrent] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const touchStartXRef = useRef<number | null>(null);
    const slides = items.slice(0, 5);
    const active = slides[current] || slides[0];

    useEffect(() => {
        setCurrent(0);
    }, [slides.length]);

    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (slides.length <= 1) return;
        timerRef.current = setInterval(() => {
            setCurrent((index) => (index + 1) % slides.length);
        }, 6500);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [current, slides.length]);

    if (!active) return null;

    const coverUrl = imageOrPlaceholder(active.cover);
    const jumpTo = (index: number) => setCurrent(index);
    const advance = (direction: number) => {
        setCurrent((index) => (index + direction + slides.length) % slides.length);
    };
    const handleTouchStart = (event: React.TouchEvent<HTMLElement>) => {
        touchStartXRef.current = event.changedTouches[0]?.clientX ?? null;
    };
    const handleTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
        const startX = touchStartXRef.current;
        const endX = event.changedTouches[0]?.clientX ?? null;
        touchStartXRef.current = null;
        if (startX == null || endX == null) return;
        const deltaX = endX - startX;
        if (Math.abs(deltaX) < 40) return;
        advance(deltaX < 0 ? 1 : -1);
    };

    const metaParts = [
        active.status ? active.status.charAt(0).toUpperCase() + active.status.slice(1) : null,
        active.genres.length > 0 ? active.genres.slice(0, 2).join(" · ") : null,
    ].filter(Boolean);

    return (
        <section
            className="home-featured-anime"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            <div className="home-featured-anime-bg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverUrl} alt="" referrerPolicy="no-referrer" />
            </div>
            <div className="home-featured-anime-shade" />
            {slides.length > 1 && (
                <>
                    <button
                        type="button"
                        className="home-featured-arrow home-featured-arrow-prev"
                        aria-label="Previous featured novel"
                        onClick={() => advance(-1)}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 18l-6-6 6-6" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        className="home-featured-arrow home-featured-arrow-next"
                        aria-label="Next featured novel"
                        onClick={() => advance(1)}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 18l6-6-6-6" />
                        </svg>
                    </button>
                </>
            )}
            <div className="home-featured-anime-content">
                <div className="home-featured-anime-kickers">
                    <span className="home-featured-anime-kicker">Spotlight</span>
                </div>
                <h1 className="home-featured-anime-title">{active.title}</h1>
                {metaParts.length > 0 && (
                    <div className="home-featured-anime-meta">
                        {metaParts.map((part) => (
                            <span key={part}>{part}</span>
                        ))}
                    </div>
                )}
                <div className="home-featured-anime-actions">
                    <Link href={active.href} className="btn-primary browse-hero-cta">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
                        Read Now
                    </Link>
                    <Link href={active.href} className="btn-secondary home-featured-anime-secondary">
                        View Details
                    </Link>
                </div>
                {slides.length > 1 && (
                    <div className="home-featured-carousel-controls" aria-label="Featured novel carousel">
                        {slides.map((item, index) => (
                            <button
                                key={`${item.id}-${index}`}
                                type="button"
                                className={`home-featured-dot ${index === current ? "active" : ""}`}
                                aria-label={`Show ${item.title}`}
                                onClick={() => jumpTo(index)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}

export default function NovelPage() {
    const [sakuraNovels, setSakuraNovels] = useState<Novel[]>([]);
    const [externalNovels, setExternalNovels] = useState<AllNovelItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [searchResults, setSearchResults] = useState<UnifiedNovel[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const debouncedSearch = useDebounce(search, 600);

    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const [showRecent, setShowRecent] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        Promise.all([
            getNovels({ limit: 50 }),
            fetchPopularNovels(1).catch(() => [] as AllNovelItem[]),
        ]).then(async ([sakura, external]) => {
            setSakuraNovels(sakura);
            setExternalNovels(external);
            setLoading(false);
            const enhanced = await enhanceCovers(external);
            setExternalNovels(enhanced);
        });
    }, []);

    useEffect(() => {
        setRecentSearches(getLocal<string[]>(STORAGE_KEYS.RECENT_SEARCHES + "_NOVEL", []));
    }, []);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowRecent(false);
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    const saveRecentSearch = useCallback((query: string) => {
        const trimmed = query.trim();
        if (!trimmed || trimmed.length < 2) return;
        const existing = getLocal<string[]>(STORAGE_KEYS.RECENT_SEARCHES + "_NOVEL", []);
        const filtered = existing.filter(s => s.toLowerCase() !== trimmed.toLowerCase());
        const updated = [trimmed, ...filtered].slice(0, MAX_RECENT_SEARCHES);
        setLocalAndSyncSearches(STORAGE_KEYS.RECENT_SEARCHES + "_NOVEL", updated);
        setRecentSearches(updated);
    }, []);

    const removeRecentSearch = useCallback((query: string) => {
        const existing = getLocal<string[]>(STORAGE_KEYS.RECENT_SEARCHES + "_NOVEL", []);
        const updated = existing.filter(s => s !== query);
        setLocalAndSyncSearches(STORAGE_KEYS.RECENT_SEARCHES + "_NOVEL", updated);
        setRecentSearches(updated);
    }, []);

    const clearRecentSearches = useCallback(() => {
        setLocalAndSyncSearches(STORAGE_KEYS.RECENT_SEARCHES + "_NOVEL", []);
        setRecentSearches([]);
    }, []);

    useEffect(() => {
        if (!debouncedSearch.trim()) { setSearchResults([]); return; }
        setSearchLoading(true);
        Promise.all([
            getNovels({ search: debouncedSearch }),
            searchExternal(debouncedSearch, 1).catch(() => [] as AllNovelItem[]),
        ]).then(async ([sakura, external]) => {
            setSearchResults([...sakura.map(toUnified), ...external.map(externalToUnified)]);
            setSearchLoading(false);
            if (debouncedSearch.trim().length >= 2) saveRecentSearch(debouncedSearch);
            const enhanced = await enhanceCovers(external);
            setSearchResults([...sakura.map(toUnified), ...enhanced.map(externalToUnified)]);
        });
    }, [debouncedSearch, saveRecentSearch]);

    const handleRecentClick = (query: string) => { setSearch(query); setShowRecent(false); };

    const isSearching = search.trim().length > 0;
    const allNovels: UnifiedNovel[] = [
        ...sakuraNovels.map(toUnified),
        ...externalNovels.map(externalToUnified),
    ];
    const isDefaultBrowse = !isSearching && !loading;

    const featuredNovels: UnifiedNovel[] = externalNovels.length > 0
        ? externalNovels.slice(0, 5).map(externalToUnified)
        : sakuraNovels.slice(0, 5).map(toUnified);

    return (
        <main className="main-content app-browse">
            <div className="home-toolbar">
                <div className="home-toolbar-copy">
                    <h1>Novels</h1>
                </div>
                <div className="home-toolbar-search">
                    <div className="search-bar-wrapper home-search-wrap" ref={searchRef}>
                        <div className="search-bar">
                            <span className="search-icon">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" x2="16.65" y1="21" y2="16.65" /></svg>
                            </span>
                            <input type="text" placeholder="Search novels..." value={search} onChange={(e) => setSearch(e.target.value)} onFocus={() => setShowRecent(true)} />
                            {search && (<button className="search-clear" onClick={() => { setSearch(""); setShowRecent(true); }} aria-label="Clear">✕</button>)}
                        </div>
                        {showRecent && recentSearches.length > 0 && !search && (
                            <div className="recent-searches">
                                <div className="recent-searches-header">
                                    <span className="recent-searches-title">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                        Recent
                                    </span>
                                    <button className="recent-searches-clear" onClick={clearRecentSearches}>Clear All</button>
                                </div>
                                {recentSearches.map((q) => (
                                    <div key={q} className="recent-search-item">
                                        <button className="recent-search-text" onClick={() => handleRecentClick(q)}>{q}</button>
                                        <button className="recent-search-remove" onClick={(e) => { e.stopPropagation(); removeRecentSearch(q); }}>✕</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {isDefaultBrowse && featuredNovels.length > 0 && (
                <FeaturedNovelCarousel items={featuredNovels} />
            )}

            {isSearching && (
                <section className="section" style={{ paddingTop: 0 }}>
                    {searchLoading ? (
                        <div className="manga-grid">
                            {Array.from({ length: 6 }).map((_, i) => (<div key={i} className="loading-skeleton" style={{ aspectRatio: "2/3", borderRadius: "var(--radius-md)" }} />))}
                        </div>
                    ) : searchResults.length > 0 ? (
                        <div className="manga-grid">
                            {searchResults.map((novel) => <NovelCard key={novel.id} novel={novel} />)}
                        </div>
                    ) : (
                        <div className="manga-browse-empty">
                            <p>No results found.</p>
                        </div>
                    )}
                </section>
            )}

            {isDefaultBrowse && (
                <>
                    {externalNovels.length > 0 && (
                        <HorizontalScroll title="Popular Novels" linkText="View more ›" linkHref="/novel/browse">
                            {externalNovels.slice(0, 20).map(n => {
                                const u = externalToUnified(n);
                                return (
                                    <PosterCard
                                        key={u.id}
                                        href={u.href}
                                        title={u.title}
                                        image={u.cover}
                                        fallbackImage={u.originalCover}
                                    />
                                );
                            })}
                        </HorizontalScroll>
                    )}

                    {sakuraNovels.length > 0 && (
                        <HorizontalScroll title="Sakura Originals" linkText="Publish yours ›" linkHref="/novel/publish">
                            {sakuraNovels.map(n => {
                                const u = toUnified(n);
                                return (
                                    <Link key={u.id} href={u.href} className="novel-sm-card">
                                        <div className="novel-sm-cover">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={u.cover || "/placeholder.png"} alt={u.title} />
                                        </div>
                                        <p className="novel-sm-title">{u.title}</p>
                                        {u.genres.length > 0 && <p className="novel-sm-genre">{u.genres.slice(0, 2).join(" · ")}</p>}
                                    </Link>
                                );
                            })}
                        </HorizontalScroll>
                    )}

                    {allNovels.length > 0 && (
                        <HorizontalScroll title="All Novels" linkText="View more ›" linkHref="/novel/browse">
                            {allNovels.slice(0, 20).map(n => (
                                <PosterCard
                                    key={n.id}
                                    href={n.href}
                                    title={n.title}
                                    image={n.cover}
                                    fallbackImage={n.originalCover}
                                />
                            ))}
                        </HorizontalScroll>
                    )}

                    {allNovels.length === 0 && (
                        <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
                            <BookIcon size={64} />
                            <p style={{ fontSize: 14, marginTop: 8 }}>No novels yet.</p>
                            <Link href="/novel/publish" style={{ display: "inline-block", marginTop: 16, background: "var(--sakura-pink)", color: "#fff", padding: "10px 24px", borderRadius: 12, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
                                Start Writing
                            </Link>
                        </div>
                    )}
                </>
            )}

            {!isSearching && loading && (
                <section className="section" style={{ paddingTop: 0 }}>
                    <div className="manga-grid">
                        {Array.from({ length: 8 }).map((_, i) => (<div key={i} className="loading-skeleton" style={{ aspectRatio: "2/3", borderRadius: "var(--radius-md)" }} />))}
                    </div>
                </section>
            )}

            <div className="novel-publish-cta">
                <Link href="/novel/publish" className="btn-primary">
                    Publish Your Novel
                </Link>
            </div>
        </main>
    );
}
