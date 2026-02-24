"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Binder = {
  id: string;
  name: string;
  page_rows: number;
  page_cols: number;
  created_at: string;
};

export default function BindersPage() {
  const [binders, setBinders] = useState<Binder[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error } = await supabase
      .from("binders")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error) setBinders((data as Binder[]) || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function createBinder() {
    const n = name.trim();
    if (!n) return;

    setBusy(true);
    try {
      const { error } = await supabase.from("binders").insert({
        name: n,
        page_rows: 3,
        page_cols: 3,
      });

      if (!error) {
        setName("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteBinder(id: string) {
    if (!confirm("Delete this binder? This will remove all Pokémon and cards in it.")) return;
    await supabase.from("binders").delete().eq("id", id);
    await load();
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 26, marginBottom: 10 }}>Binders</h1>

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Create a new binder</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Kanto Binder / Johto Binder"
            style={{ padding: 10, flex: "1 1 280px" }}
          />
          <button onClick={createBinder} style={{ padding: "10px 14px" }} disabled={busy}>
            {busy ? "Creating..." : "Create"}
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 13, opacity: 0.75 }}>
          Default layout is 3×3 pages. You can change it later if you want to support other binder formats.
        </div>
      </section>

      <div style={{ display: "grid", gap: 10 }}>
        {binders.map((b) => (
          <div key={b.id} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>{b.name}</div>
                <div style={{ fontSize: 13, opacity: 0.75 }}>
                  Layout: {b.page_rows}×{b.page_cols}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <Link
                  href={`/binder?id=${encodeURIComponent(b.id)}`}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 10,
                    padding: "10px 12px",
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  Open →
                </Link>

                <button onClick={() => deleteBinder(b.id)} style={{ padding: "10px 12px" }}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}

        {binders.length === 0 && (
          <div style={{ opacity: 0.7 }}>
            No binders yet. Create one above (for example: “Kanto Binder”, “Johto Binder”).
          </div>
        )}
      </div>
    </main>
  );
}
