export type ParsedSearch = {
  name: string;
  number?: string;
  set?: string;
  rarity?: string;
  raw: string;
};

// Heuristic parser: supports inputs like
// "Charizard 4 base set" or "Charizard #4" or "Charizard number:4 set:base".
export function parseCardSearch(input: string): ParsedSearch {
  const raw = input.trim();
  const lowered = raw.toLowerCase();

  // explicit tokens
  const numberMatch = raw.match(/(?:number:|#)(\d+[a-zA-Z]?)/i);
  const setMatch = raw.match(/(?:set:)([^,]+)$/i);

  let number = numberMatch?.[1];
  let set = setMatch?.[1]?.trim();

  // If no explicit number:, grab a standalone token that looks like a card number (e.g., 4 or 4a)
  if (!number) {
    const tok = raw.split(/\s+/).find(t => /^\d+[a-zA-Z]?$/.test(t));
    if (tok) number = tok;
  }

  // If no explicit set:, infer set from common suffix phrases once we remove name/number-ish tokens.
  // This is intentionally conservative; it helps narrow results but won't be perfect.
  if (!set) {
    const cleaned = raw
      .replace(/(?:number:|#)\s*\d+[a-zA-Z]?/gi, '')
      .replace(/\b\d+[a-zA-Z]?\b/g, '')
      .trim();

    // if user typed more than just the Pokémon name, treat remainder as set hint
    // Example: "Charizard base set" -> set hint "base set".
    const parts = cleaned.split(/\s+/);
    if (parts.length >= 2) {
      // keep as hint; API will match within set.name via a "*" fuzzy-like approach? (not true fuzzy)
      // We'll pass set.name:"<hint>" which can still work for many official set names.
      set = cleaned;
    }
  }

  // Pokémon name guess: remove recognized fragments.
  let name = raw;
  if (number) name = name.replace(new RegExp(`(?:number:|#)?\\s*${number}`, 'i'), '');
  if (setMatch?.[0]) name = name.replace(setMatch[0], '');
  name = name.replace(/\bset:\b/gi, '').replace(/\s+/g, ' ').trim();

  // If user typed "base set" etc, name might still include those words; we handle by taking first chunk before set keywords.
  // Keep it simple: if name contains " set" at end, strip.
  name = name.replace(/\b(base|jungle|fossil|team|rocket|neo|gym)\b.*$/i, (m) => name);

  if (!name) name = raw; // fallback

  return { name, number, set, raw };
}

export function buildTcgApiQuery(parsed: ParsedSearch): string {
  // Pokémon TCG API query language supports fields like name, number, set.name
  // We'll build a tighter query when we have hints.
  const clauses: string[] = [];
  const safeName = parsed.name.replace(/"/g, '\\"');
  clauses.push(`name:"${safeName}"`);

  if (parsed.number) {
    const safeNum = parsed.number.replace(/"/g, '\\"');
    clauses.push(`number:"${safeNum}"`);
  }

  if (parsed.set) {
    const safeSet = parsed.set.replace(/"/g, '\\"');
    // set.name isn't fuzzy, but partial set names often still work if they match a substring token.
    clauses.push(`set.name:"${safeSet}"`);
  }

  return clauses.join(' ');
}
