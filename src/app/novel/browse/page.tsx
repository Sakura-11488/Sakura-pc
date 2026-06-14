"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import BackButton from "@/components/BackButton";
import PosterCard from "@/components/PosterCard";
import { getNovels, NOVEL_GENRES } from "@/lib/novel";
import {
    fetchPopularNovels,
    searchNovels as searchExternal,
    enhanceCovers,
    type AllNovelItem,
} from "@/lib/allnovel";
import { toUnified, externalToUnified, fetchNovelsByGenre, type UnifiedNovel } from "@/lib/novel-browse";

function useDebounce(value: string, delay: number) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}

export default function NovelBrowsePage() {
    const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
    const [sakuraNovels, setSakuraNovels] = useState<UnifiedNovel[]>([]);
    const [externalNovels, setExternalNovels] = useState<UnifiedNovel[]>([]);
    const [genreResults, setGenreResults] = useState<UnifiedNovel[]>([]);
    const [searchResults, setSearchResults] = useState<UnifiedNovel[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [genreLoading, setGenreLoading] = useState(false);
    const [searching, setSearching] = useState(false);

    const debouncedSearch = useDebounce(searchQuery, 450);
    const trimmedSearch = debouncedSearch.trim();
    const isSearching = trimmedSearch.length >= 2;

    useEffect(() => {
        let cancelled = false;

        async function loadInitial() {
            setLoading(true);
            try {
                const [sakura, external] = await Promise.all([
                    getNovels({ limit: 80 }),
                    fetchPopularNovels(1).catch(() => [] as AllNovelItem[]),
                ]);
                if (cancelled) return;

                const enhanced = external.length > 0 ? await enhanceCovers(external) : external;
                if (cancelled) return;

                setSakuraNovels(sakura.map(toUnified));
                setExternalNovels(enhanced.map(externalToUnified));
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void loadInitial();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!selectedGenre) {
            setGenreResults([]);
            setGenreLoading(false);
            return;
        }

        let cancelled = false;
        setGenreLoading(true);

        void fetchNovelsByGenre(selectedGenre).then((results) => {
            if (cancelled) return;
            setGenreResults(results);
            setGenreLoading(false);
        });

        return () => {
            cancelled = true;
        };
    }, [selectedGenre]);

    useEffect(() => {
        if (!isSearching) {
            setSearchResults([]);
            setSearching(false);
            return;
        }

        let cancelled = false;
        setSearching(true);

        Promise.all([
            getNovels({ search: trimmedSearch }),
            searchExternal(trimmedSearch, 1).catch(() => [] as AllNovelItem[]),
        ]).then(async ([sakura, external]) => {
            if (cancelled) return;
            const enhanced = external.length > 0 ? await enhanceCovers(external) : external;
            if (cancelled) return;
            setSearchResults([...sakura.map(toUnified), ...enhanced.map(externalToUnified)]);
            setSearching(false);
        });

        return () => {
            cancelled = true;
        };
    }, [isSearching, trimmedSearch]);

    const defaultList = useMemo(() => {
        const seen = new Set<string>();
        const merged: UnifiedNovel[] = [];
        for (const novel of [...sakuraNovels, ...externalNovels]) {
            if (seen.has(novel.id)) continue;
            seen.add(novel.id);
            merged.push(novel);
        }
        return merged;
    }, [externalNovels, sakuraNovels]);

    const activeList = isSearching ? searchResults : selectedGenre ? genreResults : defaultList;
    const isLoading = isSearching ? searching : selectedGenre ? genreLoading : loading;

    const pickGenre = useCallback((genre: string | null) => {
        setSelectedGenre(genre);
    }, []);

    return (
        <main className="main-content app-browse novel-browse-page">
            <div className="novel-browse-head">
                <div className="novel-browse-toolbar">
                    <BackButton href="/novel" />
                    <h1 className="novel-browse-title">All Novels</h1>
                    <div className="novel-browse-search">
                        <div className="search-bar">
                            <span className="search-icon">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="8" />
                                    <line x1="21" x2="16.65" y1="21" y2="16.65" />
                                </svg>
                            </span>
                            <input
                                type="text"
                                placeholder="Search novels..."
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

                <div className="novel-browse-genres-wrap">
                    <div className="novel-browse-genres" role="tablist" aria-label="Novel genres">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={!selectedGenre}
                            className={`genre-chip${!selectedGenre ? " active" : ""}`}
                            onClick={() => pickGenre(null)}
                        >
                            All
                        </button>
                        {NOVEL_GENRES.map((genre) => (
                            <button
                                key={genre}
                                type="button"
                                role="tab"
                                aria-selected={selectedGenre === genre}
                                className={`genre-chip${selectedGenre === genre ? " active" : ""}`}
                                onClick={() => pickGenre(genre)}
                            >
                                {genre}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <section className="novel-browse-grid-section">
                {isLoading ? (
                    <div className="novel-browse-grid">
                        {Array.from({ length: 14 }).map((_, i) => (
                            <div key={i} className="loading-skeleton novel-browse-skeleton" />
                        ))}
                    </div>
                ) : activeList.length > 0 ? (
                    <div className="novel-browse-grid">
                        {activeList.map((novel) => (
                            <PosterCard
                                key={novel.id}
                                href={novel.href}
                                title={novel.title}
                                image={novel.cover}
                                fallbackImage={novel.originalCover}
                                className="novel-browse-card"
                            />
                        ))}
                    </div>
                ) : (
                    <div className="manga-browse-empty">
                        <p>
                            {isSearching
                                ? `No results for "${trimmedSearch}".`
                                : selectedGenre
                                    ? `No ${selectedGenre.toLowerCase()} novels found.`
                                    : "No novels found."}
                        </p>
                    </div>
                )}
            </section>
        </main>
    );
}
