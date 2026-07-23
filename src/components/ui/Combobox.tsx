"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface ComboboxItem {
  id: string;
  label: string;
}

interface ComboboxProps {
  items: ComboboxItem[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Generic searchable typeahead combobox. Built as a controlled text input +
 * local dropdown state — no external library. Typing filters `items` by a
 * case-insensitive substring match on `label`; the dropdown supports
 * click, Enter, ArrowUp/ArrowDown, and Escape/blur to close.
 */
export function Combobox({ items, value, onChange, placeholder, className, disabled }: ComboboxProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedItem = useMemo(() => items.find((i) => i.id === value) ?? null, [items, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.label.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, isOpen]);

  // Close the dropdown when clicking outside the combobox.
  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openDropdown() {
    setIsOpen(true);
    setQuery("");
  }

  function closeDropdown() {
    setIsOpen(false);
    setQuery("");
  }

  function selectItem(item: ComboboxItem) {
    onChange(item.id);
    closeDropdown();
    inputRef.current?.blur();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) {
        openDropdown();
        return;
      }
      setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) {
        openDropdown();
        return;
      }
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[highlightedIndex];
      if (item) selectItem(item);
    } else if (e.key === "Escape") {
      closeDropdown();
      inputRef.current?.blur();
    }
  }

  const displayValue = isOpen ? query : selectedItem?.label ?? "";

  return (
    <div ref={containerRef} className={["relative", className ?? ""].join(" ")}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        disabled={disabled}
        value={displayValue}
        onFocus={openDropdown}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!isOpen) setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        onBlur={closeDropdown}
        placeholder={placeholder}
        className="w-full rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
      />
      {isOpen && (
        <div className="absolute z-20 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded border border-border bg-popover shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No matches</p>
          ) : (
            filtered.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                // Fire before the input's blur handler so selection registers.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectItem(item)}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={[
                  "block w-full text-left px-2 py-1 text-xs transition-colors",
                  idx === highlightedIndex
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted",
                ].join(" ")}
              >
                {item.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
