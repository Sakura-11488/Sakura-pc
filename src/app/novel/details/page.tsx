"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import {
    getNovel, getChapters, getProgress, getUserUnlocks, canReadChapter,
    getMilestones, type Novel, type NovelChapter, type NovelMilestone,
} from "@/lib/novel";
import { parseNovelDetail, getHDCover, type AllNovelDetail, type AllNovelChapter } from "@/lib/allnovel";
import { checkPassStatus } from "@/lib/pass-check";
import { truncateAddress } from "@/lib/solana";
import {
    addNovelDownload, getNovelDownloadsIndex, removeNovelDownload,
    isInLibrary, type NovelDownloadEntry,
} from "@/lib/storage";
import NovelDetailHero from "@/components/NovelDetailHero";

const SaveToLibraryModal = dynamic(() => import("@/components/SaveToLibraryModal"), { ssr: false });
const NovelComments = dynamic(() => import("@/components/NovelComments"), { ssr: false });
const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

function BookIcon({ size = 40 }: { size?: number }) {
    const [animData, setAnimData] = useState<object | null>(null);
    useEffect(() => {
        fetch("/icons/wired-outline-779-books-hover-hit.json").then(r => r.json()).then(setAnimData).catch(() => {});
    }, []);
    if (!animData) return null;
    return <Lottie animationData={animData} loop autoplay style={{ width: size, height: size, opacity: 0.4 }} />;
}

/* ═══════ External Novel Details ═══════ */

function ExternalDetailsContent() {
    const params = useSearchParams();
    const path = params.get("path") || "";

    const [detail, setDetail] = useState<AllNovelDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [showLibrary, setShowLibrary] = useState(false);
    const [inLibrary, setInLibrary] = useState(false);
    const [downloadedSet, setDownloadedSet] = useState<Set<string>>(new Set());
    const [downloading, setDownloading] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (path) setInLibrary(isInLibrary(path, 'novel'));
    }, [path]);

    useEffect(() => {
        if (!path) return;
        setLoading(true);
        parseNovelDetail(path).then(async (d) => {
            setDetail(d);
            setLoading(false);
            if (d.name) {
                const hd = await getHDCover(d.name);
                if (hd) setDetail(prev => prev ? { ...prev, cover: hd } : prev);
            }
        }).catch(() => setLoading(false));
    }, [path]);

    useEffect(() => {
        const index = getNovelDownloadsIndex();
        const set = new Set(index.filter(e => e.source === "sakura" && e.novelId === path).map(e => e.chapterId));
        setDownloadedSet(set);
    }, [path]);

    const handleDownloadChapter = async (ch: AllNovelChapter) => {
        if (!detail) return;
        setDownloading(prev => new Set(prev).add(ch.path));
        try {
            const { parseChapterContent } = await import("@/lib/allnovel");
            const content = await parseChapterContent(ch.path);
            const entry: NovelDownloadEntry = {
                novelId: path, chapterId: ch.path, chapterNumber: ch.chapterNumber,
                chapterName: ch.name, novelTitle: detail.name, coverUrl: detail.cover,
                source: "sakura", downloadedAt: Date.now(), sizeBytes: new Blob([content]).size,
            };
            addNovelDownload(entry, content);
            setDownloadedSet(prev => new Set(prev).add(ch.path));
        } catch (e) { console.error("Download failed:", e); }
        setDownloading(prev => { const n = new Set(prev); n.delete(ch.path); return n; });
    };

    const handleRemoveDownload = (ch: AllNovelChapter) => {
        removeNovelDownload("sakura", path, ch.path);
        setDownloadedSet(prev => { const n = new Set(prev); n.delete(ch.path); return n; });
    };

    if (loading) {
        return (
            <>
                <main className="main-content">
                    <section className="section" style={{ paddingTop: 60, textAlign: "center" }}>
                        <div className="loading-skeleton" style={{ width: "100%", maxWidth: 400, height: 300, borderRadius: 20, margin: "0 auto" }} />
                        <div className="loading-skeleton" style={{ width: 200, height: 24, borderRadius: 8, margin: "16px auto" }} />
                    </section>
                </main>
            </>
        );
    }

    if (!detail) {
        return (
            <>
                <main className="main-content">
                    <section className="section" style={{ paddingTop: 80, textAlign: "center" }}>
                        <p style={{ color: "var(--text-muted)", fontSize: 16 }}>Novel not found.</p>
                        <Link href="/novel" style={{ color: "var(--sakura-pink)", fontSize: 14, marginTop: 16, display: "inline-block" }}>Back to Browse</Link>
                    </section>
                </main>
            </>
        );
    }

    return (
        <>
            <main className="main-content manga-detail novel-detail">
                <BackButton href="/novel" />
                <NovelDetailHero
                    title={detail.name}
                    cover={detail.cover}
                    author={detail.author}
                    status={detail.status}
                    genres={detail.genres?.split(",").map((g) => g.trim()).filter(Boolean) || []}
                    stats={[
                        { label: "Chapters", value: detail.chapters.length, accent: "pink" },
                        { label: "All Chapters", value: "FREE", accent: "green" },
                    ]}
                    readHref={detail.chapters.length > 0 ? `/novel/read?source=external&path=${encodeURIComponent(path)}&chapter=1` : undefined}
                    inLibrary={inLibrary}
                    onSave={() => setShowLibrary(true)}
                    synopsis={detail.summary}
                />

                <section className="md-chapters">
                    <div className="md-ch-head">
                        <h2 className="md-ch-title">Chapters<span className="md-ch-count">{detail.chapters.length}</span></h2>
                    </div>
                    <div className="md-ch-list">
                        {detail.chapters.map(ch => {
                            const isDownloaded = downloadedSet.has(ch.path);
                            const isDownloading = downloading.has(ch.path);
                            return (
                                <div key={ch.path} className="novel-md-ch-row-wrap">
                                    <Link
                                        href={`/novel/read?source=external&path=${encodeURIComponent(path)}&chapter=${ch.chapterNumber}&chapterPath=${encodeURIComponent(ch.path)}`}
                                        className="md-ch-row"
                                    >
                                        <span className="md-ch-num">{ch.chapterNumber}</span>
                                        <div className="md-ch-main">
                                            <span className="md-ch-name">{ch.name || `Chapter ${ch.chapterNumber}`}</span>
                                        </div>
                                    </Link>
                                    <button
                                        type="button"
                                        className={`dl-btn${isDownloaded ? " dl-completed" : ""}`}
                                        onClick={() => isDownloaded ? handleRemoveDownload(ch) : handleDownloadChapter(ch)}
                                        disabled={isDownloading}
                                        title={isDownloaded ? "Remove download" : "Download for offline"}
                                        aria-label={isDownloaded ? "Remove download" : "Download chapter"}
                                    >
                                        {isDownloading ? "…" : isDownloaded ? (
                                            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                                        ) : (
                                            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></svg>
                                        )}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {showLibrary && (
                    <SaveToLibraryModal
                        item={{ id: path, title: detail.name, image: detail.cover, type: "novel", source: "external", addedAt: Date.now() }}
                        onClose={() => { setShowLibrary(false); setInLibrary(isInLibrary(path, 'novel')); }}
                    />
                )}
            </main>
        </>
    );
}

/* ═══════ Sakura (Creator) Details ═══════ */

function SakuraDetailsContent() {
    const params = useSearchParams();
    const novelId = params.get("id") || "";
    const { publicKey } = useWallet();
    const wallet = publicKey?.toBase58() || null;

    const [novel, setNovel] = useState<Novel | null>(null);
    const [chapters, setChapters] = useState<Omit<NovelChapter, "content">[]>([]);
    const [loading, setLoading] = useState(true);
    const [progress, setProgress] = useState<{ chapter_number: number; scroll_position: number } | null>(null);
    const [unlockedChapters, setUnlockedChapters] = useState<Set<number>>(new Set());
    const [hasPass, setHasPass] = useState(false);
    const [showLibrary, setShowLibrary] = useState(false);
    const [inLibrary, setInLibrary] = useState(false);
    const [accessMap, setAccessMap] = useState<Map<number, boolean>>(new Map());
    const [milestones, setMilestones] = useState<NovelMilestone[]>([]);
    const [downloadedSet, setDownloadedSet] = useState<Set<string>>(new Set());
    const [downloading, setDownloading] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (novelId) setInLibrary(isInLibrary(novelId, 'novel'));
    }, [novelId]);

    const load = useCallback(async () => {
        if (!novelId) return;
        setLoading(true);
        const [n, ch] = await Promise.all([getNovel(novelId), getChapters(novelId)]);
        setNovel(n);
        setChapters(ch.filter(c => c.published));
        if (wallet) {
            const [prog, unlocks, pass, mils] = await Promise.all([
                getProgress(wallet, novelId), getUserUnlocks(wallet, novelId),
                checkPassStatus(wallet), getMilestones(wallet, novelId),
            ]);
            setProgress(prog);
            setUnlockedChapters(new Set(unlocks));
            setHasPass(pass.valid);
            setMilestones(mils);
            const published = ch.filter(c => c.published);
            const accessChecks = await Promise.all(
                published.map(c => canReadChapter(wallet, novelId, c.chapter_number).then(ok => [c.chapter_number, ok] as [number, boolean]))
            );
            setAccessMap(new Map(accessChecks));
        }
        setLoading(false);
    }, [novelId, wallet]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        const index = getNovelDownloadsIndex();
        setDownloadedSet(new Set(index.filter(e => e.source === "sakura" && e.novelId === novelId).map(e => e.chapterId)));
    }, [novelId]);

    const handleDownloadChapter = async (ch: Omit<NovelChapter, "content">) => {
        if (!novel) return;
        setDownloading(prev => new Set(prev).add(String(ch.chapter_number)));
        try {
            const { getChapterContent } = await import("@/lib/novel");
            const full = await getChapterContent(novelId, ch.chapter_number);
            if (full) {
                const entry: NovelDownloadEntry = {
                    novelId, chapterId: String(ch.chapter_number), chapterNumber: ch.chapter_number,
                    chapterName: ch.title, novelTitle: novel.title, coverUrl: novel.cover_url,
                    source: "sakura", downloadedAt: Date.now(), sizeBytes: new Blob([full.content]).size,
                };
                addNovelDownload(entry, full.content);
                setDownloadedSet(prev => new Set(prev).add(String(ch.chapter_number)));
            }
        } catch (e) { console.error("Download failed:", e); }
        setDownloading(prev => { const n = new Set(prev); n.delete(String(ch.chapter_number)); return n; });
    };

    if (loading) {
        return (<><main className="main-content"><section className="section" style={{ paddingTop: 60, textAlign: "center" }}><div className="loading-skeleton" style={{ width: "100%", maxWidth: 400, height: 300, borderRadius: 20, margin: "0 auto" }} /><div className="loading-skeleton" style={{ width: 200, height: 24, borderRadius: 8, margin: "16px auto" }} /></section></main></>);
    }

    if (!novel) {
        return (<><main className="main-content"><section className="section" style={{ paddingTop: 80, textAlign: "center" }}><p style={{ color: "var(--text-muted)", fontSize: 16 }}>Novel not found.</p><Link href="/novel" style={{ color: "var(--sakura-pink)", fontSize: 14, marginTop: 16, display: "inline-block" }}>Back to Browse</Link></section></main></>);
    }

    const totalWords = chapters.reduce((sum, c) => sum + (c.word_count || 0), 0);
    const continueChapter = progress ? progress.chapter_number : 1;

    return (
        <>
            <main className="main-content manga-detail novel-detail">
                <BackButton href="/novel" />
                <NovelDetailHero
                    title={novel.title}
                    cover={novel.cover_url}
                    author={truncateAddress(novel.creator_wallet)}
                    status={novel.status}
                    genres={novel.genres}
                    stats={[
                        { label: "Chapters", value: chapters.length, accent: "pink" },
                        { label: "Words", value: totalWords > 1000 ? `${(totalWords / 1000).toFixed(1)}k` : totalWords },
                        { label: "Free", value: novel.free_until_chapter },
                        { label: "Price", value: `${novel.price_per_chapter} 🌸` },
                    ]}
                    readHref={`/novel/read?novel=${novel.id}&chapter=${continueChapter}`}
                    readLabel={progress ? "Continue Reading" : "Start Reading"}
                    inLibrary={inLibrary}
                    onSave={() => setShowLibrary(true)}
                    synopsis={novel.description}
                />

                {hasPass && (
                    <div className="novel-pass-banner">
                        Premium Pass — All chapters unlocked
                    </div>
                )}

                {milestones.length > 0 && (
                    <div className="novel-milestones">
                        {milestones.map(m => {
                            const badges: Record<string, { icon: string; label: string }> = {
                                unlock: { icon: "🔓", label: "Supporter" },
                                complete: { icon: "✅", label: "Completed" },
                                support: { icon: "💝", label: "Tipper" },
                                early_reader: { icon: "⚡", label: "Early Reader" },
                                first_100: { icon: "🏆", label: "First 100" },
                            };
                            const b = badges[m.milestone_type] || { icon: "🎖", label: m.milestone_type };
                            return (
                                <span key={m.id} className="novel-milestone-badge">
                                    {b.icon} {b.label}
                                </span>
                            );
                        })}
                    </div>
                )}

                <section className="md-chapters">
                    <div className="md-ch-head">
                        <h2 className="md-ch-title">Chapters<span className="md-ch-count">{chapters.length}</span></h2>
                    </div>
                    <div className="md-ch-list">
                        {chapters.map(ch => {
                            const isFree = ch.chapter_number <= novel.free_until_chapter || ch.is_free_override;
                            const isUnlocked = unlockedChapters.has(ch.chapter_number);
                            const canRead = accessMap.get(ch.chapter_number) ?? isFree;
                            const isDownloaded = downloadedSet.has(String(ch.chapter_number));
                            const isDownloading = downloading.has(String(ch.chapter_number));
                            return (
                                <div key={ch.id} className="novel-md-ch-row-wrap">
                                    <Link
                                        href={`/novel/read?novel=${novel.id}&chapter=${ch.chapter_number}`}
                                        className={`md-ch-row${progress?.chapter_number === ch.chapter_number ? " is-active" : ""}`}
                                    >
                                        <span className="md-ch-num">{canRead ? ch.chapter_number : "🔒"}</span>
                                        <div className="md-ch-main">
                                            <span className="md-ch-name">{ch.title || `Chapter ${ch.chapter_number}`}</span>
                                            <span className="md-ch-meta">
                                                {ch.word_count ? `${ch.word_count.toLocaleString()} words` : ""}
                                                {isFree && <span className="md-ch-badge">FREE</span>}
                                                {!isFree && isUnlocked && <span className="md-ch-badge">UNLOCKED</span>}
                                            </span>
                                        </div>
                                    </Link>
                                    {canRead && (
                                        <button
                                            type="button"
                                            className={`dl-btn${isDownloaded ? " dl-completed" : ""}`}
                                            onClick={() => isDownloaded ? removeNovelDownload("sakura", novelId, String(ch.chapter_number)) : handleDownloadChapter(ch)}
                                            disabled={isDownloading}
                                            title={isDownloaded ? "Downloaded" : "Download chapter"}
                                            aria-label={isDownloaded ? "Downloaded" : "Download chapter"}
                                        >
                                            {isDownloading ? "…" : isDownloaded ? (
                                                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                                            ) : (
                                                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></svg>
                                            )}
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <NovelComments novelId={novel.id} />
                </section>

                {showLibrary && (
                    <SaveToLibraryModal
                        item={{ id: novel.id, title: novel.title, image: novel.cover_url, type: "novel", addedAt: Date.now() }}
                        onClose={() => { setShowLibrary(false); setInLibrary(isInLibrary(novelId, 'novel')); }}
                    />
                )}
            </main>
        </>
    );
}

/* ═══════ Router ═══════ */

function DetailsRouter() {
    const params = useSearchParams();
    const source = params.get("source");
    if (source === "external") return <ExternalDetailsContent />;
    return <SakuraDetailsContent />;
}

export default function NovelDetailsPage() {
    return (
        <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "white" }}>Loading...</div>}>
            <DetailsRouter />
        </Suspense>
    );
}
