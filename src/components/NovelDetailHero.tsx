"use client";

import Link from "next/link";
import LottieIcon from "@/components/LottieIcon";

function BookFallback({ size = 40 }: { size?: number }) {
    return (
        <div className="md-poster-fallback" style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.45">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
            </svg>
        </div>
    );
}

export interface NovelDetailStat {
    label: string;
    value: React.ReactNode;
    accent?: "pink" | "green" | "default";
}

interface NovelDetailHeroProps {
    title: string;
    cover?: string;
    author?: string;
    status?: string;
    genres?: string[];
    stats?: NovelDetailStat[];
    readHref?: string;
    readLabel?: string;
    inLibrary?: boolean;
    onSave?: () => void;
    synopsis?: string;
}

export default function NovelDetailHero({
    title,
    cover,
    author,
    status,
    genres = [],
    stats = [],
    readHref,
    readLabel = "Start Reading",
    inLibrary = false,
    onSave,
    synopsis,
}: NovelDetailHeroProps) {
    return (
        <>
            <section className="md-hero">
                <div className="md-hero-bg">
                    {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt="" referrerPolicy="no-referrer" />
                    ) : null}
                </div>
                <div className="md-hero-scrim" />

                <div className="md-hero-inner">
                    <div className="md-poster">
                        {cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={cover} alt={title} referrerPolicy="no-referrer" />
                        ) : (
                            <BookFallback />
                        )}
                    </div>

                    <div className="md-info">
                        <h1 className="md-title">{title}</h1>

                        {author && (
                            <p className="md-author">
                                <span className="md-author-by">by</span>{" "}
                                <span className="md-author-name">{author}</span>
                            </p>
                        )}

                        {(stats.length > 0 || status) && (
                            <div className="md-stats">
                                {stats.map((stat) => (
                                    <span
                                        key={stat.label}
                                        className={`md-stat${stat.accent === "green" ? " md-stat-free" : stat.accent === "pink" ? " md-stat-rating" : ""}`}
                                    >
                                        <strong>{stat.value}</strong> {stat.label}
                                    </span>
                                ))}
                                {status && <span className="md-status">{status}</span>}
                            </div>
                        )}

                        {genres.length > 0 && (
                            <div className="md-genres">
                                {genres.slice(0, 4).map((genre) => (
                                    <span key={genre} className="md-genre">{genre}</span>
                                ))}
                                {genres.length > 4 && (
                                    <span className="md-genre md-genre-more">+{genres.length - 4}</span>
                                )}
                            </div>
                        )}

                        {synopsis && (
                            <p className="md-synopsis">{synopsis.slice(0, 220)}{synopsis.length > 220 ? "…" : ""}</p>
                        )}

                        <div className="md-actions">
                            {readHref && (
                                <Link href={readHref} className="md-btn-read">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
                                    {readLabel}
                                </Link>
                            )}
                            {onSave && (
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={onSave}
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
                            )}
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
}
