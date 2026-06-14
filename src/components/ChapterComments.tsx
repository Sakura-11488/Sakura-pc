"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useSakuraWalletModal } from "./SakuraWalletModal";
import { payForHighlightComment } from "@/lib/payment-split";
import { truncateAddress } from "@/lib/solana";
import LottieIcon from "@/components/LottieIcon";
import {
    getComments,
    postComment,
    deleteComment,
    toggleReaction,
    REACTION_EMOJIS,
    type ChapterComment,
    type ReactionSummary,
} from "@/lib/comments";
import Link from "next/link";

/* ─── Time Ago Helper ─── */
function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
}

/* ─── Emoji Reaction Bar ─── */
function EmojiReactions({
    commentId,
    reactions,
    walletAddress,
    onToggle,
}: {
    commentId: number;
    reactions: ReactionSummary[];
    walletAddress: string | null;
    onToggle: (commentId: number, emoji: string) => void;
}) {
    const [showPicker, setShowPicker] = useState(false);
    const pickerRef = useRef<HTMLDivElement>(null);

    // Close picker on outside click
    useEffect(() => {
        if (!showPicker) return;
        const handler = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setShowPicker(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [showPicker]);

    return (
        <div className="reaction-bar">
            {/* Existing reactions */}
            {reactions.map(r => (
                <button
                    key={r.emoji}
                    className={`reaction-chip ${r.reacted ? "reacted" : ""}`}
                    onClick={() => walletAddress && onToggle(commentId, r.emoji)}
                    disabled={!walletAddress}
                >
                    <span>{r.emoji}</span>
                    <span className="reaction-count">{r.count}</span>
                </button>
            ))}

            {/* Add reaction button */}
            <div className="reaction-add-wrapper" ref={pickerRef}>
                <button
                    className="reaction-add-btn"
                    onClick={() => setShowPicker(!showPicker)}
                    disabled={!walletAddress}
                    title={walletAddress ? "Add reaction" : "Sign up / Login to react"}
                >
                    +
                </button>
                {showPicker && (
                    <div className="reaction-picker">
                        {REACTION_EMOJIS.map(emoji => (
                            <button
                                key={emoji}
                                className="reaction-picker-item"
                                onClick={() => {
                                    onToggle(commentId, emoji);
                                    setShowPicker(false);
                                }}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ─── Main Chapter Comments Component ─── */
export default function ChapterComments({
    mangaId,
    chapterId,
    defaultExpanded = false,
}: {
    mangaId: string;
    chapterId: string;
    defaultExpanded?: boolean;
}) {
    const { publicKey } = useWallet();
    const { setVisible } = useSakuraWalletModal();
    const walletAddress = publicKey?.toBase58() || null;

    const [comments, setComments] = useState<ChapterComment[]>([]);
    const [newComment, setNewComment] = useState("");
    const [loading, setLoading] = useState(true);
    const [posting, setPosting] = useState(false);
    const [highlighting, setHighlighting] = useState(false);
    const [expanded, setExpanded] = useState(defaultExpanded);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Provide the wallet context signTransaction 
    const { signTransaction } = useWallet();

    // Load comments
    const loadComments = useCallback(async () => {
        setLoading(true);
        const data = await getComments(mangaId, chapterId, walletAddress || undefined);
        setComments(data);
        setLoading(false);
    }, [mangaId, chapterId, walletAddress]);

    useEffect(() => {
        loadComments();
    }, [loadComments]);

    // Refresh on focus
    useEffect(() => {
        const refresh = () => loadComments();
        window.addEventListener("focus", refresh);
        return () => window.removeEventListener("focus", refresh);
    }, [loadComments]);

    // Post comment
    const handlePost = async () => {
        if (!walletAddress || !newComment.trim() || posting) return;
        setPosting(true);
        const posted = await postComment(walletAddress, mangaId, chapterId, newComment);
        if (posted) {
            setNewComment("");
            await loadComments();
        }
        setPosting(false);
    };

    // Highlight comment
    const handleHighlight = async () => {
        if (!walletAddress || !signTransaction || !newComment.trim() || highlighting) return;

        try {
            setHighlighting(true);

            // 1. Pay for the highlight
            const paymentResult = await payForHighlightComment(publicKey!, signTransaction);
            if (!paymentResult.success || !paymentResult.signature) {
                alert("Payment failed: " + paymentResult.error);
                setHighlighting(false);
                return;
            }

            // 2. Submit to backend API for verification
            const res = await fetch("/api/comments/highlight", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    walletAddress,
                    mangaId,
                    chapterId,
                    content: newComment,
                    signature: paymentResult.signature
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Verification failed");
            }

            // 3. Reset and reload
            setNewComment("");
            await loadComments();
        } catch (error: any) {
            console.error(error);
            alert("Error highlighting comment: " + error.message);
        } finally {
            setHighlighting(false);
        }
    };

    // Delete comment
    const handleDelete = async (commentId: number) => {
        if (!walletAddress) return;
        const ok = await deleteComment(commentId, walletAddress);
        if (ok) {
            setComments(prev => prev.filter(c => c.id !== commentId));
        }
    };

    // Toggle reaction (optimistic)
    const handleReaction = async (commentId: number, emoji: string) => {
        if (!walletAddress) return;

        // Optimistic update
        setComments(prev => prev.map(c => {
            if (c.id !== commentId) return c;
            const existing = c.reactions?.find(r => r.emoji === emoji);
            let newReactions: ReactionSummary[];
            if (existing) {
                if (existing.reacted) {
                    // Remove reaction
                    newReactions = c.reactions!.map(r =>
                        r.emoji === emoji ? { ...r, count: r.count - 1, reacted: false } : r
                    ).filter(r => r.count > 0);
                } else {
                    // Add to existing
                    newReactions = c.reactions!.map(r =>
                        r.emoji === emoji ? { ...r, count: r.count + 1, reacted: true } : r
                    );
                }
            } else {
                // New reaction
                newReactions = [...(c.reactions || []), { emoji, count: 1, reacted: true }];
            }
            return { ...c, reactions: newReactions };
        }));

        // Sync to server
        await toggleReaction(commentId, walletAddress, emoji);
    };

    // Submit on Ctrl/Cmd + Enter
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            handlePost();
        }
    };

    // Sort comments: Highlights first, then oldest to newest
    const sortedComments = [...comments].sort((a, b) => {
        if (a.is_highlighted && !b.is_highlighted) return -1;
        if (!a.is_highlighted && b.is_highlighted) return 1;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    return (
        <div className="chapter-comments">
            {/* Collapsible Header */}
            <button
                className="comments-header"
                onClick={() => setExpanded(!expanded)}
            >
                <span className="comments-header-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    コメント Comments
                    {comments.length > 0 && (
                        <span className="comments-count">{comments.length}</span>
                    )}
                </span>
                <span className={`comments-chevron ${expanded ? "expanded" : ""}`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                </span>
            </button>

            {/* Comments Body */}
            {expanded && (
                <div className="comments-body">
                    {/* Comment Input */}
                    <div className="comment-input-area">
                        {walletAddress ? (
                            <>
                                <div className="comment-input-header">
                                    <span className="comment-as">
                                        Commenting as {truncateAddress(walletAddress)}
                                    </span>
                                    <span className="comment-char-count">
                                        {newComment.length}/500
                                    </span>
                                </div>
                                <textarea
                                    ref={inputRef}
                                    className="comment-textarea"
                                    placeholder="Share your thoughts... 感想を共有..."
                                    value={newComment}
                                    onChange={e => setNewComment(e.target.value.slice(0, 500))}
                                    onKeyDown={handleKeyDown}
                                    rows={3}
                                />
                                <div className="comment-input-footer">
                                    <span className="comment-hint">Ctrl+Enter to post</span>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            className="comment-post-btn"
                                            onClick={handleHighlight}
                                            disabled={!newComment.trim() || posting || highlighting}
                                            style={{ backgroundColor: 'var(--sakura-pink)', color: '#fff' }}
                                        >
                                            {highlighting ? "Processing..." : "Highlight (50 🌸)"}
                                        </button>
                                        <button
                                            className="comment-post-btn"
                                            onClick={handlePost}
                                            disabled={!newComment.trim() || posting || highlighting}
                                        >
                                            {posting ? "Posting..." : "投稿 Post"}
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <button
                                className="comment-connect-btn"
                                onClick={() => setVisible(true)}
                            >
                                <LottieIcon src="/icons/wired-outline-421-wallet-purse-hover-pinch.json" size={16} tone="dim" replayIntervalMs={3000} autoplay />
                                Sign up / Login to comment
                            </button>
                        )}
                    </div>

                    {/* Comments List */}
                    {loading ? (
                        <div className="comments-loading">
                            <div className="swm-spinner" />
                            <span>Loading comments...</span>
                        </div>
                    ) : comments.length === 0 ? (
                        <div className="comments-empty">
                            <p>No comments yet — be the first! 🌸</p>
                        </div>
                    ) : (
                        <div className="comments-list">
                            {sortedComments.map(comment => (
                                <div key={comment.id} className="comment-item" style={
                                    comment.is_highlighted ? {
                                        background: 'linear-gradient(135deg, rgba(255, 105, 180, 0.15) 0%, rgba(255, 183, 197, 0.05) 100%)',
                                        border: '1px solid rgba(255, 105, 180, 0.4)',
                                        boxShadow: '0 0 10px rgba(255, 105, 180, 0.1)'
                                    } : {}
                                }>
                                    <div className="comment-header">
                                        <Link
                                            href={`/profile?wallet=${comment.wallet_address}`}
                                            className="comment-author"
                                        >
                                            <span
                                                className="comment-avatar"
                                                style={{
                                                    background: `hsl(${hashCode(comment.wallet_address) % 360}, 60%, 50%)`,
                                                }}
                                            >
                                                {(comment.profile?.display_name || comment.wallet_address)[0].toUpperCase()}
                                            </span>
                                            <span className="comment-name">
                                                {comment.profile?.display_name || truncateAddress(comment.wallet_address)}
                                                {comment.profile?.has_pass && (
                                                    <span className="pass-badge" title="Pass Holder">🌸</span>
                                                )}
                                                {comment.is_highlighted && (
                                                    <span style={{ marginLeft: 6, fontSize: '10px', background: 'var(--sakura-pink)', color: '#fff', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold' }}>SUPER CHAT</span>
                                                )}
                                            </span>
                                        </Link>
                                        <div className="comment-meta">
                                            <span className="comment-time">{timeAgo(comment.created_at)}</span>
                                            {walletAddress === comment.wallet_address && (
                                                <button
                                                    className="comment-delete"
                                                    onClick={() => handleDelete(comment.id)}
                                                    title="Delete comment"
                                                >
                                                    🗑
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <p className="comment-content">{comment.content}</p>
                                    <EmojiReactions
                                        commentId={comment.id}
                                        reactions={comment.reactions || []}
                                        walletAddress={walletAddress}
                                        onToggle={handleReaction}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/* Simple string hash for deterministic avatar color */
function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
}
