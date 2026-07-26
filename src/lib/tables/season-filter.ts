// Season-filter predicate shared by the calendar advance/forecast routes'
// `tablePassesFilter` helpers. `RandomTable.seasonName` is stored as a
// comma-joined list of season names (see `parseSeasonNames` in
// TableEditModal and the wizard's create payload in TableImportWizard);
// `rollWhenNoSeason` ("always" | "skip") controls behavior when the active
// season is unknown or doesn't match.
export function seasonFilterPasses(
  raw: { seasonName: string | null; rollWhenNoSeason: string },
  activeSeasonName: string | null
): boolean {
  if (!raw.seasonName) return true;
  const allowed = raw.seasonName.split(",").map((s) => s.trim());
  if (!activeSeasonName || !allowed.includes(activeSeasonName)) {
    return raw.rollWhenNoSeason === "always";
  }
  return true;
}
