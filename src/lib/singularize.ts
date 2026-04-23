export function singularize(word: string): string {
  if (!word.endsWith("s")) return word;

  const lower = word.toLowerCase();

  // "ves" → "f": Wolves → Wolf, Elves → Elf, Dwarves → Dwarf
  if (lower.endsWith("ves")) {
    return word.slice(0, -3) + (word[word.length - 4] === word[word.length - 4].toUpperCase() ? "F" : "f");
  }

  // sibilant + "es": Witches → Witch, Liches → Lich, Foxes → Fox
  if (lower.endsWith("ches") || lower.endsWith("shes") || lower.endsWith("xes") || lower.endsWith("zes") || lower.endsWith("sses")) {
    return word.slice(0, -2);
  }

  // Default: strip trailing "s" — covers Gnolls, Orcs, Goblins, Zombies, Ogres, etc.
  return word.slice(0, -1);
}
