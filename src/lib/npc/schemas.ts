import { z } from "zod";

export const detailTableSchema = z.object({
  label: z.string().min(1),
  tableId: z.string(),
});

export const npcProfileConfigSchema = z.object({
  typeLabel: z.string().default("Type"),
  secondaryTypeLabel: z.string().nullable().default(null),
  typeTableId: z.string().nullable().default(null),
  secondaryTypeTableId: z.string().nullable().default(null),
  ageTableId: z.string().nullable().default(null),
  physicalTableIds: z.array(z.string()).default([]),
  personalityTableIds: z.array(z.string()).default([]),
  detailTableIds: z.array(detailTableSchema).default([]),
});
