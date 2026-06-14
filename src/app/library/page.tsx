"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
    getLibraryCategories,
    removeFromLibrary,
    deleteLibraryCategory,
    type LibraryCategory,
    type LibraryItem,
} from "@/lib/storage";

function ConfirmModal({
    title,
    message,
    confirmLabel,
    onConfirm,
    onCancel,
}: {
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    return (
        <div className="hub-confirm-backdrop" onClick={onCancel}>
            <div className="hub-confirm-modal" onClick={(event) => event.stopPropagation()}>
                <p className="hub-confirm-title">{title}</p>
                <p className="hub-confirm-copy">{message}</p>
                <div className="hub-confirm-actions">
                    <button type="button" className="hub-btn hub-btn-muted" onClick={onCancel}>
                        Cancel
                    </button>
                    <button type="button" className="hub-btn hub-btn-danger" onClick={onConfirm}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

const EXPLORE_LINKS = [
    { href: "/manga", label: "Browse Manga", accentClass: "is-manga" },
    { href: "/anime", label: "Browse Anime", accentClass: "is-anime" },
    { href: "/novel", label: "Browse Novels", accentClass: "is-novel" },
] as const;

function formatSavedAt(timestamp: number) {
    if (!timestamp) return "Saved recently";
    return `Saved ${new Date(timestamp).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    })}`;
}

function itemHref(item: LibraryItem) {
    if (item.type === "anime") {
        return `/anime/details?id=${encodeURIComponent(item.id)}`;
    }
    if (item.type === "novel") {
        return item.source === "external"
            ? `/novel/details?source=external&path=${encodeURIComponent(item.id)}`
            : `/novel/details?id=${encodeURIComponent(item.id)}`;
    }
    return `/title?id=${encodeURIComponent(item.id)}&source=atsumaru`;
}

function itemTypeLabel(item: LibraryItem) {
    if (item.type === "novel" && item.source === "external") return "External Novel";
    return item.type.charAt(0).toUpperCase() + item.type.slice(1);
}

export default function LibraryPage() {
    const [categories, setCategories] = useState<LibraryCategory[]>([]);
    const [activeTab, setActiveTab] = useState(-1);
    const [confirmRemove, setConfirmRemove] = useState<{ item: LibraryItem; categoryName: string } | null>(null);
    const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<string | null>(null);

    const reload = useCallback(() => {
        const nextCategories = getLibraryCategories();
        setCategories(nextCategories);
        setActiveTab((current) => {
            if (current === -1) return current;
            return current >= nextCategories.length ? -1 : current;
        });
    }, []);

    useEffect(() => {
        reload();
    }, [reload]);

    const activeCategory = activeTab >= 0 ? categories[activeTab] : null;

    const uniqueItems = useMemo(() => {
        const seen = new Set<string>();
        const flattened = categories.flatMap((category) => category.items);
        return flattened.filter((item) => {
            const key = `${item.type}:${item.id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [categories]);

    const visibleItems = useMemo(() => {
        const source = activeTab === -1 ? uniqueItems : activeCategory?.items || [];
        return [...source].sort((left, right) => right.addedAt - left.addedAt);
    }, [activeCategory, activeTab, uniqueItems]);

    const handleRemoveItem = (item: LibraryItem) => {
        if (!activeCategory) return;
        setConfirmRemove({ item, categoryName: activeCategory.name });
    };

    const confirmRemoveItem = () => {
        if (!confirmRemove) return;
        removeFromLibrary(confirmRemove.categoryName, confirmRemove.item.id, confirmRemove.item.type);
        setConfirmRemove(null);
        reload();
    };

    const confirmDeleteCategoryAction = () => {
        if (!confirmDeleteCategory) return;
        deleteLibraryCategory(confirmDeleteCategory);
        setConfirmDeleteCategory(null);
        setActiveTab(-1);
        reload();
    };

    return (
        <>
            <main className="main-content hub-page">
                <section className="hub-surface">
                    <div className="hub-minimal-head">
                        <div>
                            <h1 className="hub-minimal-title">Library</h1>
                            <p className="hub-minimal-sub">
                                {activeTab === -1
                                    ? `${uniqueItems.length} saved title${uniqueItems.length === 1 ? "" : "s"} across ${categories.length} shelf${categories.length === 1 ? "" : "s"}.`
                                    : `${activeCategory?.name || "Selected"} shelf • ${visibleItems.length} item${visibleItems.length === 1 ? "" : "s"}`}
                            </p>
                        </div>
                        <div className="hub-minimal-actions">
                            {uniqueItems.length > 0 ? (
                                <Link href="/anime" className="hub-btn hub-btn-link">Browse</Link>
                            ) : null}
                            {activeCategory && activeCategory.name !== "Default" ? (
                                <button
                                    type="button"
                                    className="hub-btn hub-btn-danger"
                                    onClick={() => setConfirmDeleteCategory(activeCategory.name)}
                                >
                                    Delete Shelf
                                </button>
                            ) : null}
                        </div>
                    </div>

                    <div className="hub-segments" aria-label="Library shelves">
                        <button
                            type="button"
                            className={`hub-segment ${activeTab === -1 ? "active" : ""}`}
                            onClick={() => setActiveTab(-1)}
                        >
                            All
                            <span>{uniqueItems.length}</span>
                        </button>
                        {categories.map((category, index) => (
                            <button
                                key={category.name}
                                type="button"
                                className={`hub-segment ${activeTab === index ? "active" : ""}`}
                                onClick={() => setActiveTab(index)}
                            >
                                {category.name}
                                <span>{category.items.length}</span>
                            </button>
                        ))}
                    </div>

                    {visibleItems.length === 0 ? (
                        <div className="hub-empty-card">
                            <h3>Nothing on this shelf yet</h3>
                            <p>Save a title from manga, anime, or novels and it will land here for quick return visits.</p>
                            <div className="hub-empty-actions">
                                {EXPLORE_LINKS.map((link) => (
                                    <Link key={link.href} href={link.href} className={`hub-link-chip ${link.accentClass}`}>
                                        {link.label}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="hub-list">
                            {visibleItems.map((item) => (
                                <div key={`${item.type}-${item.id}`} className="hub-row">
                                    <Link href={itemHref(item)} className="hub-row-link">
                                        <div className="hub-row-media">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={item.image || "/placeholder.png"} alt={item.title} referrerPolicy="no-referrer" />
                                        </div>
                                        <div className="hub-row-body">
                                            <h3>{item.title}</h3>
                                            <p>{itemTypeLabel(item)} • {formatSavedAt(item.addedAt)}</p>
                                        </div>
                                    </Link>
                                    {activeCategory ? (
                                        <button
                                            type="button"
                                            className="hub-row-button hub-row-button-danger"
                                            aria-label={`Remove ${item.title} from ${activeCategory.name}`}
                                            onClick={() => handleRemoveItem(item)}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="18" y1="6" x2="6" y2="18" />
                                                <line x1="6" y1="6" x2="18" y2="18" />
                                            </svg>
                                        </button>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </main>

            {confirmRemove ? (
                <ConfirmModal
                    title="Remove from shelf?"
                    message={`Remove "${confirmRemove.item.title}" from "${confirmRemove.categoryName}"?`}
                    confirmLabel="Remove"
                    onConfirm={confirmRemoveItem}
                    onCancel={() => setConfirmRemove(null)}
                />
            ) : null}

            {confirmDeleteCategory ? (
                <ConfirmModal
                    title="Delete shelf?"
                    message={`Delete "${confirmDeleteCategory}" and remove every title saved there?`}
                    confirmLabel="Delete"
                    onConfirm={confirmDeleteCategoryAction}
                    onCancel={() => setConfirmDeleteCategory(null)}
                />
            ) : null}
        </>
    );
}
