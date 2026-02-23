import { NextResponse } from 'next/server';

function titleCase(name: string): string {
  // Basic title casing for Pokémon names; keeps hyphens.
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-');
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const startRaw = url.searchParams.get('start');
  const endRaw = url.searchParams.get('end');

  const start = Math.max(1, parseInt(startRaw || '', 10) || 1);
  const end = Math.max(start, parseInt(endRaw || '', 10) || start);
  const limit = Math.min(400, end - start + 1); // safety cap
  const offset = start - 1;

  // PokéAPI: pokemon-species is ordered by national dex id.
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species?limit=${limit}&offset=${offset}`);
  if (!res.ok) return NextResponse.json({ error: 'PokéAPI error' }, { status: 500 });

  const json = await res.json();
  const results = (json?.results ?? []) as { name: string; url: string }[];

  const data = results.map((r, idx) => ({
    dex: start + idx,
    name: titleCase(r.name)
  }));

  return NextResponse.json({ data, start, end: start + data.length - 1 });
}
