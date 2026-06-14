"use client";

import { useEffect, useState } from "react";
import PosterCard from "./PosterCard";
import HorizontalScroll from "./HorizontalScroll";
import {
    recommendForMe,
    recommendAnimeFromHistory,
    type DiscoveryCard,
    type RecommendForMeResult,
} from "@/lib/sakura-ai/library";

const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_KEY_HOME = "sakura_personal_reco_home";
const CACHE_KEY_ANIME = "sakura_personal_reco_anime";

interface CachePayload {
    at: number;
    cards: DiscoveryCard[];
    seeds: RecommendForMeResult["seeds"];
}

function readCache(key: string): RecommendForMeResult | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const p = JSON.parse(raw) as CachePayload;
        if (!p.at || !Array.isArray(p.cards)) return null;
        if (Date.now() - p.at > CACHE_TTL_MS) return null;
        return { cards: p.cards, seeds: p.seeds || [] };
    } catch {
        return null;
    }
}

function writeCache(key: string, data: RecommendForMeResult) {
    try {
        localStorage.setItem(
            key,
            JSON.stringify({ at: Date.now(), cards: data.cards, seeds: data.seeds }),
        );
    } catch {
        /* ignore quota */
    }
}

function headingFromSeeds(seeds: RecommendForMeResult["seeds"]): string {
    if (seeds.length === 1) {
        const s = seeds[0];
        return s.kind === "anime"
            ? `Because you watched ${s.title}`
            : `Because you read ${s.title}`;
    }
    if (seeds.length > 1) {
        return "Sakura thinks you might like these";
    }
    return "Sakura thinks you might like these";
}

type RowMode = "home" | "anime";

export default function PersonalizedRecommendationRow({ mode }: { mode: RowMode }) {
    const [cards, setCards] = useState<DiscoveryCard[]>([]);
    const [seeds, setSeeds] = useState<RecommendForMeResult["seeds"]>([]);

    useEffect(() => {
        const key = mode === "anime" ? CACHE_KEY_ANIME : CACHE_KEY_HOME;
        const cached = readCache(key);
        if (cached && cached.cards.length > 0) {
            setCards(cached.cards);
            setSeeds(cached.seeds);
        }

        let cancelled = false;
        void (async () => {
            const data =
                mode === "anime" ? await recommendAnimeFromHistory() : await recommendForMe();
            if (cancelled) return;
            if (data.cards.length > 0) {
                writeCache(key, data);
                setCards(data.cards);
                setSeeds(data.seeds);
            } else if (!cached) {
                setCards([]);
                setSeeds([]);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [mode]);

    if (cards.length === 0) return null;

    const visible =
        mode === "anime" ? cards.filter((c) => c.kind === "anime") : cards;
    if (visible.length === 0) return null;

    const title = headingFromSeeds(seeds);

    if (mode === "anime") {
        return (
            <HorizontalScroll title={title}>
                {visible.map((card) => (
                    <PosterCard
                        key={`${card.kind}:${card.id}:${card.route}`}
                        href={card.route}
                        title={card.title}
                        image={card.image}
                        badge={
                            card.score != null && card.score > 0
                                ? `★ ${typeof card.score === "number" ? card.score.toFixed(1) : card.score}`
                                : null
                        }
                    />
                ))}
            </HorizontalScroll>
        );
    }

    return (
        <section
            className="personalized-reco-row personalized-reco-row--home"
            style={{ paddingLeft: 20, paddingRight: 20, paddingTop: 12, paddingBottom: 8 }}
        >
            <div className="section-header" style={{ marginBottom: 10 }}>
                <h2 className="section-title" style={{ fontSize: 16 }}>{title}</h2>
            </div>
            <div className="browse-row-scroll">
                {visible.map((card) => {
                    const badge =
                        card.score != null && card.score > 0
                            ? `★ ${typeof card.score === "number" ? card.score.toFixed(1) : card.score}`
                            : null;

                    return (
                        <PosterCard
                            key={`${card.kind}:${card.id}:${card.route}`}
                            href={card.route}
                            title={card.title}
                            image={card.image}
                            badge={badge}
                        />
                    );
                })}
            </div>
        </section>
    );
}
