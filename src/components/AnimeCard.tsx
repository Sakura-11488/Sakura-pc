"use client";

import PosterCard from "./PosterCard";

interface AnimeCardProps {
    id: string;
    title: string;
    image?: string;
    type?: string;
    year?: number | null;
    score?: number | null;
    rank?: number;
    showMeta?: boolean;
    className?: string;
    style?: React.CSSProperties;
}

export default function AnimeCard({
    id,
    title,
    image,
    score,
    rank,
    className,
    style,
}: AnimeCardProps) {
    const badge =
        score != null && score > 0
            ? `★ ${typeof score === "number" ? score.toFixed(1) : score}`
            : null;

    return (
        <PosterCard
            href={`/anime/details?id=${encodeURIComponent(id)}`}
            title={title}
            image={image}
            badge={badge}
            rank={rank}
            className={className}
            style={style}
        />
    );
}
