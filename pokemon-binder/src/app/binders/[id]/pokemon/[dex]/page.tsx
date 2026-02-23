'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { buildTcgApiQuery, parseCardSearch } from '@/lib/search';

type OwnedCard = {
  id: string;
  binder_id: string;
  dex: number;
  pokemon_name: string;
  tcg_card_id: string;
  qty: number;
  set_name: string | null;
  set_id: string | null;
  card_number: string | null;
  rarity: string | null;
  image_small: string | null;
  image_large: string | null;
  language: string | null;
  variant: string | null;
  condition: string | null;
  notes: string | null;

  tcgplayer_market_cents?: number | null;
  tcgplayer_low_cents?: number | null;
  tcgplayer_mid_cents?: number | null;
  tcgplayer_high_cents?: number | null;
  tcgplayer_updated_at?: string | null;
};

type Slot = {
  id: string;
  binder_id: string;
  page: number;
  row: number;
  col: number;
  owned_card_id: string | null;
};

export default function PokemonDetail() {
  const params = useParams<{ id: string; dex: string }>();
  const binderId = params.id;
  const dex = parseInt(params.dex, 10);

  const [pokemonName, setPokemonName] = useState<string>('');
  const [owned, setOwned] = useState<OwnedCard[]>([]);
  const [slotsUsing, setSlotsUsing] = useState<Slot[]>([]);

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshingPrices, setRefreshingPrices] = useState(false);

  async function load() {
    const bp = await supabase
      .from('binder_pokemon')
      .select('name')
      .eq('binder_id', binderId)
      .eq('dex', dex)
      .single();

    setPokemonName(bp.data?.name ?? `#${dex}`);

    const cards = await supabase
      .from('owned_cards')
      .select('*')
      .eq('binder_id', binderId)
      .eq('dex', dex)
      .order('created_at', { ascending: false });

    if (!cards.error) setOwned((cards.data as OwnedCard[]) || []);

    // Any layout slots currently showing one of these cards?
    const slotRes = await supabase
      .from('binder_slots')
      .select('*')
      .eq('binder_id', binderId)
      .in('owned_card_id', ((cards.data as OwnedCard[]) || []).map(c => c.id));

    if (!slotRes.error) setSlotsUsing((slotRes.data as Slot[]) || []);
  }

  useEffect(() => { load(); }, [binderId, dex]);

  function dollarsToCents(x: any): number | null {
    if (typeof x !== 'number' || !isFinite(x)) return null;
    return Math.round(x * 100);
  }

  function pickTcgplayerPrice(tcg: any): { market: number | null; low: number | null; mid: number | null; high: number | null; } | null {
    if (!tcg?.prices) return null;

    // Prefer foil-ish variants first when present.
    const keys = Object.keys(tcg.prices);
    const preferred = ['holofoil', 'reverseHolofoil', 'normal', ...keys];

    for (const k of preferred) {
      const p = tcg.prices[k];
      if (!p) continue;
      return {
        market: dollarsToCents(p.market),
        low: dollarsToCents(p.low),
        mid: dollarsToCents(p.mid),
        high: dollarsToCents(p.high)
      };
    }
    return null;
  }

  async function refreshPricesIfStale(cards: OwnedCard[]) {
    // Refresh at most once every 24 hours per card.
    const STALE_MS = 1000 * 60 * 60 * 24;
    const now = Date.now();

    setRefreshingPrices(true);
    try {
      for (const c of cards) {
        const last = c.tcgplayer_updated_at ? new Date(c.tcgplayer_updated_at).getTime() : 0;
        const stale = !last || (now - last) > STALE_MS;
        if (!stale) continue;

        const res = await fetch(`/api/tcg/card?id=${encodeURIComponent(c.tcg_card_id)}`);
        const json = await res.json();
        const card = json?.data;
        const price = pickTcgplayerPrice(card?.tcgplayer);
        if (!price) continue;

        await supabase
          .from('owned_cards')
          .update({
            tcgplayer_market_cents: price.market,
            tcgplayer_low_cents: price.low,
            tcgplayer_mid_cents: price.mid,
            tcgplayer_high_cents: price.high,
            tcgplayer_updated_at: new Date().toISOString()
          })
          .eq('id', c.id);
      }
    } finally {
      setRefreshingPrices(false);
    }
  }

  async function recomputeOwnedCount() {
    const { data, error } = await supabase
      .from('owned_cards')
      .select('qty')
      .eq('binder_id', binderId)
      .eq('dex', dex);

    if (error) return;

    const sum = (data || []).reduce((acc: number, r: any) => acc + (r.qty ?? 0), 0);
    await supabase
      .from('binder_pokemon')
      .update({ owned_count: sum })
      .eq('binder_id', binderId)
      .eq('dex', dex);
  }

  async function doSearch() {
    const qRaw = search.trim();
    if (!qRaw) return;
    setBusy(true);

    const parsed = parseCardSearch(qRaw);
    // If user searches from a Pokémon page, default to that Pokémon name unless they typed something else.
    const nameToUse = parsed.name ? parsed.name : pokemonName;
    const apiQ = buildTcgApiQuery({ ...parsed, name: nameToUse });

    const res = await fetch(`/api/tcg/search?q=${encodeURIComponent(apiQ)}`);
    const json = await res.json();
    setResults(json?.data ?? []);
    setBusy(false);
  }

  async function addCard(card: any) {
    const row = {
      binder_id: binderId,
      dex,
      pokemon_name: pokemonName,
      tcg_card_id: card.id,
      qty: 1,
      set_name: card.set?.name ?? null,
      set_id: card.set?.id ?? null,
      card_number: card.number ?? null,
      rarity: card.rarity ?? null,
      image_small: card.images?.small ?? null,
      image_large: card.images?.large ?? null,
      language: 'EN',
      variant: inferVariant(card),
      condition: null,
      notes: null
    };

    const ins = await supabase.from('owned_cards').insert(row);
    if (!ins.error) {
      await recomputeOwnedCount();
      await load();
      const { data } = await supabase
        .from('owned_cards')
        .select('*')
        .eq('binder_id', binderId)
        .eq('dex', dex)
        .order('created_at', { ascending: false });
      if (data) refreshPricesIfStale(data as OwnedCard[]);
    }
  }

  function inferVariant(card: any): string {
    // Very simple starter. Pokémon TCG API has fields like "subtypes" and "rarity"; variants can be inferred more precisely later.
    const r: string = (card?.rarity ?? '').toLowerCase();
    if (r.includes('holo')) return 'Holo';
    if (r.includes('reverse')) return 'Reverse Holo';
    if (r.includes('promo')) return 'Promo';
    return 'Normal';
  }

  const slotSummary = useMemo(() => {
    if (slotsUsing.length === 0) return null;
    const pages = Array.from(new Set(slotsUsing.map(s => s.page))).sort((a,b)=>a-b);
    return pages;
  }, [slotsUsing]);

  useEffect(() => {
    if (owned.length > 0) {
      refreshPricesIfStale(owned);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owned.length]);

  async function updateOwnedCard(id: string, patch: Partial<OwnedCard>) {
    await supabase.from('owned_cards').update(patch).eq('id', id);
    await recomputeOwnedCount();
    load();
  }

  async function removeOwnedCard(id: string) {
    await supabase.from('owned_cards').delete().eq('id', id);
    await recomputeOwnedCount();
    load();
  }

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: 16, fontFamily: 'system-ui' }}>
      <Link href={`/binders/${binderId}`} style={{ display: 'inline-block', marginBottom: 10 }}>
        ← Back
      </Link>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>{pokemonName} (#{dex})</h1>
        <Link href={`/binders/${binderId}/layout`} style={{ opacity: 0.85 }}>Open layout →</Link>
      </div>

      {slotSummary && (
        <div style={{ marginTop: 8, opacity: 0.75, fontSize: 13 }}>
          Currently placed in layout page(s): {slotSummary.join(', ')}
        </div>
      )}

      <section style={{ border: '1px solid #ddd', borderRadius: 14, padding: 12, marginTop: 14, marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='Better search: "Charizard 4 base" or "Pikachu #58" or "Alakazam set:Base Set number:1"'
            style={{ padding: 10, flex: '1 1 280px', border: '1px solid #ddd', borderRadius: 10 }}
          />
          <button
            onClick={doSearch}
            style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #ddd', background: '#fafafa' }}
            disabled={busy}
          >
            {busy ? 'Searching…' : 'Search cards'}
          </button>
        </div>

        {results.length > 0 && (
          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            {results.slice(0, 12).map((card) => (
              <div
                key={card.id}
                style={{ display: 'flex', gap: 12, alignItems: 'center', borderTop: '1px solid #eee', paddingTop: 10 }}
              >
                <img src={card.images?.small} alt={card.name} style={{ width: 72, borderRadius: 10 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 900 }}>{card.name}</div>
                  <div style={{ fontSize: 13, opacity: 0.8 }}>
                    {card.set?.name} • #{card.number} • {card.rarity ?? 'Unknown rarity'}
                  </div>
                </div>
                <button
                  onClick={() => addCard(card)}
                  style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #ddd', background: '#fff' }}
                >
                  Add
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 10, opacity: 0.7, fontSize: 13 }}>
          If search feels too broad, add a number or set hint (e.g., “4 base”).
        </div>
      </section>

      <h2 style={{ fontSize: 18, marginBottom: 10 }}>Cards you’ve logged</h2>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <button
          onClick={() => refreshPricesIfStale(owned)}
          style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #ddd', background: '#fafafa' }}
          disabled={refreshingPrices || owned.length === 0}
        >
          {refreshingPrices ? 'Refreshing prices…' : 'Refresh prices'}
        </button>
        <div style={{ fontSize: 13, opacity: 0.75 }}>
          Prices shown are TCGplayer (Market / Low / Mid / High) when available.
        </div>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {owned.map((c) => (
          <div key={c.id} style={{ display: 'flex', gap: 12, border: '1px solid #ddd', borderRadius: 14, padding: 12 }}>
            <img
              src={c.image_small ?? ''}
              alt={c.tcg_card_id}
              style={{ width: 84, borderRadius: 10, background: '#f4f4f4' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900 }}>
                {c.set_name ?? 'Unknown set'} • #{c.card_number ?? '?'}
              </div>
              <div style={{ fontSize: 13, opacity: 0.85 }}>
                Rarity: {c.rarity ?? '?'} • Variant: {c.variant ?? '?'} • Lang: {c.language ?? '?'} • Qty: {c.qty}
              </div>
              <div style={{ fontSize: 13, opacity: 0.85, marginTop: 6 }}>
                TCGplayer —
                {' '}
                Market: {c.tcgplayer_market_cents != null ? `$${(c.tcgplayer_market_cents / 100).toFixed(2)}` : '—'}
                {' '}• Low: {c.tcgplayer_low_cents != null ? `$${(c.tcgplayer_low_cents / 100).toFixed(2)}` : '—'}
                {' '}• Mid: {c.tcgplayer_mid_cents != null ? `$${(c.tcgplayer_mid_cents / 100).toFixed(2)}` : '—'}
                {' '}• High: {c.tcgplayer_high_cents != null ? `$${(c.tcgplayer_high_cents / 100).toFixed(2)}` : '—'}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
                <label style={{ fontSize: 13, opacity: 0.8 }}>
                  Qty
                  <input
                    type="number"
                    min={1}
                    value={c.qty}
                    onChange={(e) => updateOwnedCard(c.id, { qty: parseInt(e.target.value || '1', 10) })}
                    style={{ width: 80, padding: 8, borderRadius: 10, border: '1px solid #ddd', marginLeft: 6 }}
                  />
                </label>

                <label style={{ fontSize: 13, opacity: 0.8 }}>
                  Variant
                  <select
                    value={c.variant ?? 'Normal'}
                    onChange={(e) => updateOwnedCard(c.id, { variant: e.target.value })}
                    style={{ padding: 8, borderRadius: 10, border: '1px solid #ddd', marginLeft: 6 }}
                  >
                    <option>Normal</option>
                    <option>Holo</option>
                    <option>Reverse Holo</option>
                    <option>Promo</option>
                    <option>Stamped</option>
                  </select>
                </label>

                <label style={{ fontSize: 13, opacity: 0.8 }}>
                  Lang
                  <select
                    value={c.language ?? 'EN'}
                    onChange={(e) => updateOwnedCard(c.id, { language: e.target.value })}
                    style={{ padding: 8, borderRadius: 10, border: '1px solid #ddd', marginLeft: 6 }}
                  >
                    <option value="EN">EN</option>
                    <option value="JP">JP</option>
                    <option value="DE">DE</option>
                    <option value="FR">FR</option>
                    <option value="ES">ES</option>
                    <option value="IT">IT</option>
                  </select>
                </label>

                <label style={{ fontSize: 13, opacity: 0.8 }}>
                  Condition
                  <select
                    value={c.condition ?? ''}
                    onChange={(e) => updateOwnedCard(c.id, { condition: e.target.value || null })}
                    style={{ padding: 8, borderRadius: 10, border: '1px solid #ddd', marginLeft: 6 }}
                  >
                    <option value="">(none)</option>
                    <option value="NM">NM</option>
                    <option value="LP">LP</option>
                    <option value="MP">MP</option>
                    <option value="HP">HP</option>
                    <option value="DMG">DMG</option>
                  </select>
                </label>
              </div>

              <div style={{ marginTop: 10 }}>
                <textarea
                  value={c.notes ?? ''}
                  onChange={(e) => updateOwnedCard(c.id, { notes: e.target.value })}
                  placeholder="Notes (optional)"
                  style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #ddd', minHeight: 44 }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => removeOwnedCard(c.id)}
                  style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #f0b4b4', background: '#fff' }}
                >
                  Remove card
                </button>
              </div>
            </div>
          </div>
        ))}

        {owned.length === 0 && <div style={{ opacity: 0.7 }}>No cards logged for this Pokémon yet.</div>}
      </div>
    </main>
  );
}
