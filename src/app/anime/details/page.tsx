"use client";

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import BackButton from "@/components/BackButton";
import { fetchAnimeInfo, getCachedAnimeInfo, refreshAnimeInfo, fetchEpisodeSources, type AnimeInfo } from "@/lib/anime";
import Link from "next/link";
import { Capacitor } from "@capacitor/core";
import { getLocal, setLocal, STORAGE_KEYS, getAnimeHistory, isInLibrary } from "@/lib/storage";
import type { DownloadProgressEvent } from "@/plugins/anime";
import { PSYOP_ID, PSYOP_INFO, PSYOP_STUDIO, PSYOP_CHARACTERS } from "@/lib/psyopAnime";
import { TWO_HE_ANIME_ID, TWO_HE_ANIME_INFO, TWO_HE_CREATOR_BIO, TWO_HE_CREATOR_EMAIL, TWO_HE_CREATOR_WALLET, TWO_HE_EPISODE_DETAILS } from "@/lib/2heAnime";
import { imageOrPlaceholder, SAKURA_PLACEHOLDER_IMAGE } from "@/lib/media-fallback";
import { buildSakuraShareUrl, shareOrCopyLink } from "@/lib/share";
import dynamic from "next/dynamic";
import { truncateAddress } from "@/lib/solana";
const SaveToLibraryModal = dynamic(() => import("@/components/SaveToLibraryModal"), { ssr: false });

interface AnimeDownloadEntry {
    episodeId: string;
    animeId: string;
    animeTitle: string;
    episodeTitle: string;
    episodeNumber: number;
    state: string;
    progress: number;
    filePath?: string;
    timestamp: number;
}

const EPISODES_PER_RANGE = 50;

function SummaryModal({ description, onClose }: { description: string; onClose: () => void }) {
    return (
        <div className="summary-modal-overlay" onClick={onClose}>
            <div className="summary-modal" onClick={(e) => e.stopPropagation()}>
                <h3>Synopsis</h3>
                <p>{description.replace(/<[^>]+>/g, "")}</p>
                <button type="button" className="close-btn" onClick={onClose}>Close</button>
            </div>
        </div>
    );
}

function AnimeDetailsInner() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const id = searchParams.get("id") || "";
    const isNative = Capacitor.isNativePlatform();
    const isPsyop = id === PSYOP_ID;
    const isTwoHeAnime = id === TWO_HE_ANIME_ID;

    const [anime, setAnime] = useState<AnimeInfo | null>(isPsyop ? PSYOP_INFO : isTwoHeAnime ? TWO_HE_ANIME_INFO : null);
    const [loading, setLoading] = useState(!isPsyop && !isTwoHeAnime);
    const [error, setError] = useState<string | null>(null);
    const [dlMap, setDlMap] = useState<Record<string, AnimeDownloadEntry>>({});
    const listenerRef = useRef<{ remove: () => void } | null>(null);
    const [lastWatchedEpId, setLastWatchedEpId] = useState<string | null>(null);
    const [showLibraryModal, setShowLibraryModal] = useState(false);
    const [inLib, setInLib] = useState(false);
    const [showSummary, setShowSummary] = useState(false);
    const [episodeRange, setEpisodeRange] = useState(0);
    const [retrying, setRetrying] = useState(false);
    const [statusToast, setStatusToast] = useState<string | null>(null);

    const showToast = useCallback((message: string) => {
        setStatusToast(message);
        window.setTimeout(() => setStatusToast(null), 3500);
    }, []);

    const retryEpisodeLookup = useCallback(async () => {
        if (!id || retrying) return;
        setRetrying(true);
        try {
            const fresh = await refreshAnimeInfo(id, { forceSourceRefresh: true });
            if (fresh) setAnime(fresh);
        } finally {
            setRetrying(false);
        }
    }, [id, retrying]);

    useEffect(() => {
        setDlMap(getLocal<Record<string, AnimeDownloadEntry>>(STORAGE_KEYS.ANIME_DOWNLOADS, {}));
        const history = getAnimeHistory();
        const entry = history.find(h => h.animeId === id);
        if (entry) setLastWatchedEpId(entry.episodeId);
        setInLib(isInLibrary(id, "anime"));
    }, [id]);

    useEffect(() => {
        if (!isNative) return;
        let handle: { remove: () => void } | null = null;
        (async () => {
            const { Anime } = await import("@/plugins/anime");
            handle = await Anime.addListener("downloadProgress", (event: DownloadProgressEvent) => {
                setDlMap(prev => {
                    const updated = { ...prev };
                    if (updated[event.episodeId]) {
                        updated[event.episodeId] = { ...updated[event.episodeId], state: event.state, progress: event.progress };
                        if (event.filePath) updated[event.episodeId].filePath = event.filePath;
                        if (event.state === "completed") showToast(`Download complete: ${updated[event.episodeId].episodeTitle}`);
                        if (event.state === "error") showToast(`Download failed: ${updated[event.episodeId].episodeTitle}`);
                        if (event.state === "cancelled") showToast(`Download cancelled: ${updated[event.episodeId].episodeTitle}`);
                    }
                    setLocal(STORAGE_KEYS.ANIME_DOWNLOADS, updated);
                    return updated;
                });
            });
            listenerRef.current = handle;
        })();
        return () => { handle?.remove(); };
    }, [isNative, showToast]);

    const handleCancelDownload = useCallback(async (episodeId: string) => {
        try {
            const { Anime } = await import("@/plugins/anime");
            await Anime.cancelDownload({ episodeId });
        } catch {
            // The native listener updates state when available; keep UI responsive either way.
        }
        setDlMap(prev => {
            const updated = { ...prev };
            if (updated[episodeId]) updated[episodeId] = { ...updated[episodeId], state: "cancelled", progress: 0 };
            setLocal(STORAGE_KEYS.ANIME_DOWNLOADS, updated);
            return updated;
        });
    }, []);

    const handleDownload = useCallback(async (ep: { id: string; number: number; title: string }) => {
        if (!anime) return;
        const existing = dlMap[ep.id];
        if (existing?.state === "downloading" || existing?.state === "extracting") return;
        if (existing?.state === "completed" && existing.filePath) {
            try {
                const { Anime } = await import("@/plugins/anime");
                await Anime.playLocalEpisode({ filePath: existing.filePath, title: ep.title || `Episode ${ep.number}` });
            } catch (e) { console.error(e); }
            return;
        }

        const entry: AnimeDownloadEntry = {
            episodeId: ep.id, animeId: id, animeTitle: anime.title,
            episodeTitle: ep.title || `Episode ${ep.number}`, episodeNumber: ep.number,
            state: "extracting", progress: 0, timestamp: Date.now()
        };
        setDlMap(prev => {
            const updated = { ...prev, [ep.id]: entry };
            setLocal(STORAGE_KEYS.ANIME_DOWNLOADS, updated);
            return updated;
        });

        try {
            const sourceData = await fetchEpisodeSources(ep.id);
            if (!sourceData?.url) throw new Error("Could not resolve stream URL for download.");
            const { Anime } = await import("@/plugins/anime");
            showToast(`Download started: ${ep.title || `Episode ${ep.number}`}`);
            const result = await Anime.downloadEpisode({
                episodeId: ep.id, m3u8Url: sourceData.url,
                title: ep.title || `Episode ${ep.number}`, animeTitle: anime.title,
                referer: sourceData.referer,
                isM3U8: sourceData.isM3U8,
            });
            if (result.filePath) {
                setDlMap(prev => {
                    const updated = { ...prev };
                    if (updated[ep.id]) updated[ep.id] = { ...updated[ep.id], filePath: result.filePath!, state: "completed", progress: 100 };
                    setLocal(STORAGE_KEYS.ANIME_DOWNLOADS, updated);
                    return updated;
                });
                showToast(`Download complete: ${ep.title || `Episode ${ep.number}`}`);
            }
        } catch (e: any) {
            console.error("Download failed:", e);
            const cancelled = /cancel/i.test(e?.message || "");
            setDlMap(prev => {
                const updated = { ...prev };
                if (updated[ep.id]) updated[ep.id] = { ...updated[ep.id], state: cancelled ? "cancelled" : "error", progress: 0 };
                setLocal(STORAGE_KEYS.ANIME_DOWNLOADS, updated);
                return updated;
            });
            showToast(`${cancelled ? "Download cancelled" : "Download failed"}: ${ep.title || `Episode ${ep.number}`}`);
        }
    }, [anime, id, dlMap, showToast]);

    useEffect(() => {
        if (!id || isPsyop || isTwoHeAnime) return;
        const cached = getCachedAnimeInfo(id);
        if (cached && cached.episodes?.length > 0) {
            setAnime(cached);
            setLoading(false);
            refreshAnimeInfo(id, { forceSourceRefresh: true }).then(fresh => { if (fresh) setAnime(fresh); }).catch(() => {});
            return;
        }
        setLoading(true);
        fetchAnimeInfo(id).then(data => {
            if (data) setAnime(data);
            else setError("Failed to resolve this Anime.");
        }).catch((e: any) => {
            setError(e.message || "Failed to load Anime details.");
        }).finally(() => setLoading(false));
    }, [id, isPsyop, isTwoHeAnime]);

    const episodes = anime?.episodes || [];
    const totalEps = episodes.length;
    const needsRangeNav = totalEps > EPISODES_PER_RANGE;

    const ranges = useMemo(() => {
        if (!needsRangeNav) return [];
        const r = [];
        for (let i = 0; i < totalEps; i += EPISODES_PER_RANGE) {
            const start = i + 1;
            const end = Math.min(i + EPISODES_PER_RANGE, totalEps);
            r.push({ start, end, offset: i });
        }
        return r;
    }, [totalEps, needsRangeNav]);

    const visibleEpisodes = useMemo(() => {
        if (!needsRangeNav) return episodes;
        const start = episodeRange * EPISODES_PER_RANGE;
        return episodes.slice(start, start + EPISODES_PER_RANGE);
    }, [episodes, episodeRange, needsRangeNav]);

    const lastEp = lastWatchedEpId ? episodes.find(e => e.id === lastWatchedEpId) : null;
    const targetEp = lastEp || episodes[0];
    const ctaLabel = lastEp ? `Continue Ep ${lastEp.number}` : episodes.length > 0 ? "Start Watching" : "View Details";
    const plainDescription = anime?.description?.replace(/<[^>]+>/g, "").trim() || "";

    if (loading) {
        return (
            <main className="main-content anime-detail">
                <div className="loading-container">
                    <div className="spinner" />
                    <p>Loading anime...</p>
                </div>
            </main>
        );
    }

    if (error || !anime) {
        return (
            <main className="main-content anime-detail">
                <BackButton href="/anime" />
                <div className="error-container">
                    <p>{error || "Anime not found."}</p>
                    <button type="button" onClick={() => router.push("/anime")} className="btn-secondary" style={{ marginTop: 24 }}>Go Back</button>
                </div>
            </main>
        );
    }

    return (
        <main className="main-content anime-detail">
            {statusToast && <div className="sakura-toast" role="status">{statusToast}</div>}
            <BackButton href="/anime" />

            {showSummary && plainDescription && (
                <SummaryModal description={plainDescription} onClose={() => setShowSummary(false)} />
            )}

            {showLibraryModal && (
                <SaveToLibraryModal
                    item={{ id: anime.id, title: anime.title, image: anime.image, type: "anime", addedAt: Date.now() }}
                    onClose={() => { setShowLibraryModal(false); setInLib(isInLibrary(id, "anime")); }}
                />
            )}

            <section className="md-hero">
                <div className="md-hero-bg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageOrPlaceholder(anime.cover || anime.image)} alt="" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).src = SAKURA_PLACEHOLDER_IMAGE; }} />
                </div>
                <div className="md-hero-scrim" />
                <div className="md-hero-inner">
                    <div className="md-poster">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imageOrPlaceholder(anime.cover || anime.image)} alt={anime.title} referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).src = SAKURA_PLACEHOLDER_IMAGE; }} />
                    </div>
                    <div className="md-info">
                        {(isPsyop || isTwoHeAnime) && (
                            <span className="ad-original-badge">Sakura Original</span>
                        )}
                        <h1 className="md-title">{anime.title}</h1>
                        <div className="md-stats">
                            {totalEps > 0 && (
                                <span className="md-stat"><strong>{totalEps}</strong> Episodes</span>
                            )}
                            {anime.score ? (
                                <span className="md-stat md-stat-rating">★ {anime.score}</span>
                            ) : null}
                            {anime.status ? <span className="md-status">{anime.status}</span> : null}
                        </div>
                        {anime.genres && anime.genres.length > 0 && (
                            <div className="md-genres">
                                {anime.genres.slice(0, 5).map((g) => (
                                    <span key={g} className="md-genre">{g}</span>
                                ))}
                            </div>
                        )}
                        {plainDescription && (
                            <p className="md-synopsis">
                                {plainDescription.slice(0, 220)}
                                {plainDescription.length > 220 && "… "}
                                {plainDescription.length > 220 && (
                                    <button type="button" className="md-readmore" onClick={() => setShowSummary(true)}>Read more</button>
                                )}
                            </p>
                        )}
                        <div className="md-actions">
                            {targetEp && (
                                <Link href={`/anime/watch?id=${encodeURIComponent(anime.id)}&ep=${encodeURIComponent(targetEp.id)}`} className="md-btn-read">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                    {ctaLabel}
                                </Link>
                            )}
                            <button
                                type="button"
                                className={`md-icon-btn${inLib ? " is-active" : ""}`}
                                onClick={() => setShowLibraryModal(true)}
                                aria-label={inLib ? "Saved to library" : "Save to library"}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill={inLib ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
                            </button>
                            <button
                                type="button"
                                className="md-icon-btn"
                                onClick={async () => {
                                    const url = buildSakuraShareUrl({ kind: "anime", id: anime.id });
                                    const result = await shareOrCopyLink({ title: anime.title, url });
                                    if (result === "copied") showToast("Share link copied");
                                }}
                                aria-label="Share"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <section className="md-chapters ad-episodes">
                <div className="md-ch-head">
                    <h2 className="md-ch-title">Episodes<span className="md-ch-count">{totalEps}</span></h2>
                    {needsRangeNav && (
                        <div className="md-ch-tools">
                            <select
                                className="ad-range-select"
                                value={episodeRange}
                                onChange={(e) => setEpisodeRange(Number(e.target.value))}
                                aria-label="Episode range"
                            >
                                {ranges.map((r, idx) => (
                                    <option key={idx} value={idx}>Episodes {r.start}-{r.end}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                <div className="ad-ep-list">
                    {visibleEpisodes.length > 0 ? visibleEpisodes.map((ep) => {
                        const dl = dlMap[ep.id];
                        const isCompleted = dl?.state === "completed";
                        const isActive = dl?.state === "downloading" || dl?.state === "extracting";
                        const pct = dl?.progress || 0;
                        const isLast = ep.id === lastWatchedEpId;

                        return (
                            <Link
                                key={ep.id}
                                href={`/anime/watch?id=${encodeURIComponent(anime.id)}&ep=${encodeURIComponent(ep.id)}`}
                                className={`ad-ep-row${isLast ? " is-active" : ""}`}
                            >
                                <div className="ad-ep-thumb">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={imageOrPlaceholder(ep.image || anime.cover || anime.image)}
                                        alt=""
                                        loading="lazy"
                                        referrerPolicy="no-referrer"
                                        onError={(e) => {
                                            const img = e.target as HTMLImageElement;
                                            if (!img.dataset.fallback) {
                                                img.dataset.fallback = "1";
                                                img.src = SAKURA_PLACEHOLDER_IMAGE;
                                            }
                                        }}
                                    />
                                    <span className="ad-ep-play" aria-hidden="true">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                    </span>
                                </div>
                                <div className="ad-ep-body">
                                    <div className="ad-ep-label">
                                        {isLast && <span className="ad-ep-continue-dot" aria-hidden="true" />}
                                        Episode {ep.number}
                                    </div>
                                    <div className="ad-ep-title">{ep.title || `Episode ${ep.number}`}</div>
                                    {isCompleted && <div className="ad-ep-meta is-downloaded">Downloaded</div>}
                                </div>
                                {isNative && (
                                    <div className="ad-ep-actions">
                                        {isCompleted ? (
                                            <button type="button" className="ad-ep-dl is-complete" title="Downloaded" onClick={(e) => { e.preventDefault(); handleDownload(ep); }}>
                                                Saved
                                            </button>
                                        ) : isActive ? (
                                            <button type="button" className="ad-ep-dl is-progress" title={`Cancel download (${pct}%)`} onClick={(e) => { e.preventDefault(); handleCancelDownload(ep.id); }}>
                                                Stop {Math.round(pct)}%
                                                    <span>×</span>
                                            </button>
                                        ) : (
                                            <button type="button" className="ad-ep-dl" title="Download" onClick={(e) => { e.preventDefault(); handleDownload(ep); }}>
                                                Download
                                            </button>
                                        )}
                                    </div>
                                )}
                            </Link>
                        );
                    }) : (
                        <div className="ad-ep-empty">
                            <p className="ad-ep-empty-title">No streaming source found for this title</p>
                            <p className="ad-ep-empty-copy">
                                {anime.episodeLoadError
                                    ? anime.episodeLoadError
                                    : "Try again — sometimes the provider is just slow, or check back later."}
                            </p>
                            <button type="button" onClick={retryEpisodeLookup} disabled={retrying} className="btn-secondary">
                                {retrying ? "Searching…" : "Try search again"}
                            </button>
                        </div>
                    )}
                </div>
            </section>

            {(isPsyop || isTwoHeAnime) && (
                <section className="ad-extra">
                    <h2 className="ad-extra-title">{isPsyop ? "Characters" : "Creator"}</h2>
                    {isPsyop ? (
                        <div className="ad-info-cards">
                            <div className="ad-info-card">
                                <span className="ad-info-label">Studio</span>
                                <p>{PSYOP_STUDIO}</p>
                            </div>
                            {PSYOP_CHARACTERS.map((c) => (
                                <div key={c.name} className="ad-info-card">
                                    <div className="ad-info-card-head">
                                        <strong>{c.name}</strong>
                                        <span>{c.role}</span>
                                    </div>
                                    <p>{c.description}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="ad-info-cards">
                            <div className="ad-info-card">
                                <span className="ad-info-label">Creator</span>
                                <p>2heAnime</p>
                            </div>
                            <div className="ad-info-card">
                                <span className="ad-info-label">Bio</span>
                                <p className="ad-info-pre">{TWO_HE_CREATOR_BIO}</p>
                            </div>
                            <div className="ad-info-card">
                                <span className="ad-info-label">Contact</span>
                                <p>{TWO_HE_CREATOR_EMAIL}</p>
                            </div>
                            <div className="ad-info-card">
                                <span className="ad-info-label">Creator Wallet</span>
                                <p className="ad-info-mono">{truncateAddress(TWO_HE_CREATOR_WALLET)}</p>
                            </div>
                            {TWO_HE_EPISODE_DETAILS.map((episode) => (
                                <div key={episode.id} className="ad-info-card">
                                    <div className="ad-info-card-head">
                                        <strong>Episode {episode.number}: {episode.title}</strong>
                                    </div>
                                    <p>{episode.description}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            )}

            {targetEp && (
                <div className="ad-sticky-cta">
                    <Link href={`/anime/watch?id=${encodeURIComponent(anime.id)}&ep=${encodeURIComponent(targetEp.id)}`} className="ad-sticky-play">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                        {ctaLabel}
                    </Link>
                    <button
                        type="button"
                        className={`ad-sticky-save${inLib ? " is-active" : ""}`}
                        onClick={() => setShowLibraryModal(true)}
                        aria-label={inLib ? "Saved to library" : "Save to library"}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill={inLib ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
                    </button>
                </div>
            )}
        </main>
    );
}

export default function AnimeDetailsPage() {
    return (
        <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f", color: "white" }}>Loading...</div>}>
            <AnimeDetailsInner />
        </Suspense>
    );
}
