import { NOVEL_GENRES, getNovels, type Novel } from "@/lib/novel";
import { ALLNOVEL_GENRES, type AllNovelItem } from "@/lib/allnovel";

export interface UnifiedNovel {
    id: string;
    title: string;
    cover?: string;
    originalCover?: string;
    status?: string;
    genres: string[];
    href: string;
}

export function toUnified(novel: Novel): UnifiedNovel {
    return {
        id: novel.id,
        title: novel.title,
        cover: novel.cover_url,
        status: novel.status,
        genres: novel.genres,
        href: `/novel/details?id=${novel.id}`,
    };
}

export function externalToUnified(item: AllNovelItem): UnifiedNovel {
    return {
        id: `ext_${item.path}`,
        title: item.name,
        cover: item.cover,
        originalCover: item.originalCover || item.cover,
        genres: [],
        href: `/novel/details?source=external&path=${encodeURIComponent(item.path)}`,
    };
}

export const COMBINED_GENRES = Array.from(
    new Map(
        [
            ...NOVEL_GENRES.map((g) => ({ label: g, value: g, source: "sakura" as const })),
            ...ALLNOVEL_GENRES.map((g) => ({ ...g, source: "external" as const })),
        ].map((g) => [g.label, g]),
    ).values(),
);

export async function fetchNovelsByGenre(genre: string) {
    const genreMeta = COMBINED_GENRES.find((g) => g.label === genre);
    const [sakura, external] = await Promise.all([
        getNovels({ genre }),
        genreMeta?.source === "external"
            ? import("@/lib/allnovel").then(({ fetchPopularNovels }) =>
                  fetchPopularNovels(1, { genre: genreMeta.value }).catch(() => [] as AllNovelItem[]),
              )
            : Promise.resolve([] as AllNovelItem[]),
    ]);
    return [...sakura.map(toUnified), ...external.map(externalToUnified)];
}
