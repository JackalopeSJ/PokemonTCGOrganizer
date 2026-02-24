"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { KANTO_151 } from "@/lib/kanto151";

type Binder = { id: string; name: string; page_rows: number; page_cols: number };
type BP = {
  id: string;
  binder_id: string;
  dex: number;
  name: string;
  owned_count: number;
  target_count: number;
};

async function fetchDexRange(start: number, end: number) {
  // Uses PokeAPI to fetch species names by dex number (1-indexed)
  // We fetch each species by id because the "list" endpoint returns in National Dex-ish order
  // and keeps it simple + reliable for a few hundred entries.
  const out: { dex: number; name: string }[] = [];
  for (let i = start; i <= end; i++) {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${i}`, { cache: "no-store" });
    if (!res.ok) continue;
    const json = await res.json();
    const name = (json?.name ?? `${i}`).toString();
    const proper = name.charAt(0).toUpperCase() + name.slice(1);
    out.push({ dex: i, name: proper });
  }
  return out;
}

export default function BinderPage() {
  const sp = useSearchParams();
  const binderId = sp.get("id");

  const [binder, setBinder] = useState<Binder | null>(null);
  const [rows, setRows] = useState<BP[]>([]);
  const [needsOnly, setNeedsOnly] = useState(false);

  const [populateMode, setPopulateMode] = useState<"kanto" | "johto" | "range">("kanto");
  const [rangeStart, setRangeStart] = useState<number>(152);
  const [rangeEnd, setRangeEnd] = useState<number>(251);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!binderId) return;

    const b = await supabase.from("binders").select("*").eq("id", binderId).single();
    if (!b.error) setBinder(b.data as Binder);

    const { data, error } = await supabase
      .from("binder_pokemon")
      .select("*")
      .eq("binder_id", binderId)
      .order("dex", { ascending: true });

    if (!error) setRows((data as BP[]) || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binderId]);

  const visible = useMemo(() => {
    if (!needsOnly) return rows;
    return rows.filter((r) => Math.max(0, r.target_count - r.owned_count) > 0);
  }, [rows, needsOnly]);

  async function upsertPokemon(list: { dex: number; name: string }[]) {
    if (!binderId) return;
    const payload = list.map((p) => ({
      binder_id: binderId,
      dex: p.dex,
      name: p.name,
      owned_count: 0,
      target_count: 0,
    }));
    await supabase.from("binder_pokemon").upsert(payload, { onConflict: "binder_id,dex" });
    await load();
  }

  async function populate() {
    if (!binderId) return;
    setBusy(true);
    try {
      if (populateMode === "kanto") {
        await upsertPokemon(KANTO_151);
      } else if (populateMode === "johto") {
        const list = await fetchDexRange(152, 251);
        await upsertPokemon(list);
      } else {
        const start = Math.max(1, Math.min(rangeStart, rangeEnd));
        const end = Math.max(1, Math.max(rangeStart, rangeEnd));
        const list = await fetchDexRange(start, end);
        await upsertPokemon(list);
      }
    } finally {
      setBusy(false);
    }
  }

  async function updateTarget(id: string, target: number) {
    await supabase.from("binder_pokemon").update({ target_count: target }).eq("id", id);
    await load();
  }

  if (!binderId) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 20 }}>Missing binder id</h1>
        <p>Go back to the binder list and click a binder again.</p>
        <Link href="/binders">Go to Binders</Link>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <Link href="/binders" style={{ display: "inline-block", marginBottom: 10 }}>
        ← Back
      </Link>

      <h1 style={{ fontSize: 24, marginBottom: 8 }}>{binder?.name ?? "Binder"}</h1>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <Link
          href={`/layout-view?id=${encodeURIComponent(binderId)}`}
          style={{ border: "1px solid #ddd", borderRadius: 10, padding: "10px 12px", textDecoration: "none" }}
        >
          Binder page layout →
        </Link>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={needsOnly} onChange={(e) => setNeedsOnly(e.target.checked)} />
          Needs only
        </label>
      </div>

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Populate binder</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select value={populateMode} onChange={(e) => setPopulateMode(e.target.value as any)} style={{ padding: 10 }}>
            <option value="kanto">Kanto (1–151)</option>
            <option value="johto">Johto (152–251)</option>
            <option value="range">Dex range…</option>
          </select>

          {populateMode === "range" && (
            <>
              <input
                type="number"
                min={1}
                value={rangeStart}
                onChange={(e) => setRangeStart(parseInt(e.target.value || "1", 10))}
                style={{ padding: 10, width: 120 }}
                placeholder="Start"
              />
              <input
                type="number"
                min={1}
                value={rangeEnd}
                onChange={(e) => setRangeEnd(parseInt(e.target.value || "1", 10))}
                style={{ padding: 10, width: 120 }}
                placeholder="End"
              />
            </>
          )}

          <button onClick={populate} style={{ padding: "10px 14px" }} disabled={busy}>
            {busy ? "Working..." : "Populate"}
          </button>
        </div>

        <div style={{ marginTop: 8, fontSize: 13, opacity: 0.75 }}>
          This won’t delete anything you already have — it upserts by Dex number.
        </div>
      </section>

      <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 650 }}>
          <thead>
            <tr style={{ textAlign: "left", background: "#fafafa" }}>
              <th style={{ padding: 10 }}>Dex</th>
              <th style={{ padding: 10 }}>Pokémon</th>
              <th style={{ padding: 10 }}>Owned</th>
              <th style={{ padding: 10 }}>Target</th>
              <th style={{ padding: 10 }}>Need</th>
              <th style={{ padding: 10 }}></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const need = Math.max(0, r.target_count - r.owned_count);
              return (
                <tr key={r.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: 10 }}>{r.dex}</td>
                  <td style={{ padding: 10, fontWeight: 700 }}>{r.name}</td>
                  <td style={{ padding: 10 }}>{r.owned_count}</td>
                  <td style={{ padding: 10 }}>
                    <input
                      type="number"
                      value={r.target_count}
                      min={0}
                      onChange={(e) => updateTarget(r.id, parseInt(e.target.value || "0", 10))}
                      style={{ width: 90, padding: 6 }}
                    />
                  </td>
                  <td style={{ padding: 10 }}>{need}</td>
                  <td style={{ padding: 10 }}>
                    <Link
                      href={`/pokemon?binder=${encodeURIComponent(binderId)}&dex=${encodeURIComponent(String(r.dex))}`}
                      style={{ whiteSpace: "nowrap" }}
                    >
                      View cards →
                    </Link>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 14, opacity: 0.7 }}>
                  No Pokémon in this binder yet. Use “Populate binder”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
