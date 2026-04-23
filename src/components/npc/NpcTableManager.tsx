"use client";

import type { RandomTable } from "@/types/table";
import { TableManagerModal } from "@/components/tables/TableManagerModal";

interface Props {
  tables: RandomTable[];
  campaignId: string;
  regions: { id: string; name: string }[];
  onClose: () => void;
}

export function NpcTableManager({ tables, campaignId, regions, onClose }: Props) {
  return (
    <TableManagerModal
      title="NPC Tables"
      tables={tables}
      campaignId={campaignId}
      regions={regions}
      seasons={[]}
      onClose={onClose}
    />
  );
}
