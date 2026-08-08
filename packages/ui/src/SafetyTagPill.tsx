import React from "react";

export type SafetyTier = "safe" | "check" | "blocked" | "unsure";

export interface SafetyTagPillProps {
  tier: SafetyTier;
  label?: string;
  className?: string;
}

const TIER_STYLES: Record<SafetyTier, { bgClass: string; textClass: string; defaultLabel: string }> = {
  safe: {
    bgClass: "bg-tag-safe-bg",
    textClass: "text-tag-safe-text",
    defaultLabel: "Safe to Clean",
  },
  check: {
    bgClass: "bg-tag-check-bg",
    textClass: "text-tag-check-text",
    defaultLabel: "Check First",
  },
  blocked: {
    bgClass: "bg-tag-danger-bg",
    textClass: "text-tag-danger-text",
    defaultLabel: "System Blocked",
  },
  unsure: {
    bgClass: "bg-tag-unsure-bg",
    textClass: "text-tag-unsure-text",
    defaultLabel: "Unsure",
  },
};

export const SafetyTagPill = React.memo(function SafetyTagPill({
  tier,
  label,
  className = "",
}: SafetyTagPillProps) {
  const config = TIER_STYLES[tier] || TIER_STYLES.unsure;
  const displayLabel = label || config.defaultLabel;

  return (
    <span
      className={`inline-flex items-center rounded-xs px-1.5 py-0.5 text-meta font-medium ${config.bgClass} ${config.textClass} ${className}`}
    >
      {displayLabel}
    </span>
  );
});
