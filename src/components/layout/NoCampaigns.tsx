"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function NoCampaigns() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const importFileRef = useRef<HTMLInputElement>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (!res.ok) {
      setError("Failed to create campaign. Please try again.");
      setLoading(false);
      return;
    }
    const campaign = await res.json();
    router.push(`/dashboard/${campaign.id}`);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    setError("");
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetch("/api/campaigns/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(`Import failed: ${err.error ?? res.statusText}`);
        return;
      }
      const campaign = await res.json();
      router.push(`/dashboard/${campaign.id}`);
    } catch {
      setError("Import failed: invalid file");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <input
        ref={importFileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportFile}
      />
      <div className="w-full max-w-sm space-y-6 p-8 border rounded-lg shadow-sm">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Welcome to Seneschal</h1>
          <p className="text-sm text-muted-foreground">
            Create your first campaign to get started.
          </p>
        </div>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="campaign-name">Campaign name</Label>
            <Input
              id="campaign-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. The Black Strath Campaign"
              autoFocus
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={!name.trim() || loading}>
            {loading ? "Creating…" : "Create campaign"}
          </Button>
        </form>
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">or</span>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={importing}
          onClick={() => importFileRef.current?.click()}
        >
          {importing ? "Importing…" : "Import existing campaign"}
        </Button>
      </div>
    </div>
  );
}
