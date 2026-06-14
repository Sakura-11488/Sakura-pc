"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { truncateAddress, getConnection, SAKURA_MINT, SOLANA_NETWORK } from "@/lib/solana";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { generateWallet, storeWalletSecurely, removeWalletSecurely } from "@/lib/wallet";
import { SakuraNativeWalletAdapter } from "@/lib/wallet-adapter";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";

const BuySakuraModal = dynamic(() => import("@/components/BuySakuraModal"), { ssr: false });
const TipModal = dynamic(() => import("@/components/TipModal"), { ssr: false });
import LottieIcon from "@/components/LottieIcon";

/* ─── Context ─── */
interface SakuraWalletModalContextType {
    visible: boolean;
    setVisible: (v: boolean) => void;
}

const SakuraWalletModalContext = createContext<SakuraWalletModalContextType>({
    visible: false,
    setVisible: () => { },
});

export function useSakuraWalletModal() {
    return useContext(SakuraWalletModalContext);
}

/* ─── Provider + Modal ─── */
export function SakuraWalletModalProvider({ children }: { children: React.ReactNode }) {
    const [visible, setVisible] = useState(false);

    return (
        <SakuraWalletModalContext.Provider value={{ visible, setVisible }}>
            {children}
            {visible && <SakuraWalletModal onClose={() => setVisible(false)} />}
        </SakuraWalletModalContext.Provider>
    );
}

/* ─── The Modal ─── */
function SakuraWalletModal({ onClose }: { onClose: () => void }) {
    const { wallets, select, publicKey, disconnect, connected } = useWallet();
    const router = useRouter();
    const [balance, setBalance] = useState<number | null>(null);
    const [sakuraBalance, setSakuraBalance] = useState<number | null>(null);

    const [showBuySakura, setShowBuySakura] = useState(false);
    const [showDonate, setShowDonate] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importKey, setImportKey] = useState("");

    const fetchBalances = useCallback(() => {
        if (!publicKey) {
            setBalance(null);
            setSakuraBalance(null);
            return;
        }

        const conn = getConnection();

        conn.getBalance(publicKey)
            .then(b => setBalance(b / LAMPORTS_PER_SOL))
            .catch((e) => { console.warn("SOL balance fetch failed:", e); setBalance(0); });

        import("@/lib/solana").then(({ SAKURA_MINT, SAKURA_DECIMALS }) => {
            conn.getParsedTokenAccountsByOwner(publicKey, { mint: SAKURA_MINT })
                .then(accounts => {
                    if (accounts.value.length > 0) {
                        let total = 0;
                        for (const account of accounts.value) {
                            const amountStr = account.account.data.parsed.info.tokenAmount.amount;
                            total += Number(amountStr) / (10 ** SAKURA_DECIMALS);
                        }
                        setSakuraBalance(total);
                    } else {
                        setSakuraBalance(0);
                    }
                })
                .catch((e) => { console.warn("SAKURA balance fetch failed:", e); setSakuraBalance(0); });
        });
    }, [publicKey]);

    const [balanceLoading, setBalanceLoading] = useState(false);
    const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        fetchBalances();

        if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
        if (publicKey) {
            refreshTimerRef.current = setInterval(fetchBalances, 15_000);
        }
        return () => {
            if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
        };
    }, [fetchBalances]);

    const finishEmbeddedWalletConnect = async (publicKeyBase58: string) => {
        if (!wallets || wallets.length === 0) {
            throw new Error("No wallet adapter available");
        }
        const adapter = wallets[0].adapter;

        // The wallet-adapter-react WalletProvider wires its 'connect' listener
        // to the adapter inside a useEffect that runs AFTER `select()` has
        // propagated through React state. Calling adapter.connect() before
        // that effect runs means the listener never sees the event and the
        // UI stays on the "Create Wallet" screen even though the keypair is
        // safely stored. The robust way to drive it is:
        //   1. unselect (resets autoConnect tracking + listener attachment),
        //   2. yield to React,
        //   3. re-select — the provider's autoConnect effect then calls
        //      adapter.connect() AFTER its listener is attached, so the
        //      'connect' event lands in `setPublicKey` and the UI updates
        //      immediately.
        try {
            select(null);
        } catch {
            /* ignore */
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
        select(adapter.name);

        // Belt-and-suspenders: if we somehow miss the event window, push the
        // pubkey into the adapter directly so the next render picks it up via
        // adapter.publicKey.
        if (adapter instanceof SakuraNativeWalletAdapter) {
            setTimeout(() => {
                if (!adapter.publicKey) {
                    adapter.applyPersistedPublicKey(publicKeyBase58);
                }
            }, 250);
        }
    };

    const handleCreateWallet = async () => {
        try {
            setError(null);
            setIsGenerating(true);

            const newKeypair = generateWallet();
            await storeWalletSecurely(newKeypair);
            await finishEmbeddedWalletConnect(newKeypair.publicKey.toBase58());
        } catch (err: any) {
            console.error("Wallet generation error:", err);
            setError(err?.message || "Failed to create wallet");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleImportWallet = async () => {
        try {
            setError(null);
            if (!importKey) return;

            let keypair: Keypair;
            try {
                const secretKey = bs58.decode(importKey.trim());
                keypair = Keypair.fromSecretKey(secretKey);
            } catch (e) {
                throw new Error("Invalid Secret Key format (must be Base58)");
            }

            setIsImporting(true);
            await storeWalletSecurely(keypair);
            await finishEmbeddedWalletConnect(keypair.publicKey.toBase58());
        } catch (err: any) {
            console.error("Wallet import error:", err);
            setError(err?.message || "Failed to import wallet");
        } finally {
            setIsImporting(false);
        }
    };

    const handleDisconnect = useCallback(async () => {
        try {
            await disconnect();
            await removeWalletSecurely();
            onClose();
        } catch (err) {
            console.error(err);
        }
    }, [disconnect, onClose]);

    const handleCopy = useCallback(async () => {
        if (!publicKey) return;
        try {
            await navigator.clipboard.writeText(publicKey.toBase58());
        } catch {
            try {
                const ta = document.createElement('textarea');
                ta.value = publicKey.toBase58();
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            } catch {}
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [publicKey]);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    return (
        <div className="sakura-wallet-overlay" onClick={onClose}>
            <div className="sakura-wallet-modal" onClick={e => e.stopPropagation()}>
                <div className="swm-petals">
                    <span className="swm-petal" style={{ top: '-6px', left: '20%', animationDelay: '0s' }}>🌸</span>
                    <span className="swm-petal" style={{ top: '-8px', right: '15%', animationDelay: '0.5s' }}>🌸</span>
                    <span className="swm-petal" style={{ bottom: '-6px', left: '40%', animationDelay: '1s' }}>🌸</span>
                </div>

                <button className="swm-close" onClick={onClose} aria-label="Close">×</button>

                {connected && publicKey ? (
                    <div className="swm-connected">
                        <div className="swm-kicker">Connected</div>
                        <div className="swm-avatar">
                            <LottieIcon src="/icons/wired-outline-421-wallet-purse-hover-pinch.json" size={40} colorFilter="invert(52%) sepia(74%) saturate(1057%) hue-rotate(308deg)" replayIntervalMs={3000} autoplay />
                        </div>
                        <h2 className="swm-title">Sakura Native Wallet</h2>
                        <p className="swm-subtitle">Your library, pass, tips, and creator tools sync through this device wallet.</p>
                        <span className="swm-network-badge">Solana {SOLANA_NETWORK}</span>

                        <div className="swm-address-card" onClick={handleCopy}>
                            <div className="swm-address-meta">
                                <span className="swm-address-label">Wallet address</span>
                                <span className="swm-address">{truncateAddress(publicKey.toBase58())}</span>
                            </div>
                            <span className="swm-copy-hint">{copied ? "Copied" : "Copy"}</span>
                        </div>

                        <div className="swm-balances">
                            <div className="swm-balance-card swm-balance-card-sol">
                                <span className="swm-balance-label">SOL</span>
                                <span className="swm-balance-amount">{balance !== null ? balance.toFixed(4) : "…"}</span>
                            </div>
                            <div className="swm-balance-card swm-balance-card-sakura">
                                <span className="swm-balance-label">$SAKURA</span>
                                <span className="swm-balance-amount">{sakuraBalance !== null ? sakuraBalance.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "…"}</span>
                            </div>
                        </div>

                        <button
                            type="button"
                            className="swm-refresh-btn"
                            onClick={() => { setBalanceLoading(true); fetchBalances(); setTimeout(() => setBalanceLoading(false), 1500); }}
                            disabled={balanceLoading}
                        >
                            {balanceLoading ? "Refreshing…" : "Refresh balances"}
                        </button>

                        {(SOLANA_NETWORK as string) === "mainnet-beta" && (
                            <div className="swm-connected-actions">
                                <button type="button" className="bsm-buy-btn swm-action-primary" onClick={() => setShowBuySakura(true)}>
                                    <span className="bsm-buy-btn-icon">🌸</span>
                                    Buy $SAKURA
                                </button>
                                <button type="button" className="btn-secondary swm-action-btn" onClick={() => setShowDonate(true)}>
                                    Support Sakura
                                </button>
                                <button
                                    type="button"
                                    className="btn-secondary swm-action-btn"
                                    onClick={() => { onClose(); router.push("/trade"); }}
                                >
                                    Trade SOL-PERP
                                </button>
                            </div>
                        )}

                        {showDonate && (
                            <TipModal
                                onClose={() => setShowDonate(false)}
                                header="Support Sakura"
                                subtitle="Donate $SAKURA to the Sakura treasury"
                                onComplete={() => fetchBalances()}
                            />
                        )}

                        {showBuySakura && (
                            <BuySakuraModal
                                onClose={() => setShowBuySakura(false)}
                                solBalance={balance ?? 0}
                                onComplete={() => fetchBalances()}
                            />
                        )}

                        <button type="button" className="swm-disconnect-btn" onClick={handleDisconnect}>
                            Delete &amp; disconnect
                        </button>
                    </div>
                ) : (
                    <div className="swm-select">
                        <div className="swm-kicker">Sakura Account</div>
                        <div className="swm-header-icon">
                            <LottieIcon src="/icons/wired-outline-421-wallet-purse-hover-pinch.json" size={48} colorFilter="invert(52%) sepia(74%) saturate(1057%) hue-rotate(308deg)" replayIntervalMs={3000} autoplay />
                        </div>
                        <h2 className="swm-title">Sign Up / Login</h2>
                        <p className="swm-subtitle">Your library, pass, tips, and creator tools sync through a private Solana wallet stored on this device.</p>

                        {error && (
                            <div className="swm-error">
                                <span>Error: {error}</span>
                            </div>
                        )}

                        {isImporting ? (
                            <div className="swm-import-section">
                                <label className="swm-import-label" htmlFor="sakura-wallet-import">Secret key</label>
                                <input
                                    id="sakura-wallet-import"
                                    className="swm-import-input"
                                    placeholder="Paste Base58 Secret Key..."
                                    value={importKey}
                                    onChange={(e) => setImportKey(e.target.value)}
                                    autoFocus
                                />
                                <p className="swm-import-help">Only import keys you control. Sakura stores this locally and never shows it again.</p>
                                <div className="swm-import-actions">
                                    <button className="swm-wallet-btn swm-wallet-btn-secondary" onClick={() => setIsImporting(false)}>
                                        Cancel
                                    </button>
                                    <button
                                        className="swm-wallet-btn swm-wallet-btn-hero"
                                        onClick={handleImportWallet}
                                        disabled={!importKey.trim()}
                                    >
                                        Import
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="swm-section">
                                    <button className="swm-wallet-btn swm-wallet-btn-hero" onClick={handleCreateWallet} disabled={isGenerating}>
                                        <LottieIcon src="/icons/wired-outline-421-wallet-purse-hover-pinch.json" size={28} autoplay replayIntervalMs={3000} />
                                        <div className="swm-wallet-info">
                                            <span className="swm-wallet-name">{isGenerating ? "Creating Wallet..." : "Create New Wallet"}</span>
                                            <span className="swm-wallet-tag">Instant local Solana wallet</span>
                                        </div>
                                    </button>
                                    <button className="swm-wallet-btn" onClick={() => setIsImporting(true)}>
                                        <LottieIcon src="/icons/wired-outline-199-download-2-hover-pointing.json" size={28} autoplay replayIntervalMs={3000} />
                                        <div className="swm-wallet-info">
                                            <span className="swm-wallet-name">Import Existing</span>
                                            <span className="swm-wallet-tag">Paste a secret key</span>
                                        </div>
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
