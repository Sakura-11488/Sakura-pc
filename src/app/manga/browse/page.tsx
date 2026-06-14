"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import MangaCard from "@/components/MangaCard";
import BackButton from "@/components/BackButton";
import {
    getMangaBrowseListAll,
    searchAllSources,
    type MangaBrowseTab,
    type MangaMediaFilter,
} from "@/lib/sources";
import { type Manga } from "@/lib/sources/types";
import { MANGA_GENRES, searchMangaByGenre } from "@/lib/content-source";

const MEDIA_FILTERS: MangaMediaFilter[] = ["All", "Manga", "Manwha", "Manhua"];

const SECTION_LABELS: Record<MangaBrowseTab, string> = {
    popular: "Popular",
    recommended: "Recommended",
    new: "New Releases",
};

function useDebounce(value: string, delay: number) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}

function parseSection(value: string | null): MangaBrowseTab {
    if (value === "recommended" || value === "new" || value === "popular") return value;
    return "popular";
}

function parseMedia(value: string | null): MangaMediaFilter {
    if (value === "Manga" || value === "Manwha" || value === "Manhua") return value;
    return "All";
}

function filterByMedia(list: Manga[], media: MangaMediaFilter) {
    if (media === "All") return list;
    return list.filter((m) => m.tags.some((t) => t.toLowerCase() === media.toLowerCase()));
}

function filterByGenre(list: Manga[], genreId: string | null) {
    if (!genreId) return list;
    const genreName = MANGA_GENRES.find((g) => g.id === genreId)?.name.toLowerCase();
    if (!genreName) return list;
    return list.filter((m) =>
        m.tags.some((t) => t.toLowerCase() === genreName || t.toLowerCase().includes(genreName)),
    );
}

function GenreFilterDropdown({
    value,
    onChange,
}: {
    value: string | null;
    onChange: (genreId: string | null) => void;
}) {
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const selectedLabel = value
        ? MANGA_GENRES.find((g) => g.id === value)?.name ?? "All genres"
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

    const pick = (genreId: string | null) => {
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
                    {MANGA_GENRES.map((genre) => (
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

export default function MangaBrowseAllPage() {
    const searchParams = useSearchParams();
    const section = parseSection(searchParams.get("section"));
    const initialMedia = parseMedia(searchParams.get("type"));

    const [mediaFilter, setMediaFilter] = useState<MangaMediaFilter>(initialMedia);
    const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
    const [sectionList, setSectionList] = useState<Manga[]>([]);
    const [genreResults, setGenreResults] = useState<Manga[]>([]);
    const [searchResults, setSearchResults] = useState<Manga[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [genreLoading, setGenreLoading] = useState(false);
    const [searching, setSearching] = useState(false);

    const debouncedSearch = useDebounce(searchQuery, 450);
    const trimmedSearch = debouncedSearch.trim();
    const isSearching = trimmedSearch.length >= 2;
    const sectionLabel = SECTION_LABELS[section];

    useEffect(() => {
        setMediaFilter(initialMedia);
    }, [initialMedia]);

    useEffect(() => {
        if (isSearching || selectedGenre) return;

        let cancelled = false;

        async function loadSection() {
            setLoading(true);
            try {
                const data = await getMangaBrowseListAll(section, mediaFilter, 80);
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
    }, [section, mediaFilter, isSearching, selectedGenre]);

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
                const results = await searchMangaByGenre(genreId);
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
                const results = await searchAllSources(trimmedSearch);
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
        const source = isSearching ? searchResults : selectedGenre ? genreResults : sectionList;
        return filterByMedia(filterByGenre(source, selectedGenre), mediaFilter);
    }, [isSearching, searchResults, selectedGenre, genreResults, sectionList, mediaFilter]);

    const isLoading = isSearching ? searching : selectedGenre ? genreLoading : loading;
    const pageTitle = isSearching ? "Search" : sectionLabel;
    const selectedGenreName = MANGA_GENRES.find((g) => g.id === selectedGenre)?.name;

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
                                    placeholder="Search manga, manhwa, manhua..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                {searchQuery ? (
                                    <button
                                        type="button"
                                        className="search-clear"
                                        onClick={() => setSearchQuery("")}
                                        aria-label="Clear search"
                                    >
                                        ✕
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="manga-browse-bar">
                <div className="manga-browse-types" role="tablist" aria-label="Media type">
                    {MEDIA_FILTERS.map((type) => (
                        <button
                            key={type}
                            type="button"
                            role="tab"
                            aria-selected={mediaFilter === type}
                            className={`manga-browse-type${mediaFilter === type ? " active" : ""}`}
                            onClick={() => setMediaFilter(type)}
                        >
                            {type}
                        </button>
                    ))}
                </div>
                <GenreFilterDropdown value={selectedGenre} onChange={setSelectedGenre} />
            </div>

            <section className="manga-browse-grid-section">
                {isLoading ? (
                    <div className="manga-grid">
                        {Array.from({ length: 12 }).map((_, i) => (
                            <div
                                key={i}
                                className="loading-skeleton"
                                style={{ aspectRatio: "2/3", borderRadius: "var(--radius-md)" }}
                            />
                        ))}
                    </div>
                ) : activeList.length > 0 ? (
                    <div className="manga-grid">
                        {activeList.map((manga) => (
                            <MangaCard
                                key={manga.id}
                                slug={manga.id}
                                title={manga.title}
                                cover={manga.cover}
                                genres={manga.tags.slice(0, 3)}
                                follows={manga.follows}
                                rating={manga.rating}
                                source={manga.sourceStr}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="manga-browse-empty">
                        <p>
                            {isSearching
                                ? `No results for "${trimmedSearch}".`
                                : selectedGenreName
                                    ? `No ${selectedGenreName.toLowerCase()} titles found.`
                                    : "No titles found."}
                        </p>
                    </div>
                )}
            </section>
        </main>
    );
}
