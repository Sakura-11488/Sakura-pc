"use client";

import { useState, useEffect, Suspense } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { submitCreatorApplication } from "@/lib/creator";
import { useSakuraWalletModal } from "@/components/SakuraWalletModal";
import BackButton from "@/components/BackButton";
import { useRouter, useSearchParams } from "next/navigation";
import { truncateAddress } from "@/lib/solana";

function CreatorApplyPageContent() {
    const { publicKey, connected } = useWallet();
    const { setVisible } = useSakuraWalletModal();
    const router = useRouter();
    const searchParams = useSearchParams();

    const initialAuthorId = searchParams?.get("authorId") || "";

    const [displayName, setDisplayName] = useState("");
    const [bio, setBio] = useState("");
    const [contentAuthorId, setContentAuthorId] = useState(initialAuthorId);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!connected) {
            setVisible(true);
        }
    }, [connected, setVisible]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!connected || !publicKey) {
            setError("You must connect a wallet to apply.");
            setVisible(true);
            return;
        }

        if (!displayName.trim()) {
            setError("Display name is required.");
            return;
        }

        try {
            setError(null);
            setIsSubmitting(true);

            const result = await submitCreatorApplication(
                publicKey.toBase58(),
                displayName.trim(),
                bio.trim(),
                contentAuthorId.trim() || null,
            );

            if (result) {
                setSuccess(true);
                setTimeout(() => {
                    router.push(`/creator?id=${publicKey.toBase58()}`);
                }, 3000);
            } else {
                setError("Failed to submit application. Please try again.");
            }
        } catch (err: unknown) {
            console.error("Application error:", err);
            setError(err instanceof Error ? err.message : "An unexpected error occurred.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const walletLabel = connected && publicKey
        ? truncateAddress(publicKey.toBase58())
        : "Not connected";

    return (
        <div className="creator-apply-page">
            <header className="creator-apply-head">
                <BackButton />
                <h1 className="creator-apply-head-title">Creator Profile Setup</h1>
            </header>

            <div className="creator-apply-card">
                <div className="creator-apply-hero">
                    <div className="creator-apply-kicker">Creator</div>
                    <h2 className="creator-apply-title">Become a Creator</h2>
                    <p className="creator-apply-subtitle">
                        Set up a creator profile for publishing, public creator pages, and direct $SAKURA support from readers.
                    </p>
                </div>

                {success ? (
                    <div className="creator-apply-success">
                        <div className="creator-apply-kicker">Submitted</div>
                        <h3>Application submitted</h3>
                        <p>
                            Your profile has been created and is pending primary verification. You will be redirected to your profile shortly.
                        </p>
                    </div>
                ) : (
                    <form className="creator-apply-form" onSubmit={handleSubmit}>
                        <div className="creator-apply-field">
                            <label className="swm-import-label" htmlFor="creator-wallet">Wallet address</label>
                            <input
                                id="creator-wallet"
                                type="text"
                                className={`swm-import-input creator-apply-input ${connected ? "is-connected" : "is-disabled"}`}
                                value={walletLabel}
                                disabled
                                readOnly
                            />
                            {!connected && (
                                <button type="button" className="creator-apply-link-btn" onClick={() => setVisible(true)}>
                                    Connect wallet
                                </button>
                            )}
                        </div>

                        <div className="creator-apply-field">
                            <label className="swm-import-label" htmlFor="creator-author-id">Existing author ID (optional)</label>
                            <input
                                id="creator-author-id"
                                type="text"
                                className="swm-import-input creator-apply-input"
                                value={contentAuthorId}
                                onChange={(e) => setContentAuthorId(e.target.value)}
                                placeholder="e.g. 5e1823ab-..."
                            />
                            <p className="creator-apply-help">
                                If you already publish elsewhere, you can add your existing author ID now and link it later to this creator profile.
                            </p>
                        </div>

                        <div className="creator-apply-field">
                            <label className="swm-import-label" htmlFor="creator-display-name">Display name *</label>
                            <input
                                id="creator-display-name"
                                type="text"
                                className="swm-import-input creator-apply-input"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="Your pen name or studio name"
                                required
                            />
                        </div>

                        <div className="creator-apply-field">
                            <label className="swm-import-label" htmlFor="creator-bio">Creator bio</label>
                            <textarea
                                id="creator-bio"
                                className="swm-import-input creator-apply-textarea"
                                value={bio}
                                onChange={(e) => setBio(e.target.value)}
                                placeholder="Tell readers about yourself and your works..."
                                rows={4}
                            />
                        </div>

                        {error && <div className="creator-apply-error">{error}</div>}

                        <button
                            type="submit"
                            className="btn-primary creator-apply-submit"
                            disabled={!connected || isSubmitting}
                        >
                            {isSubmitting ? "Creating creator profile…" : "Create creator profile"}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}

export default function CreatorApplyPage() {
    return (
        <Suspense fallback={<div className="creator-apply-page creator-apply-loading"><div className="spinner" /></div>}>
            <CreatorApplyPageContent />
        </Suspense>
    );
}
