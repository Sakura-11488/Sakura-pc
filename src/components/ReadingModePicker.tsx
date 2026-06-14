"use client";

import type { ReadingMode } from "@/lib/reading-mode";
import { READING_MODE_OPTIONS } from "@/lib/reading-mode";

type ReadingModePickerProps = {
    value: ReadingMode;
    onChange: (mode: ReadingMode) => void;
    compact?: boolean;
};

export default function ReadingModePicker({ value, onChange, compact }: ReadingModePickerProps) {
    return (
        <div className={`reading-mode-picker${compact ? " reading-mode-picker-compact" : ""}`}>
            {READING_MODE_OPTIONS.map((option) => (
                <button
                    key={option.id}
                    type="button"
                    className={`reading-mode-picker-option${value === option.id ? " active" : ""}`}
                    onClick={() => onChange(option.id)}
                    aria-pressed={value === option.id}
                >
                    <span className="reading-mode-picker-title">{option.subtitle}</span>
                    {!compact && <span className="reading-mode-picker-desc">{option.desc}</span>}
                </button>
            ))}
        </div>
    );
}
