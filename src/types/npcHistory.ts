import type { GeneratedNpc } from "./npc";

export type NpcHistoryRetention = 5 | 10 | 25;

export interface NpcResultSet {
  id: string;                     // crypto.randomUUID()
  /** Real-world epoch ms. */
  createdAt: number;
  profileId: string;
  /** Snapshotted — survives profile rename/deletion (D9). */
  profileName: string;
  /** Raw campaign date, "YYYY-MM-DD". Null if the campaign has no calendar config. */
  inGameDate: string | null;
  /** Rendered at generation, e.g. "12 Harvestmoon 1247". */
  inGameDateLabel: string | null;
  regionId: string | null;
  /** Rendered at generation. Survives region rename/deletion. */
  regionName: string | null;
  /** Exempt from trimming; does not count toward retention (D14). */
  pinned: boolean;
  npcs: GeneratedNpc[];
}
