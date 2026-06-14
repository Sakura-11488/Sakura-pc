"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import AnimeCard from "@/components/AnimeCard";
import BackButton from "@/components/BackButton";
import {
    searchAnime,
    fetchAiringAnime,
    fetchPopularAnime,
    fetchAnimeByGenre,
    ANIME_GENRES,
    type AnimeResult,
} from "@/lib/anime";

type AnimeBrowseSection = "popular" | "airing" | "top";

const SECTION_LABELS: Record<AnimeBrowseSection, string> = {
    popular: "Popular This Season",
    airing: "Currently Airing",
    top: "Top Anime Today",
};

function useDebounce(value: string, delay: number) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}

function parseSection(value: string | null): AnimeBrowseSection {
    if (value === "airing" || value === "top" || value === "popular") return value;
    return "top";
}

function GenreFilterDropdown({
    value,
    onChange,
}: {
    value: number | null;
    onChange: (genreId: number | null) => void;
}) {
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const selectedLabel = value
        ? ANIME_GENRES.find((g) => g.id === value)?.name ?? "All genres"
        : "All genres";

    useEffect(() => {
        if (!open) return;
        const handleClick = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    const pick = (genreId: number | null) => {
        onChange(genreId);
        setOpen(false);
    };

    return (
        <div className="manga-browse-genre-menu" ref={menuRef}>
            <button
                type="button"
                className={`manga-browse-genre-trigger${open ? " open" : ""}${value ? " has-value" : ""}`}
                aria-expanded={open}
                aria-haspopup="listbox"
                onClick={() => setOpen((prev) => !prev)}
            >
                <span>{selectedLabel}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>
            {open ? (
                <div className="manga-browse-genre-panel" role="listbox" aria-label="Filter by genre">
                    <button
                        type="button"
                        role="option"
                        aria-selected={!value}
                        className={`manga-browse-genre-option${!value ? " active" : ""}`}
                        onClick={() => pick(null)}
                    >
                        All genres
                    </button>
                    {ANIME_GENRES.map((genre) => (
                        <button
                            key={genre.id}
                            type="button"
                            role="option"
                            aria-selected={value === genre.id}
                            className={`manga-browse-genre-option${value === genre.id ? " active" : ""}`}
                            onClick={() => pick(genre.id)}
                        >
                            {genre.name}
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

async function loadAnimeSection(section: AnimeBrowseSection): Promise<AnimeResult[]> {
    if (section === "airing") return fetchAiringAnime();
    const popular = await fetchPopularAnime();
    if (section === "top") return popular;
    return popular.slice(10);
}

export default function AnimeBrowseAllPage() {
    const searchParams = useSearchParams();
    const section = parseSection(searchParams.get("section"));

    const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
    const [sectionList, setSectionList] = useState<AnimeResult[]>([]);
    const [genreResults, setGenreResults] = useState<AnimeResult[]>([]);
    const [searchResults, setSearchResults] = useState<AnimeResult[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [genreLoading, setGenreLoading] = useState(false);
    const [searching, setSearching] = useState(false);

    const debouncedSearch = useDebounce(searchQuery, 450);
    const trimmedSearch = debouncedSearch.trim();
    const isSearching = trimmedSearch.length >= 2;
    const sectionLabel = SECTION_LABELS[section];
    const selectedGenreName = ANIME_GENRES.find((g) => g.id === selectedGenre)?.name;

    useEffect(() => {
        if (isSearching || selectedGenre) return;

        let cancelled = false;

        async function loadSection() {
            setLoading(true);
            try {
                const data = await loadAnimeSection(section);
                if (!cancelled) setSectionList(data);
            } catch {
                if (!cancelled) setSectionList([]);
            }
            if (!cancelled) setLoading(false);
        }

        void loadSection();

        return () => {
            cancelled = true;
        };
    }, [section, isSearching, selectedGenre]);

    useEffect(() => {
        if (!selectedGenre || isSearching) {
            if (!selectedGenre) setGenreResults([]);
            return;
        }

        const genreId = selectedGenre;
        let cancelled = false;

        async function loadGenre() {
            setGenreLoading(true);
            try {
                const results = await fetchAnimeByGenre(genreId);
                if (!cancelled) setGenreResults(results);
            } catch {
                if (!cancelled) setGenreResults([]);
            }
            if (!cancelled) setGenreLoading(false);
        }

        void loadGenre();

        return () => {
            cancelled = true;
        };
    }, [selectedGenre, isSearching]);

    useEffect(() => {
        if (!isSearching) {
            setSearchResults([]);
            setSearching(false);
            return;
        }

        let cancelled = false;

        async function runSearch() {
            setSearching(true);
            try {
                const results = await searchAnime(trimmedSearch);
                if (!cancelled) setSearchResults(results);
            } catch {
                if (!cancelled) setSearchResults([]);
            }
            if (!cancelled) setSearching(false);
        }

        void runSearch();

        return () => {
            cancelled = true;
        };
    }, [trimmedSearch, isSearching]);

    const activeList = useMemo(() => {
        if (isSearching) return searchResults;
        if (selectedGenre) return genreResults;
        return sectionList;
    }, [isSearching, searchResults, selectedGenre, genreResults, sectionList]);

    const isLoading = isSearching ? searching : selectedGenre ? genreLoading : loading;
    const pageTitle = isSearching ? "Search" : sectionLabel;
    const showRank = section === "top" && !isSearching && !selectedGenre;

    return (
        <main className="main-content app-browse manga-browse-all">
            <div className="manga-browse-head">
                <BackButton />
                <div className="home-toolbar manga-browse-toolbar">
                    <div className="home-toolbar-copy">
                        <h1>{pageTitle}</h1>
                    </div>
                    <div className="home-toolbar-search">
                        <div className="home-search-wrap">
                            <div className="search-bar">
                                <span className="search-icon">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="11" cy="11" r="8" />
                                        <line x1="21" x2="16.65" y1="21" y2="16.65" />
                                    </svg>
                                </span>
                                <input
                                    type="text"
                                    placeholder="Search anime..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                {searchQuery ? (
                                    <button type="button" className="search-clear" onClick={() => setSearchQuery("")} aria-label="Clear search">✕</button>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="manga-browse-bar">
                <div className="manga-browse-bar-spacer" />
                <GenreFilterDropdown value={selectedGenre} onChange={setSelectedGenre} />
            </div>

            <section className="manga-browse-grid-section">
                {isLoading ? (
                    <div className="manga-grid">
                        {Array.from({ length: 12 }).map((_, i) => (
                            <div key={i} className="loading-skeleton" style={{ aspectRatio: "2/3", borderRadius: "var(--radius-md)" }} />
                        ))}
                    </div>
                ) : activeList.length > 0 ? (
                    <div className="manga-grid">
                        {activeList.map((anime, index) => (
                            <AnimeCard
                                key={anime.id}
                                id={anime.id}
                                title={anime.title}
                                image={anime.image}
                                type={anime.type}
                                year={anime.year}
                                score={anime.score}
                                rank={showRank ? index + 1 : undefined}
                                showMeta
                            />
                        ))}
                    </div>
                ) : (
                    <div className="manga-browse-empty">
                        <p>
                            {isSearching
                                ? `No results for "${trimmedSearch}".`
                                : selectedGenreName
                                    ? `No ${selectedGenreName.toLowerCase()} anime found.`
                                    : "No anime found."}
                        </p>
                    </div>
                )}
            </section>
        </main>
    );
}
