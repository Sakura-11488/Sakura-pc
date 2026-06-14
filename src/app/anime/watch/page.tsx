"use client";

import { useState, useEffect, useCallback, useRef, Suspense, type ChangeEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { fetchEpisodeSources, type StreamingSource, fetchAnimeInfo, refreshAnimeInfo, type AnimeInfo } from "@/lib/anime";
import { PSYOP_ID, isPsyopEpisode } from "@/lib/psyopAnime";
import { TWO_HE_ANIME_ID, isTwoHeAnimeEpisode } from "@/lib/2heAnime";
import Link from "next/link";
import { Capacitor } from "@capacitor/core";
import { getLocal, setLocal, STORAGE_KEYS, saveAnimeWatchEntry } from "@/lib/storage";
import type { DownloadProgressEvent } from "@/plugins/anime";

const CATEGORY_STORAGE_KEY = "sakura_anime_category";

interface WatchErrorState {
    message: string;
    code?: string;
    stage?: string;
    details?: Record<string, unknown>;
}

type AnimeEpisode = AnimeInfo["episodes"][number];

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

function getSavedCategory(): "sub" | "dub" {
    if (typeof window === "undefined") return "sub";
    const saved = localStorage.getItem(CATEGORY_STORAGE_KEY);
    return saved === "dub" ? "dub" : "sub";
}

function parseEpisodeNumber(episodeId: string): number | null {
    const match = episodeId.match(/^hi-\d+-(\d+)$/);
    if (!match) return null;
    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) ? parsed : null;
}

function toWatchError(error: unknown): WatchErrorState {
    if (error && typeof error === "object") {
        const source = error as {
            message?: string;
            code?: string;
            stage?: string;
            details?: Record<string, unknown>;
        };
        return {
            message: source.message || "Playback failed.",
            code: source.code,
            stage: source.stage,
            details: source.details,
        };
    }
    return { message: "Playback failed." };
}

function getErrorGuidance(error: WatchErrorState): string {
    if (error.stage === "mapping" || error.stage === "episodes") {
        return "This usually means Sakura matched the wrong HiAnime entry. Use Rematch Series to force a fresh lookup.";
    }
    if (error.stage === "servers") {
        return "The episode matched, but HiAnime has no usable servers for it yet. Retry later or try the other audio track if available.";
    }
    if (error.stage === "embed" || error.stage === "extractor") {
        return "The series matched, but the current host failed while resolving the embed or playlist. Retry the stream first, then rematch if it keeps happening.";
    }
    return "Retry the stream first. If the episode list still looks wrong, rematch the series to refresh the provider binding.";
}

function getEpisodeTitle(episode: AnimeEpisode | null | undefined): string {
    if (!episode) return "Episode ?";
    return episode.title || `Episode ${episode.number}`;
}

function getProviderLabel(episodeId: string, isOffline: boolean): string {
    if (isPsyopEpisode(episodeId)) return "PsyopAnime x Sakura";
    if (isTwoHeAnimeEpisode(episodeId)) return "2heAnime x Sakura";
    if (isOffline) return "Offline playback";
    return "Streaming via Sakura Engine";
}

function formatPlaybackTime(value: number): string {
    if (!Number.isFinite(value) || value < 0) return "0:00";
    const totalSeconds = Math.floor(value);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function AnimeWatchInner() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const id = searchParams.get("id") || "";
    const episodeId = searchParams.get("ep") || "";

    const [anime, setAnime] = useState<AnimeInfo | null>(null);
    const [source, setSource] = useState<StreamingSource | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<WatchErrorState | null>(null);
    const [nativePlaying, setNativePlaying] = useState(false);
    const [isNative] = useState(Capacitor.isNativePlatform());
    const [playTriggered, setPlayTriggered] = useState(false);
    const [category, setCategory] = useState<"sub" | "dub">(getSavedCategory);
    const [availableCategories, setAvailableCategories] = useState<string[]>(["sub"]);
    const [categoryLoading, setCategoryLoading] = useState(false);
    const [reloadToken, setReloadToken] = useState(0);
    const [rematching, setRematching] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isPaused, setIsPaused] = useState(true);
    const [isMuted, setIsMuted] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [downloadMap, setDownloadMap] = useState<Record<string, AnimeDownloadEntry>>({});
    const videoRef = useRef<HTMLVideoElement>(null);
    const playerWrapRef = useRef<HTMLDivElement>(null);
    const playerChromeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hlsRef = useRef<any>(null);

    const currentEpisodeIndex = anime?.episodes.findIndex((episode) => episode.id === episodeId) ?? -1;
    const currentEpisode = currentEpisodeIndex >= 0 ? anime?.episodes[currentEpisodeIndex] : null;
    const previousEpisode = currentEpisodeIndex > 0 ? anime?.episodes[currentEpisodeIndex - 1] : null;
    const nextEpisode = currentEpisodeIndex >= 0 && currentEpisodeIndex < (anime?.episodes.length || 0) - 1
        ? anime?.episodes[currentEpisodeIndex + 1]
        : null;
    const errorGuidance = error ? getErrorGuidance(error) : null;
    const currentDownload = downloadMap[episodeId];
    const isOfflineEpisode = currentDownload?.state === "completed";
    const providerLabel = getProviderLabel(episodeId, isOfflineEpisode);
    const posterImage = anime?.cover || anime?.image || "/sakura.png";
    const availableEpisodes = anime?.episodes || [];
    const detailsHref = `/anime/details?id=${encodeURIComponent(id)}`;
    const canRematch = !!error && !isPsyopEpisode(episodeId) && !isTwoHeAnimeEpisode(episodeId) && (
        error.stage === "mapping"
        || error.stage === "episodes"
        || error.code === "MISSING_SLUG"
        || error.code === "EPISODE_NOT_FOUND"
    );

    const applyResolvedCategory = useCallback((resolvedCategory?: string) => {
        const nextCategory = resolvedCategory === "dub" ? "dub" : "sub";
        if (nextCategory !== category) {
            localStorage.setItem(CATEGORY_STORAGE_KEY, nextCategory);
            setCategory(nextCategory);
        }
    }, [category]);

    useEffect(() => {
        setSource(null);
        setAnime(null);
        setError(null);
        setNativePlaying(false);
        setPlayTriggered(false);
        setCurrentTime(0);
        setDuration(0);
        setIsPaused(true);
        setIsMuted(false);
        setShowControls(true);
        setLoading(true);
    }, [episodeId]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        setDownloadMap(getLocal<Record<string, AnimeDownloadEntry>>(STORAGE_KEYS.ANIME_DOWNLOADS, {}));
    }, [episodeId, id]);

    useEffect(() => {
        if (!isNative) return;
        let handle: { remove: () => void } | null = null;

        (async () => {
            const { Anime } = await import("@/plugins/anime");
            handle = await Anime.addListener("downloadProgress", (event: DownloadProgressEvent) => {
                setDownloadMap((prev) => {
                    const updated = { ...prev };
                    const current = updated[event.episodeId];
                    if (current) {
                        updated[event.episodeId] = {
                            ...current,
                            state: event.state,
                            progress: event.progress,
                            ...(event.filePath ? { filePath: event.filePath } : {}),
                        };
                    }
                    setLocal(STORAGE_KEYS.ANIME_DOWNLOADS, updated);
                    return updated;
                });
            });
        })();

        return () => {
            handle?.remove();
        };
    }, [isNative]);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            setError(null);
            try {
                const animeData = await fetchAnimeInfo(id);
                if (cancelled) return;

                if (animeData) {
                    setAnime(animeData);
                    const isPsyop = id === PSYOP_ID;
                    const isTwoHeAnime = id === TWO_HE_ANIME_ID;
                    if (!isPsyop && !isTwoHeAnime && !animeData.episodes.some((episode) => episode.id === episodeId)) {
                        const currentNumber = parseEpisodeNumber(episodeId);
                        throw {
                            message: "The current episode is missing from the matched provider list.",
                            code: "EPISODE_NOT_FOUND",
                            stage: "episodes",
                            details: {
                                requestedEpisodeId: episodeId,
                                requestedEpisodeNumber: currentNumber,
                                matchedEpisodeCount: animeData.episodes.length,
                            },
                        };
                    }
                }

                console.log(`[Watch] Fetching sources for ep=${episodeId} category=${category}`);
                const sourceData = await fetchEpisodeSources(episodeId, category);
                if (cancelled) return;

                if (sourceData) {
                    console.log(`[Watch] Got source URL: ${sourceData.url?.substring(0, 80)}`);
                    setSource(sourceData);
                    if (sourceData.availableCategories) setAvailableCategories(sourceData.availableCategories);
                    applyResolvedCategory(sourceData.category);
                } else {
                    setError({
                        message: "Could not find a stream for this episode. Try another episode or check back later.",
                        code: "NO_STREAM_SOURCES",
                        stage: "extractor",
                    });
                }
            } catch (loadError) {
                console.error("[Watch] Load error:", loadError);
                if (!cancelled) setError(toWatchError(loadError));
            }

            if (!cancelled) setLoading(false);
        }

        if (id && episodeId) {
            load();
        }

        return () => {
            cancelled = true;
        };
    }, [id, episodeId, isNative, category, reloadToken, applyResolvedCategory]);

    const retryStream = useCallback(() => {
        setPlayTriggered(false);
        setNativePlaying(false);
        setSource(null);
        setError(null);
        setReloadToken((value) => value + 1);
    }, []);

    const toggleCategory = useCallback(async () => {
        const next = category === "sub" ? "dub" : "sub";
        if (!availableCategories.includes(next)) return;

        localStorage.setItem(CATEGORY_STORAGE_KEY, next);
        setCategory(next);
        setPlayTriggered(false);
        setNativePlaying(false);
        setCategoryLoading(true);
        setError(null);

        try {
            const sourceData = await fetchEpisodeSources(episodeId, next);
            if (sourceData) {
                setSource(sourceData);
                if (sourceData.availableCategories) setAvailableCategories(sourceData.availableCategories);
                applyResolvedCategory(sourceData.category);
            } else {
                setError({
                    message: `No ${next.toUpperCase()} stream available for this episode.`,
                    code: "NO_STREAM_SOURCES",
                    stage: "extractor",
                });
            }
        } catch (toggleError) {
            setError(toWatchError(toggleError));
        } finally {
            setCategoryLoading(false);
        }
    }, [category, availableCategories, episodeId, applyResolvedCategory]);

    const handleCancelDownload = useCallback(async (targetEpisodeId: string) => {
        try {
            const { Anime } = await import("@/plugins/anime");
            await Anime.cancelDownload({ episodeId: targetEpisodeId });
        } catch {
            // Keep local state responsive even if the native layer is unavailable.
        }

        setDownloadMap((prev) => {
            const updated = { ...prev };
            if (updated[targetEpisodeId]) {
                updated[targetEpisodeId] = { ...updated[targetEpisodeId], state: "cancelled", progress: 0 };
            }
            setLocal(STORAGE_KEYS.ANIME_DOWNLOADS, updated);
            return updated;
        });
    }, []);

    const handleDownload = useCallback(async (episode: AnimeEpisode | null) => {
        if (!anime || !episode || !isNative) return;

        const existing = downloadMap[episode.id];
        if (existing?.state === "downloading" || existing?.state === "extracting") return;

        const nextEntry: AnimeDownloadEntry = {
            episodeId: episode.id,
            animeId: id,
            animeTitle: anime.title,
            episodeTitle: getEpisodeTitle(episode),
            episodeNumber: episode.number,
            state: "extracting",
            progress: 0,
            timestamp: Date.now(),
            filePath: existing?.filePath,
        };

        setDownloadMap((prev) => {
            const updated = { ...prev, [episode.id]: nextEntry };
            setLocal(STORAGE_KEYS.ANIME_DOWNLOADS, updated);
            return updated;
        });

        try {
            const sourceData = await fetchEpisodeSources(episode.id, category);
            if (!sourceData?.url) {
                throw new Error("Could not resolve stream URL for download.");
            }

            const { Anime } = await import("@/plugins/anime");
            const result = await Anime.downloadEpisode({
                episodeId: episode.id,
                m3u8Url: sourceData.url,
                title: getEpisodeTitle(episode),
                animeTitle: anime.title,
                referer: sourceData.referer,
                isM3U8: sourceData.isM3U8,
            });

            if (result.filePath) {
                setDownloadMap((prev) => {
                    const updated = {
                        ...prev,
                        [episode.id]: {
                            ...nextEntry,
                            state: "completed",
                            progress: 100,
                            filePath: result.filePath,
                        },
                    };
                    setLocal(STORAGE_KEYS.ANIME_DOWNLOADS, updated);
                    return updated;
                });
            }
        } catch (downloadError) {
            const cancelled = /cancel/i.test(String((downloadError as Error)?.message || ""));
            setDownloadMap((prev) => {
                const updated = {
                    ...prev,
                    [episode.id]: {
                        ...nextEntry,
                        state: cancelled ? "cancelled" : "error",
                        progress: 0,
                    },
                };
                setLocal(STORAGE_KEYS.ANIME_DOWNLOADS, updated);
                return updated;
            });
        }
    }, [anime, category, downloadMap, id, isNative]);

    const rematchSeries = useCallback(async () => {
        if (!id || !episodeId) return;

        setRematching(true);
        setError(null);
        setSource(null);

        try {
            const currentNumber = parseEpisodeNumber(episodeId);
            const freshAnime = await refreshAnimeInfo(id, { forceSourceRefresh: true });
            if (!freshAnime || freshAnime.episodes.length === 0) {
                throw new Error("Rematch completed, but HiAnime still returned no episodes.");
            }

            setAnime(freshAnime);
            const replacementEpisode =
                (currentNumber != null ? freshAnime.episodes.find((episode) => episode.number === currentNumber) : null)
                || freshAnime.episodes[0];

            if (!replacementEpisode) {
                throw new Error("Rematch completed, but the requested episode still could not be found.");
            }

            if (replacementEpisode.id !== episodeId) {
                router.replace(`/anime/watch?id=${encodeURIComponent(id)}&ep=${encodeURIComponent(replacementEpisode.id)}`);
                return;
            }

            retryStream();
        } catch (rematchError) {
            setError(toWatchError(rematchError));
        } finally {
            setRematching(false);
        }
    }, [episodeId, id, retryStream, router]);

    const playNative = useCallback(async () => {
        if (!anime) return;

        const episodeIndex = anime.episodes.findIndex((episode) => episode.id === episodeId);
        const currentEp = episodeIndex >= 0 ? anime.episodes[episodeIndex] : null;
        const nextEp = episodeIndex >= 0 && episodeIndex < anime.episodes.length - 1 ? anime.episodes[episodeIndex + 1] : null;
        const title = currentEp?.title || `Episode ${currentEp?.number || "?"}`;

        try {
            setNativePlaying(true);
            setError(null);

            saveAnimeWatchEntry({
                animeId: id,
                episodeId,
                animeTitle: anime.title,
                episodeTitle: title,
                episodeNumber: currentEp?.number || 0,
                image: anime.image,
                timestamp: Date.now(),
            });

            const { Anime } = await import("@/plugins/anime");
            const allDownloads = getLocal<Record<string, any>>(STORAGE_KEYS.ANIME_DOWNLOADS, {});
            const localEntry = allDownloads[episodeId];

            let result: { completed: boolean };
            if (localEntry?.state === "completed" && localEntry?.filePath) {
                result = await Anime.playLocalEpisode({
                    filePath: localEntry.filePath,
                    title,
                    episodeId,
                    hasNext: !!nextEp,
                    nextEpisodeTitle: nextEp?.title || (nextEp ? `Episode ${nextEp.number}` : ""),
                });
            } else {
                if (!source?.url) {
                    setError({
                        message: "No stream URL is available yet. Retry the stream first.",
                        code: "NO_STREAM_URL",
                        stage: "extractor",
                    });
                    return;
                }

                result = await Anime.playEpisode({
                    streamUrl: source.url,
                    referer: source.referer || "",
                    title,
                    episodeId,
                    hasNext: !!nextEp,
                    nextEpisodeTitle: nextEp?.title || (nextEp ? `Episode ${nextEp.number}` : ""),
                    ...(source.intro != null
                    && typeof source.intro.start === "number"
                    && typeof source.intro.end === "number"
                    && source.intro.end > source.intro.start
                        ? { introStart: source.intro.start, introEnd: source.intro.end }
                        : {}),
                });
            }

            if (result.completed && nextEp) {
                const nextTitle = nextEp.title || `Episode ${nextEp.number}`;
                saveAnimeWatchEntry({
                    animeId: id,
                    episodeId: nextEp.id,
                    animeTitle: anime.title,
                    episodeTitle: nextTitle,
                    episodeNumber: nextEp.number,
                    image: anime.image,
                    timestamp: Date.now(),
                });
                router.replace(`/anime/watch?id=${encodeURIComponent(id)}&ep=${encodeURIComponent(nextEp.id)}`);
            }
        } catch (playError) {
            console.error("[Anime] Native playback error:", playError);
            setError(toWatchError(playError));
        } finally {
            setNativePlaying(false);
        }
    }, [anime, episodeId, id, router, source]);

    useEffect(() => {
        if (isNative && anime && source && !error && !nativePlaying && !playTriggered) {
            setPlayTriggered(true);
            playNative();
        }
    }, [isNative, anime, source, error, nativePlaying, playTriggered, playNative]);

    useEffect(() => {
        if (isNative || !source?.url) return;
        const video = videoRef.current;
        if (!video) return;

        let hls: any = null;
        let disposed = false;

        const startWebPlayback = async () => {
            if ((window as any).electronAPI?.setStreamReferer) {
                await (window as any).electronAPI.setStreamReferer(source.referer || "");
            }
            if (disposed) return;

            if (!source.isM3U8) {
                video.src = source.url;
                video.play().catch(() => {});
                return;
            }

            const Hls = (await import("hls.js")).default;
            if (Hls.isSupported()) {
                hls = new Hls({
                    enableWorker: false,
                    maxBufferLength: 30,
                    maxMaxBufferLength: 60,
                });
                hlsRef.current = hls;
                hls.loadSource(source.url);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    video.play().catch(() => {});
                });
                hls.on(Hls.Events.ERROR, (_: any, data: any) => {
                    if (!data?.fatal) return;
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
                    else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
                    else {
                        setError({
                            message: "Fatal playback error.",
                            code: "HLS_FATAL",
                            stage: "extractor",
                            details: {
                                hlsDetails: data?.details,
                                hlsError: String(data?.error?.message || data?.error || ""),
                            },
                        });
                    }
                });
                return;
            }

            if (video.canPlayType("application/vnd.apple.mpegurl")) {
                video.src = source.url;
                video.play().catch(() => {});
                return;
            }

            setError({
                message: "This device cannot play the current HLS stream.",
                code: "HLS_NOT_SUPPORTED",
                stage: "extractor",
            });
        };

        startWebPlayback();

        return () => {
            disposed = true;
            if (hls) hls.destroy();
            hlsRef.current = null;
        };
    }, [isNative, source]);

    useEffect(() => {
        if (isNative) return;
        const video = videoRef.current;
        if (!video) return;

        const syncState = () => {
            setCurrentTime(video.currentTime || 0);
            setDuration(video.duration || 0);
            setIsPaused(video.paused);
            setIsMuted(video.muted);
        };

        syncState();
        video.addEventListener("timeupdate", syncState);
        video.addEventListener("loadedmetadata", syncState);
        video.addEventListener("durationchange", syncState);
        video.addEventListener("play", syncState);
        video.addEventListener("pause", syncState);
        video.addEventListener("volumechange", syncState);
        video.addEventListener("ended", syncState);

        return () => {
            video.removeEventListener("timeupdate", syncState);
            video.removeEventListener("loadedmetadata", syncState);
            video.removeEventListener("durationchange", syncState);
            video.removeEventListener("play", syncState);
            video.removeEventListener("pause", syncState);
            video.removeEventListener("volumechange", syncState);
            video.removeEventListener("ended", syncState);
        };
    }, [isNative, source]);

    useEffect(() => {
        if (isNative) return;
        if (playerChromeTimeoutRef.current) {
            clearTimeout(playerChromeTimeoutRef.current);
            playerChromeTimeoutRef.current = null;
        }

        if (isPaused || !source?.url) {
            setShowControls(true);
            return;
        }

        playerChromeTimeoutRef.current = setTimeout(() => {
            setShowControls(false);
        }, 2200);

        return () => {
            if (playerChromeTimeoutRef.current) {
                clearTimeout(playerChromeTimeoutRef.current);
                playerChromeTimeoutRef.current = null;
            }
        };
    }, [isNative, isPaused, currentTime, source]);

    const revealControls = useCallback(() => {
        setShowControls(true);
    }, []);

    const togglePlayback = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        revealControls();
        if (video.paused) video.play().catch(() => {});
        else video.pause();
    }, [revealControls]);

    const handleSeek = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        const video = videoRef.current;
        if (!video) return;
        const nextTime = Number(event.target.value);
        video.currentTime = nextTime;
        setCurrentTime(nextTime);
        revealControls();
    }, [revealControls]);

    const toggleMute = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        video.muted = !video.muted;
        setIsMuted(video.muted);
        revealControls();
    }, [revealControls]);

    const toggleFullscreen = useCallback(async () => {
        const playerWrap = playerWrapRef.current;
        if (!playerWrap) return;
        try {
            if (document.fullscreenElement === playerWrap) {
                await document.exitFullscreen();
            } else {
                await playerWrap.requestFullscreen();
            }
        } catch {
            // Ignore fullscreen failures from unsupported environments.
        }
        revealControls();
    }, [revealControls]);

    useEffect(() => {
        if (isNative) return;
        if (typeof window === "undefined") return;
        const onKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const tag = target?.tagName?.toLowerCase();
            if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
            if (e.code === "Space" || e.key === " ") {
                e.preventDefault();
                togglePlayback();
                return;
            }
            if (e.key.toLowerCase() === "m") {
                toggleMute();
                return;
            }
            if (e.key.toLowerCase() === "f") {
                toggleFullscreen();
            }
        };
        window.addEventListener("keydown", onKeyDown, { capture: true });
        return () => window.removeEventListener("keydown", onKeyDown, { capture: true } as any);
    }, [isNative, toggleFullscreen, toggleMute, togglePlayback]);

    if (loading) {
        return (
            <main className="cinema-page cinema-screen">
                <section className="cinema-loading-card glass-heavy">
                    <span className="cinema-loading-dot" aria-hidden="true" />
                    <p className="cinema-loading-kicker">{isNative ? "Preparing native player" : "Locating stream"}</p>
                    <h1 className="cinema-loading-title">{anime?.title || "Setting up playback"}</h1>
                    <p className="cinema-loading-copy">
                        {isNative
                            ? "Sakura is getting the episode ready in the Android player."
                            : "Sakura is resolving the best stream and warming up the player."}
                    </p>
                </section>
            </main>
        );
    }

    if (error) {
        const copyLog = () => {
            const payload = JSON.stringify(error, null, 2);
            navigator.clipboard?.writeText(payload).then(() => {
                alert("Copied to clipboard!");
            }).catch(() => {
                const textArea = document.createElement("textarea");
                textArea.value = payload;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand("copy");
                document.body.removeChild(textArea);
                alert("Copied to clipboard!");
            });
        };

        return (
            <main className="cinema-page cinema-screen">
                <div className="cinema-backdrop" style={{ backgroundImage: `url("${posterImage}")` }} />
                <div className="cinema-backdrop-overlay" />
                <section className="cinema-error-card glass-heavy">
                    <p className="cinema-panel-kicker">Playback issue</p>
                    <h1 className="cinema-error-title">This episode could not start</h1>
                    {errorGuidance && <p className="cinema-error-guidance">{errorGuidance}</p>}
                    <pre className="cinema-error-log">{JSON.stringify(error, null, 2)}</pre>
                    <div className="cinema-error-actions">
                        <button onClick={retryStream} className="btn-primary">
                            Retry Stream
                        </button>
                        {canRematch && (
                            <button
                                onClick={rematchSeries}
                                className="btn-secondary"
                                disabled={rematching}
                                style={{ opacity: rematching ? 0.6 : 1 }}
                            >
                                {rematching ? "Rematching..." : "Rematch Series"}
                            </button>
                        )}
                        {isNative && source?.url && (
                            <button onClick={playNative} className="btn-secondary">
                                Retry Native Player
                            </button>
                        )}
                        <button onClick={copyLog} className="cinema-copy-btn">
                            Copy Log
                        </button>
                        <Link href={detailsHref} className="btn-secondary">
                            Anime Details
                        </Link>
                    </div>
                </section>
            </main>
        );
    }

    return (
        <main className="cinema-page">
            <div className="cinema-backdrop" style={{ backgroundImage: `url("${posterImage}")` }} />
            <div className="cinema-backdrop-overlay" />

            <header className="cinema-topbar">
                <div className="cinema-floating-controls">
                    <Link href={detailsHref} aria-label="Anime details" className="cinema-icon-btn">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                    </Link>
                </div>
            </header>

            <section className="cinema-layout">
                <div className="cinema-stage">
                    <article className="cinema-player-card glass-heavy">
                        <div className="cinema-player-shell">
                            {isNative ? (
                                <div className="cinema-native-panel">
                                    <h2>{nativePlaying ? "Launching player..." : "Ready to watch"}</h2>
                                    <button
                                        onClick={playNative}
                                        disabled={nativePlaying}
                                        className="btn-primary cinema-native-cta"
                                        style={{ opacity: nativePlaying ? 0.6 : 1 }}
                                    >
                                        {nativePlaying ? "Launching..." : "Play Episode"}
                                    </button>
                                </div>
                            ) : (
                                <div
                                    ref={playerWrapRef}
                                    className={`cinema-player-wrap cinema-player-shell-wrap${showControls ? " controls-visible" : ""}`}
                                    onMouseMove={revealControls}
                                    onPointerMove={revealControls}
                                >
                                    <video
                                        ref={videoRef}
                                        playsInline
                                        className="cinema-player-video"
                                        onClick={togglePlayback}
                                        onDoubleClick={toggleFullscreen}
                                    />
                                    <div className={`cinema-player-overlay${showControls ? " is-visible" : ""}`}>
                                        <div className="cinema-controls-bar">
                                            <div className="cinema-progress-wrap">
                                                <input
                                                    type="range"
                                                    min={0}
                                                    max={duration || 0}
                                                    step="0.1"
                                                    value={Math.min(currentTime, duration || 0)}
                                                    onChange={handleSeek}
                                                    className="cinema-progress"
                                                    aria-label="Seek video"
                                                />
                                                <div
                                                    className="cinema-progress-fill"
                                                    style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%" }}
                                                />
                                            </div>

                                            <div className="cinema-controls-row">
                                                <div className="cinema-controls-group">
                                                    <button
                                                        type="button"
                                                        className="cinema-control-btn"
                                                        onClick={togglePlayback}
                                                        aria-label={isPaused ? "Play video" : "Pause video"}
                                                    >
                                                        {isPaused ? (
                                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="8 5 19 12 8 19 8 5" /></svg>
                                                        ) : (
                                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="5" width="4" height="14" rx="1.5" /><rect x="13" y="5" width="4" height="14" rx="1.5" /></svg>
                                                        )}
                                                    </button>
                                                    <span className="cinema-timecode">
                                                        {formatPlaybackTime(currentTime)} / {formatPlaybackTime(duration)}
                                                    </span>
                                                </div>

                                                <div className="cinema-controls-group">
                                                    <button
                                                        type="button"
                                                        className="cinema-control-btn"
                                                        onClick={toggleMute}
                                                        aria-label={isMuted ? "Unmute video" : "Mute video"}
                                                    >
                                                        {isMuted ? (
                                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
                                                        ) : (
                                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a10 10 0 0 1 0 14" /></svg>
                                                        )}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="cinema-control-btn"
                                                        onClick={toggleFullscreen}
                                                        aria-label="Toggle fullscreen"
                                                    >
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="cinema-minimal-bar">
                            <div className="cinema-minimal-copy">
                                <h2 className="cinema-panel-title">{getEpisodeTitle(currentEpisode)}</h2>
                                <p className="cinema-panel-meta">
                                    {currentEpisode ? `Episode ${currentEpisode.number}` : "Episode"}
                                    {anime?.episodes?.length ? ` • ${anime.episodes.length} total` : ""}
                                    {providerLabel ? ` • ${providerLabel}` : ""}
                                </p>
                            </div>

                            <div className="cinema-action-panel cinema-action-panel-inline">
                                {previousEpisode ? (
                                    <Link href={`/anime/watch?id=${encodeURIComponent(id)}&ep=${encodeURIComponent(previousEpisode.id)}`} className="btn-secondary">
                                        Prev
                                    </Link>
                                ) : null}
                                {isNative && currentEpisode ? (
                                    currentDownload?.state === "downloading" || currentDownload?.state === "extracting" ? (
                                        <button
                                            type="button"
                                            onClick={() => void handleCancelDownload(currentEpisode.id)}
                                            className="cinema-track-btn"
                                        >
                                            Stop {Math.round(currentDownload.progress || 0)}%
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => void handleDownload(currentEpisode)}
                                            className={`cinema-track-btn${currentDownload?.state === "completed" ? " is-sub" : ""}`}
                                        >
                                            {currentDownload?.state === "completed" ? "Downloaded" : "Download"}
                                        </button>
                                    )
                                ) : null}
                                {!isPsyopEpisode(episodeId) && availableCategories.length > 1 && (
                                    <button
                                        onClick={toggleCategory}
                                        disabled={categoryLoading}
                                        className={`cinema-track-btn ${category === "dub" ? "is-dub" : "is-sub"}`}
                                    >
                                        {categoryLoading ? "Switching..." : category === "sub" ? "SUB" : "DUB"}
                                    </button>
                                )}
                                {nextEpisode ? (
                                    <Link href={`/anime/watch?id=${encodeURIComponent(id)}&ep=${encodeURIComponent(nextEpisode.id)}`} className="btn-primary">
                                        Next
                                    </Link>
                                ) : null}
                            </div>
                        </div>
                    </article>
                </div>

                <aside className="cinema-sidebar glass">
                    <div className="cinema-sidebar-head">
                        <h2>
                            Episodes
                            <span className="cinema-sidebar-total">{availableEpisodes.length}</span>
                        </h2>
                    </div>

                    <div className="cinema-episode-list">
                        {availableEpisodes.map((episode) => {
                            const isActive = episode.id === episodeId;
                            const episodeDownload = downloadMap[episode.id];
                            const isDownloading = episodeDownload?.state === "downloading" || episodeDownload?.state === "extracting";
                            const isDownloaded = episodeDownload?.state === "completed";
                            return (
                                <div
                                    key={episode.id}
                                    className={`cinema-episode-card${isActive ? " is-active" : ""}`}
                                >
                                    <Link
                                        href={`/anime/watch?id=${encodeURIComponent(id)}&ep=${encodeURIComponent(episode.id)}`}
                                        className="cinema-episode-link"
                                    >
                                        <span className="cinema-episode-number">{String(episode.number).padStart(2, "0")}</span>
                                        <span className="cinema-episode-title">{getEpisodeTitle(episode)}</span>
                                    </Link>
                                    {isNative ? (
                                        <button
                                            type="button"
                                            className={`cinema-episode-download${isDownloaded ? " is-complete" : ""}`}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                if (isDownloading) {
                                                    void handleCancelDownload(episode.id);
                                                    return;
                                                }
                                                void handleDownload(episode);
                                            }}
                                        >
                                            {isDownloading ? `${Math.round(episodeDownload?.progress || 0)}%` : isDownloaded ? "Saved" : "Download"}
                                        </button>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                </aside>
            </section>
        </main>
    );
}

export default function AnimeWatchPage() {
    return (
        <Suspense fallback={<div className="cinema-page cinema-screen">Buffering episode...</div>}>
            <AnimeWatchInner />
        </Suspense>
    );
}
