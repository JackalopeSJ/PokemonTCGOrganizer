"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type BP = { name: string; owned_count: number; target_count: number };

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

  tcgplayer_market_cents: number | null;
  tcgplayer_low_cents: number | null;
  tcgplayer_mid_cents: number | null;
  tcgplayer_high_cents: number | null;
  tcgplayer_updated_at: string | null;
};

function dollarsToCents(x: any): number | null {
  if (typeof x !== "number" || !isFinite(x)) return null;
  return Math.round(x * 100);
}

function pickTcgplayerPrice(tcg: any) {
  if (!tcg?.prices) return null;
  const keys = Object.keys(tcg.prices);
  const preferred = ["holofoil", "reverseHolofoil", "normal", ...keys];
  for (const k of preferred) {
    const p = tcg.prices[k];
    if (!p) continue;
    return {
      market: dollarsToCents(p.market),
      low: dollarsToCents(p.low),
      mid: dollarsToCents(p.mid),
      high: dollarsToCents(p.high),
      variantKey: k,
    };
  }
  return null;
}

function buildCardQuery(raw: string, pokemonName: string) {
  const s = raw.trim();
  const mNum = s.match(/\b(\d{1,3})\b/);
  const number = mNum?.[1] ?? null;

  const mSet = s.match(/set\s*:\s*("?)([^"]+)\1/i);
  const set = mSet?.[2]?.trim() ?? null;

  let namePart = s
    .replace(/set\s*:\s*("?)[^"]+\1/i, "")
    .replace(/\b\d{1,3}\b/, "")
    .trim();

  if (!namePart) namePart = pokemonName;

  const parts = [`name:"${namePart.replace(/"/g, '\\"')}"`];
  if (number) parts.push(`number:"${number}"`);
  if (set) parts.push(`set.name:"${set.replace(/"/g, '\\"')}"`);
  return parts.join(" ");
}

function PokemonInner() {
  const sp = useSearchParams();
  const binderId = sp.get("binder");
  const dexStr = sp.get("dex");
  const dex = dexStr ? parseInt(dexStr, 10) : NaN;

  const [pokemonName, setPokemonName] = useState<string>("");
  const [bp, setBp] = useState<BP | null>(null);
  const [owned, setOwned] = useState<OwnedCard[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  async function recomputeOwnedCount() {
    if (!binderId || !isFinite(dex)) return;
    const { data, error } = await supabase.from("owned_cards").select("qty").eq("binder_id", binderId).eq("dex", dex);
    if (error) return;
    const sum = (data || []).reduce((acc: number, r: any) => acc + (r.qty ?? 0), 0);
    await supabase.from("binder_pokemon").update({ owned_count: sum }).eq("binder_id", binderId).eq("dex", dex);
  }

  async function load() {
    if (!binderId || !isFinite(dex)) return;

    const bpRes = await supabase
      .from("binder_pokemon")
      .select("name,owned_count,target_count")
      .eq("binder_id", binderId)
      .eq("dex", dex)
      .single();

    const name = bpRes.data?.name ?? `#${dex}`;
    setPokemonName(name);
    setBp(bpRes.data as BP);

    const cards = await supabase
      .from("owned_cards")
      .select("*")
      .eq("binder_id", binderId)
      .eq("dex", dex)
      .order("created_at", { ascending: false });

    if (!cards.error) setOwned((cards.data as OwnedCard[]) || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binderId, dexStr]);

  async function refreshPricesIfStale(list: OwnedCard[]) {
    const STALE_MS = 1000 * 60 * 60 * 24; // 24h
    const now = Date.now();

    for (const c of list) {
      const stale = !c.tcgplayer_updated_at || now - new Date(c.tcgplayer_updated_at).getTime() > STALE_MS;
      if (!stale) continue;

      const res = await fetch(`https://api.pokemontcg.io/v2/cards/${encodeURIComponent(c.tcg_card_id)}`, {
        cache: "no-store",
      });
      if (!res.ok) continue;
      const json = await res.json();
      const card = json?.data;
      const price = pickTcgplayerPrice(card?.tcgplayer);
      if (!price) continue;

      await supabase
        .from("owned_cards")
        .update({
          tcgplayer_market_cents: price.market,
          tcgplayer_low_cents: price.low,
          tcgplayer_mid_cents: price.mid,
          tcgplayer_high_cents: price.high,
          tcgplayer_updated_at: new Date().toISOString(),
        })
        .eq("id", c.id);
    }
  }

  useEffect(() => {
    if (owned.length) refreshPricesIfStale(owned).then(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owned.length]);

  async function doSearch() {
    const qRaw = search.trim();
    if (!qRaw || !pokemonName) return;
    setBusy(true);
    try {
      const q = buildCardQuery(qRaw, pokemonName);
      const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=20`, {
        cache: "no-store",
      });
      const json = await res.json();
      setResults(json?.data ?? []);
    } finally {
      setBusy(false);
    }
  }

  async function addCard(card: any) {
    if (!binderId) return;

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
      language: "EN",
      variant: "Normal",
      condition: null,
      notes: null,
    };

    const ins = await supabase.from("owned_cards").insert(row);
    if (!ins.error) {
      await recomputeOwnedCount();
      await load();
    }
  }

  async function updateOwnedCard(id: string, patch: Partial<OwnedCard>) {
    await supabase.from("owned_cards").update(patch).eq("id", id);
    await recomputeOwnedCount();
    await load();
  }

  async function deleteOwnedCard(id: string) {
    await supabase.from("owned_cards").delete().eq("id", id);
    await recomputeOwnedCount();
    await load();
  }

  if (!binderId || !isFinite(dex)) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 20 }}>Missing binder/dex</h1>
        <Link href="/binders">Go to Binders</Link>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <Link href={`/binder?id=${encodeURIComponent(binderId)}`} style={{ display: "inline-block", marginBottom: 10 }}>
        ← Back
      </Link>

      <h1 style={{ fontSize: 24, marginBottom: 6 }}>
        {pokemonName} (#{dex})
      </h1>

      <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 14 }}>
        Owned: {bp?.owned_count ?? 0} • Target: {bp?.target_count ?? 0} • Need:{" "}
        {Math.max(0, (bp?.target_count ?? 0) - (bp?.owned_count ?? 0))}
      </div>

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='Search cards (e.g., "4 base", or set:"Base Set" 4)'
            style={{ padding: 10, flex: "1 1 260px" }}
          />
          <button onClick={doSearch} style={{ padding: "10px 14px" }} disabled={busy}>
            {busy ? "Searching..." : "Search cards"}
          </button>
        </div>

        {results.length > 0 && (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {results.slice(0, 10).map((card) => (
              <div
                key={card.id}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  borderTop: "1px solid #eee",
                  paddingTop: 10,
                }}
              >
                <img src={card.images?.small} alt={card.name} style={{ width: 72, borderRadius: 8 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800 }}>{card.name}</div>
                  <div style={{ fontSize: 13, opacity: 0.8 }}>
                    {card.set?.name} • #{card.number} • {card.rarity ?? "Unknown rarity"}
                  </div>
                </div>
                <button onClick={() => addCard(card)} style={{ padding: "10px 14px" }}>
                  Add
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <h2 style={{ fontSize: 18, marginBottom: 10 }}>Cards you’ve logged</h2>

      <div style={{ display: "grid", gap: 10 }}>
        {owned.map((c) => {
          const market = c.tcgplayer_market_cents != null ? (c.tcgplayer_market_cents / 100).toFixed(2) : null;
          const low = c.tcgplayer_low_cents != null ? (c.tcgplayer_low_cents / 100).toFixed(2) : null;
          const mid = c.tcgplayer_mid_cents != null ? (c.tcgplayer_mid_cents / 100).toFixed(2) : null;
          const high = c.tcgplayer_high_cents != null ? (c.tcgplayer_high_cents / 100).toFixed(2) : null;

          return (
            <div key={c.id} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", gap: 12 }}>
                <img
                  src={c.image_small ?? ""}
                  alt={c.tcg_card_id}
                  style={{ width: 84, borderRadius: 8, background: "#f4f4f4" }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800 }}>
                    {c.set_name ?? "Unknown set"} • #{c.card_number ?? "?"} • {c.rarity ?? "?"}
                  </div>

                  <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
                    TCGplayer — Market: {market ? `$${market}` : "—"} • Low: {low ? `$${low}` : "—"} • Mid:{" "}
                    {mid ? `$${mid}` : "—"} • High: {high ? `$${high}` : "—"}
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                    <label style={{ fontSize: 13 }}>
                      Qty{" "}
                      <input
                        type="number"
                        min={1}
                        value={c.qty}
                        onChange={(e) => updateOwnedCard(c.id, { qty: parseInt(e.target.value || "1", 10) })}
                        style={{ width: 70, padding: 6, marginLeft: 6 }}
                      />
                    </label>

                    <label style={{ fontSize: 13 }}>
                      Lang{" "}
                      <select
                        value={c.language ?? "EN"}
                        onChange={(e) => updateOwnedCard(c.id, { language: e.target.value })}
                        style={{ padding: 6, marginLeft: 6 }}
                      >
                        <option value="EN">EN</option>
                        <option value="JP">JP</option>
                        <option value="DE">DE</option>
                        <option value="FR">FR</option>
                        <option value="ES">ES</option>
                        <option value="IT">IT</option>
                      </select>
                    </label>

                    <label style={{ fontSize: 13 }}>
                      Variant{" "}
                      <select
                        value={c.variant ?? "Normal"}
                        onChange={(e) => updateOwnedCard(c.id, { variant: e.target.value })}
                        style={{ padding: 6, marginLeft: 6 }}
                      >
                        <option value="Normal">Normal</option>
                        <option value="Holo">Holo</option>
                        <option value="Reverse">Reverse</option>
                        <option value="Promo">Promo</option>
                        <option value="Stamped">Stamped</option>
                      </select>
                    </label>

                    <label style={{ fontSize: 13 }}>
                      Condition{" "}
                      <select
                        value={c.condition ?? ""}
                        onChange={(e) => updateOwnedCard(c.id, { condition: e.target.value || null })}
                        style={{ padding: 6, marginLeft: 6 }}
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
                      value={c.notes ?? ""}
                      placeholder="Notes…"
                      onChange={(e) => updateOwnedCard(c.id, { notes: e.target.value })}
                      style={{ width: "100%", padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
                    />
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <button onClick={() => deleteOwnedCard(c.id)} style={{ padding: "8px 10px" }}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {owned.length === 0 && <div style={{ opacity: 0.7 }}>No cards logged for this Pokémon yet.</div>}
      </div>
    </main>
  );
}

export default function PokemonPage() {
  return (
    <Suspense fallback={<main style={{ padding: 16, fontFamily: "system-ui" }}>Loading…</main>}>
      <PokemonInner />
    </Suspense>
  );
}
