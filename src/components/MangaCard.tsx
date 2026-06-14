"use client";

import { memo } from "react";
import PosterCard from "./PosterCard";

interface MangaCardProps {
    slug: string;
    title: string;
    cover: string;
    genres: string[];
    chapterCount?: number;
    latestChapter?: number;
    follows?: number;
    rating?: number;
    source?: string;
    rank?: number;
    className?: string;
    style?: React.CSSProperties;
}

const MangaCard = memo(function MangaCard({
    slug,
    title,
    cover,
    rating,
    source,
    rank,
    className,
    style,
}: MangaCardProps) {
    const badge =
        rating != null && rating > 0 ? `★ ${rating.toFixed(1)}` : null;

    return (
        <PosterCard
            href={`/title?id=${slug}&source=${source || "atsumaru"}`}
            title={title}
            image={cover}
            badge={badge}
            rank={rank}
            className={className}
            style={style}
        />
    );
});

export default MangaCard;
