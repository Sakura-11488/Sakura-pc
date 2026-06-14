"use client";

import { useState, useEffect, useCallback, useRef, Suspense, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import {
    getNovel, getChapterContent, getChapters, canReadChapter,
    saveProgress, getProgress, recordMilestone, buildChapterPaymentTx,
    unlockChapter as recordUnlock, type Novel, type NovelChapter,
} from "@/lib/novel";
import { parseChapterContent as fetchExternalChapter, parseNovelDetail } from "@/lib/allnovel";
import {
    getLocal, setLocal, STORAGE_KEYS, getNovelDownloadContent,
    getChapterBookmarks, addNovelBookmark, removeNovelBookmark,
    saveNovelHistoryEntry,
    type NovelBookmark,
} from "@/lib/storage";
import { schedulePushNovelBookmarks, schedulePushSettings } from "@/lib/cloud-sync";
import dynamic from "next/dynamic";
import TradeCheckModal from "@/components/TradeCheckModal";
import ReaderFloatingChrome from "@/components/ReaderFloatingChrome";
import ReadingModePicker from "@/components/ReadingModePicker";
import { type ReadingMode, normalizeReadingMode, isPaginatedMode } from "@/lib/reading-mode";

const NovelComments = dynamic(() => import("@/components/NovelComments"), { ssr: false });

/* ═══════ Types ═══════ */

interface ReaderSettings {
    fontSize: number;
    fontFamily: "serif" | "sans-serif" | "monospace";
    theme: "dark" | "light" | "sepia" | "midnight" | "sakura";
    lineHeight: number;
    padding: number;
    textAlign: "left" | "center" | "right" | "justify";
    mode: ReadingMode;
    customCSS: string;
    bionicReading: boolean;
    autoScrollSpeed: number;
    focusMode: boolean;
}

interface TTSSettings {
    voiceURI: string;
    rate: number;
    pitch: number;
}

const DEFAULT_SETTINGS: ReaderSettings = {
    fontSize: 18, fontFamily: "serif", theme: "dark", lineHeight: 1.8,
    padding: 20, textAlign: "left", mode: "scroll", customCSS: "",
    bionicReading: false, autoScrollSpeed: 40, focusMode: false,
};

const DEFAULT_TTS: TTSSettings = { voiceURI: "", rate: 1.0, pitch: 1.0 };

const SETTINGS_KEY = STORAGE_KEYS.NOVEL_READER_SETTINGS;
const TTS_KEY = STORAGE_KEYS.NOVEL_TTS_SETTINGS;
const NOVEL_CACHE_PREFIX = "sakura_novel_ch_";

function getConnectedWallet(): string | null {
    if (typeof window === 'undefined') return null;
    try { return localStorage.getItem('sakura_wallet_address') || null; } catch { return null; }
}

function loadSettings(): ReaderSettings {
    const saved = getLocal<Partial<ReaderSettings>>(SETTINGS_KEY, {});
    const mode = normalizeReadingMode(saved.mode as string) || DEFAULT_SETTINGS.mode;
    return { ...DEFAULT_SETTINGS, ...saved, mode };
}

function saveSettingsLocal(s: ReaderSettings) {
    setLocal(SETTINGS_KEY, s);
    if (s.customCSS !== undefined) setLocal(STORAGE_KEYS.NOVEL_CUSTOM_CSS, s.customCSS);
    const w = getConnectedWallet();
    if (w) schedulePushSettings(w);
}

function loadTTSSettings(): TTSSettings {
    return { ...DEFAULT_TTS, ...getLocal<Partial<TTSSettings>>(TTS_KEY, {}) };
}

function saveTTSSettingsLocal(s: TTSSettings) {
    setLocal(TTS_KEY, s);
    const w = getConnectedWallet();
    if (w) schedulePushSettings(w);
}

const THEME_MAP: Record<string, { bg: string; text: string; secondary: string }> = {
    dark: { bg: "#0a0812", text: "#f0ecf4", secondary: "rgba(240,236,244,0.5)" },
    light: { bg: "#faf8f5", text: "#1a1a2e", secondary: "rgba(26,26,46,0.5)" },
    sepia: { bg: "#f4ecd8", text: "#5c4033", secondary: "rgba(92,64,51,0.5)" },
    midnight: { bg: "#0d1117", text: "#e2e8f0", secondary: "rgba(226,232,240,0.4)" },
    sakura: { bg: "#1a0a1a", text: "#fce4ec", secondary: "rgba(252,228,236,0.4)" },
};

const FONT_MAP: Record<string, string> = {
    serif: "'Noto Serif JP', Georgia, serif",
    "sans-serif": "'Inter', system-ui, sans-serif",
    monospace: "'JetBrains Mono', 'Courier New', monospace",
};

/* ═══════ Bionic Reading ═══════ */

function applyBionic(text: string): string {
    return text.replace(/\b(\w)(\w*)\b/g, (_, first, rest) => {
        const len = 1 + rest.length;
        const boldLen = len <= 3 ? 1 : len <= 6 ? 2 : 3;
        const full = first + rest;
        return `<b>${full.slice(0, boldLen)}</b>${full.slice(boldLen)}`;
    });
}

/* ═══════ EPUB Export ═══════ */

async function exportEpub(title: string, author: string, chapters: { title: string; content: string }[]) {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

    const meta = zip.folder("META-INF")!;
    meta.file("container.xml", `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);

    const oebps = zip.folder("OEBPS")!;
    const manifest: string[] = [];
    const spine: string[] = [];

    chapters.forEach((ch, i) => {
        const id = `ch${i + 1}`;
        const fname = `${id}.xhtml`;
        oebps.file(fname, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${ch.title}</title></head>
<body><h1>${ch.title}</h1><div>${ch.content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>")}</div></body></html>`);
        manifest.push(`<item id="${id}" href="${fname}" media-type="application/xhtml+xml"/>`);
        spine.push(`<itemref idref="${id}"/>`);
    });

    oebps.file("content.opf", `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:identifier id="uid">sakura-${Date.now()}</dc:identifier>
  <dc:title>${title}</dc:title>
  <dc:creator>${author}</dc:creator>
  <dc:language>en</dc:language>
</metadata>
<manifest>${manifest.join("\n")}</manifest>
<spine>${spine.join("\n")}</spine>
</package>`);

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9]/g, "_")}.epub`;
    a.click();
    URL.revokeObjectURL(url);
}

/* ═══════ Main Reader ═══════ */

function NovelReaderContent() {
    const params = useSearchParams();
    const router = useRouter();
    const source = params.get("source") || "sakura";
    const novelId = params.get("novel") || params.get("path") || "";
    const chapterNum = parseInt(params.get("chapter") || "1", 10);
    const chapterPath = params.get("chapterPath") || "";
    const { publicKey, signTransaction } = useWallet();
    const wallet = publicKey?.toBase58() || null;

    const isExternal = source === "external";

    const [novel, setNovel] = useState<Novel | null>(null);
    const [externalTitle, setExternalTitle] = useState("");
    const [externalCover, setExternalCover] = useState<string | undefined>();
    const [chapter, setChapter] = useState<NovelChapter | null>(null);
    const [htmlContent, setHtmlContent] = useState("");
    const [totalChapters, setTotalChapters] = useState(0);
    const [allChapterPaths, setAllChapterPaths] = useState<{ path: string; name: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [hasAccess, setHasAccess] = useState(false);
    const [showPaywall, setShowPaywall] = useState(false);
    const [paying, setPaying] = useState(false);
    const [payError, setPayError] = useState<string | null>(null);

    const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
    const [ttsSettings, setTtsSettings] = useState<TTSSettings>(DEFAULT_TTS);
    const [showOverlay, setShowOverlay] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showTradeModal, setShowTradeModal] = useState(false);
    const [activeSettingsTab, setActiveSettingsTab] = useState<"display" | "tts" | "advanced">("display");

    /* Page Mode */
    const [currentPage, setCurrentPage] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const pageContainerRef = useRef<HTMLDivElement>(null);

    /* TTS */
    const [ttsPlaying, setTtsPlaying] = useState(false);
    const [ttsPaused, setTtsPaused] = useState(false);
    const [voices, setVoices] = useState<{ voiceURI: string; name: string; lang: string }[]>([]);

    /* Overlay auto-hide */
    const overlayAutoHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    /* Ambient Audio */
    const [ambientPlaying, setAmbientPlaying] = useState(false);
    const [ambientVolume, setAmbientVolume] = useState(0.3);
    const ambientAudioRef = useRef<HTMLAudioElement | null>(null);

    /* Scroll Progress */
    const [scrollProgress, setScrollProgress] = useState(0);

    /* Focus Mode */
    const focusObserverRef = useRef<IntersectionObserver | null>(null);

    /* Auto-Scroll */
    const [autoScrolling, setAutoScrolling] = useState(false);
    const autoScrollRef = useRef<number | null>(null);

    /* Bookmarks */
    const [bookmarks, setBookmarks] = useState<NovelBookmark[]>([]);
    const [selectionMenu, setSelectionMenu] = useState<{ x: number; y: number; text: string } | null>(null);

    const contentRef = useRef<HTMLDivElement>(null);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setSettings(loadSettings());
        setTtsSettings(loadTTSSettings());
        const ambient = getLocal<{ playing: boolean; volume: number }>(STORAGE_KEYS.NOVEL_AMBIENT_SETTINGS, { playing: false, volume: 0.3 });
        setAmbientPlaying(ambient.playing);
        setAmbientVolume(ambient.volume);
    }, []);

    const updateSetting = <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
        setSettings(prev => { const next = { ...prev, [key]: value }; saveSettingsLocal(next); return next; });
    };

    const updateTTSSetting = <K extends keyof TTSSettings>(key: K, value: TTSSettings[K]) => {
        setTtsSettings(prev => { const next = { ...prev, [key]: value }; saveTTSSettingsLocal(next); return next; });
    };

    /* ── Load chapter ── */
    const loadChapter = useCallback(async () => {
        if (!novelId) return;
        setLoading(true);
        setShowPaywall(false);
        setPayError(null);

        if (isExternal) {
            const offline = getNovelDownloadContent("sakura", novelId, chapterPath || `ch_${chapterNum}`);
            if (offline) { setHtmlContent(offline); setHasAccess(true); }
            try {
                const detail = await parseNovelDetail(novelId);
                setExternalTitle(detail.name);
                if (detail.cover) setExternalCover(detail.cover);
                setTotalChapters(detail.chapters.length);
                setAllChapterPaths(detail.chapters.map(c => ({ path: c.path, name: c.name })));
                if (!offline) {
                    const path = chapterPath || detail.chapters[chapterNum - 1]?.path;
                    if (path) { const content = await fetchExternalChapter(path); setHtmlContent(content); setHasAccess(true); }
                }
            } catch (e) {
                console.error("External load error:", e);
                if (!offline) setHtmlContent("<p>Failed to load chapter. Please try again.</p>");
            }
        } else {
            const [n, chapters] = await Promise.all([getNovel(novelId), getChapters(novelId)]);
            setNovel(n);
            setTotalChapters(chapters.filter(c => c.published).length);

            const access = await canReadChapter(wallet, novelId, chapterNum);
            setHasAccess(access);

            if (access) {
                const cached = getLocal<string>(NOVEL_CACHE_PREFIX + `${novelId}_${chapterNum}`, "");
                if (cached) { try { setChapter(JSON.parse(cached)); } catch { /* */ } }

                const offlineContent = getNovelDownloadContent("sakura", novelId, String(chapterNum));
                if (offlineContent) {
                    setChapter({ content: offlineContent, title: `Chapter ${chapterNum}`, word_count: offlineContent.split(/\s+/).length } as NovelChapter);
                }

                const ch = await getChapterContent(novelId, chapterNum);
                setChapter(ch);
                if (ch) setLocal(NOVEL_CACHE_PREFIX + `${novelId}_${chapterNum}`, JSON.stringify(ch));
            } else {
                setShowPaywall(true);
            }
        }
        setLoading(false);
    }, [novelId, chapterNum, chapterPath, wallet, isExternal]);

    useEffect(() => { loadChapter(); }, [loadChapter]);

    /* Save novel read history */
    useEffect(() => {
        if (loading || !hasAccess) return;
        const novelTitle = isExternal ? externalTitle : novel?.title;
        if (!novelTitle || !novelId) return;

        const chapterTitle = isExternal
            ? (allChapterPaths[chapterNum - 1]?.name || `Chapter ${chapterNum}`)
            : (chapter?.title || `Chapter ${chapterNum}`);

        saveNovelHistoryEntry({
            novelId,
            chapterNum,
            novelTitle,
            chapterTitle,
            cover: isExternal ? externalCover : novel?.cover_url,
            source: isExternal ? "external" : "sakura",
            externalPath: isExternal ? novelId : undefined,
            chapterPath: isExternal ? (chapterPath || allChapterPaths[chapterNum - 1]?.path) : undefined,
            timestamp: Date.now(),
        });
    }, [loading, hasAccess, isExternal, externalTitle, externalCover, novel, novelId, chapterNum, chapter, chapterPath, allChapterPaths]);

    /* Load bookmarks */
    useEffect(() => {
        setBookmarks(getChapterBookmarks(novelId, String(chapterNum)));
    }, [novelId, chapterNum]);

    /* Scroll position restore */
    useEffect(() => {
        if (!wallet || !novelId || !chapter) return;
        getProgress(wallet, novelId).then(prog => {
            if (prog && prog.chapter_number === chapterNum && prog.scroll_position > 0) {
                requestAnimationFrame(() => window.scrollTo({ top: prog.scroll_position }));
            }
        });
    }, [wallet, novelId, chapterNum, chapter]);

    /* Save scroll position */
    useEffect(() => {
        if (!wallet || !novelId || !hasAccess) return;
        const handleScroll = () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            saveTimerRef.current = setTimeout(() => { saveProgress(wallet, novelId, chapterNum, window.scrollY); }, 1500);
        };
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => { window.removeEventListener("scroll", handleScroll); if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    }, [wallet, novelId, chapterNum, hasAccess]);

    /* Completion detection */
    useEffect(() => {
        if (!wallet || !novelId || !hasAccess) return;
        const handleScroll = () => {
            if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 100) {
                recordMilestone(wallet, novelId, "complete", chapterNum);
            }
        };
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, [wallet, novelId, chapterNum, hasAccess]);

    /* Page / card mode calculations */
    useEffect(() => {
        if (!isPaginatedMode(settings.mode) || !pageContainerRef.current) return;
        const el = pageContainerRef.current;
        const recalc = () => {
            const total = Math.max(1, Math.ceil(el.scrollWidth / Math.max(1, el.clientWidth)));
            setTotalPages(total);
            setCurrentPage(0);
        };
        recalc();
        window.addEventListener("resize", recalc);
        return () => window.removeEventListener("resize", recalc);
    }, [settings.mode, chapter, settings.fontSize, settings.lineHeight, settings.padding]);

    /* TTS voices — load from native plugin or web */
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { ttsGetVoices } = await import("@/lib/tts");
            const v = await ttsGetVoices();
            if (!cancelled && v.length > 0) setVoices(v as any);
        })();
        if (typeof window !== "undefined" && window.speechSynthesis) {
            const loadVoices = () => {
                const v = window.speechSynthesis.getVoices();
                if (v.length > 0) setVoices(v);
            };
            window.speechSynthesis.onvoiceschanged = loadVoices;
        }
        return () => { cancelled = true; };
    }, []);

    /* Auto-scroll loop */
    useEffect(() => {
        if (!autoScrolling) {
            if (autoScrollRef.current) cancelAnimationFrame(autoScrollRef.current);
            return;
        }
        let last = performance.now();
        const tick = (now: number) => {
            const dt = (now - last) / 1000;
            last = now;
            window.scrollBy(0, settings.autoScrollSpeed * dt);
            autoScrollRef.current = requestAnimationFrame(tick);
        };
        autoScrollRef.current = requestAnimationFrame(tick);
        return () => { if (autoScrollRef.current) cancelAnimationFrame(autoScrollRef.current); };
    }, [autoScrolling, settings.autoScrollSpeed]);

    /* Selection context menu */
    useEffect(() => {
        const handleMouseUp = () => {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || !sel.toString().trim()) { setSelectionMenu(null); return; }
            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            setSelectionMenu({ x: rect.left + rect.width / 2, y: rect.top - 10, text: sel.toString() });
        };
        document.addEventListener("mouseup", handleMouseUp);
        document.addEventListener("touchend", handleMouseUp);
        return () => { document.removeEventListener("mouseup", handleMouseUp); document.removeEventListener("touchend", handleMouseUp); };
    }, []);

    /* ── Overlay auto-hide ── */
    const closeOverlay = useCallback(() => {
        setShowOverlay(false);
        setShowSettings(false);
        if (overlayAutoHideTimer.current) clearTimeout(overlayAutoHideTimer.current);
    }, []);

    const resetAutoHide = useCallback(() => {
        if (overlayAutoHideTimer.current) clearTimeout(overlayAutoHideTimer.current);
        overlayAutoHideTimer.current = setTimeout(() => closeOverlay(), 5000);
    }, [closeOverlay]);

    const toggleOverlay = useCallback(() => {
        setShowOverlay(prev => {
            const next = !prev;
            if (overlayAutoHideTimer.current) clearTimeout(overlayAutoHideTimer.current);
            if (next) {
                overlayAutoHideTimer.current = setTimeout(() => closeOverlay(), 5000);
            } else {
                setShowSettings(false);
            }
            return next;
        });
    }, [closeOverlay]);

    /* ── Scroll progress bar ── */
    useEffect(() => {
        const updateProgress = () => {
            const scrollTop = window.scrollY;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            setScrollProgress(docHeight > 0 ? (scrollTop / docHeight) * 100 : 0);
        };
        window.addEventListener("scroll", updateProgress, { passive: true });
        return () => window.removeEventListener("scroll", updateProgress);
    }, []);

    /* ── Ambient Audio ── */
    useEffect(() => {
        const audio = ambientAudioRef.current;
        if (!audio) return;
        audio.volume = ambientVolume;
        if (ambientPlaying) {
            audio.play().catch(() => {});
        } else {
            audio.pause();
        }
    }, [ambientPlaying, ambientVolume]);

    useEffect(() => {
        if (!ambientPlaying && !ambientVolume) return;
        const handleVisibility = () => {
            const audio = ambientAudioRef.current;
            if (!audio) return;
            if (document.hidden) audio.pause();
            else if (ambientPlaying) audio.play().catch(() => {});
        };
        document.addEventListener("visibilitychange", handleVisibility);
        return () => document.removeEventListener("visibilitychange", handleVisibility);
    }, [ambientPlaying, ambientVolume]);

    const saveAmbientSettings = useCallback((playing: boolean, volume: number) => {
        setLocal(STORAGE_KEYS.NOVEL_AMBIENT_SETTINGS, { playing, volume });
    }, []);

    /* Duck ambient audio when TTS is playing */
    useEffect(() => {
        const audio = ambientAudioRef.current;
        if (!audio) return;
        if (ttsPlaying) audio.volume = ambientVolume * 0.2;
        else audio.volume = ambientVolume;
    }, [ttsPlaying, ambientVolume]);

    /* ── TTS Functions (native plugin + web fallback) ── */

    const ttsNativeRef = useRef(false);
    const ttsChunkInfoRef = useRef({ index: 0, total: 0 });

    useEffect(() => {
        import("@/lib/tts").then(m => { ttsNativeRef.current = m.ttsIsNative(); });
    }, []);

    const ttsPlay = useCallback(async () => {
        const { ttsSpeak, ttsIsSupported } = await import("@/lib/tts");
        if (!ttsIsSupported()) { alert("Text-to-Speech is not supported on this device."); return; }

        const raw = isExternal ? htmlContent : (chapter?.content || "");
        const text = raw.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
        if (!text) { alert("No content to read aloud."); return; }

        setTtsPlaying(true);
        setTtsPaused(false);

        try {
            await ttsSpeak(text, {
                rate: ttsSettings.rate,
                pitch: ttsSettings.pitch,
                voiceURI: ttsSettings.voiceURI || undefined,
            }, {
                onEnd: () => { setTtsPlaying(false); setTtsPaused(false); },
                onChunk: (index, total) => { ttsChunkInfoRef.current = { index, total }; },
            });
        } catch (err: any) {
            console.error("TTS error:", err);
            setTtsPlaying(false);
            setTtsPaused(false);
            if (err?.message !== "TTS_NOT_SUPPORTED") {
                alert("TTS failed to start. Please check your device's Text-to-Speech settings.");
            }
        }
    }, [chapter, htmlContent, isExternal, ttsSettings]);

    const ttsPause = useCallback(() => {
        import("@/lib/tts").then(m => { m.ttsPauseWeb(); });
        setTtsPaused(true);
    }, []);

    const ttsResume = useCallback(() => {
        import("@/lib/tts").then(m => { m.ttsResumeWeb(); });
        setTtsPaused(false);
    }, []);

    const ttsStop = useCallback(async () => {
        const { ttsStopAll } = await import("@/lib/tts");
        await ttsStopAll();
        setTtsPlaying(false);
        setTtsPaused(false);
    }, []);

    useEffect(() => {
        return () => {
            import("@/lib/tts").then(m => m.ttsStopAll());
        };
    }, []);

    /* ── Bookmark / Highlight ── */
    const handleAddBookmark = (type: "bookmark" | "highlight", color?: string) => {
        if (!selectionMenu) return;
        const chId = String(chapterNum);
        const scrollPercent = window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const bm: NovelBookmark = {
            id: `bm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            novelId, chapterId: chId,
            source: "sakura",
            type, positionPercent: scrollPercent,
            selectedText: selectionMenu.text,
            color: color || "yellow",
            createdAt: Date.now(),
        };
        addNovelBookmark(bm);
        setBookmarks(prev => [...prev, bm]);
        setSelectionMenu(null);
        window.getSelection()?.removeAllRanges();
        if (wallet) schedulePushNovelBookmarks(wallet);
    };

    const handleRemoveBookmark = (id: string) => {
        removeNovelBookmark(id);
        setBookmarks(prev => prev.filter(b => b.id !== id));
        if (wallet) schedulePushNovelBookmarks(wallet);
    };

    /* ── Payment ── */
    const handlePay = async () => {
        if (!wallet || !publicKey || !signTransaction || !novel) return;
        setPaying(true); setPayError(null);
        try {
            const { tx, blockhash, lastValidBlockHeight } = await buildChapterPaymentTx(publicKey, novel.price_per_chapter, novel.creator_wallet);
            const signed = await signTransaction(tx);
            const { getConnection } = await import("@/lib/solana");
            const connection = getConnection();
            const sig = await connection.sendRawTransaction(signed.serialize());
            await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
            const unlockOk = await recordUnlock(wallet, novelId, chapterNum, sig, novel.price_per_chapter);
            if (!unlockOk) {
                const { setLocal, getLocal } = await import("@/lib/storage");
                const key = `novel_unlock_${novelId}_${chapterNum}`;
                const fallbacks = getLocal<Record<string, unknown>>("sakura_unlock_fallbacks", {});
                fallbacks[key] = { sig, wallet, novelId, chapterNum, price: novel.price_per_chapter, ts: Date.now() };
                setLocal("sakura_unlock_fallbacks", fallbacks);
                console.warn("Unlock recorded locally as fallback. TX:", sig);
            }
            setHasAccess(true); setShowPaywall(false);
            await loadChapter();
        } catch (e: unknown) { setPayError(e instanceof Error ? e.message : "Payment failed"); }
        setPaying(false);
    };

    /* ── Navigation ── */
    const goChapter = (num: number) => {
        ttsStop();
        setAutoScrolling(false);
        if (isExternal) {
            const cp = allChapterPaths[num - 1]?.path || "";
            router.push(`/novel/read?source=external&path=${encodeURIComponent(novelId)}&chapter=${num}${cp ? `&chapterPath=${encodeURIComponent(cp)}` : ""}`);
        } else {
            router.push(`/novel/read?novel=${novelId}&chapter=${num}`);
        }
    };

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") { e.preventDefault(); router.back(); }
            if (e.key === "ArrowRight" && chapterNum < totalChapters) { e.preventDefault(); goChapter(chapterNum + 1); }
            if (e.key === "ArrowLeft" && chapterNum > 1) { e.preventDefault(); goChapter(chapterNum - 1); }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [router, chapterNum, totalChapters]);

    const goPage = (delta: number) => {
        if (!pageContainerRef.current) return;
        const next = Math.max(0, Math.min(totalPages - 1, currentPage + delta));
        setCurrentPage(next);
        pageContainerRef.current.style.transform = `translateX(-${next * 100}%)`;
    };

    const handleDoubleTap = (() => {
        let lastTap = 0;
        return () => {
            const now = Date.now();
            if (now - lastTap < 300) toggleOverlay();
            lastTap = now;
        };
    })();

    /* ── EPUB Export ── */
    const handleExportEpub = async () => {
        const title = novel?.title || "Novel";
        const author = novel?.creator_wallet || "Unknown";
        const { getNovelDownloadsIndex } = await import("@/lib/storage");
        const idx = getNovelDownloadsIndex().filter(e => e.novelId === novelId && e.source === "sakura");
        const chapterContents: { title: string; content: string }[] = [];
        for (const entry of idx) {
            const c = getNovelDownloadContent("sakura", novelId, entry.chapterId);
            if (c) chapterContents.push({ title: entry.chapterName, content: c });
        }
        if (chapterContents.length === 0) {
            alert("No downloaded chapters found. Download chapters first to export as EPUB.");
            return;
        }
        await exportEpub(title, author, chapterContents);
    };

    /* ── Rendered Content ── */
    const displayContent = useMemo(() => {
        if (isExternal && htmlContent) {
            return settings.bionicReading ? applyBionic(htmlContent) : htmlContent;
        }
        let text = chapter?.content || "";
        if (settings.bionicReading && text) {
            text = applyBionic(text);
        }
        return text;
    }, [chapter, htmlContent, isExternal, settings.bionicReading]);

    const isHtml = isExternal && htmlContent.includes("<");

    const theme = THEME_MAP[settings.theme] || THEME_MAP.dark;
    const fontFamily = FONT_MAP[settings.fontFamily] || FONT_MAP.serif;
    const backUrl = isExternal ? `/novel/details?source=external&path=${encodeURIComponent(novelId)}` : `/novel/details?id=${novelId}`;

    /* ── Focus Mode (IntersectionObserver) ── */
    useEffect(() => {
        if (focusObserverRef.current) { focusObserverRef.current.disconnect(); focusObserverRef.current = null; }
        if (!settings.focusMode || isPaginatedMode(settings.mode) || !contentRef.current) return;

        const container = contentRef.current;
        const elements = container.querySelectorAll("p, h1, h2, h3, h4, h5, h6, blockquote, li");
        if (elements.length === 0) return;

        container.classList.add("focus-mode-on");

        let focusedEl: Element | null = null;
        const ratios = new Map<Element, number>();

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => ratios.set(entry.target, entry.intersectionRatio));
            let best: Element | null = null;
            let bestRatio = 0;
            ratios.forEach((ratio, el) => {
                if (ratio > bestRatio) { bestRatio = ratio; best = el; }
            });
            if (best !== null && best !== focusedEl) {
                if (focusedEl) (focusedEl as HTMLElement).classList.remove("reader-focused");
                (best as HTMLElement).classList.add("reader-focused");
                focusedEl = best;
            }
        }, { rootMargin: "-35% 0px -35% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] });

        elements.forEach(el => observer.observe(el));
        focusObserverRef.current = observer;

        return () => {
            observer.disconnect();
            container.classList.remove("focus-mode-on");
            elements.forEach(el => el.classList.remove("reader-focused"));
        };
    }, [settings.focusMode, settings.mode, displayContent]);

    /* ── Render ── */

    if (loading) {
        return (
            <div style={{ minHeight: "100vh", background: theme.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div className="loading-skeleton" style={{ width: 200, height: 24, borderRadius: 8 }} />
            </div>
        );
    }

    if (showPaywall && novel) {
        return (
            <div style={{ minHeight: "100vh", background: theme.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                <div style={{ maxWidth: 380, width: "100%", textAlign: "center", padding: "32px 24px", borderRadius: 24, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <p style={{ fontSize: 48, margin: "0 0 16px" }}>🔒</p>
                    <h2 style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: "0 0 8px" }}>Chapter {chapterNum} is Locked</h2>
                    <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 24px" }}>
                        Unlock for <strong style={{ color: "var(--sakura-pink)" }}>{novel.price_per_chapter} $SAKURA</strong>
                    </p>
                    {wallet ? (
                        <button onClick={handlePay} disabled={paying} style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: "linear-gradient(135deg, var(--sakura-pink), var(--purple-accent))", color: "#fff", fontWeight: 700, fontSize: 15, cursor: paying ? "wait" : "pointer", opacity: paying ? 0.6 : 1 }}>
                            {paying ? "Processing..." : `Unlock — ${novel.price_per_chapter} 🌸`}
                        </button>
                    ) : (<p style={{ fontSize: 13, color: "var(--sakura-pink)" }}>Connect wallet to unlock</p>)}
                    {payError && <p style={{ color: "#ef4444", fontSize: 12, marginTop: 12 }}>{payError}</p>}
                    <Link href={backUrl} style={{ display: "block", marginTop: 16, color: "var(--text-muted)", fontSize: 13, textDecoration: "none" }}>Back to Novel</Link>
                </div>
            </div>
        );
    }

    const chapterTitle = isExternal
        ? (allChapterPaths[chapterNum - 1]?.name || `Chapter ${chapterNum}`)
        : (chapter?.title || `Chapter ${chapterNum}`);
    const novelTitle = isExternal ? externalTitle : (novel?.title || "");

    return (
        <div
            className="novel-reader-shell"
            data-reader-theme={settings.theme}
            style={{
                minHeight: "100vh",
                background: theme.bg,
                color: theme.text,
                transition: "all 0.3s ease",
                ["--novel-reader-bg" as string]: theme.bg,
                ["--novel-reader-text" as string]: theme.text,
                ["--novel-reader-secondary" as string]: theme.secondary,
            }}
            onClick={handleDoubleTap}
        >

            {/* Reading progress bar */}
            <div className="novel-reader-progress" style={{ width: `${scrollProgress}%` }} />

            {/* Ambient Audio */}
            <audio ref={ambientAudioRef} src="/audio/sakuracalmness.mp3" loop preload="none" />

            {/* Selection Context Menu */}
            {selectionMenu && (
                <div
                    className="novel-selection-menu"
                    style={{
                        left: Math.min(selectionMenu.x - 100, window.innerWidth - 220),
                        top: Math.max(selectionMenu.y - 50, 10),
                    }}
                    onClick={e => e.stopPropagation()}
                >
                    <button onClick={() => handleAddBookmark("bookmark")} className="novel-selection-action is-primary">Bookmark</button>
                    {(["yellow", "green", "blue", "pink"] as const).map(c => (
                        <button key={c} onClick={() => handleAddBookmark("highlight", c)} className={`novel-selection-swatch is-${c}`} title={`Highlight ${c}`} />
                    ))}
                    <button onClick={() => { navigator.clipboard.writeText(selectionMenu.text); setSelectionMenu(null); }} className="novel-selection-action">Copy</button>
                </div>
            )}

            {/* Overlay (manga-reader style) */}
            <div className={`reader-overlay ${showOverlay ? "visible" : ""}`} onClick={() => closeOverlay()}>
                {/* Top bar */}
                <div className="reader-overlay-header" onClick={e => e.stopPropagation()}>
                    <button className="reader-overlay-back" onClick={() => router.push(backUrl)} aria-label="Back">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                    </button>
                    <span className="reader-overlay-title">{chapterTitle}</span>
                    <span className="reader-overlay-page-info">Ch {chapterNum}/{totalChapters}</span>
                </div>

                {/* Bottom bar */}
                <div className="reader-overlay-footer" onClick={e => e.stopPropagation()}>
                    {ttsPlaying && (
                        <div style={{ display: "flex", gap: 8, marginBottom: 8, justifyContent: "center", alignItems: "center" }}>
                            <span style={{ fontSize: 11, color: "rgba(255,107,157,0.8)", fontWeight: 600 }}>
                                {ttsPaused ? "Paused" : "Reading aloud..."}
                            </span>
                            {!ttsNativeRef.current && (
                                <button onClick={ttsPaused ? ttsResume : ttsPause} className="reader-overlay-setting-btn" style={{ padding: "4px 12px", fontSize: 11 }}>
                                    {ttsPaused ? "Resume" : "Pause"}
                                </button>
                            )}
                            <button onClick={ttsStop} className="reader-overlay-setting-btn" style={{ padding: "4px 12px", fontSize: 11, background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>Stop</button>
                        </div>
                    )}

                    {autoScrolling && (
                        <div style={{ textAlign: "center", marginBottom: 8 }}>
                            <button onClick={() => setAutoScrolling(false)} className="reader-overlay-setting-btn" style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80" }}>
                                Auto-scrolling — Tap to stop
                            </button>
                        </div>
                    )}

                    {/* Chapter nav row */}
                    <div className="reader-overlay-slider-row">
                        <button className="reader-overlay-skip-btn" disabled={chapterNum <= 1} onClick={() => { goChapter(chapterNum - 1); resetAutoHide(); }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                        </button>
                        <span className="reader-overlay-page-num">{chapterNum}</span>
                        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>/</span>
                        <span className="reader-overlay-page-num">{totalChapters}</span>
                        <button className="reader-overlay-skip-btn" disabled={chapterNum >= totalChapters} onClick={() => { goChapter(chapterNum + 1); resetAutoHide(); }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                        </button>
                    </div>

                    {/* Settings quick-toggle row */}
                    <div className="reader-overlay-settings">
                        <button className="reader-overlay-setting-btn" onClick={() => { updateSetting("fontSize", Math.max(12, settings.fontSize - 2)); resetAutoHide(); }}>A-</button>
                        <button className="reader-overlay-setting-btn" onClick={() => { updateSetting("fontSize", Math.min(32, settings.fontSize + 2)); resetAutoHide(); }}>A+</button>
                        <button className="reader-overlay-setting-btn" onClick={() => {
                            const themes: ReaderSettings["theme"][] = ["dark", "light", "sepia", "midnight", "sakura"];
                            const idx = themes.indexOf(settings.theme);
                            updateSetting("theme", themes[(idx + 1) % themes.length]);
                            resetAutoHide();
                        }}>
                            {settings.theme.charAt(0).toUpperCase() + settings.theme.slice(1)}
                        </button>
                        <button className={`reader-overlay-setting-btn ${isPaginatedMode(settings.mode) ? "active" : ""}`} onClick={() => { setShowSettings(true); resetAutoHide(); }}>
                            {settings.mode === "scroll" ? "Scroll" : "Cards"}
                        </button>
                        <button className={`reader-overlay-setting-btn ${ttsPlaying ? "active" : ""}`} onClick={() => { ttsPlaying ? ttsStop() : ttsPlay(); resetAutoHide(); }}>
                            {ttsPlaying ? "Stop" : "TTS"}
                        </button>
                        <button className="reader-overlay-setting-btn" onClick={() => { setShowTradeModal(true); resetAutoHide(); }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                            </svg>
                            Trade
                        </button>
                        <button className="reader-overlay-setting-btn" onClick={() => { setShowSettings(s => !s); resetAutoHide(); }}>
                            More
                        </button>
                    </div>
                </div>
            </div>

            <TradeCheckModal isOpen={showTradeModal} onClose={() => setShowTradeModal(false)} />

            <ReaderFloatingChrome
                onBack={() => router.push(backUrl)}
                onSettings={() => {
                    setShowSettings(true);
                    setShowOverlay(false);
                }}
                showPageNav={isPaginatedMode(settings.mode)}
                onPrevPage={() => goPage(-1)}
                onNextPage={() => goPage(1)}
                hasPrevPage={currentPage > 0}
                hasNextPage={currentPage < totalPages - 1}
                onPrevChapter={chapterNum > 1 ? () => goChapter(chapterNum - 1) : undefined}
                onNextChapter={chapterNum < totalChapters ? () => goChapter(chapterNum + 1) : undefined}
                hasPrevChapter={chapterNum > 1}
                hasNextChapter={chapterNum < totalChapters}
                backLabel="Novel details"
            />

            {/* Full Settings Panel */}
            {showSettings && (<>
                <div className="reader-settings-backdrop" onClick={() => setShowSettings(false)} />
                <div className="reader-settings-panel novel-reader-settings-panel" onClick={e => e.stopPropagation()}>
                    <div className="reader-settings-head">
                        <h3>Reading Settings</h3>
                        <button type="button" className="reader-settings-close" onClick={() => setShowSettings(false)}>Done</button>
                    </div>
                    <button type="button" className="reader-settings-back-link" onClick={() => { setShowSettings(false); router.push(backUrl); }}>
                        ← Back to novel details
                    </button>
                    <div className="novel-reader-settings-tabs">
                        {(["display", "tts", "advanced"] as const).map(tab => (
                            <button key={tab} type="button" onClick={() => { setActiveSettingsTab(tab); resetAutoHide(); }} className={`novel-reader-settings-tab${activeSettingsTab === tab ? " active" : ""}`}>
                                    {tab}
                            </button>
                        ))}
                    </div>

                    {activeSettingsTab === "display" && (
                        <>
                            <div style={{ marginBottom: 14 }}>
                                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>Font Size: {settings.fontSize}px</label>
                                <input type="range" min={12} max={32} step={1} value={settings.fontSize} onChange={e => updateSetting("fontSize", parseInt(e.target.value))} style={{ width: "100%", marginTop: 4, accentColor: "var(--sakura-pink)" }} />
                            </div>
                            <div style={{ marginBottom: 14 }}>
                                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>Line Height: {settings.lineHeight}</label>
                                <input type="range" min={1.2} max={2.6} step={0.1} value={settings.lineHeight} onChange={e => updateSetting("lineHeight", parseFloat(e.target.value))} style={{ width: "100%", marginTop: 4, accentColor: "var(--sakura-pink)" }} />
                            </div>
                            <div style={{ marginBottom: 14 }}>
                                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>Padding: {settings.padding}px</label>
                                <input type="range" min={8} max={48} step={2} value={settings.padding} onChange={e => updateSetting("padding", parseInt(e.target.value))} style={{ width: "100%", marginTop: 4, accentColor: "var(--sakura-pink)" }} />
                            </div>
                            <div style={{ marginBottom: 14 }}>
                                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, display: "block", marginBottom: 6 }}>Font</label>
                                <div style={{ display: "flex", gap: 6 }}>
                                    {(["serif", "sans-serif", "monospace"] as const).map(f => (
                                        <button key={f} onClick={() => updateSetting("fontFamily", f)} style={{ flex: 1, padding: "7px 4px", borderRadius: 8, fontSize: 11, fontWeight: 600, fontFamily: FONT_MAP[f], border: settings.fontFamily === f ? "1px solid var(--sakura-pink)" : "1px solid rgba(255,255,255,0.1)", background: settings.fontFamily === f ? "rgba(255,107,157,0.15)" : "rgba(255,255,255,0.04)", color: settings.fontFamily === f ? "var(--sakura-pink)" : "rgba(255,255,255,0.6)", cursor: "pointer" }}>
                                            {f === "sans-serif" ? "Sans" : f === "monospace" ? "Mono" : "Serif"}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div style={{ marginBottom: 14 }}>
                                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, display: "block", marginBottom: 6 }}>Text Align</label>
                                <div style={{ display: "flex", gap: 6 }}>
                                    {(["left", "center", "right", "justify"] as const).map(a => (
                                        <button key={a} onClick={() => updateSetting("textAlign", a)} style={{ flex: 1, padding: "7px 4px", borderRadius: 8, fontSize: 11, fontWeight: 600, border: settings.textAlign === a ? "1px solid var(--sakura-pink)" : "1px solid rgba(255,255,255,0.1)", background: settings.textAlign === a ? "rgba(255,107,157,0.15)" : "rgba(255,255,255,0.04)", color: settings.textAlign === a ? "var(--sakura-pink)" : "rgba(255,255,255,0.6)", cursor: "pointer", textTransform: "capitalize" }}>
                                            {a}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div style={{ marginBottom: 14 }}>
                                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, display: "block", marginBottom: 6 }}>Theme</label>
                                <div style={{ display: "flex", gap: 6 }}>
                                    {(["dark", "light", "sepia", "midnight", "sakura"] as const).map(t => (
                                        <button key={t} onClick={() => updateSetting("theme", t)} style={{ flex: 1, padding: "8px 2px", borderRadius: 8, fontSize: 10, fontWeight: 600, background: THEME_MAP[t].bg, color: THEME_MAP[t].text, border: settings.theme === t ? "2px solid var(--sakura-pink)" : "2px solid rgba(255,255,255,0.1)", cursor: "pointer", textTransform: "capitalize" }}>
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div style={{ marginBottom: 14 }}>
                                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, display: "block", marginBottom: 6 }}>Reading Mode</label>
                                <ReadingModePicker
                                    value={settings.mode}
                                    onChange={(mode) => updateSetting("mode", mode)}
                                    compact
                                />
                            </div>
                            <div style={{ marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <label style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>Focus Mode</label>
                                <button onClick={() => updateSetting("focusMode", !settings.focusMode)} style={{ padding: "6px 16px", borderRadius: 8, border: "none", background: settings.focusMode ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.06)", color: settings.focusMode ? "#a78bfa" : "var(--text-muted)", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                                    {settings.focusMode ? "ON" : "OFF"}
                                </button>
                            </div>
                        </>
                    )}

                    {activeSettingsTab === "tts" && (
                        <>
                            {voices.length === 0 && (
                                <div style={{ marginBottom: 14, padding: "8px 12px", borderRadius: 8, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)" }}>
                                    <p style={{ margin: 0, fontSize: 11, color: "#fbbf24" }}>Loading voices... If none appear, your device may not support TTS.</p>
                                </div>
                            )}
                            <div style={{ marginBottom: 14 }}>
                                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, display: "block", marginBottom: 6 }}>Voice ({voices.length} available)</label>
                                <select value={ttsSettings.voiceURI} onChange={e => updateTTSSetting("voiceURI", e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#fff", fontSize: 12 }}>
                                    <option value="">System Default</option>
                                    {voices.filter(v => v.lang.startsWith("en")).map(v => (<option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>))}
                                    {voices.filter(v => !v.lang.startsWith("en")).length > 0 && (
                                        <optgroup label="Other Languages">
                                            {voices.filter(v => !v.lang.startsWith("en")).map(v => (<option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>))}
                                        </optgroup>
                                    )}
                                </select>
                            </div>
                            <div style={{ marginBottom: 14 }}>
                                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>Speed: {ttsSettings.rate}x</label>
                                <input type="range" min={0.5} max={3} step={0.1} value={ttsSettings.rate} onChange={e => updateTTSSetting("rate", parseFloat(e.target.value))} style={{ width: "100%", marginTop: 4, accentColor: "var(--sakura-pink)" }} />
                            </div>
                            <div style={{ marginBottom: 14 }}>
                                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>Pitch: {ttsSettings.pitch}</label>
                                <input type="range" min={0.5} max={2} step={0.1} value={ttsSettings.pitch} onChange={e => updateTTSSetting("pitch", parseFloat(e.target.value))} style={{ width: "100%", marginTop: 4, accentColor: "var(--sakura-pink)" }} />
                            </div>
                            <button onClick={ttsPlaying ? ttsStop : ttsPlay} style={{ width: "100%", padding: "12px", borderRadius: 12, border: "none", background: ttsPlaying ? "rgba(239,68,68,0.2)" : "linear-gradient(135deg, var(--sakura-pink), rgba(139,92,246,0.8))", color: ttsPlaying ? "#ef4444" : "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                                {ttsPlaying ? "Stop Reading" : "Read Aloud"}
                            </button>
                            {ttsPlaying && ttsChunkInfoRef.current.total > 1 && (
                                <p style={{ margin: "8px 0 0", fontSize: 10, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
                                    Reading section {ttsChunkInfoRef.current.index + 1} of {ttsChunkInfoRef.current.total}
                                </p>
                            )}
                        </>
                    )}

                    {activeSettingsTab === "advanced" && (
                        <>
                            <div style={{ marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <label style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>Bionic Reading</label>
                                <button onClick={() => updateSetting("bionicReading", !settings.bionicReading)} style={{ padding: "6px 16px", borderRadius: 8, border: "none", background: settings.bionicReading ? "rgba(255,107,157,0.3)" : "rgba(255,255,255,0.06)", color: settings.bionicReading ? "var(--sakura-pink)" : "var(--text-muted)", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                                    {settings.bionicReading ? "ON" : "OFF"}
                                </button>
                            </div>
                            <div style={{ marginBottom: 14 }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                                    <label style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>Auto-Scroll</label>
                                    <button onClick={() => setAutoScrolling(!autoScrolling)} style={{ padding: "6px 16px", borderRadius: 8, border: "none", background: autoScrolling ? "rgba(74,222,128,0.3)" : "rgba(255,255,255,0.06)", color: autoScrolling ? "#4ade80" : "var(--text-muted)", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                                        {autoScrolling ? "ON" : "OFF"}
                                    </button>
                                </div>
                                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Speed: {settings.autoScrollSpeed} px/s</label>
                                <input type="range" min={10} max={200} step={5} value={settings.autoScrollSpeed} onChange={e => updateSetting("autoScrollSpeed", parseInt(e.target.value))} style={{ width: "100%", marginTop: 4, accentColor: "var(--sakura-pink)" }} />
                            </div>
                            <div style={{ marginBottom: 14, padding: "12px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                                    <label style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>Ambient Music</label>
                                    <button onClick={() => {
                                        const next = !ambientPlaying;
                                        setAmbientPlaying(next);
                                        saveAmbientSettings(next, ambientVolume);
                                    }} style={{ padding: "6px 16px", borderRadius: 8, border: "none", background: ambientPlaying ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.06)", color: ambientPlaying ? "#a78bfa" : "var(--text-muted)", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                                        {ambientPlaying ? "ON" : "OFF"}
                                    </button>
                                </div>
                                {ambientPlaying && (
                                    <div>
                                        <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Volume: {Math.round(ambientVolume * 100)}%</label>
                                        <input type="range" min={0} max={1} step={0.05} value={ambientVolume} onChange={e => {
                                            const v = parseFloat(e.target.value);
                                            setAmbientVolume(v);
                                            saveAmbientSettings(ambientPlaying, v);
                                        }} style={{ width: "100%", marginTop: 4, accentColor: "#a78bfa" }} />
                                    </div>
                                )}
                            </div>
                            <div style={{ marginBottom: 14 }}>
                                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, display: "block", marginBottom: 6 }}>Custom CSS</label>
                                <textarea value={settings.customCSS} onChange={e => updateSetting("customCSS", e.target.value)} placeholder=".reader-content { /* your styles */ }" style={{ width: "100%", minHeight: 80, padding: 8, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)", color: "#e0d8ea", fontSize: 11, fontFamily: "monospace", resize: "vertical" }} />
                            </div>
                            <button onClick={handleExportEpub} style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                                Export EPUB
                            </button>
                        </>
                    )}
                </div>
            </>)}

            {/* Custom CSS injection */}
            {settings.customCSS && <style dangerouslySetInnerHTML={{ __html: settings.customCSS }} />}

            {/* Chapter Content */}
            {isPaginatedMode(settings.mode) ? (
                <div
                    className="novel-reader-card-shell"
                    style={{ width: "100%", height: "100vh", overflow: "hidden", position: "relative" }}
                >
                    <div ref={pageContainerRef} className="novel-reader-page-track" style={{
                        columnWidth: `${(typeof window !== "undefined" ? window.innerWidth : 800) - settings.padding * 2}px`,
                        columnGap: settings.padding * 2,
                        height: `calc(100vh - 80px)`,
                        padding: `40px ${settings.padding}px`,
                        transform: "translateX(0)",
                        transition: "transform 0.3s ease",
                        fontSize: settings.fontSize, fontFamily, lineHeight: settings.lineHeight,
                        color: theme.text, textAlign: settings.textAlign,
                    }}>
                        <h1 style={{ fontSize: settings.fontSize + 6, fontWeight: 800, lineHeight: 1.3, marginBottom: 8, color: theme.text }}>{chapterTitle}</h1>
                        <div ref={contentRef} className="reader-content" style={{ whiteSpace: isHtml ? "normal" : "pre-wrap", wordWrap: "break-word" }}
                            dangerouslySetInnerHTML={(settings.bionicReading || isHtml) ? { __html: displayContent } : undefined}>
                            {!(settings.bionicReading || isHtml) ? displayContent : undefined}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="novel-reader-scroll-shell">
                    <div className="novel-reader-scroll">
                        <div className="novel-reader-meta">
                            <p className="novel-reader-kicker">{novelTitle || "Novel"}</p>
                            <h1 className="novel-reader-chapter-title" style={{ fontSize: settings.fontSize + 8, fontFamily, color: theme.text }}>{chapterTitle}</h1>
                            <p className="novel-reader-chapter-meta" style={{ color: theme.secondary }}>
                        Chapter {chapterNum}{chapter?.word_count ? ` · ${chapter.word_count.toLocaleString()} words` : ""}
                    </p>

                        </div>

                    {bookmarks.filter(b => b.type === "highlight").length > 0 && (
                        <div className="novel-reader-highlights">
                            <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, color: theme.secondary }}>Highlights</p>
                            {bookmarks.filter(b => b.type === "highlight").map(bm => (
                                <div key={bm.id} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
                                    <span style={{ width: 12, height: 12, borderRadius: 3, flexShrink: 0, marginTop: 2, background: bm.color === "yellow" ? "rgba(250,204,21,0.6)" : bm.color === "green" ? "rgba(74,222,128,0.6)" : bm.color === "blue" ? "rgba(96,165,250,0.6)" : "rgba(244,114,182,0.6)" }} />
                                    <p style={{ margin: 0, fontSize: 11, color: theme.secondary, flex: 1, lineHeight: 1.4 }}>&ldquo;{bm.selectedText?.slice(0, 80)}...&rdquo;</p>
                                    <button onClick={() => handleRemoveBookmark(bm.id)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 10, cursor: "pointer", flexShrink: 0 }}>x</button>
                                </div>
                            ))}
                        </div>
                    )}

                    <article className="novel-reader-article" style={{ padding: `clamp(24px, 3.2vw, 36px) ${settings.padding}px` }}>
                        <div ref={contentRef} style={{ fontSize: settings.fontSize, fontFamily, lineHeight: settings.lineHeight, color: theme.text, whiteSpace: isHtml ? "normal" : "pre-wrap", wordWrap: "break-word", textAlign: settings.textAlign }}
                            className="reader-content"
                            dangerouslySetInnerHTML={(settings.bionicReading || isHtml) ? { __html: displayContent } : undefined}>
                            {!(settings.bionicReading || isHtml) ? displayContent : undefined}
                        </div>
                    </article>

                    {/* End-of-chapter nav */}
                    <div className="novel-reader-end-nav" style={{ borderTopColor: theme.secondary }}>
                        {chapterNum > 1 && (
                            <button onClick={() => goChapter(chapterNum - 1)} style={{ flex: 1, padding: "14px", borderRadius: 14, border: `1px solid ${theme.secondary}`, background: "transparent", color: theme.text, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                                Previous Chapter
                            </button>
                        )}
                        {chapterNum < totalChapters && (
                            <button onClick={() => goChapter(chapterNum + 1)} style={{ flex: 1, padding: "14px", borderRadius: 14, border: "none", background: "var(--sakura-pink)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                                Next Chapter
                            </button>
                        )}
                    </div>

                    {chapterNum >= totalChapters && (
                        <div style={{ textAlign: "center", marginTop: 40 }}>
                            <p style={{ fontSize: 14, color: theme.secondary }}>You&apos;ve reached the latest chapter.</p>
                            <Link href={backUrl} style={{ color: "var(--sakura-pink)", fontSize: 14, marginTop: 8, display: "inline-block" }}>Back to Novel</Link>
                        </div>
                    )}

                    <div className="novel-reader-comments">
                        <NovelComments novelId={novelId} chapterNumber={chapterNum} />
                    </div>

                    <div style={{ height: 60 }} />
                    </div>
                </div>
            )}
        </div>
    );
}

export default function NovelReaderPage() {
    return (
        <Suspense fallback={<div style={{ minHeight: "100vh", background: "#0a0812", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>Loading...</div>}>
            <NovelReaderContent />
        </Suspense>
    );
}
