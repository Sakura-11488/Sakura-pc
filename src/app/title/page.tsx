"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense, useMemo } from "react";
import { getSource, getDetailsSource } from "@/lib/sources";
import { isComicSourceId } from "@/lib/sources/source-ids";
import { type Manga, type Chapter } from "@/lib/sources/types";
import { useWallet } from "@solana/wallet-adapter-react";
import { useSakuraWalletModal } from "@/components/SakuraWalletModal";
import dynamic from "next/dynamic";

const TipModal = dynamic(() => import("@/components/TipModal"), { ssr: false });
import LottieIcon from "@/components/LottieIcon";
import BackButton from "@/components/BackButton";
const SaveToLibraryModal = dynamic(() => import("@/components/SaveToLibraryModal"), { ssr: false });
import { getCreatorProfile } from "@/lib/creator";
import { getFavorites, addFavorite, removeFavorite } from "@/lib/supabase";
import { getLocal, setLocal, STORAGE_KEYS, setChapterProgress, getChapterProgress, getReadChapters, getAllChapterProgress, READ_THRESHOLD, isInLibrary, type LibraryItem } from "@/lib/storage";
import { useDownloads, downloadManager } from "@/lib/downloads";
import ChapterComments from "@/components/ChapterComments";

function FavoriteButton({ manga }: { manga: Manga }) {
    const [showLibraryModal, setShowLibraryModal] = useState(false);
    const [inLibrary, setInLibrary] = useState(false);

    useEffect(() => {
        setInLibrary(isInLibrary(manga.id, 'manga'));
    }, [manga.id, showLibraryModal]);

    const libraryItem: LibraryItem = {
        id: manga.id,
        title: manga.title,
        image: manga.cover,
        type: 'manga',
        addedAt: Date.now(),
    };

    return (
        <>
            <button
                onClick={() => setShowLibraryModal(true)}
                className="btn-secondary"
                style={{
                    ...(inLibrary
                        ? { color: "#4ade80", background: "rgba(76,175,80,0.15)", borderColor: "rgba(76,175,80,0.3)" }
                        : {}),
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                }}
            >
                <LottieIcon
                    src={inLibrary ? "/icons/wired-outline-24-approved-checked-hover-loading.json" : "/icons/wired-outline-2620-bookmark-alt-hover-flutter.json"}
                    size={22}
                    playOnMount
                    tone={inLibrary ? undefined : "on-accent"}
                    colorFilter={inLibrary ? "brightness(0) saturate(100%) invert(62%) sepia(61%) saturate(483%) hue-rotate(79deg) brightness(96%) contrast(92%)" : undefined}
                />
                {inLibrary ? "Saved" : "Save"}
            </button>
            {showLibraryModal && (
                <SaveToLibraryModal
                    item={libraryItem}
                    onClose={() => { setShowLibraryModal(false); setInLibrary(isInLibrary(manga.id, 'manga')); }}
                />
            )}
        </>
    );
}

/* Summary Modal */
function SummaryModal({ description, onClose }: { description: string; onClose: () => void }) {
    return (
        <div className="summary-modal-overlay" onClick={onClose}>
            <div className="summary-modal" onClick={(e) => e.stopPropagation()}>
                <h3>あらすじ — Synopsis</h3>
                <p>{description}</p>
                <button className="close-btn" onClick={onClose}>
                    閉じる — Close
                </button>
            </div>
        </div>
    );
}

function SeriesLoadingSkeleton({ browseHref }: { browseHref: string }) {
    return (
        <main className="main-content manga-detail series-loading">
            <BackButton href={browseHref} />
            <section className="md-hero series-loading-hero">
                <div className="series-loading-bg shimmer" aria-hidden />
                <div className="md-hero-scrim" />
                <div className="md-hero-inner">
                    <div className="md-poster series-loading-poster shimmer" aria-hidden />
                    <div className="md-info series-loading-info">
                        <div className="series-loading-line shimmer series-loading-line-lg" aria-hidden />
                        <div className="series-loading-line shimmer series-loading-line-sm" aria-hidden />
                        <div className="series-loading-line shimmer series-loading-line-md" aria-hidden />
                        <div className="series-loading-stats" aria-hidden>
                            <div className="series-loading-pill shimmer" />
                            <div className="series-loading-pill shimmer" />
                            <div className="series-loading-pill shimmer" />
                        </div>
                        <div className="series-loading-actions" aria-hidden>
                            <div className="series-loading-btn shimmer" />
                            <div className="series-loading-btn shimmer series-loading-btn-sm" />
                        </div>
                    </div>
                </div>
            </section>
            <div className="series-loading-status" role="status" aria-live="polite">
                <span className="series-loading-sakura" aria-hidden>🌸</span>
                <span className="series-loading-text">Loading series</span>
                <span className="series-loading-dots" aria-hidden>
                    <span /><span /><span />
                </span>
            </div>
        </main>
    );
}

function SeriesContent() {
    const searchParams = useSearchParams();
    const id = searchParams.get("id"); // Series ID
    const sourceStr = searchParams.get("source") || "atsumaru";

    const [series, setSeries] = useState<Manga | null>(null);
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showSummary, setShowSummary] = useState(false);
    const [showBatchDownload, setShowBatchDownload] = useState(false);
    const [showTipModal, setShowTipModal] = useState(false);
    const [creatorWallet, setCreatorWallet] = useState<string | null>(null);
    const [isBatchQueuing, setIsBatchQueuing] = useState(false);
    const downloads = useDownloads();
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
    const [readChapterIds, setReadChapterIds] = useState<string[]>([]);
    const [chapterProgress, setChapterProgress] = useState<Record<string, number>>({});

    const source = useMemo(() => getSource(sourceStr), [sourceStr]);
    const browseHref = isComicSourceId(sourceStr) ? "/comics" : "/manga";

    useEffect(() => {
        if (!id) return;

        async function loadData() {
            setLoading(true);
            setError(null);
            try {
                const [mangaData, chaptersData] = await Promise.all([
                    source.getMangaDetails(id!),
                    source.getChapters(id!)
                ]);

                let enrichedData = mangaData;
                if (mangaData && sourceStr !== "mangadex") {
                    try {
                        const detailsSource = getDetailsSource();
                        const mdResults = await detailsSource.searchManga(mangaData.title, 5);
                        const match = mdResults.find(
                            m => m.title.toLowerCase().trim() === mangaData.title.toLowerCase().trim()
                        ) || mdResults[0];
                        if (match) {
                            const mdDetails = await detailsSource.getMangaDetails(match.id);
                            if (mdDetails) {
                                enrichedData = {
                                    ...mangaData,
                                    description: mdDetails.description || mangaData.description,
                                    author: mdDetails.author || mangaData.author,
                                    authorId: mdDetails.authorId || mangaData.authorId,
                                    rating: mdDetails.rating || mangaData.rating,
                                    follows: mdDetails.follows || mangaData.follows,
                                    status: mdDetails.status || mangaData.status,
                                    year: mdDetails.year || mangaData.year,
                                    tags: mdDetails.tags?.length ? mdDetails.tags : mangaData.tags,
                                };
                            }
                        }
                    } catch (e) {
                        console.warn("MangaDex details enrichment failed, using primary source data:", e);
                    }
                }

                setSeries(enrichedData);
                setChapters(chaptersData);
            } catch (error: any) {
                console.error("Failed to load series:", error);
                setError(error.message || "Failed to load series.");
            }
            setLoading(false);
        }

        loadData();
    }, [id, sourceStr, source]);

    useEffect(() => {
        if (!series?.authorId || sourceStr !== "mangadex") return;
        getCreatorProfile(series.authorId).then((profile) => {
            if (profile?.is_verified && profile.wallet_address) {
                setCreatorWallet(profile.wallet_address);
            }
        });
    }, [series?.authorId, sourceStr]);

    // Load read chapters + progress from local storage (and refresh on window focus)
    useEffect(() => {
        if (!id) return;

        const refresh = () => {
            setReadChapterIds(getReadChapters(id));
            setChapterProgress(getAllChapterProgress(id));
        };

        refresh();
        window.addEventListener("focus", refresh);
        return () => window.removeEventListener("focus", refresh);
    }, [id]);

    // Sort chapters based on sortOrder
    const sortedChapters = useMemo(() => {
        const sorted = [...chapters];
        if (sortOrder === "asc") {
            sorted.reverse(); // API returns newest first, so reverse for oldest first
        }
        return sorted;
    }, [chapters, sortOrder]);

    if (!id) {
        return (
            <div className="error-container">
                <p>Invalid Series ID.</p>
                <Link href={browseHref} className="btn-primary">Back to Browse</Link>
            </div>
        )
    }

    if (loading) {
        return <SeriesLoadingSkeleton browseHref={browseHref} />;
    }

    if (error || !series) {
        return (
            <div className="error-container">
                <p>{error || "Manga not found."}</p>
                <Link href={browseHref} className="btn-primary">Back to Browse</Link>
            </div>
        );
    }

    const handleDownloadChapter = async (chapterId: string, title: string) => {
        const task = downloads[chapterId];
        if (task) {
            if (task.state === 'downloading') downloadManager.pause(chapterId);
            else if (task.state === 'paused' || task.state === 'error') downloadManager.resume(chapterId);
            return;
        }

        try {
            const pages = await source.getChapterPages(chapterId);
            if (!pages || pages.length === 0) throw new Error("No pages found");
            downloadManager.addDownload(id, chapterId, title, series.cover, pages);
        } catch (e) {
            console.error("Failed to queue download", e);
            alert("Failed to queue download. Check network.");
        }
    };

    const handleBatchDownload = async () => {
        setIsBatchQueuing(true);
        // Only queue chapters that aren't downloaded
        const toDownload = sortedChapters.filter(c => !downloads[c.id] || downloads[c.id].state !== 'completed');

        // Fetch pages sequentially to avoid overloading the source API
        for (const chap of toDownload) {
            try {
                // Skip if already in manager
                if (downloads[chap.id]) continue;

                const pages = await source.getChapterPages(chap.id);
                if (pages && pages.length > 0) {
                    downloadManager.addDownload(id, chap.id, chap.title || `Chapter ${chap.chapter}`, series.cover, pages);
                }
            } catch (e) {
                console.error(`Failed to get pages for ${chap.id}`, e);
            }
        }
        setIsBatchQueuing(false);
        setShowBatchDownload(false);
    };

    const firstChapterHref = chapters.length > 0
        ? `/chapter?id=${chapters[chapters.length - 1].id}&manga=${id}&source=${sourceStr}`
        : null;

    return (
        <main className="main-content manga-detail">
            <BackButton href={browseHref} />
            {showTipModal && (
                <TipModal
                    onClose={() => setShowTipModal(false)}
                    header={creatorWallet ? "Tip Creator" : "Support Sakura"}
                    subtitle={creatorWallet ? "Send $SAKURA directly to this creator" : "Donate $SAKURA to the Sakura treasury"}
                    receiverAddress={creatorWallet || undefined}
                />
            )}

            {showSummary && (
                <SummaryModal
                    description={series.description}
                    onClose={() => setShowSummary(false)}
                />
            )}

            {/* ── Hero ── */}
            <section className="md-hero">
                <div className="md-hero-bg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={series.cover} alt="" referrerPolicy="no-referrer" />
                </div>
                <div className="md-hero-scrim" />

                <div className="md-hero-inner">
                    <div className="md-poster">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={series.cover} alt={series.title} referrerPolicy="no-referrer" />
                    </div>

                    <div className="md-info">
                        <h1 className="md-title">{series.title}</h1>

                        {series.author && (
                            <p className="md-author">
                                <span className="md-author-by">by</span>{" "}
                                {sourceStr === "mangadex" && series.authorId ? (
                                    <Link href={`/creator?id=${series.authorId}`} className="md-author-link">
                                        {series.author}
                                    </Link>
                                ) : (
                                    <span className="md-author-name">{series.author}</span>
                                )}
                            </p>
                        )}

                        <div className="md-stats">
                            <span className="md-stat">
                                <strong>{chapters.length}</strong> Chapters
                            </span>
                            {series.year ? (
                                <span className="md-stat"><strong>{series.year}</strong> Year</span>
                            ) : null}
                            {typeof series.rating === "number" && series.rating > 0 ? (
                                <span className="md-stat md-stat-rating">★ {series.rating.toFixed(1)}</span>
                            ) : null}
                            {series.status ? (
                                <span className="md-status">{series.status}</span>
                            ) : null}
                        </div>

                        {series.tags.length > 0 && (
                            <div className="md-genres">
                                {series.tags.slice(0, 4).map((g) => (
                                    <span key={g} className="md-genre">{g}</span>
                                ))}
                                {series.tags.length > 4 && (
                                    <span className="md-genre md-genre-more">+{series.tags.length - 4}</span>
                                )}
                            </div>
                        )}

                        {series.description && (
                            <p className="md-synopsis">
                                {series.description.slice(0, 220)}
                                {series.description.length > 220 && "… "}
                                {series.description.length > 220 && (
                                    <button className="md-readmore" onClick={() => setShowSummary(true)}>
                                        Read more
                                    </button>
                                )}
                            </p>
                        )}

                        <div className="md-actions">
                            {firstChapterHref && (
                                <Link href={firstChapterHref} className="md-btn-read">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
                                    Start Reading
                                </Link>
                            )}
                            <FavoriteButton manga={series} />
                            <button className="md-icon-btn" onClick={() => setShowTipModal(true)} title="Tip Creator" aria-label="Tip Creator">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                            </button>
                            <Link href="/pass" className="md-icon-btn" title="Get Weekly Pass" aria-label="Get Weekly Pass">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" /></svg>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Chapters ── */}
            <section className="md-chapters">
                <div className="md-ch-head">
                    <h2 className="md-ch-title">Chapters<span className="md-ch-count">{chapters.length}</span></h2>
                    <div className="md-ch-tools">
                        <button className="md-tool-btn" onClick={() => setShowBatchDownload(true)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></svg>
                            Download all
                        </button>
                        <button className="md-tool-btn" onClick={() => setSortOrder(prev => prev === "desc" ? "asc" : "desc")}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 8 4-4 4 4" /><path d="M7 4v16" /><path d="m17 16 4 4" /><path d="m21 16-4 4" /><path d="M17 20V4" /></svg>
                            {sortOrder === "desc" ? "Newest" : "Oldest"}
                        </button>
                    </div>
                </div>

                {showBatchDownload && (
                    <div className="reading-mode-modal-overlay" onClick={() => !isBatchQueuing && setShowBatchDownload(false)}>
                        <div className="reading-mode-modal md-confirm" onClick={e => e.stopPropagation()}>
                            <div className="md-confirm-icon">
                                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></svg>
                            </div>
                            <h2>Download all chapters</h2>
                            <p>Queue every un-downloaded chapter for offline reading.</p>
                            <div className="md-confirm-actions">
                                <button className="btn-secondary" onClick={() => setShowBatchDownload(false)} disabled={isBatchQueuing}>
                                    Cancel
                                </button>
                                <button className="btn-primary" onClick={handleBatchDownload} disabled={isBatchQueuing}>
                                    {isBatchQueuing ? "Queuing…" : "Start Download"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {sortedChapters.length === 0 && !loading && (
                    <div className="md-ch-empty">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                            <line x1="9" y1="10" x2="15" y2="10" />
                        </svg>
                        <p className="md-ch-empty-title">No readable chapters available</p>
                        <p className="md-ch-empty-sub">This title&apos;s chapters may have been removed or are only available on the official publisher&apos;s site.</p>
                    </div>
                )}

                <div className="md-ch-list">
                    {sortedChapters.map((chapter, idx) => {
                        const isRead = readChapterIds.includes(chapter.id);
                        const progress = chapterProgress[chapter.id] || 0;
                        const prevChapter = sortedChapters[idx - 1];
                        const isContinue = !isRead && progress > 0;
                        const isNextUp = !isRead && !isContinue && prevChapter && readChapterIds.includes(prevChapter.id);
                        const dl = downloads[chapter.id];

                        return (
                            <Link
                                key={chapter.id}
                                href={`/chapter?id=${chapter.id}&manga=${id}&source=${sourceStr}`}
                                className={`md-ch-row ${isRead ? 'is-read' : ''} ${isContinue || isNextUp ? 'is-active' : ''}`.trim()}
                            >
                                <span className={`md-ch-num ${isRead ? 'is-read' : ''}`.trim()}>
                                    {isRead ? (
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                                    ) : (
                                        chapter.chapter || "—"
                                    )}
                                </span>

                                <div className="md-ch-main">
                                    <span className="md-ch-name">{chapter.title || `Chapter ${chapter.chapter}`}</span>
                                    <span className="md-ch-meta">
                                        {chapter.volume ? `Vol. ${chapter.volume} · ` : ""}Ch. {chapter.chapter || "?"} · {new Date(chapter.publishAt).toLocaleDateString()}
                                        {isContinue && <span className="md-ch-badge">Continue</span>}
                                        {isNextUp && <span className="md-ch-badge">Next up</span>}
                                    </span>
                                </div>

                                {(() => {
                                    if (!dl) {
                                        return (
                                            <button
                                                className="dl-btn"
                                                onClick={(e) => { e.preventDefault(); handleDownloadChapter(chapter.id, chapter.title || `Chapter ${chapter.chapter}`); }}
                                                title="Download"
                                                aria-label="Download chapter"
                                            >
                                                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></svg>
                                            </button>
                                        );
                                    }

                                    if (dl.state === 'completed') {
                                        return (
                                            <button className="dl-btn dl-completed" title="Downloaded" aria-label="Downloaded" onClick={e => e.preventDefault()}>
                                                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                                            </button>
                                        );
                                    }

                                    const pct = dl.pages.length > 0 ? (dl.downloadedPages / dl.pages.length) * 100 : 0;
                                    const isDownloading = dl.state === 'downloading';

                                    return (
                                        <button
                                            className={`dl-btn ${isDownloading ? 'dl-active' : 'dl-paused'}`}
                                            onClick={(e) => { e.preventDefault(); handleDownloadChapter(chapter.id, chapter.title); }}
                                            title={isDownloading ? "Pause" : "Resume"}
                                        >
                                            <div className="dl-progress-circle" style={{ background: `conic-gradient(var(--sakura-pink) ${pct}%, transparent 0)` }}>
                                                <div className="dl-progress-inner">
                                                    {isDownloading ? (
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                                                    ) : (
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                                    )}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })()}

                                {progress > 0 && (
                                    <div className="chapter-progress-bar">
                                        <div className="chapter-progress-fill" style={{ width: `${progress}%` }} />
                                    </div>
                                )}
                            </Link>
                        );
                    })}
                </div>
            </section>
        </main>
    );
}

export default function SeriesPage() {
    return (
        <>
            <Suspense fallback={<SeriesLoadingSkeleton browseHref="/manga" />}>
                <SeriesContent />
            </Suspense>
        </>
    );
}
