"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { getLocal, removeLocal, STORAGE_KEYS, getAnimeHistory, getNovelHistory, novelHistoryHref, type AnimeHistoryEntry, type NovelHistoryEntry } from "@/lib/storage";

interface HistoryItem {
    mangaId: string;
    chapterId: string;
    title: string;
    cover: string;
    lastReadAt: number;
    chapterNum?: string;
}

type HistoryTab = "manga" | "anime" | "novel";

function formatActivityDate(timestamp: number) {
    return new Date(timestamp).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

export default function HistoryPage() {
    const [tab, setTab] = useState<HistoryTab>("manga");
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [animeHistory, setAnimeHistory] = useState<AnimeHistoryEntry[]>([]);
    const [novelHistory, setNovelHistory] = useState<NovelHistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const mangaHistory = getLocal<HistoryItem[]>(STORAGE_KEYS.HISTORY, []).sort((left, right) => right.lastReadAt - left.lastReadAt);
        const animeWatchHistory = getAnimeHistory().sort((left, right) => right.timestamp - left.timestamp);
        const novelReadHistory = getNovelHistory().sort((left, right) => right.timestamp - left.timestamp);
        setHistory(mangaHistory);
        setAnimeHistory(animeWatchHistory);
        setNovelHistory(novelReadHistory);
        setLoading(false);
    }, []);

    const activeCount = tab === "manga" ? history.length : tab === "anime" ? animeHistory.length : novelHistory.length;
    const latestTimestamp = useMemo(() => {
        const timestamps = [
            ...history.map((item) => item.lastReadAt),
            ...animeHistory.map((item) => item.timestamp),
            ...novelHistory.map((item) => item.timestamp),
        ].filter(Boolean);
        return timestamps.length > 0 ? Math.max(...timestamps) : null;
    }, [animeHistory, history, novelHistory]);

    const clearHistory = () => {
        const label = tab === "manga" ? "manga" : tab === "anime" ? "anime" : "novel";
        if (!window.confirm(`Clear ${label} history?`)) return;
        if (tab === "manga") {
            removeLocal(STORAGE_KEYS.HISTORY);
            setHistory([]);
            return;
        }
        if (tab === "anime") {
            removeLocal(STORAGE_KEYS.ANIME_HISTORY);
            setAnimeHistory([]);
            return;
        }
        removeLocal(STORAGE_KEYS.NOVEL_HISTORY);
        setNovelHistory([]);
    };

    const sessionLabel = tab === "manga"
        ? `${history.length} manga session${history.length === 1 ? "" : "s"}`
        : tab === "anime"
            ? `${animeHistory.length} anime session${animeHistory.length === 1 ? "" : "s"}`
            : `${novelHistory.length} novel session${novelHistory.length === 1 ? "" : "s"}`;

    const clearLabel = tab === "manga" ? "Manga" : tab === "anime" ? "Anime" : "Novels";

    return (
        <main className="main-content hub-page">
            <section className="hub-surface">
                <div className="hub-minimal-head">
                    <div>
                        <h1 className="hub-minimal-title">History</h1>
                        <p className="hub-minimal-sub">
                            {sessionLabel}
                            {latestTimestamp ? ` • Updated ${formatActivityDate(latestTimestamp)}` : ""}
                        </p>
                    </div>
                    {!loading && activeCount > 0 ? (
                        <button type="button" className="hub-btn hub-btn-muted" onClick={clearHistory}>
                            Clear {clearLabel}
                        </button>
                    ) : null}
                </div>

                <div className="hub-segments" aria-label="History type">
                    <button
                        type="button"
                        className={`hub-segment ${tab === "manga" ? "active" : ""}`}
                        onClick={() => setTab("manga")}
                    >
                        Manga
                        <span>{history.length}</span>
                    </button>
                    <button
                        type="button"
                        className={`hub-segment ${tab === "anime" ? "active" : ""}`}
                        onClick={() => setTab("anime")}
                    >
                        Anime
                        <span>{animeHistory.length}</span>
                    </button>
                    <button
                        type="button"
                        className={`hub-segment ${tab === "novel" ? "active" : ""}`}
                        onClick={() => setTab("novel")}
                    >
                        Novels
                        <span>{novelHistory.length}</span>
                    </button>
                </div>

                {loading ? (
                    <div className="hub-empty-card">
                        <h3>Loading history</h3>
                        <p>Pulling your recent sessions into place.</p>
                    </div>
                ) : tab === "manga" ? (
                    history.length === 0 ? (
                        <div className="hub-empty-card">
                            <h3>No manga history yet</h3>
                            <p>Start reading a series and your recent chapters will appear here.</p>
                            <div className="hub-empty-actions">
                                <Link href="/manga" className="hub-link-chip is-manga">Browse Manga</Link>
                            </div>
                        </div>
                    ) : (
                        <div className="hub-list">
                            {history.map((item) => (
                                <Link
                                    key={`${item.mangaId}-${item.chapterId}`}
                                    href={`/chapter?id=${encodeURIComponent(item.chapterId)}&manga=${encodeURIComponent(item.mangaId)}&source=atsumaru`}
                                    className="hub-row-link hub-row"
                                >
                                    <div className="hub-row-media">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={item.cover || "/placeholder.png"} alt={item.title} referrerPolicy="no-referrer" />
                                    </div>
                                    <div className="hub-row-body">
                                        <h3>{item.title}</h3>
                                        <p>{item.chapterNum ? `Chapter ${item.chapterNum}` : "Resume reading"} • {formatActivityDate(item.lastReadAt)}</p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )
                ) : tab === "anime" ? (
                    animeHistory.length === 0 ? (
                        <div className="hub-empty-card">
                            <h3>No anime history yet</h3>
                            <p>Watch an episode and it will show up here for quick resume.</p>
                            <div className="hub-empty-actions">
                                <Link href="/anime" className="hub-link-chip is-anime">Browse Anime</Link>
                            </div>
                        </div>
                    ) : (
                        <div className="hub-list">
                            {animeHistory.map((entry) => (
                                <Link
                                    key={`${entry.animeId}-${entry.episodeId}`}
                                    href={`/anime/watch?id=${encodeURIComponent(entry.animeId)}&ep=${encodeURIComponent(entry.episodeId)}`}
                                    className="hub-row-link hub-row"
                                >
                                    <div className="hub-row-media">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={entry.image || "/sakura.png"} alt={entry.animeTitle} referrerPolicy="no-referrer" />
                                    </div>
                                    <div className="hub-row-body">
                                        <h3>{entry.animeTitle}</h3>
                                        <p>{`Episode ${entry.episodeNumber}: ${entry.episodeTitle}`} • {formatActivityDate(entry.timestamp)}</p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )
                ) : novelHistory.length === 0 ? (
                    <div className="hub-empty-card">
                        <h3>No novel history yet</h3>
                        <p>Start reading a novel and your recent chapters will appear here.</p>
                        <div className="hub-empty-actions">
                            <Link href="/novel" className="hub-link-chip">Browse Novels</Link>
                        </div>
                    </div>
                ) : (
                    <div className="hub-list">
                        {novelHistory.map((entry) => (
                            <Link
                                key={`${entry.source}-${entry.novelId}-${entry.chapterNum}`}
                                href={novelHistoryHref(entry)}
                                className="hub-row-link hub-row"
                            >
                                <div className="hub-row-media">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={entry.cover || "/placeholder.png"} alt={entry.novelTitle} referrerPolicy="no-referrer" />
                                </div>
                                <div className="hub-row-body">
                                    <h3>{entry.novelTitle}</h3>
                                    <p>
                                        {entry.chapterTitle || `Chapter ${entry.chapterNum}`} • {formatActivityDate(entry.timestamp)}
                                    </p>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </section>
        </main>
    );
}
