"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import AnimeCard from "@/components/AnimeCard";
import HorizontalScroll from "@/components/HorizontalScroll";
import Link from "next/link";
import {
    searchAnime,
    fetchAiringAnime,
    fetchPopularAnime,
    fetchAnimeInfo,
    type AnimeResult,
} from "@/lib/anime";
import { alTrending } from "@/lib/anilist";
import { getLastAniListDebug } from "@/lib/anilist";
import { getLocal, setLocalAndSyncSearches, STORAGE_KEYS, getAnimeHistory, type AnimeHistoryEntry } from "@/lib/storage";
import { PSYOP_ID, PSYOP_INFO } from "@/lib/psyopAnime";
import { TWO_HE_ANIME_ID, TWO_HE_ANIME_INFO } from "@/lib/2heAnime";
import { imageOrPlaceholder } from "@/lib/media-fallback";
import PersonalizedRecommendationRow from "@/components/PersonalizedRecommendationRow";

const MAX_RECENT_SEARCHES = 8;
const ROW_PREVIEW = 15;

const SAKURA_ORIGINALS: AnimeResult[] = [
    {
        id: PSYOP_ID,
        title: PSYOP_INFO.title,
        image: PSYOP_INFO.cover || PSYOP_INFO.image,
        type: "Sakura Original",
        score: PSYOP_INFO.score,
    },
    {
        id: TWO_HE_ANIME_ID,
        title: TWO_HE_ANIME_INFO.title,
        image: TWO_HE_ANIME_INFO.cover || TWO_HE_ANIME_INFO.image,
        type: "Sakura Original",
        score: TWO_HE_ANIME_INFO.score,
    },
];

function useDebounce(value: string, delay: number) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}

type FeaturedAnimeItem = AnimeResult & {
    description?: string;
    eyebrow?: string;
    isOriginal?: boolean;
    watchHref?: string;
};

function FeaturedAnimeCarousel({ items }: { items: FeaturedAnimeItem[] }) {
    const [current, setCurrent] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const touchStartXRef = useRef<number | null>(null);
    const active = items[current] || items[0];

    useEffect(() => {
        setCurrent(0);
    }, [items.length]);

    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (items.length <= 1) return;
        timerRef.current = setInterval(() => {
            setCurrent((index) => (index + 1) % items.length);
        }, 6500);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [current, items.length]);

    if (!active) return null;

    const coverUrl = imageOrPlaceholder(active.image);
    const detailsHref = `/anime/details?id=${encodeURIComponent(active.id)}`;
    const showOriginalBadge =
        Boolean(active.isOriginal) && (active.eyebrow || "").trim().toLowerCase() !== "sakura original";

    const advance = (direction: number) => {
        setCurrent((index) => (index + direction + items.length) % items.length);
    };

    return (
        <section
            className="home-featured-anime"
            onTouchStart={(event) => {
                touchStartXRef.current = event.changedTouches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
                const startX = touchStartXRef.current;
                const endX = event.changedTouches[0]?.clientX ?? null;
                touchStartXRef.current = null;
                if (startX == null || endX == null) return;
                const deltaX = endX - startX;
                if (Math.abs(deltaX) < 40) return;
                advance(deltaX < 0 ? 1 : -1);
            }}
        >
            <div className="home-featured-anime-bg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverUrl} alt="" referrerPolicy="no-referrer" />
            </div>
            <div className="home-featured-anime-shade" />
            {items.length > 1 && (
                <>
                    <button type="button" className="home-featured-arrow home-featured-arrow-prev" aria-label="Previous featured anime" onClick={() => advance(-1)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                    </button>
                    <button type="button" className="home-featured-arrow home-featured-arrow-next" aria-label="Next featured anime" onClick={() => advance(1)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                </>
            )}
            <div className="home-featured-anime-content">
                <div className="home-featured-anime-kickers">
                    <span className="home-featured-anime-kicker">{active.eyebrow || "Spotlight"}</span>
                    {showOriginalBadge && <span className="home-featured-original">Sakura Original</span>}
                </div>
                <h1 className="home-featured-anime-title">{active.title}</h1>
                {active.description && <p className="home-featured-anime-desc">{active.description}</p>}
                <div className="home-featured-anime-meta">
                    {active.type && <span>{active.type}</span>}
                    {active.releaseDate && <span>{active.releaseDate}</span>}
                    {active.score != null && <span className="home-featured-anime-rating">★ {active.score}</span>}
                </div>
                <div className="home-featured-anime-actions">
                    <Link href={active.watchHref || detailsHref} className="btn-primary browse-hero-cta">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                        Watch Now
                    </Link>
                    <Link href={detailsHref} className="btn-secondary home-featured-anime-secondary">View Details</Link>
                </div>
                {items.length > 1 && (
                    <div className="home-featured-carousel-controls" aria-label="Featured anime carousel">
                        {items.map((item, index) => (
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

export default function AnimeBrowsePage() {
    const [searchResults, setSearchResults] = useState<AnimeResult[]>([]);
    const [airingAnime, setAiringAnime] = useState<AnimeResult[]>([]);
    const [popularAnime, setPopularAnime] = useState<AnimeResult[]>([]);
    const [trendingAnime, setTrendingAnime] = useState<AnimeResult[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(false);
    const [airingLoading, setAiringLoading] = useState(true);
    const [popularLoading, setPopularLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const debouncedSearch = useDebounce(search, 500);
    const [continueWatching, setContinueWatching] = useState<AnimeHistoryEntry[]>([]);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const [showRecent, setShowRecent] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);
    const [apiError, setApiError] = useState<string | null>(null);
    const [featuredWatchHrefs, setFeaturedWatchHrefs] = useState<Record<string, string>>({});

    const loadRows = useCallback(async () => {
        setAiringLoading(true);
        setPopularLoading(true);
        setApiError(null);

        let gotAny = false;
        const errors: string[] = [];

        try {
            const airing = await fetchAiringAnime();
            setAiringAnime(airing);
            if (airing.length > 0) gotAny = true;
            else errors.push("trending:empty");
        } catch (e: unknown) {
            errors.push(`trending:${e instanceof Error ? e.message : "error"}`);
        }
        setAiringLoading(false);

        try {
            const [popular, trending] = await Promise.allSettled([
                fetchPopularAnime(),
                alTrending(),
            ]);
            if (popular.status === "fulfilled") {
                setPopularAnime(popular.value);
                if (popular.value.length > 0) gotAny = true;
                else errors.push("popular:empty");
            } else {
                errors.push(`popular:${popular.reason instanceof Error ? popular.reason.message : "error"}`);
            }
            if (trending.status === "fulfilled") {
                setTrendingAnime(trending.value.map((item) => ({
                    id: String(item.mal_id),
                    title: item.title,
                    image: item.image,
                    type: item.type,
                    score: item.score,
                    year: item.year,
                    releaseDate: item.year != null ? String(item.year) : undefined,
                })));
            }
        } catch (e: unknown) {
            errors.push(`popular:${e instanceof Error ? e.message : "error"}`);
        }
        setPopularLoading(false);

        if (!gotAny) {
            const dbg = getLastAniListDebug();
            setApiError(`${errors.join(" | ")}. DBG: ${dbg.slice(0, 180)}. Tap to retry`);
        }
    }, []);

    useEffect(() => {
        setContinueWatching(getAnimeHistory());
        void loadRows();
    }, [loadRows]);

    useEffect(() => {
        setRecentSearches(getLocal<string[]>(STORAGE_KEYS.RECENT_SEARCHES + "_ANIME", []));
    }, []);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setShowRecent(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    const saveRecentSearch = useCallback((query: string) => {
        const trimmed = query.trim();
        if (!trimmed || trimmed.length < 2) return;
        const existing = getLocal<string[]>(STORAGE_KEYS.RECENT_SEARCHES + "_ANIME", []);
        const filtered = existing.filter((s) => s.toLowerCase() !== trimmed.toLowerCase());
        const updated = [trimmed, ...filtered].slice(0, MAX_RECENT_SEARCHES);
        setLocalAndSyncSearches(STORAGE_KEYS.RECENT_SEARCHES + "_ANIME", updated);
        setRecentSearches(updated);
    }, []);

    const removeRecentSearch = useCallback((query: string) => {
        const existing = getLocal<string[]>(STORAGE_KEYS.RECENT_SEARCHES + "_ANIME", []);
        const updated = existing.filter((s) => s !== query);
        setLocalAndSyncSearches(STORAGE_KEYS.RECENT_SEARCHES + "_ANIME", updated);
        setRecentSearches(updated);
    }, []);

    const clearRecentSearches = useCallback(() => {
        setLocalAndSyncSearches(STORAGE_KEYS.RECENT_SEARCHES + "_ANIME", []);
        setRecentSearches([]);
    }, []);

    const fetchAnimeData = useCallback(async (query: string) => {
        if (!query.trim()) {
            setSearchResults([]);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const results = await searchAnime(query);
            setSearchResults(results);
            if (query.trim().length >= 2) saveRecentSearch(query);
        } catch (e: unknown) {
            console.error("Search failed", e);
            setError(e instanceof Error ? e.message : "Search failed.");
        }
        setLoading(false);
    }, [saveRecentSearch]);

    useEffect(() => {
        if (!debouncedSearch.trim()) {
            setSearchResults([]);
            setLoading(false);
            setError(null);
            return;
        }
        void fetchAnimeData(debouncedSearch);
    }, [debouncedSearch, fetchAnimeData]);

    const handleRecentClick = (query: string) => {
        setSearch(query);
        setShowRecent(false);
    };

    const psyopFeatured = useMemo<FeaturedAnimeItem>(() => {
        const firstPsyopEpisode = PSYOP_INFO.episodes[0];
        return {
            id: PSYOP_ID,
            title: PSYOP_INFO.title,
            image: PSYOP_INFO.cover || PSYOP_INFO.image,
            type: "Sakura Original",
            score: PSYOP_INFO.score,
            description: PSYOP_INFO.description,
            eyebrow: "Spotlight",
            isOriginal: false,
            watchHref: firstPsyopEpisode
                ? `/anime/watch?id=${encodeURIComponent(PSYOP_ID)}&ep=${encodeURIComponent(firstPsyopEpisode.id)}`
                : undefined,
        };
    }, []);

    const featuredBase = useMemo<FeaturedAnimeItem[]>(() => {
        const seen = new Set<string>([PSYOP_ID]);
        const source = trendingAnime.length > 0 ? trendingAnime : popularAnime;
        const liveItems = source
            .filter((item) => {
                if (seen.has(item.id)) return false;
                seen.add(item.id);
                return Boolean(item.image);
            })
            .slice(0, 8)
            .map((item) => ({ ...item, eyebrow: "Spotlight" }));

        return [...liveItems.slice(0, 3), psyopFeatured, ...liveItems.slice(3)];
    }, [popularAnime, psyopFeatured, trendingAnime]);

    useEffect(() => {
        const needsFetch = featuredBase.filter((item) => !item.watchHref).map((item) => item.id);
        if (needsFetch.length === 0) return;

        let cancelled = false;

        async function loadWatchLinks() {
            const results = await Promise.allSettled(
                needsFetch.map(async (id) => {
                    const info = await fetchAnimeInfo(id);
                    const firstEpisode = info?.episodes?.[0];
                    return firstEpisode
                        ? [id, `/anime/watch?id=${encodeURIComponent(id)}&ep=${encodeURIComponent(firstEpisode.id)}`] as const
                        : null;
                }),
            );

            if (cancelled) return;

            setFeaturedWatchHrefs((current) => {
                const next = { ...current };
                let changed = false;
                for (const result of results) {
                    if (result.status !== "fulfilled" || !result.value) continue;
                    const [id, href] = result.value;
                    if (next[id] === href) continue;
                    next[id] = href;
                    changed = true;
                }
                return changed ? next : current;
            });
        }

        void loadWatchLinks();
        return () => {
            cancelled = true;
        };
    }, [featuredBase]);

    const featuredAnime = useMemo<FeaturedAnimeItem[]>(
        () => featuredBase.map((item) => ({
            ...item,
            watchHref: item.watchHref || featuredWatchHrefs[item.id],
        })),
        [featuredBase, featuredWatchHrefs],
    );

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

    const renderAnimeRowCards = (list: AnimeResult[], withRank = false) =>
        list.slice(0, ROW_PREVIEW).map((anime, index) => (
            <AnimeCard
                key={anime.id}
                id={anime.id}
                title={anime.title}
                image={anime.image}
                score={anime.score}
                rank={withRank ? index + 1 : undefined}
            />
        ));

    const renderBrowseRow = (
        section: "top" | "airing" | "popular",
        title: string,
        list: AnimeResult[],
        isRowLoading: boolean,
        withRank = false,
    ) => {
        const seeMoreHref = isRowLoading || list.length > 0
            ? `/anime/browse?section=${section}`
            : undefined;

        return (
            <HorizontalScroll key={section} title={title} seeMoreHref={seeMoreHref}>
                {isRowLoading
                    ? renderRowSkeletons()
                    : list.length > 0
                        ? renderAnimeRowCards(list, withRank)
                        : renderRowEmpty(`${title} could not load right now.`)}
            </HorizontalScroll>
        );
    };

    return (
        <main className="main-content app-browse">
            <div className="home-toolbar">
                <div className="home-toolbar-copy">
                    <h1>Anime</h1>
                </div>
                <div className="home-toolbar-search">
                    <div className="search-bar-wrapper home-search-wrap" ref={searchRef}>
                        <div className="search-bar">
                            <span className="search-icon">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" x2="16.65" y1="21" y2="16.65" /></svg>
                            </span>
                            <input
                                type="text"
                                placeholder="Search anime..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onFocus={() => setShowRecent(true)}
                            />
                            {search && (
                                <button className="search-clear" onClick={() => { setSearch(""); setShowRecent(true); }} aria-label="Clear search">✕</button>
                            )}
                        </div>
                        {showRecent && recentSearches.length > 0 && !search && (
                            <div className="recent-searches">
                                <div className="recent-searches-header">
                                    <span className="recent-searches-title">Recent</span>
                                    <button className="recent-searches-clear" onClick={clearRecentSearches}>Clear All</button>
                                </div>
                                {recentSearches.map((q) => (
                                    <div key={q} className="recent-search-item">
                                        <button className="recent-search-text" onClick={() => handleRecentClick(q)}>{q}</button>
                                        <button className="recent-search-remove" onClick={(e) => { e.stopPropagation(); removeRecentSearch(q); }} aria-label={`Remove ${q}`}>✕</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {isDefaultBrowse && featuredAnime.length > 0 && (
                <FeaturedAnimeCarousel items={featuredAnime} />
            )}

            {isDefaultBrowse && continueWatching.length > 0 && (
                <HorizontalScroll title="Continue Watching" seeMoreHref="/history">
                    {continueWatching.map((entry) => (
                        <Link
                            key={entry.animeId}
                            href={`/anime/watch?id=${encodeURIComponent(entry.animeId)}&ep=${encodeURIComponent(entry.episodeId)}`}
                            className="continue-card"
                        >
                            <div className="continue-thumb">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={entry.image || "/placeholder.png"} alt={entry.animeTitle} referrerPolicy="no-referrer" />
                                <span className="continue-ep-badge">EP {entry.episodeNumber}</span>
                            </div>
                            <div className="continue-info">
                                <p className="continue-title">{entry.animeTitle}</p>
                            </div>
                        </Link>
                    ))}
                </HorizontalScroll>
            )}

            {isDefaultBrowse && (
                <>
                    <HorizontalScroll title="Sakura Originals">
                        {SAKURA_ORIGINALS.map((anime) => (
                            <AnimeCard
                                key={anime.id}
                                id={anime.id}
                                title={anime.title}
                                image={anime.image}
                                score={anime.score}
                                className="sakura-original-card"
                            />
                        ))}
                    </HorizontalScroll>
                    {renderBrowseRow("top", "Top Anime Today", popularAnime, popularLoading, true)}
                    {renderBrowseRow("airing", "Currently Airing", airingAnime, airingLoading)}
                    {popularAnime.length > 10 && renderBrowseRow("popular", "Popular This Season", popularAnime.slice(10), popularLoading)}
                    <PersonalizedRecommendationRow mode="anime" />
                </>
            )}

            {apiError && isDefaultBrowse && (
                <button type="button" className="browse-retry-btn" onClick={() => void loadRows()}>{apiError}</button>
            )}

            {isSearching && (
                <section className="section" style={{ paddingTop: 0 }}>
                    {loading ? (
                        <div className="manga-grid">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <div key={i} className="loading-skeleton" style={{ aspectRatio: "2/3", borderRadius: "var(--radius-md)" }} />
                            ))}
                        </div>
                    ) : searchResults.length > 0 ? (
                        <div className="manga-grid">
                            {searchResults.map((anime) => (
                                <AnimeCard key={anime.id} id={anime.id} title={anime.title} image={anime.image} type={anime.type} year={anime.year} score={anime.score} showMeta />
                            ))}
                        </div>
                    ) : (
                        <div className="manga-browse-empty">
                            <p>No anime found.</p>
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
