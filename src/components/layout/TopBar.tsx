"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTheme } from "next-themes";
import { Sun, Moon, History } from "lucide-react";
import CampaignSwitcher from "./CampaignSwitcher";
import RegionSelector from "./RegionSelector";
import DungeonRegionSelector from "./DungeonRegionSelector";
import type { ExplorationMode } from "./AppShell";
import { Button } from "@/components/ui/button";

interface Campaign {
  id: string;
  name: string;
  defaultSurpriseDice: string | null;
  defaultSurpriseThreshold: number | null;
  defaultReactionTableId: string | null;
  defaultMoraleTableId: string | null;
  encounterWindowsJson: string;
  defaultCombatAC: number | null;
  defaultCombatHD: string | null;
  defaultCombatAttackBonus: number | null;
  defaultCombatAttackDamage: string | null;
  defaultRollHpIndividually: boolean;
  defaultTraitTableId: string | null;
  defaultTraitCount: number | null;
  state: {
    currentRegionId: string | null;
    currentDate: string;
    mode: string;
    currentTime: string;
    currentDungeonRegionId: string | null;
    currentRegion: { id: string; name: string; rerollOnSwitch: boolean; regionType: string } | null;
  } | null;
  regions: { id: string; name: string; rerollOnSwitch: boolean; regionType: string }[];
}

interface TopBarProps {
  campaign: Campaign;
  allCampaigns: { id: string; name: string }[];
  mode: ExplorationMode;
  onModeChange: (mode: ExplorationMode) => void;
  onRegionChange: (regionId: string | null) => void;
  currentDungeonRegionId: string | null;
  onDungeonRegionChange: (regionId: string | null) => void;
  onOpenHistory: () => void;
}

export default function TopBar({
  campaign,
  allCampaigns,
  mode,
  onModeChange,
  onRegionChange,
  currentDungeonRegionId,
  onDungeonRegionChange,
  onOpenHistory,
}: TopBarProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="sticky top-0 z-40 flex items-center gap-2 sm:gap-3 border-b bg-background/95 backdrop-blur px-2 sm:px-4 py-2 h-14">
      <div className="flex items-center gap-2 shrink-0">
        <Image
          src="/logo.png"
          alt="Seneschal Logo"
          width={24}
          height={24}
          className="w-6 h-6"
        />
        <span className="font-semibold text-sm tracking-tight hidden sm:block">
          Seneschal
        </span>
      </div>
      <div className="h-4 w-px bg-border hidden sm:block" />
      <div className="min-w-0 shrink">
        <CampaignSwitcher currentCampaign={campaign} allCampaigns={allCampaigns} />
      </div>

      {/* Mode toggle */}
      <div data-slot="button-group" className="flex rounded-md border border-border overflow-hidden shrink-0">
        <Button
          size="xs"
          variant={mode === "OVERLAND" ? "default" : "ghost"}
          onClick={() => onModeChange("OVERLAND")}
          title="Overland exploration mode"
          aria-label="Overland exploration mode"
        >
          <span className="hidden sm:inline">Overland</span>
          <span className="sm:hidden">O</span>
        </Button>
        <Button
          size="xs"
          variant={mode === "DUNGEON" ? "default" : "ghost"}
          onClick={() => onModeChange("DUNGEON")}
          title="Dungeon exploration mode"
          aria-label="Dungeon exploration mode"
        >
          <span className="hidden sm:inline">Dungeon</span>
          <span className="sm:hidden">D</span>
        </Button>
        <Button
          size="xs"
          variant={mode === "COMBAT" ? "default" : "ghost"}
          onClick={() => onModeChange("COMBAT")}
          title="Combat encounter mode"
          aria-label="Combat encounter mode"
        >
          <span className="hidden sm:inline">Combat</span>
          <span className="sm:hidden">C</span>
        </Button>
      </div>

      <div className="flex-1 min-w-0" />

      <Button
        size="xs"
        variant="ghost"
        onClick={onOpenHistory}
        title="Roll history"
        aria-label="Roll history"
      >
        <History className="h-4 w-4" />
      </Button>

      <Button
        size="xs"
        variant="ghost"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        title="Toggle dark mode"
        aria-label="Toggle dark mode"
      >
        {mounted && resolvedTheme === "dark" ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )}
      </Button>

      {/* Dungeon location picker — only in dungeon mode */}
      {mode === "DUNGEON" && (
        <div className="min-w-0 shrink">
          <DungeonRegionSelector
            campaign={campaign}
            currentDungeonRegionId={currentDungeonRegionId}
            onDungeonRegionChange={onDungeonRegionChange}
          />
        </div>
      )}

      {/* Overland region selector — always visible */}
      <div className="min-w-0 shrink">
        <RegionSelector campaign={campaign} onRegionChange={onRegionChange} />
      </div>
    </header>
  );
}
