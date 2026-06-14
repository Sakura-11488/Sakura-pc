"use client";

import MangaCard from "@/components/MangaCard";
import HorizontalScroll from "@/components/HorizontalScroll";
import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";
import { searchAllComics, getComicsBrowseList } from "@/lib/sources";
import { type Manga } from "@/lib/sources/types";
import { MANGA_SOURCE_IDS } from "@/lib/sources/source-ids";
import { getLocal, setLocalAndSyncSearches, STORAGE_KEYS } from "@/lib/storage";
import { imageOrPlaceholder } from "@/lib/media-fallback";

const MAX_RECENT_SEARCHES = 8;
const ROW_PREVIEW = 15;
const COMIC_SOURCE = MANGA_SOURCE_IDS.XOXOCOMIC;

function useDebounce(value: string, delay: number) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}

function FeaturedComicsCarousel({ items }: { items: Manga[] }) {
    const [current, setCurrent] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
    const detailsHref = `/title?id=${encodeURIComponent(active.id)}&source=${encodeURIComponent(active.sourceStr || COMIC_SOURCE)}`;
    const advance = (direction: number) => {
        setCurrent((index) => (index + direction + slides.length) % slides.length);
    };

    return (
        <section className="home-featured-anime">
            <div className="home-featured-anime-bg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverUrl} alt="" referrerPolicy="no-referrer" />
            </div>
            <div className="home-featured-anime-shade" />
            {slides.length > 1 && (
                <>
                    <button type="button" className="home-featured-arrow home-featured-arrow-prev" aria-label="Previous featured comic" onClick={() => advance(-1)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                    </button>
                    <button type="button" className="home-featured-arrow home-featured-arrow-next" aria-label="Next featured comic" onClick={() => advance(1)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                </>
            )}
            <div className="home-featured-anime-content">
                <div className="home-featured-anime-kickers">
                    <span className="home-featured-anime-kicker">Spotlight</span>
                </div>
                <h1 className="home-featured-anime-title">{active.title}</h1>
                {active.description ? <p className="home-featured-anime-desc">{active.description}</p> : null}
                <div className="home-featured-anime-meta">
                    {active.status ? <span>{active.status}</span> : null}
                    {active.author ? <span>{active.author}</span> : null}
                </div>
                <div className="home-featured-anime-actions">
                    <Link href={detailsHref} className="btn-primary browse-hero-cta">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
                        Read Now
                    </Link>
                    <Link href={detailsHref} className="btn-secondary home-featured-anime-secondary">
                        View Details
                    </Link>
                </div>
                {slides.length > 1 && (
                    <div className="home-featured-carousel-controls" aria-label="Featured comics carousel">
                        {slides.map((item, index) => (
                            <button
                                key={`${item.id}-${index}`}
                                type="button"
                                className={`home-featured-dot ${index === current ? "active" : ""}`}
                                aria-label={`Show ${item.title}`}
                                onClick={() => setCurrent(index)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}

function renderComicRowCards(list: Manga[]) {
    return list.slice(0, ROW_PREVIEW).map((comic, index) => (
        <MangaCard
            key={`${comic.sourceStr}:${comic.id}`}
            slug={comic.id}
            title={comic.title}
            cover={comic.cover}
            genres={comic.tags.slice(0, 3)}
            follows={comic.follows}
            rating={comic.rating}
            source={comic.sourceStr || COMIC_SOURCE}
            rank={index + 1}
        />
    ));
}

export default function ComicsBrowsePage() {
    const [popular, setPopular] = useState<Manga[]>([]);
    const [recommended, setRecommended] = useState<Manga[]>([]);
    const [latest, setLatest] = useState<Manga[]>([]);
    const [sectionLoading, setSectionLoading] = useState(true);
    const [comicsList, setComicsList] = useState<Manga[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const debouncedSearch = useDebounce(search, 500);

    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const [showRecent, setShowRecent] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setRecentSearches(getLocal<string[]>(STORAGE_KEYS.RECENT_SEARCHES + "_COMICS", []));
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
        const existing = getLocal<string[]>(STORAGE_KEYS.RECENT_SEARCHES + "_COMICS", []);
        const filtered = existing.filter((s) => s.toLowerCase() !== trimmed.toLowerCase());
        const updated = [trimmed, ...filtered].slice(0, MAX_RECENT_SEARCHES);
        setLocalAndSyncSearches(STORAGE_KEYS.RECENT_SEARCHES + "_COMICS", updated);
        setRecentSearches(updated);
    }, []);

    const removeRecentSearch = useCallback((query: string) => {
        const existing = getLocal<string[]>(STORAGE_KEYS.RECENT_SEARCHES + "_COMICS", []);
        const updated = existing.filter((s) => s !== query);
        setLocalAndSyncSearches(STORAGE_KEYS.RECENT_SEARCHES + "_COMICS", updated);
        setRecentSearches(updated);
    }, []);

    const clearRecentSearches = useCallback(() => {
        setLocalAndSyncSearches(STORAGE_KEYS.RECENT_SEARCHES + "_COMICS", []);
        setRecentSearches([]);
    }, []);

    useEffect(() => {
        let cancelled = false;
        setSectionLoading(true);
        Promise.all([
            getComicsBrowseList("popular"),
            getComicsBrowseList("recommended"),
            getComicsBrowseList("new"),
        ])
            .then(([popularItems, recommendedItems, latestItems]) => {
                if (cancelled) return;
                setPopular(popularItems);
                setRecommended(recommendedItems);
                setLatest(latestItems);
            })
            .catch((e) => {
                if (!cancelled) {
                    console.error("Comics browse failed", e);
                    setError(e instanceof Error ? e.message : "Could not load comics");
                }
            })
            .finally(() => {
                if (!cancelled) setSectionLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const fetchComics = useCallback(async (query: string) => {
        setLoading(true);
        setError(null);
        try {
            const results = await searchAllComics(query);
            setComicsList(results);
            if (query.trim().length >= 2) saveRecentSearch(query);
        } catch (e: unknown) {
            console.error("Comics search failed", e);
            setError(e instanceof Error ? e.message : "Search failed");
            setComicsList([]);
        }
        setLoading(false);
    }, [saveRecentSearch]);

    useEffect(() => {
        if (!debouncedSearch.trim()) {
            setComicsList([]);
            return;
        }
        fetchComics(debouncedSearch);
    }, [debouncedSearch, fetchComics]);

    const handleRecentClick = (query: string) => {
        setSearch(query);
        setShowRecent(false);
    };

    const isSearching = debouncedSearch.trim().length > 0;
    const isDefaultBrowse = !isSearching;
    const renderRowSkeletons = () =>
        Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="loading-skeleton" style={{ width: 140, aspectRatio: "2/3", borderRadius: "var(--radius-md)", flexShrink: 0 }} />
        ));

    const renderRowEmpty = (message: string) => (
        <div style={{ padding: "24px 8px", color: "var(--text-muted)", fontSize: 14 }}>{message}</div>
    );

    return (
        <main className="main-content app-browse">
            <div className="home-toolbar">
                <div className="home-toolbar-copy">
                    <h1>Comics</h1>
                </div>
                <div className="home-toolbar-search">
                    <div className="search-bar-wrapper home-search-wrap" ref={searchRef}>
                        <div className="search-bar">
                            <span className="search-icon">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" x2="16.65" y1="21" y2="16.65" /></svg>
                            </span>
                            <input
                                type="text"
                                placeholder="Search comics..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onFocus={() => setShowRecent(true)}
                            />
                            {search && (
                                <button type="button" className="search-clear" onClick={() => { setSearch(""); setShowRecent(true); }} aria-label="Clear search">✕</button>
                            )}
                        </div>
                        {showRecent && recentSearches.length > 0 && !search && (
                            <div className="recent-searches">
                                <div className="recent-searches-header">
                                    <span className="recent-searches-title">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                        Recent
                                    </span>
                                    <button type="button" className="recent-searches-clear" onClick={clearRecentSearches}>Clear All</button>
                                </div>
                                {recentSearches.map((q) => (
                                    <div key={q} className="recent-search-item">
                                        <button type="button" className="recent-search-text" onClick={() => handleRecentClick(q)}>{q}</button>
                                        <button type="button" className="recent-search-remove" onClick={(e) => { e.stopPropagation(); removeRecentSearch(q); }} aria-label={`Remove ${q}`}>✕</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {isDefaultBrowse && popular.length > 0 && (
                <FeaturedComicsCarousel items={popular} />
            )}

            {error && isDefaultBrowse && !sectionLoading && popular.length === 0 ? (
                <div className="error-container" style={{ margin: "40px auto", maxWidth: 600 }}>
                    <p className="error-message">{error}</p>
                    <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
                        Comics are loaded through the Sakura catalog service. Check your connection and try again.
                    </p>
                </div>
            ) : null}

            {isDefaultBrowse && (
                <>
                    <HorizontalScroll title="Popular Comics">
                        {sectionLoading ? renderRowSkeletons() : popular.length > 0 ? renderComicRowCards(popular) : renderRowEmpty("Popular comics could not load right now.")}
                    </HorizontalScroll>
                    <HorizontalScroll title="Recommended">
                        {sectionLoading ? renderRowSkeletons() : recommended.length > 0 ? renderComicRowCards(recommended) : renderRowEmpty("Recommendations could not load right now.")}
                    </HorizontalScroll>
                    <HorizontalScroll title="Latest Issues">
                        {sectionLoading ? renderRowSkeletons() : latest.length > 0 ? renderComicRowCards(latest) : renderRowEmpty("Latest issues could not load right now.")}
                    </HorizontalScroll>
                </>
            )}

            {isSearching && (
                <section className="section" style={{ paddingTop: 0 }}>
                    {loading ? (
                        <div className="manga-grid">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <div key={i} className="loading-skeleton" style={{ aspectRatio: "2/3", borderRadius: "var(--radius-md)" }} />
                            ))}
                        </div>
                    ) : comicsList.length > 0 ? (
                        <div className="manga-grid">
                            {comicsList.map((comic) => (
                                <MangaCard
                                    key={`${comic.sourceStr}:${comic.id}`}
                                    slug={comic.id}
                                    title={comic.title}
                                    cover={comic.cover}
                                    genres={comic.tags.slice(0, 3)}
                                    source={comic.sourceStr || COMIC_SOURCE}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="manga-browse-empty">
                            <p>No comics found.</p>
                        </div>
                    )}
                </section>
            )}

            {error && isSearching && (
                <div className="error-container" style={{ margin: "40px auto", maxWidth: 600 }}>
                    <p className="error-message">{error}</p>
                </div>
            )}
        </main>
    );
}
