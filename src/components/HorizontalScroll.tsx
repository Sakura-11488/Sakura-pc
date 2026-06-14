"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";

export type HorizontalScrollProps = {
    title: string;
    linkText?: string;
    linkHref?: string;
    seeMoreHref?: string;
    children: ReactNode;
    filters?: ReactNode;
    scrollStep?: number;
    showArrows?: boolean;
};

export default function HorizontalScroll({
    title,
    linkText = "View more ›",
    linkHref,
    seeMoreHref,
    children,
    filters,
    scrollStep = 320,
    showArrows = true,
}: HorizontalScrollProps) {
    const ref = useRef<HTMLDivElement>(null);
    const href = linkHref || seeMoreHref;

    const scroll = (dir: number) => {
        ref.current?.scrollBy({ left: dir * scrollStep, behavior: "smooth" });
    };

    return (
        <section className="hscroll-section">
            <div className="hscroll-header">
                <h2 className="hscroll-title">{title}</h2>
                <div className="hscroll-controls">
                    {href ? (
                        <Link href={href} className="hscroll-link">
                            {linkText}
                        </Link>
                    ) : null}
                    {showArrows ? (
                        <>
                            <button
                                type="button"
                                className="hscroll-arrow"
                                onClick={() => scroll(-1)}
                                aria-label="Scroll left"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="15 18 9 12 15 6" />
                                </svg>
                            </button>
                            <button
                                type="button"
                                className="hscroll-arrow"
                                onClick={() => scroll(1)}
                                aria-label="Scroll right"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="9 18 15 12 9 6" />
                                </svg>
                            </button>
                        </>
                    ) : null}
                </div>
            </div>
            {filters}
            <div className="hscroll-track-wrap">
                <div className="hscroll-track" ref={ref}>
                    {children}
                </div>
            </div>
        </section>
    );
}
