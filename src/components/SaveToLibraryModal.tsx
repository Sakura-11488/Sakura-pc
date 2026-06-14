"use client";

import { useState, useEffect } from "react";
import {
    getLibraryCategories,
    addToLibrary,
    removeFromLibrary,
    createLibraryCategory,
    getItemCategories,
    type LibraryItem,
} from "@/lib/storage";

interface Props {
    item: LibraryItem;
    onClose: () => void;
}

export default function SaveToLibraryModal({ item, onClose }: Props) {
    const [categories, setCategories] = useState(getLibraryCategories());
    const [checked, setChecked] = useState<Set<string>>(new Set(getItemCategories(item.id, item.type)));
    const [newName, setNewName] = useState("");

    useEffect(() => {
        setCategories(getLibraryCategories());
        setChecked(new Set(getItemCategories(item.id, item.type)));
    }, [item.id, item.type]);

    const toggle = (catName: string) => {
        const next = new Set(checked);
        if (next.has(catName)) {
            next.delete(catName);
            removeFromLibrary(catName, item.id, item.type);
        } else {
            next.add(catName);
            addToLibrary(catName, item);
        }
        setChecked(next);
    };

    const handleCreate = () => {
        const trimmed = newName.trim();
        if (!trimmed) return;
        createLibraryCategory(trimmed);
        addToLibrary(trimmed, item);
        setCategories(getLibraryCategories());
        setChecked(prev => new Set([...prev, trimmed]));
        setNewName("");
    };

    return (
        <div
            className="glass-modal-overlay"
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 9999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                animation: "fadeIn 0.2s ease",
                padding: 20,
            }}
            onClick={onClose}
        >
            <div
                className="glass-modal"
                style={{
                    width: "100%",
                    maxWidth: 380,
                    borderRadius: 24,
                    padding: "28px 24px",
                    animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <h3 style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 20,
                    marginBottom: 4,
                    color: "var(--accent)",
                }}>
                    ライブラリに保存
                </h3>
                <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
                    Save to Library
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20, maxHeight: 240, overflowY: "auto" }}>
                    {categories.map((cat) => (
                        <button
                            key={cat.name}
                            onClick={() => toggle(cat.name)}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 12,
                                padding: "12px 16px",
                                borderRadius: 12,
                                border: `1px solid ${checked.has(cat.name) ? "rgba(240, 84, 79, 0.32)" : "var(--border-subtle)"}`,
                                background: checked.has(cat.name) ? "rgba(240, 84, 79, 0.1)" : "var(--bg-hover)",
                                color: "var(--text-primary)",
                                cursor: "pointer",
                                textAlign: "left",
                                transition: "all 0.2s ease",
                                fontSize: 14,
                                fontWeight: 500,
                            }}
                        >
                            <span style={{
                                width: 20,
                                height: 20,
                                borderRadius: 6,
                                border: `2px solid ${checked.has(cat.name) ? "var(--accent)" : "var(--border-strong)"}`,
                                background: checked.has(cat.name) ? "var(--accent)" : "transparent",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                                transition: "all 0.2s ease",
                            }}>
                                {checked.has(cat.name) && (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                )}
                            </span>
                            <span style={{ flex: 1 }}>{cat.name}</span>
                            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                                {cat.items.length}
                            </span>
                        </button>
                    ))}
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                    <input
                        type="text"
                        placeholder="New category..."
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                        style={{
                            flex: 1,
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: "1px solid var(--border-subtle)",
                            background: "var(--bg-hover)",
                            color: "var(--text-primary)",
                            fontSize: 14,
                            outline: "none",
                        }}
                    />
                    <button
                        onClick={handleCreate}
                        disabled={!newName.trim()}
                        style={{
                            padding: "10px 16px",
                            borderRadius: 12,
                            border: "none",
                            background: newName.trim() ? "var(--accent)" : "var(--bg-hover)",
                            color: newName.trim() ? "#fff" : "var(--text-muted)",
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: newName.trim() ? "pointer" : "default",
                            transition: "all 0.2s ease",
                        }}
                    >
                        Create
                    </button>
                </div>

                <button
                    onClick={onClose}
                    style={{
                        width: "100%",
                        padding: "12px",
                        borderRadius: 12,
                        border: "1px solid var(--border-subtle)",
                        background: "var(--bg-hover)",
                        color: "var(--text-primary)",
                        fontSize: 14,
                        fontWeight: 500,
                        cursor: "pointer",
                    }}
                >
                    Done
                </button>
            </div>
        </div>
    );
}
