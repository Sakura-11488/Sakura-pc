"use client";

type ReaderFloatingChromeProps = {
    onBack: () => void;
    onSettings: () => void;
    onComments?: () => void;
    onPrevChapter?: () => void;
    onNextChapter?: () => void;
    hasPrevChapter?: boolean;
    hasNextChapter?: boolean;
    onPrevPage?: () => void;
    onNextPage?: () => void;
    hasPrevPage?: boolean;
    hasNextPage?: boolean;
    showCommentsButton?: boolean;
    showPageNav?: boolean;
    backLabel?: string;
};

export default function ReaderFloatingChrome({
    onBack,
    onSettings,
    onComments,
    onPrevChapter,
    onNextChapter,
    hasPrevChapter,
    hasNextChapter,
    onPrevPage,
    onNextPage,
    hasPrevPage,
    hasNextPage,
    showCommentsButton = false,
    showPageNav = false,
    backLabel = "Details",
}: ReaderFloatingChromeProps) {
    return (
        <div className="reader-floating-chrome" aria-label="Reader controls">
            <button type="button" className="reader-float-btn reader-float-back" onClick={onBack} aria-label={`Back to ${backLabel}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                </svg>
            </button>

            <div className="reader-float-top-right">
                {showCommentsButton && onComments && (
                    <button type="button" className="reader-float-btn reader-float-comments" onClick={onComments} aria-label="Chapter comments">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                    </button>
                )}
                <button type="button" className="reader-float-btn reader-float-settings" onClick={onSettings} aria-label="Reading settings">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                </button>
            </div>

            {showPageNav && onPrevPage && (
                <button
                    type="button"
                    className="reader-page-side-btn reader-page-side-prev"
                    onClick={onPrevPage}
                    disabled={!hasPrevPage}
                    aria-label="Previous page"
                >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                </button>
            )}

            {showPageNav && onNextPage && (
                <button
                    type="button"
                    className="reader-page-side-btn reader-page-side-next"
                    onClick={onNextPage}
                    disabled={!hasNextPage}
                    aria-label="Next page"
                >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                    </svg>
                </button>
            )}

            {hasPrevChapter && onPrevChapter && (
                <button type="button" className="reader-float-bottom reader-float-bottom-prev-ch" onClick={onPrevChapter} aria-label="Previous chapter">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                    <span>Prev Ch</span>
                </button>
            )}

            {hasNextChapter && onNextChapter && (
                <button type="button" className="reader-float-bottom reader-float-bottom-next-ch" onClick={onNextChapter} aria-label="Next chapter">
                    <span>Next Ch</span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                    </svg>
                </button>
            )}
        </div>
    );
}
