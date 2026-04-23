"use client";

import Image from "next/image";
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
}

export default function TopBar({
  campaign,
  allCampaigns,
  mode,
  onModeChange,
  onRegionChange,
  currentDungeonRegionId,
  onDungeonRegionChange,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 flex items-center gap-3 border-b bg-background/95 backdrop-blur px-4 py-2 h-14">
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
      <CampaignSwitcher currentCampaign={campaign} allCampaigns={allCampaigns} />

      {/* Mode toggle */}
      <div data-slot="button-group" className="flex rounded-md border border-border overflow-hidden shrink-0">
        <Button
          size="xs"
          variant={mode === "OVERLAND" ? "default" : "ghost"}
          onClick={() => onModeChange("OVERLAND")}
          title="Overland exploration mode"
        >
          Overland
        </Button>
        <Button
          size="xs"
          variant={mode === "DUNGEON" ? "default" : "ghost"}
          onClick={() => onModeChange("DUNGEON")}
          title="Dungeon exploration mode"
        >
          Dungeon
        </Button>
        <Button
          size="xs"
          variant={mode === "COMBAT" ? "default" : "ghost"}
          onClick={() => onModeChange("COMBAT")}
          title="Combat encounter mode"
        >
          Combat
        </Button>
      </div>

      <div className="flex-1" />

      {/* Dungeon location picker — only in dungeon mode */}
      {mode === "DUNGEON" && (
        <DungeonRegionSelector
          campaign={campaign}
          currentDungeonRegionId={currentDungeonRegionId}
          onDungeonRegionChange={onDungeonRegionChange}
        />
      )}

      {/* Overland region selector — always visible */}
      <RegionSelector campaign={campaign} onRegionChange={onRegionChange} />
    </header>
  );
}
