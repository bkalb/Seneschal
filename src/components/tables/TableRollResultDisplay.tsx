"use client";

import { useState } from "react";
import type { TableRollResult, TableRow } from "@/types/table";
import { extractCombatantInfo } from "@/lib/combat-prefill";

interface Props {
  result: TableRollResult;
  tableRows?: TableRow[]; // passed from TableCard for the collapsible view
  onSendToCombat?: (name: string, count: number) => void;
}


export function TableRollResultDisplay({ result, tableRows, onSendToCombat }: Props) {
  const { rawDiceTotal, diceTotal, appliedModifiers, resolvedOutcome, reaction, surprise, subRolls, prerequisiteRoll } = result;
  const hasModifiers = appliedModifiers.length > 0;
  const [showTable, setShowTable] = useState(false);
  const combatInfo = onSendToCombat
    ? extractCombatantInfo(resolvedOutcome.expandedText)
    : null;

  // When the prerequisite check failed, skip the main roll display entirely.
  if (prerequisiteRoll?.passed === false) {
    return (
      <div className="mt-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
        <div className="text-muted-foreground">
          No encounter —{" "}
          <span className="font-mono text-xs">{prerequisiteRoll.dice}</span>
          {" "}rolled <strong>{prerequisiteRoll.result}</strong> (required {prerequisiteRoll.min}–{prerequisiteRoll.max})
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-border bg-muted/40 p-3 text-sm space-y-2">
      {/* Prerequisite check — passed */}
      {prerequisiteRoll?.passed && (
        <div className="text-xs text-muted-foreground">
          Check: <span className="font-mono">{prerequisiteRoll.dice}</span> → <strong>{prerequisiteRoll.result}</strong>{" "}
          (required {prerequisiteRoll.min}–{prerequisiteRoll.max})
        </div>
      )}

      {/* Main encounter result */}
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-foreground leading-snug">
          {resolvedOutcome.expandedText}
        </div>
        <span className="sr-only" role="status" aria-live="polite">
          {resolvedOutcome.expandedText}
        </span>
        {combatInfo && (
          <button
            onClick={() => onSendToCombat!(combatInfo.name, combatInfo.count)}
            className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border hover:border-foreground/40 rounded px-1.5 py-0.5 transition-colors"
            title={`Send to Combat: ${combatInfo.count}× ${combatInfo.name}`}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Combat
          </button>
        )}
      </div>

      {resolvedOutcome.inlineRolls.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Inline rolls:{" "}
          {resolvedOutcome.inlineRolls.map((r, i) => (
            <span key={i} className="mr-2">
              {r.notation} → <strong>{r.result}</strong>
            </span>
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
        {hasModifiers ? (
          <>
            <span>Base: {rawDiceTotal}</span>
            {appliedModifiers.map((m, i) => (
              <span key={i} className={m.adjustment >= 0 ? "text-green-600" : "text-red-600"}>
                {m.label}: {m.adjustment >= 0 ? "+" : ""}{m.adjustment}
              </span>
            ))}
            <span className="font-medium text-foreground">Total: {diceTotal}</span>
          </>
        ) : (
          <span>Roll: {diceTotal}</span>
        )}
      </div>

      {/* Sub-rolls (e.g. "roll a d20 for each side") */}
      {subRolls && subRolls.length > 0 && (
        <div className="space-y-1">
          {subRolls.map((sr, i) => (
            <div key={i} className="rounded border border-border bg-background px-2 py-1.5 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {sr.notation}{sr.label ? ` — ${sr.label}` : ""}
              </p>
              {sr.results.map((entry, j) => (
                <div key={j} className="space-y-0.5">
                  <div className="flex items-baseline gap-2 text-xs">
                    <span className="font-mono text-muted-foreground shrink-0">{entry.roll}</span>
                    <span className="text-foreground">{entry.expandedOutcome}</span>
                  </div>
                  {entry.inlineRolls.length > 0 && (
                    <div className="text-xs text-muted-foreground pl-6">
                      {entry.inlineRolls.map((r, k) => (
                        <span key={k} className="mr-2">{r.notation} → <strong>{r.result}</strong></span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Surprise result */}
      {surprise && (
        <div className={[
          "flex items-center gap-2 text-xs px-2 py-1 rounded border",
          surprise.surprised
            ? "bg-amber-50 border-amber-200 text-amber-800"
            : "bg-muted/60 border-border text-muted-foreground",
        ].join(" ")}>
          <span className="font-medium">{surprise.surprised ? "⚠ Surprised" : "Not surprised"}</span>
          <span className="opacity-70">
            ({surprise.dice}: rolled {surprise.roll}, threshold ≤{surprise.threshold})
          </span>
        </div>
      )}

      {/* Reaction result */}
      {reaction && (
        <div className="flex items-start gap-2 text-xs px-2 py-1 rounded border border-border border-l-2 border-l-violet-300 dark:border-l-violet-600 bg-muted/60">
          <span className="text-muted-foreground shrink-0 pt-px">{reaction.tableName}:</span>
          <span className="font-medium text-foreground">{reaction.outcome}</span>
          <span className="text-muted-foreground shrink-0 ml-auto pt-px">({reaction.roll})</span>
        </div>
      )}

      {/* Collapsible table view */}
      {tableRows && tableRows.length > 0 && (
        <div>
          <button
            onClick={() => setShowTable((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <svg
              className={["w-3 h-3 transition-transform", showTable ? "rotate-90" : ""].join(" ")}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {showTable ? "Hide table" : "View table"}
          </button>

          {showTable && (
            <div className="mt-1.5 border border-border rounded overflow-hidden">
              <div className="grid grid-cols-[52px_1fr] text-xs font-medium bg-muted px-2 py-1 text-muted-foreground">
                <span>Range</span>
                <span>Outcome</span>
              </div>
              <div className="divide-y divide-border max-h-60 overflow-y-auto">
                {tableRows.map((row, i) => {
                  const isMatched = row.min <= diceTotal && row.max >= diceTotal;
                  return (
                    <div
                      key={i}
                      className={[
                        "grid grid-cols-[52px_1fr] px-2 py-1 text-xs",
                        isMatched ? "bg-blue-50 dark:bg-blue-950/40 font-medium" : "",
                      ].join(" ")}
                    >
                      <span className="text-muted-foreground font-mono">
                        {row.min === row.max ? row.min : `${row.min}–${row.max === 999 ? "+" : row.max}`}
                      </span>
                      <span>{row.outcome}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
