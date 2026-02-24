"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Binder = { id: string; name: string; page_rows: number; page_cols: number };
type OwnedCard = {
  id: string;
  set_name: string | null;
  card_number: string | null;
  image_small: string | null;
};
type Slot = {
  id: string;
  binder_id: string;
  page: number;
  row: number;
  col: number;
  owned_card_id: string | null;
};

export default function LayoutViewPage() {
  const sp = useSearchParams();
  const binderId = sp.get("id");

  const [binder, setBinder] = useState<Binder | null>(null);
  const [page, setPage] = useState(1);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [owned, setOwned] = useState<OwnedCard[]>([]);
  const [picker, setPicker] = useState<{ row: number; col: number } | null>(null);

  const rows = binder?.page_rows ?? 3;
  const cols = binder?.page_cols ?? 3;

  const ownedById = useMemo(() => {
    const m = new Map<string, OwnedCard>();
    for (const c of owned) m.set(c.id, c);
    return m;
  }, [owned]);

  async function load() {
    if (!binderId) return;

    const b = await supabase.from("binders").select("*").eq("id", binderId).single();
    if (!b.error) setBinder(b.data as Binder);

    const s = await supabase
      .from("binder_slots")
      .select("*")
      .eq("binder_id", binderId)
      .eq("page", page);

    if (!s.error) setSlots((s.data as Slot[]) || []);

    const c = await supabase
      .from("owned_cards")
      .select("id,set_name,card_number,image_small")
      .eq("binder_id", binderId)
      .order("created_at", { ascending: false });

    if (!c.error) setOwned((c.data as OwnedCard[]) || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binderId, page]);

  function getSlot(row: number, col: number) {
    return slots.find((s) => s.row === row && s.col === col) ?? null;
  }

  async function ensureSlot(row: number, col: number) {
    if (!binderId) return null;
    let s = getSlot(row, col);
    if (s) return s;

    const ins = await supabase
      .from("binder_slots")
      .insert({ binder_id: binderId, page, row, col, owned_card_id: null })
      .select("*")
      .single();

    if (ins.error) return null;
    await load();
    return ins.data as Slot;
  }

  async function setSlotCard(row: number, col: number, ownedCardId: string | null) {
    const s = await ensureSlot(row, col);
    if (!s) return;
    await supabase.from("binder_slots").update({ owned_card_id: ownedCardId }).eq("id", s.id);
    setPicker(null);
    await load();
  }

  if (!binderId) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 20 }}>Missing binder id</h1>
        <Link href="/binders">Go to Binders</Link>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <Link href={`/binder?id=${encodeURIComponent(binderId)}`} style={{ display: "inline-block", marginBottom: 10 }}>
        ← Back
      </Link>

      <h1 style={{ fontSize: 22, marginBottom: 12 }}>{binder?.name ?? "Binder"} — Layout</h1>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ padding: "10px 12px" }}>
          Prev
        </button>
        <div style={{ fontWeight: 700 }}>Page {page}</div>
        <button onClick={() => setPage((p) => p + 1)} style={{ padding: "10px 12px" }}>
          Next
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 10,
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 12,
        }}
      >
        {Array.from({ length: rows }).map((_, rIdx) =>
          Array.from({ length: cols }).map((_, cIdx) => {
            const r = rIdx + 1;
            const c = cIdx + 1;
            const s = getSlot(r, c);
            const card = s?.owned_card_id ? ownedById.get(s.owned_card_id) : null;

            return (
              <button
                key={`${r}-${c}`}
                onClick={() => setPicker({ row: r, col: c })}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  padding: 10,
                  minHeight: 140,
                  textAlign: "left",
                  background: "white",
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                  Slot {r},{c}
                </div>
                {card?.image_small ? (
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <img src={card.image_small} alt="" style={{ width: 64, borderRadius: 8 }} />
                    <div style={{ fontSize: 13, opacity: 0.9 }}>
                      <div style={{ fontWeight: 700 }}>{card.set_name ?? "Unknown set"}</div>
                      <div>#{card.card_number ?? "?"}</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ opacity: 0.6 }}>Empty (tap to assign)</div>
                )}
              </button>
            );
          })
        )}
      </div>

      {picker && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setPicker(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(900px, 100%)",
              maxHeight: "80vh",
              overflow: "auto",
              background: "white",
              borderRadius: 16,
              padding: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 800 }}>
                Assign slot {picker.row},{picker.col}
              </div>
              <button onClick={() => setPicker(null)} style={{ padding: "8px 10px" }}>
                Close
              </button>
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
              <button onClick={() => setSlotCard(picker.row, picker.col, null)} style={{ padding: "10px 12px" }}>
                Clear slot
              </button>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {owned.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSlotCard(picker.row, picker.col, c.id)}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 10,
                    background: "white",
                    textAlign: "left",
                  }}
                >
                  <img src={c.image_small ?? ""} alt="" style={{ width: 60, borderRadius: 8, background: "#f4f4f4" }} />
                  <div style={{ fontSize: 13 }}>
                    <div style={{ fontWeight: 800 }}>{c.set_name ?? "Unknown set"}</div>
                    <div style={{ opacity: 0.8 }}>#{c.card_number ?? "?"}</div>
                  </div>
                </button>
              ))}
              {owned.length === 0 && <div style={{ opacity: 0.7 }}>No logged cards yet.</div>}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
