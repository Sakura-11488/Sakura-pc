"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import MangaCard from "@/components/MangaCard";
import HorizontalScroll from "@/components/HorizontalScroll";
import Link from "next/link";
import { searchAllSources, getDetailsSource, getMangaBrowseList, type MangaMediaFilter } from "@/lib/sources";
import { type Manga } from "@/lib/sources/types";
import { getLocal, setLocalAndSyncSearches, STORAGE_KEYS } from "@/lib/storage";
import { imageOrPlaceholder } from "@/lib/media-fallback";

const MAX_RECENT_SEARCHES = 8;
const ROW_PREVIEW = 15;
const FETCH_LIMIT = 40;
const MEDIA_FILTERS: MangaMediaFilter[] = ["All", "Manga", "Manwha", "Manhua"];
type BrowseSection = "recommended" | "new" | "popular";

function useDebounce(value: string, delay: number) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}

function FeaturedMangaCarousel({ items }: { items: Manga[] }) {
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
    const source = active.sourceStr || "atsumaru";
    const detailsHref = `/title?id=${encodeURIComponent(active.id)}&source=${encodeURIComponent(source)}`;
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
                        aria-label="Previous featured manga"
                        onClick={() => advance(-1)}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 18l-6-6 6-6" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        className="home-featured-arrow home-featured-arrow-next"
                        aria-label="Next featured manga"
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
                {active.description && <p className="home-featured-anime-desc">{active.description}</p>}
                <div className="home-featured-anime-meta">
                    {active.status && <span>{active.status}</span>}
                    {active.year ? <span>{active.year}</span> : null}
                    {active.rating != null && <span className="home-featured-anime-rating">★ {active.rating.toFixed(1)}</span>}
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
                    <div className="home-featured-carousel-controls" aria-label="Featured manga carousel">
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

function renderMangaRowCards(list: Manga[]) {
    return list.slice(0, ROW_PREVIEW).map((manga, index) => (
        <MangaCard
            key={manga.id}
            slug={manga.id}
            title={manga.title}
            cover={manga.cover}
            genres={manga.tags.slice(0, 3)}
            follows={manga.follows}
            rating={manga.rating}
            source={manga.sourceStr}
            rank={index + 1}
        />
    ));
}

export default function BrowsePage() {
    const [recommended, setRecommended] = useState<Manga[]>([]);
    const [newReleases, setNewReleases] = useState<Manga[]>([]);
    const [popular, setPopular] = useState<Manga[]>([]);
    const [sectionFilters, setSectionFilters] = useState<Record<BrowseSection, MangaMediaFilter>>({
        recommended: "All",
        new: "All",
        popular: "All",
    });
    const [sectionLoading, setSectionLoading] = useState<Record<BrowseSection, boolean>>({
        recommended: true,
        new: true,
        popular: true,
    });
    const [mangaList, setMangaList] = useState<Manga[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const debouncedSearch = useDebounce(search, 500);

    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const [showRecent, setShowRecent] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setRecentSearches(getLocal<string[]>(STORAGE_KEYS.RECENT_SEARCHES, []));
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
        const existing = getLocal<string[]>(STORAGE_KEYS.RECENT_SEARCHES, []);
        const filtered = existing.filter(s => s.toLowerCase() !== trimmed.toLowerCase());
        const updated = [trimmed, ...filtered].slice(0, MAX_RECENT_SEARCHES);
        setLocalAndSyncSearches(STORAGE_KEYS.RECENT_SEARCHES, updated);
        setRecentSearches(updated);
    }, []);

    const removeRecentSearch = useCallback((query: string) => {
        const existing = getLocal<string[]>(STORAGE_KEYS.RECENT_SEARCHES, []);
        const updated = existing.filter(s => s !== query);
        setLocalAndSyncSearches(STORAGE_KEYS.RECENT_SEARCHES, updated);
        setRecentSearches(updated);
    }, []);

    const clearRecentSearches = useCallback(() => {
        setLocalAndSyncSearches(STORAGE_KEYS.RECENT_SEARCHES, []);
        setRecentSearches([]);
    }, []);

    const loadBrowseSection = useCallback(async (section: BrowseSection, media: MangaMediaFilter) => {
        setSectionLoading((prev) => ({ ...prev, [section]: true }));
        try {
            const tab = section === "new" ? "new" : section;
            const data = await getMangaBrowseList(tab, FETCH_LIMIT, media);

            if (section === "recommended") {
                setRecommended(data);
            } else if (section === "new") {
                setNewReleases(data);
            } else {
                setPopular(data);
            }

            if (section === "recommended" || section === "popular") {
                const detailsSrc = getDetailsSource();
                const applyEnriched = section === "recommended" ? setRecommended : setPopular;
                Promise.allSettled(
                    data.slice(0, ROW_PREVIEW).map(async (m) => {
                        try {
                            const matches = await detailsSrc.searchManga(m.title);
                            if (matches[0]) {
                                return {
                                    ...m,
                                    description: matches[0].description || m.description,
                                    rating: matches[0].rating ?? m.rating,
                                    tags: matches[0].tags.length > 0 ? matches[0].tags : m.tags,
                                };
                            }
                        } catch {}
                        return m;
                    }),
                ).then((results) => {
                    const enriched = results.map((r, i) => (r.status === "fulfilled" ? r.value : data[i]));
                    applyEnriched((prev) => [...enriched, ...prev.slice(ROW_PREVIEW)]);
                }).catch(() => {});
            }
        } catch {
            if (section === "recommended") setRecommended([]);
            else if (section === "new") setNewReleases([]);
            else setPopular([]);
        }
        setSectionLoading((prev) => ({ ...prev, [section]: false }));
    }, []);

    useEffect(() => {
        void loadBrowseSection("popular", sectionFilters.popular);
        void loadBrowseSection("recommended", sectionFilters.recommended);
        void loadBrowseSection("new", sectionFilters.new);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSectionFilter = useCallback((section: BrowseSection, media: MangaMediaFilter) => {
        setSectionFilters((prev) => ({ ...prev, [section]: media }));
        void loadBrowseSection(section, media);
    }, [loadBrowseSection]);

    const fetchManga = useCallback(async (query: string) => {
        setLoading(true);
        setError(null);
        try {
            const results = await searchAllSources(query);
            setMangaList(results);
            if (query.trim().length >= 2) saveRecentSearch(query);
        } catch (e: any) {
            console.error("Search failed", e);
            setError(e.message || "Search failed");
        }
        setLoading(false);
    }, [saveRecentSearch]);

    useEffect(() => {
        if (!debouncedSearch.trim()) {
            setMangaList([]);
            setLoading(false);
            setError(null);
            return;
        }
        fetchManga(debouncedSearch);
    }, [debouncedSearch, fetchManga]);

    const isSearching = search.trim().length > 0;
    const isDefaultBrowse = !isSearching;

    const renderRowSkeletons = () =>
        Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="home-row-skeleton">
                <div className="loading-skeleton home-row-skeleton-cover" />
                <div className="loading-skeleton home-row-skeleton-line" />
            </div>
        ));

    const renderRowEmpty = (label: string) => (
        <div className="home-row-empty">{label}</div>
    );

    const renderCards = (list: Manga[]) => list.map((manga) => (
        <MangaCard key={manga.id} slug={manga.id} title={manga.title} cover={manga.cover}
            genres={manga.tags.slice(0, 3)} follows={manga.follows} rating={manga.rating} source={manga.sourceStr} />
    ));

    const handleRecentClick = (query: string) => { setSearch(query); setShowRecent(false); };

    const renderBrowseRow = (section: BrowseSection, title: string, list: Manga[]) => {
        const isRowLoading = sectionLoading[section];
        const seeMoreHref = isRowLoading || list.length > 0
            ? `/manga/browse?section=${section}&type=${encodeURIComponent(sectionFilters[section])}`
            : undefined;

        return (
            <HorizontalScroll
                key={section}
                title={title}
                seeMoreHref={seeMoreHref}
                filters={(
                    <div className="hscroll-filters">
                        {MEDIA_FILTERS.map((type) => (
                            <button
                                key={type}
                                type="button"
                                className={`genre-chip ${sectionFilters[section] === type ? "active" : ""}`}
                                onClick={() => handleSectionFilter(section, type)}
                                disabled={isRowLoading}
                            >
                                {type}
                            </button>
                        ))}
                    </div>
                )}
            >
                {isRowLoading
                    ? renderRowSkeletons()
                    : list.length > 0
                        ? renderMangaRowCards(list)
                        : renderRowEmpty(`${title} could not load right now.`)}
            </HorizontalScroll>
        );
    };

    return (
        <main className="main-content app-browse">
            <div className="home-toolbar">
                <div className="home-toolbar-copy">
                    <h1>Manga</h1>
                </div>
                <div className="home-toolbar-search">
                    <div className="search-bar-wrapper home-search-wrap" ref={searchRef}>
                        <div className="search-bar">
                            <span className="search-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" x2="16.65" y1="21" y2="16.65" /></svg></span>
                            <input type="text" placeholder="Search manga..." value={search}
                                onChange={(e) => setSearch(e.target.value)} onFocus={() => setShowRecent(true)} />
                            {search && (
                                <button className="search-clear" onClick={() => { setSearch(""); setShowRecent(true); }} aria-label="Clear search">✕</button>
                            )}
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
                                        <button className="recent-search-text" onClick={() => handleRecentClick(q)}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" x2="16.65" y1="21" y2="16.65" /></svg>
                                            {q}
                                        </button>
                                        <button className="recent-search-remove" onClick={(e) => { e.stopPropagation(); removeRecentSearch(q); }} aria-label={`Remove ${q}`}>✕</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {isDefaultBrowse && popular.length > 0 && (
                <FeaturedMangaCarousel items={popular} />
            )}

            {isDefaultBrowse && (
                <>
                    {renderBrowseRow("popular", "Popular", popular)}
                    {renderBrowseRow("recommended", "Recommended", recommended)}
                    {renderBrowseRow("new", "New Releases", newReleases)}
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
                    ) : mangaList.length > 0 ? (
                        <div className="manga-grid">{renderCards(mangaList)}</div>
                    ) : (
                        <div className="manga-browse-empty">
                            <p>No manga found.</p>
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
