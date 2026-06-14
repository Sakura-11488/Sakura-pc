"use client";

import MangaCard from "@/components/MangaCard";
import HorizontalScroll from "@/components/HorizontalScroll";
import Link from "next/link";
import { useState, useEffect, useRef, useMemo } from "react";
import { MANGA_GENRES } from "@/lib/content-source";
import { searchAllSources, getDetailsSource } from "@/lib/sources";
import { type Manga } from "@/lib/sources/types";
import { fetchAnimeInfo, fetchPopularAnime, searchAnime, type AnimeResult } from "@/lib/anime";
import { alTrending, alTrendingManga } from "@/lib/anilist";
import { fetchPopularNovels, type AllNovelItem } from "@/lib/allnovel";
import { getAnimeHistory, type AnimeHistoryEntry } from "@/lib/storage";
import { imageOrPlaceholder } from "@/lib/media-fallback";
import { PSYOP_ID, PSYOP_INFO } from "@/lib/psyopAnime";
import AnimeCard from "@/components/AnimeCard";

const SEARCH_ROW_LIMIT = 8;

function FeaturedAnimeHero() {
  const coverUrl = imageOrPlaceholder(PSYOP_INFO.cover || PSYOP_INFO.image);
  const firstEpisode = PSYOP_INFO.episodes[0];

  return (
    <section className="home-featured-anime">
      <div className="home-featured-anime-bg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={coverUrl} alt="" referrerPolicy="no-referrer" />
      </div>
      <div className="home-featured-anime-shade" />
      <div className="home-featured-anime-content">
        <span className="home-featured-anime-kicker">Featured Anime</span>
        <h1 className="home-featured-anime-title">{PSYOP_INFO.title}</h1>
        <p className="home-featured-anime-desc">{PSYOP_INFO.description}</p>
        <div className="home-featured-anime-meta">
          <span>{PSYOP_INFO.status}</span>
          {PSYOP_INFO.genres?.slice(0, 3).map((genre) => (
            <span key={genre}>{genre}</span>
          ))}
          {PSYOP_INFO.score != null && <span className="home-featured-anime-rating">★ {PSYOP_INFO.score}</span>}
        </div>
        <div className="home-featured-anime-actions">
          {firstEpisode && (
            <Link
              href={`/anime/watch?id=${encodeURIComponent(PSYOP_ID)}&ep=${encodeURIComponent(firstEpisode.id)}`}
              className="btn-primary browse-hero-cta"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              Watch Now
            </Link>
          )}
          <Link
            href={`/anime/details?id=${encodeURIComponent(PSYOP_ID)}`}
            className="btn-secondary home-featured-anime-secondary"
          >
            View Details
          </Link>
        </div>
      </div>
    </section>
  );
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
  const jumpTo = (index: number) => {
    setCurrent(index);
  };
  const advance = (direction: number) => {
    setCurrent((index) => (index + direction + items.length) % items.length);
  };
  const showOriginalBadge =
    Boolean(active.isOriginal) && (active.eyebrow || "").trim().toLowerCase() !== "sakura original";
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
      {items.length > 1 && (
        <>
          <button
            type="button"
            className="home-featured-arrow home-featured-arrow-prev"
            aria-label="Previous featured anime"
            onClick={() => advance(-1)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            className="home-featured-arrow home-featured-arrow-next"
            aria-label="Next featured anime"
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
          <Link href={detailsHref} className="btn-secondary home-featured-anime-secondary">
            View Details
          </Link>
        </div>
        {items.length > 1 && (
          <div className="home-featured-carousel-controls" aria-label="Featured anime carousel">
            {items.map((item, index) => (
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

export default function Home() {
  const [featured, setFeatured] = useState<Manga[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Manga[]>([]);
  const [animeSearchResults, setAnimeSearchResults] = useState<AnimeResult[]>([]);
  const [showAllAnime, setShowAllAnime] = useState(false);
  const [showAllManga, setShowAllManga] = useState(false);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const searchTimerRef = useRef<any>(null);
  const [selectedGenre] = useState<string | null>(null);
  const [genreResults] = useState<Manga[]>([]);
  const [genreLoading] = useState(false);

  const [trendingAnime, setTrendingAnime] = useState<AnimeResult[]>([]);
  const [popularAnime, setPopularAnime] = useState<AnimeResult[]>([]);
  const [continueWatching, setContinueWatching] = useState<AnimeHistoryEntry[]>([]);
  const [novels, setNovels] = useState<AllNovelItem[]>([]);
  const [topMangaResolved, setTopMangaResolved] = useState<Manga[]>([]);
  const [featuredWatchHrefs, setFeaturedWatchHrefs] = useState<Record<string, string>>({});

  useEffect(() => {
    async function loadAll() {
      try {
        const [manga, trending, anime, novelData] = await Promise.allSettled([
          // Mirror the manga tab: aggregate all manga sources (MangaDex + Atsumaru) and dedupe,
          // so the row still shows even if one source (e.g. Atsumaru) is unavailable.
          searchAllSources(""),
          alTrending(),
          fetchPopularAnime(),
          fetchPopularNovels(),
        ]);
        if (manga.status === "fulfilled") {
          setFeatured(manga.value);
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
        if (anime.status === "fulfilled") setPopularAnime(anime.value);
        if (novelData.status === "fulfilled") setNovels(novelData.value);
      } catch (e) {
        console.error("Failed to load home data:", e);
      }
      try {
        setContinueWatching(getAnimeHistory());
      } catch (_) {}
      setLoading(false);
    }
    loadAll();
  }, []);

  // Top Manga Today: rank by AniList trending, but read chapters from MangaDex.
  // Each AniList title is resolved to its MangaDex entry (so the reader has real chapters),
  // preserving AniList's order. Falls back to the aggregated trending list if resolution fails.
  useEffect(() => {
    let cancelled = false;

    async function loadTopManga() {
      try {
        const ranked = await alTrendingManga();
        if (cancelled || ranked.length === 0) return;

        const md = getDetailsSource();
        const results = await Promise.allSettled(
          ranked.slice(0, 14).map(async (item) => {
            let matches = await md.searchManga(item.romaji || item.title);
            if ((!matches || matches.length === 0) && item.english) {
              matches = await md.searchManga(item.english);
            }
            return matches?.[0] || null;
          }),
        );

        if (cancelled) return;

        const seen = new Set<string>();
        const resolved: Manga[] = [];
        for (const result of results) {
          if (result.status !== "fulfilled" || !result.value) continue;
          if (seen.has(result.value.id)) continue;
          seen.add(result.value.id);
          resolved.push(result.value);
        }

        if (resolved.length > 0) setTopMangaResolved(resolved.slice(0, 10));
      } catch (e) {
        console.error("Top manga (AniList) failed:", e);
      }
    }

    loadTopManga();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setAnimeSearchResults([]);
      setShowSearch(false);
      return;
    }
    setShowSearch(true);
    setShowAllAnime(false);
    setShowAllManga(false);
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const [manga, anime] = await Promise.allSettled([
          searchAllSources(searchQuery),
          searchAnime(searchQuery),
        ]);
        setSearchResults(manga.status === "fulfilled" ? manga.value : []);
        setAnimeSearchResults(anime.status === "fulfilled" ? anime.value : []);
      } catch (e) {
        console.error(e);
      }
      setSearching(false);
    }, 600);
    return () => clearTimeout(searchTimerRef.current);
  }, [searchQuery]);

  const renderMangaCards = (list: Manga[]) =>
    list.map((series) => (
      <MangaCard
        key={series.id}
        slug={series.id}
        title={series.title}
        cover={series.cover}
        genres={series.tags.slice(0, 3)}
        follows={series.follows}
        rating={series.rating}
        source={series.sourceStr || "atsumaru"}
      />
    ));

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

  const psyopFeatured = useMemo<FeaturedAnimeItem>(() => {
    const firstPsyopEpisode = PSYOP_INFO.episodes[0];
    return {
      id: PSYOP_ID,
      title: PSYOP_INFO.title,
      image: PSYOP_INFO.cover || PSYOP_INFO.image,
      type: "Sakura Original",
      score: PSYOP_INFO.score,
      description: undefined,
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
      .map((item) => ({
        ...item,
        eyebrow: "Spotlight",
      }));

    return [
      ...liveItems.slice(0, 3),
      psyopFeatured,
      ...liveItems.slice(3),
    ];
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
    () =>
      featuredBase.map((item) => ({
        ...item,
        watchHref: item.watchHref || featuredWatchHrefs[item.id],
      })),
    [featuredBase, featuredWatchHrefs],
  );

  const topAnimeToday = useMemo<AnimeResult[]>(() => {
    const source = trendingAnime.length > 0 ? trendingAnime : popularAnime;
    return source.slice(0, 10);
  }, [trendingAnime, popularAnime]);

  const topMangaToday = useMemo<Manga[]>(() => {
    const source = topMangaResolved.length > 0 ? topMangaResolved : featured;
    return source.slice(0, 10);
  }, [topMangaResolved, featured]);

  const defaultBrowse = !showSearch;

  return (
    <main className="main-content home-page app-browse">
      <div className="home-toolbar">
        <div className="home-toolbar-copy">
          <h1>Home</h1>
        </div>
        <div className="home-toolbar-search">

      {/* Search Bar */}
      <div className="home-search-wrap">
        <div className="search-bar">
          <span className="search-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/></svg>
          </span>
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => setSearchQuery("")} aria-label="Clear search">✕</button>
          )}
        </div>
      </div>
        </div>
      </div>

      {defaultBrowse && <FeaturedAnimeCarousel items={featuredAnime} />}

      {/* Search Results */}
      {showSearch && (
        searching ? (
          <section className="section" style={{ paddingTop: 12 }}>
            <div className="section-header">
              <h2 className="section-title">Search Results</h2>
              <p className="section-subtitle">Searching...</p>
            </div>
            <div className="manga-grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="loading-skeleton" style={{ aspectRatio: "2/3", borderRadius: "var(--radius-md)" }} />
              ))}
            </div>
          </section>
        ) : (animeSearchResults.length > 0 || searchResults.length > 0) ? (
          <>
            {animeSearchResults.length > 0 && (
              <section className="section" style={{ paddingTop: 12 }}>
                <div className="section-header">
                  <h2 className="section-title">Anime Results</h2>
                  {animeSearchResults.length > SEARCH_ROW_LIMIT && (
                    <button
                      type="button"
                      className="search-see-more"
                      onClick={() => setShowAllAnime((v) => !v)}
                    >
                      {showAllAnime ? "Show less" : `See all ${animeSearchResults.length} ›`}
                    </button>
                  )}
                </div>
                {showAllAnime ? (
                  <div className="manga-grid">
                    {animeSearchResults.map((anime) => (
                      <AnimeCard key={anime.id} id={anime.id} title={anime.title} image={anime.image} score={anime.score} />
                    ))}
                  </div>
                ) : (
                  <div className="hscroll-track search-row">
                    {animeSearchResults.slice(0, SEARCH_ROW_LIMIT).map((anime) => (
                      <AnimeCard key={anime.id} id={anime.id} title={anime.title} image={anime.image} score={anime.score} />
                    ))}
                  </div>
                )}
              </section>
            )}
            {searchResults.length > 0 && (
              <section className="section" style={{ paddingTop: 12 }}>
                <div className="section-header">
                  <h2 className="section-title">Manga Results</h2>
                  {searchResults.length > SEARCH_ROW_LIMIT && (
                    <button
                      type="button"
                      className="search-see-more"
                      onClick={() => setShowAllManga((v) => !v)}
                    >
                      {showAllManga ? "Show less" : `See all ${searchResults.length} ›`}
                    </button>
                  )}
                </div>
                {showAllManga ? (
                  <div className="manga-grid">{renderMangaCards(searchResults)}</div>
                ) : (
                  <div className="hscroll-track search-row">{renderMangaCards(searchResults.slice(0, SEARCH_ROW_LIMIT))}</div>
                )}
              </section>
            )}
          </>
        ) : (
          <section className="section" style={{ paddingTop: 12 }}>
            <div className="section-header">
              <h2 className="section-title">Search Results</h2>
              <p className="section-subtitle">0 results</p>
            </div>
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
              <p>No results found for &ldquo;{searchQuery}&rdquo;</p>
            </div>
          </section>
        )
      )}

      {/* Genre Results */}
      {!showSearch && selectedGenre && (
        <section className="section" style={{ paddingTop: 12 }}>
          <div className="section-header">
            <h2 className="section-title">{MANGA_GENRES.find(g => g.id === selectedGenre)?.name}</h2>
            <p className="section-subtitle">Browse by genre</p>
          </div>
          {genreLoading ? (
            <div className="manga-grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="loading-skeleton" style={{ aspectRatio: "2/3", borderRadius: "var(--radius-md)" }} />
              ))}
            </div>
          ) : genreResults.length > 0 ? (
            <div className="manga-grid">{renderMangaCards(genreResults)}</div>
          ) : (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
              <p>No manga found for this genre.</p>
            </div>
          )}
        </section>
      )}

      {/* Continue Watching — anime history */}
      {defaultBrowse && continueWatching.length > 0 && (
        <HorizontalScroll title="Continue Watching" linkText="See all ›" linkHref="/anime">
          {continueWatching.map(entry => (
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

      {/* Top Anime Today — horizontal scroll */}
      {defaultBrowse && (
        <HorizontalScroll title="Top Anime Today" linkText="View more ›" linkHref="/anime">
          {topAnimeToday.length > 0
            ? topAnimeToday.map((anime, index) => (
                <AnimeCard
                  key={anime.id}
                  id={anime.id}
                  title={anime.title}
                  image={anime.image}
                  score={anime.score}
                  rank={index + 1}
                />
              ))
            : loading ? renderRowSkeletons() : renderRowEmpty("Top anime could not load right now.")}
        </HorizontalScroll>
      )}

      {/* Top Manga Today — horizontal scroll */}
      {defaultBrowse && (
        <HorizontalScroll title="Top Manga Today" linkText="View more ›" linkHref="/manga">
          {topMangaToday.length > 0
            ? topMangaToday.map((series, index) => (
                <MangaCard
                  key={series.id}
                  slug={series.id}
                  title={series.title}
                  cover={series.cover}
                  genres={series.tags.slice(0, 3)}
                  follows={series.follows}
                  rating={series.rating}
                  source={series.sourceStr || "atsumaru"}
                  rank={index + 1}
                />
              ))
            : loading ? renderRowSkeletons() : renderRowEmpty("Top manga could not load right now.")}
        </HorizontalScroll>
      )}

      {/* Novels — horizontal scroll */}
      {defaultBrowse && (
        <HorizontalScroll title="Popular Novels" linkText="View more ›" linkHref="/novel">
          {novels.length > 0
            ? novels.slice(0, 20).map(novel => (
                <Link
                  key={novel.path}
                  href={`/novel/details?source=external&path=${encodeURIComponent(novel.path)}`}
                  className="novel-sm-card"
                >
                  <div className="novel-sm-cover">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={novel.cover || novel.originalCover || "/placeholder.png"} alt={novel.name} referrerPolicy="no-referrer" />
                  </div>
                  <p className="novel-sm-title">{novel.name}</p>
                </Link>
              ))
            : loading ? renderRowSkeletons() : renderRowEmpty("Popular novels could not load right now.")}
        </HorizontalScroll>
      )}

    </main>
  );
}
