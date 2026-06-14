"use client";

import Link from "next/link";
import { useDownloads, downloadManager, type DownloadTask } from "@/lib/downloads";
import { useMemo, useState, useEffect, useCallback } from "react";
import {
    getLocal,
    setLocal,
    STORAGE_KEYS,
    getNovelDownloadsIndex,
    removeNovelDownload,
    removeAllNovelDownloads,
    type NovelDownloadEntry,
} from "@/lib/storage";

interface AnimeDownloadEntry {
    episodeId: string;
    animeId: string;
    animeTitle: string;
    episodeTitle: string;
    episodeNumber: number;
    state: string;
    progress: number;
    timestamp: number;
}

type DownloadTab = "all" | "anime" | "manga" | "novel";

function formatBytes(bytes: number) {
    if (!bytes) return "0 KB";
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDownloadDate(timestamp: number) {
    return new Date(timestamp).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

function mangaProgress(task: DownloadTask) {
    return task.pages.length > 0 ? Math.round((task.downloadedPages / task.pages.length) * 100) : 0;
}

export default function DownloadsPage() {
    const downloads = useDownloads();
    const [activeTab, setActiveTab] = useState<DownloadTab>("all");
    const [animeDownloads, setAnimeDownloads] = useState<Record<string, AnimeDownloadEntry>>({});
    const [novelDownloads, setNovelDownloads] = useState<NovelDownloadEntry[]>([]);

    const refreshAnimeDownloads = useCallback(() => {
        setAnimeDownloads(getLocal<Record<string, AnimeDownloadEntry>>(STORAGE_KEYS.ANIME_DOWNLOADS, {}));
    }, []);

    const refreshNovelDownloads = useCallback(() => {
        setNovelDownloads(getNovelDownloadsIndex());
    }, []);

    useEffect(() => {
        refreshAnimeDownloads();
        refreshNovelDownloads();
    }, [refreshAnimeDownloads, refreshNovelDownloads]);

    const groupedManga = useMemo(() => {
        const groups: Record<string, DownloadTask[]> = {};
        for (const task of Object.values(downloads)) {
            if (!groups[task.mangaId]) groups[task.mangaId] = [];
            groups[task.mangaId].push(task);
        }
        for (const key of Object.keys(groups)) {
            groups[key].sort((left, right) => left.title.localeCompare(right.title));
        }
        return groups;
    }, [downloads]);

    const groupedAnime = useMemo(() => {
        const groups: Record<string, AnimeDownloadEntry[]> = {};
        for (const entry of Object.values(animeDownloads)) {
            if (!groups[entry.animeId]) groups[entry.animeId] = [];
            groups[entry.animeId].push(entry);
        }
        for (const key of Object.keys(groups)) {
            groups[key].sort((left, right) => left.episodeNumber - right.episodeNumber);
        }
        return groups;
    }, [animeDownloads]);

    const groupedNovels = useMemo(() => {
        const groups: Record<string, NovelDownloadEntry[]> = {};
        for (const entry of novelDownloads) {
            const key = `${entry.source}_${entry.novelId}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(entry);
        }
        for (const key of Object.keys(groups)) {
            groups[key].sort((left, right) => left.chapterNumber - right.chapterNumber);
        }
        return groups;
    }, [novelDownloads]);

    const mangaGroups = Object.entries(groupedManga);
    const animeGroups = Object.entries(groupedAnime);
    const novelGroups = Object.entries(groupedNovels);

    const totalGroups = mangaGroups.length + animeGroups.length + novelGroups.length;
    const activeTransfers = useMemo(() => {
        const mangaTasks = Object.values(downloads);
        const animeTasks = Object.values(animeDownloads);
        return (
            mangaTasks.filter((task) => task.state === "queued" || task.state === "downloading").length +
            animeTasks.filter((entry) => entry.state === "downloading" || entry.state === "extracting").length
        );
    }, [animeDownloads, downloads]);

    const hasAny = totalGroups > 0;

    const deleteAnimeDownload = (episodeId: string) => {
        if (!window.confirm("Remove this anime download entry? The gallery file will not be deleted.")) return;
        const next = getLocal<Record<string, AnimeDownloadEntry>>(STORAGE_KEYS.ANIME_DOWNLOADS, {});
        delete next[episodeId];
        setLocal(STORAGE_KEYS.ANIME_DOWNLOADS, next);
        refreshAnimeDownloads();
    };

    const deleteNovelChapterDownload = useCallback((source: string, novelId: string, chapterId: string) => {
        removeNovelDownload(source, novelId, chapterId);
        refreshNovelDownloads();
    }, [refreshNovelDownloads]);

    const deleteAllNovelChapters = useCallback((source: string, novelId: string) => {
        if (!window.confirm("Remove all downloaded chapters for this novel?")) return;
        removeAllNovelDownloads(source, novelId);
        refreshNovelDownloads();
    }, [refreshNovelDownloads]);

    const exportNovelEpub = useCallback(async (entries: NovelDownloadEntry[]) => {
        const { default: JSZip } = await import("jszip");
        const { getNovelDownloadContent } = await import("@/lib/storage");
        const title = entries[0]?.novelTitle || "Novel";
        const zip = new JSZip();
        zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
        const meta = zip.folder("META-INF");
        const oebps = zip.folder("OEBPS");
        if (!meta || !oebps) return;
        meta.file(
            "container.xml",
            `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
        );
        const manifest: string[] = [];
        const spine: string[] = [];
        entries.forEach((entry, index) => {
            const content = getNovelDownloadContent(entry.source, entry.novelId, entry.chapterId) || "";
            const id = `chapter-${index + 1}`;
            oebps.file(
                `${id}.xhtml`,
                `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${entry.chapterName}</title></head><body><h1>${entry.chapterName}</h1><div>${content
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/\n/g, "<br/>")}</div></body></html>`,
            );
            manifest.push(`<item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`);
            spine.push(`<itemref idref="${id}"/>`);
        });
        oebps.file(
            "content.opf",
            `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">sakura-${Date.now()}</dc:identifier><dc:title>${title}</dc:title><dc:language>en</dc:language></metadata><manifest>${manifest.join("")}</manifest><spine>${spine.join("")}</spine></package>`,
        );
        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${title.replace(/[^a-zA-Z0-9]/g, "_")}.epub`;
        anchor.click();
        URL.revokeObjectURL(url);
    }, []);

    const handlePauseAll = () => {
        downloadManager.pauseAll();
    };

    const handleAction = (chapterId: string) => {
        const task = downloads[chapterId];
        if (!task) return;
        if (task.state === "downloading") {
            downloadManager.pause(chapterId);
            return;
        }
        if (task.state === "paused" || task.state === "error") {
            downloadManager.resume(chapterId);
        }
    };

    const handleDeleteMangaDownload = async (chapterId: string) => {
        if (!window.confirm("Delete this downloaded chapter from your device?")) return;
        await downloadManager.remove(chapterId);
    };

    return (
        <main className="main-content hub-page">
            <section className="hub-surface">
                <div className="hub-minimal-head">
                    <div>
                        <h1 className="hub-minimal-title">Downloads</h1>
                        <p className="hub-minimal-sub">
                            {totalGroups} saved group{totalGroups === 1 ? "" : "s"}
                            {activeTransfers > 0 ? ` • ${activeTransfers} active transfer${activeTransfers === 1 ? "" : "s"}` : ""}
                        </p>
                    </div>
                    {activeTransfers > 0 ? (
                        <button type="button" className="hub-btn hub-btn-muted" onClick={handlePauseAll}>
                            Pause Active
                        </button>
                    ) : null}
                </div>

                <div className="hub-segments" aria-label="Download type">
                    <button type="button" className={`hub-segment ${activeTab === "all" ? "active" : ""}`} onClick={() => setActiveTab("all")}>All<span>{totalGroups}</span></button>
                    <button type="button" className={`hub-segment ${activeTab === "anime" ? "active" : ""}`} onClick={() => setActiveTab("anime")}>Anime<span>{animeGroups.length}</span></button>
                    <button type="button" className={`hub-segment ${activeTab === "manga" ? "active" : ""}`} onClick={() => setActiveTab("manga")}>Manga<span>{mangaGroups.length}</span></button>
                    <button type="button" className={`hub-segment ${activeTab === "novel" ? "active" : ""}`} onClick={() => setActiveTab("novel")}>Novels<span>{novelGroups.length}</span></button>
                </div>

                {!hasAny ? (
                    <div className="hub-empty-card">
                        <h3>No downloads yet</h3>
                        <p>Your offline manga, anime, and novel downloads will appear here once you save them.</p>
                        <div className="hub-empty-actions">
                            <Link href="/manga" className="hub-link-chip is-manga">Browse Manga</Link>
                            <Link href="/anime" className="hub-link-chip is-anime">Browse Anime</Link>
                            <Link href="/novel" className="hub-link-chip is-novel">Browse Novels</Link>
                        </div>
                    </div>
                ) : (
                    <div className="download-stack">
                        {(activeTab === "all" || activeTab === "anime") && animeGroups.map(([animeId, episodes]) => {
                            const firstEpisode = episodes[0];
                            return (
                                <section key={animeId} className="download-group">
                                    <div className="download-group-head download-group-head-minimal">
                                        <div className="download-group-copy">
                                            <h3>{firstEpisode.animeTitle}</h3>
                                            <p>{episodes.length} episode{episodes.length === 1 ? "" : "s"}</p>
                                        </div>
                                        <div className="download-group-actions">
                                            <Link href={`/anime/details?id=${encodeURIComponent(animeId)}`} className="hub-btn hub-btn-link">
                                                Open
                                            </Link>
                                        </div>
                                    </div>
                                    <div className="download-rows">
                                        {episodes.map((episode) => (
                                            <div key={episode.episodeId} className="download-row">
                                                <div className="download-row-main">
                                                    <h4>{`Episode ${episode.episodeNumber}: ${episode.episodeTitle}`}</h4>
                                                    <div className="download-status-row">
                                                        <span className={`download-status is-${episode.state}`}>{episode.state === "completed" ? "Saved" : episode.state}</span>
                                                        <span className="download-status-meta">{formatDownloadDate(episode.timestamp)}</span>
                                                    </div>
                                                    {episode.state !== "completed" && episode.state !== "error" ? (
                                                        <div className="download-progress">
                                                            <div className="download-progress-bar" style={{ width: `${episode.progress}%` }} />
                                                        </div>
                                                    ) : null}
                                                </div>
                                                <button
                                                    type="button"
                                                    className="download-icon-btn is-danger"
                                                    title="Remove entry"
                                                    onClick={() => deleteAnimeDownload(episode.episodeId)}
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="3 6 5 6 21 6" />
                                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                    </svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            );
                        })}

                        {(activeTab === "all" || activeTab === "manga") && mangaGroups.map(([mangaId, tasks]) => {
                            const firstTask = tasks[0];
                            return (
                                <section key={mangaId} className="download-group">
                                    <div className="download-group-head download-group-head-minimal">
                                        <div className="download-group-copy">
                                            <h3>{firstTask.title.split(" - ")[0] || "Manga"}</h3>
                                            <p>{tasks.length} chapter{tasks.length === 1 ? "" : "s"}</p>
                                        </div>
                                        <div className="download-group-actions">
                                            <Link href={`/title?id=${encodeURIComponent(mangaId)}&source=atsumaru`} className="hub-btn hub-btn-link">
                                                Open
                                            </Link>
                                        </div>
                                    </div>
                                    <div className="download-rows">
                                        {tasks.map((task) => {
                                            const progress = mangaProgress(task);
                                            return (
                                                <div key={task.chapterId} className="download-row">
                                                    <div className="download-row-main">
                                                        <h4>{task.title}</h4>
                                                        <div className="download-status-row">
                                                            <span className={`download-status is-${task.state}`}>
                                                                {task.state === "completed" ? "Downloaded" : task.state === "queued" ? "Queued" : task.state}
                                                            </span>
                                                            <span className="download-status-meta">
                                                                {task.state === "error" && task.error ? task.error : `${progress}% complete`}
                                                            </span>
                                                        </div>
                                                        {task.state !== "completed" ? (
                                                            <div className="download-progress">
                                                                <div className="download-progress-bar" style={{ width: `${progress}%` }} />
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                    <div className="download-row-actions">
                                                        {task.state !== "completed" ? (
                                                            <button
                                                                type="button"
                                                                className="download-icon-btn"
                                                                title={task.state === "downloading" ? "Pause" : "Resume"}
                                                                onClick={() => handleAction(task.chapterId)}
                                                            >
                                                                {task.state === "downloading" ? (
                                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                                                        <rect x="6" y="4" width="4" height="16" />
                                                                        <rect x="14" y="4" width="4" height="16" />
                                                                    </svg>
                                                                ) : (
                                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                                                        <polygon points="5 3 19 12 5 21 5 3" />
                                                                    </svg>
                                                                )}
                                                            </button>
                                                        ) : null}
                                                        <button
                                                            type="button"
                                                            className="download-icon-btn is-danger"
                                                            title="Delete"
                                                            onClick={() => void handleDeleteMangaDownload(task.chapterId)}
                                                        >
                                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                <polyline points="3 6 5 6 21 6" />
                                                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            );
                        })}

                        {(activeTab === "all" || activeTab === "novel") && novelGroups.map(([groupKey, entries]) => {
                            const firstEntry = entries[0];
                            const totalSize = entries.reduce((sum, entry) => sum + (entry.sizeBytes || 0), 0);
                            return (
                                <section key={groupKey} className="download-group">
                                    <div className="download-group-head download-group-head-minimal">
                                        <div className="download-group-copy">
                                            <h3>{firstEntry.novelTitle}</h3>
                                            <p>{entries.length} chapter{entries.length === 1 ? "" : "s"} • {formatBytes(totalSize)}</p>
                                        </div>
                                        <div className="download-group-actions">
                                            <button type="button" className="hub-btn hub-btn-link" onClick={() => void exportNovelEpub(entries)}>
                                                Export EPUB
                                            </button>
                                            <button type="button" className="hub-btn hub-btn-danger" onClick={() => deleteAllNovelChapters(firstEntry.source, firstEntry.novelId)}>
                                                Delete All
                                            </button>
                                        </div>
                                    </div>
                                    <div className="download-rows">
                                        {entries.map((entry) => (
                                            <div key={entry.chapterId} className="download-row">
                                                <div className="download-row-main">
                                                    <h4>{`Chapter ${entry.chapterNumber}: ${entry.chapterName}`}</h4>
                                                    <div className="download-status-row">
                                                        <span className="download-status is-completed">Downloaded</span>
                                                        <span className="download-status-meta">{formatDownloadDate(entry.downloadedAt)}</span>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="download-icon-btn is-danger"
                                                    title="Remove chapter"
                                                    onClick={() => deleteNovelChapterDownload(entry.source, entry.novelId, entry.chapterId)}
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="3 6 5 6 21 6" />
                                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                    </svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                )}
            </section>
        </main>
    );
}
