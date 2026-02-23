import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ data: [] });

  const apiKey = process.env.POKEMONTCG_API_KEY;
  const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=20`, {
    headers: apiKey ? { 'X-Api-Key': apiKey } : {},
    cache: 'no-store'
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'Pokémon TCG API error', status: res.status }, { status: 500 });
  }

  const json = await res.json();
  return NextResponse.json(json);
}
