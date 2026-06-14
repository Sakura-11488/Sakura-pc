export type ReadingMode = 'scroll' | 'card';

export const READING_MODE_OPTIONS: {
    id: ReadingMode;
    title: string;
    subtitle: string;
    desc: string;
}[] = [
    {
        id: 'scroll',
        title: 'スクロール',
        subtitle: 'Continuous Scroll',
        desc: 'One seamless vertical flow through all pages',
    },
    {
        id: 'card',
        title: 'カード',
        subtitle: 'Card Swipe',
        desc: 'Tap the sides or swipe between pages like cards',
    },
];

/** Migrate legacy saves (`page`, `book`) to `card`. */
export function normalizeReadingMode(value: string | null | undefined): ReadingMode | null {
    if (value === 'scroll' || value === 'card') return value;
    if (value === 'page' || value === 'book') return 'card';
    return null;
}

export function isPaginatedMode(mode: ReadingMode): boolean {
    return mode === 'card';
}
