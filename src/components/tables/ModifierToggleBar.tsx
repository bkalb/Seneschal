"use client";

import type { TableModifier } from "@/types/table";

interface Props {
  modifiers: TableModifier[];
  activeToggles: string[];
  onToggle: (modifierId: string) => void;
}

export function ModifierToggleBar({ modifiers, activeToggles, onToggle }: Props) {
  if (modifiers.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 py-1">
      {modifiers.map((mod) => {
        const isActive = activeToggles.includes(mod.id);
        return (
          <button
            key={mod.id}
            onClick={() => onToggle(mod.id)}
            className={[
              "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
              isActive
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:border-primary hover:text-foreground",
            ].join(" ")}
            title={mod.rollAdjustment >= 0 ? `+${mod.rollAdjustment} to roll` : `${mod.rollAdjustment} to roll`}
          >
            {mod.label}
            {mod.rollAdjustment !== 0 && (
              <span className="ml-1 opacity-70">
                ({mod.rollAdjustment >= 0 ? "+" : ""}{mod.rollAdjustment})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
