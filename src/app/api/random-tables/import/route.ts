import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api-helpers";
import { parseTable, detectFormat, type ImportFormat } from "@/lib/tables/import";

const importSchema = z.object({
  raw: z.string().min(1),
  format: z.enum(["csv", "markdown", "plaintext", "commalist"]).optional(),
});

export async function POST(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { raw, format } = parsed.data;
  const detectedFormat = format ?? detectFormat(raw);
  const preview = parseTable(raw, detectedFormat as ImportFormat);

  return NextResponse.json({ format: detectedFormat, ...preview });
}
