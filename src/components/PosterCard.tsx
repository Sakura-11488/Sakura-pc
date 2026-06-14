"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { imageOrPlaceholder, SAKURA_PLACEHOLDER_IMAGE } from "@/lib/media-fallback";

export interface PosterCardProps {
    href: string;
    title: string;
    image?: string;
    /** Tried if primary image fails to load */
    fallbackImage?: string;
    /** Bottom-right overlay, e.g. "★ 9.13" */
    badge?: string | null;
    /** Top-left rank number for "Top 10" style rows */
    rank?: number;
    className?: string;
    style?: React.CSSProperties;
}

export default function PosterCard({
    href,
    title,
    image,
    fallbackImage,
    badge,
    rank,
    className = "",
    style,
}: PosterCardProps) {
    const [imgSrc, setImgSrc] = useState(() => imageOrPlaceholder(image));
    const [usedFallback, setUsedFallback] = useState(false);

    useEffect(() => {
        setImgSrc(imageOrPlaceholder(image));
        setUsedFallback(false);
    }, [image]);

    const handleError = () => {
        if (!usedFallback && fallbackImage && fallbackImage !== imgSrc) {
            setImgSrc(fallbackImage);
            setUsedFallback(true);
            return;
        }
        setImgSrc(SAKURA_PLACEHOLDER_IMAGE);
    };

    return (
        <Link href={href} className={`poster-card ${className}`.trim()} style={style}>
            <div className="poster-card-img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={imgSrc}
                    alt={title}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={handleError}
                />
                {typeof rank === "number" ? <span className="poster-card-rank">{rank}</span> : null}
                {badge ? <span className="poster-card-label">{badge}</span> : null}
            </div>
            <div className="poster-card-title">{title}</div>
        </Link>
    );
}
