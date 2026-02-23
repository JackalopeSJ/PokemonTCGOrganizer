'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
const PRESETS: { label: string; start: number; end: number }[] = [
  { label: 'Kanto (1–151)', start: 1, end: 151 },
  { label: 'Johto (152–251)', start: 152, end: 251 },
  { label: 'Hoenn (252–386)', start: 252, end: 386 },
  { label: 'Sinnoh (387–493)', start: 387, end: 493 },
  { label: 'Unova (494–649)', start: 494, end: 649 },
  { label: 'Kalos (650–721)', start: 650, end: 721 },
  { label: 'Alola (722–809)', start: 722, end: 809 },
  { label: 'Galar (810–898)', start: 810, end: 898 },
  { label: 'Paldea (899–1025)', start: 899, end: 1025 },
];

type BP = {
  id: string;
  binder_id: string;
  dex: number;
  name: string;
  owned_count: number;
  target_count: number;
};

export default function BinderDetail() {
  const params = useParams<{ id: string }>();
  const binderId = params.id;

  const [binderName, setBinderName] = useState<string>('Binder');
  const [rows, setRows] = useState<BP[]>([]);
  const [needsOnly, setNeedsOnly] = useState(false);
  const [preset, setPreset] = useState<string>(PRESETS[0].label);
  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(151);
  const [populating, setPopulating] = useState(false);

  async function load() {
    const binder = await supabase.from('binders').select('name').eq('id', binderId).single();
    if (!binder.error) setBinderName(binder.data?.name ?? 'Binder');

    const { data, error } = await supabase
      .from('binder_pokemon')
      .select('*')
      .eq('binder_id', binderId)
      .order('dex', { ascending: true });

    if (!error) setRows((data as BP[]) || []);
  }

  useEffect(() => { load(); }, [binderId]);

  const visible = useMemo(() => {
    if (!needsOnly) return rows;
    return rows.filter((r) => Math.max(0, r.target_count - r.owned_count) > 0);
  }, [rows, needsOnly]);

  const totals = useMemo(() => {
    const totalTarget = rows.reduce((a, r) => a + (r.target_count ?? 0), 0);
    const totalOwned = rows.reduce((a, r) => a + (r.owned_count ?? 0), 0);
    const totalNeed = rows.reduce((a, r) => a + Math.max(0, (r.target_count ?? 0) - (r.owned_count ?? 0)), 0);
    return { totalTarget, totalOwned, totalNeed };
  }, [rows]);

  async function populateFromRange(start: number, end: number) {
    setPopulating(true);
    try {
      const res = await fetch(`/api/poke/range?start=${encodeURIComponent(String(start))}&end=${encodeURIComponent(String(end))}`);
      const json = await res.json();
      const list = (json?.data ?? []) as { dex: number; name: string }[];
      if (!Array.isArray(list) || list.length === 0) return;

      const payload = list.map((p) => ({
        binder_id: binderId,
        dex: p.dex,
        name: p.name,
        owned_count: 0,
        target_count: 0,
      }));

      await supabase.from('binder_pokemon').upsert(payload, { onConflict: 'binder_id,dex' });
      load();
    } finally {
      setPopulating(false);
    }
  }

  async function populatePreset() {
    const p = PRESETS.find(x => x.label === preset) ?? PRESETS[0];
    setRangeStart(p.start);
    setRangeEnd(p.end);
    await populateFromRange(p.start, p.end);
  }

  async function updateTarget(id: string, target: number) {
    const t = Number.isFinite(target) && target >= 0 ? target : 0;
    await supabase.from('binder_pokemon').update({ target_count: t }).eq('id', id);
    load();
  }

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: 16, fontFamily: 'system-ui' }}>
      <Link href="/binders" style={{ display: 'inline-block', marginBottom: 10 }}>
        ← Back
      </Link>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>{binderName}</h1>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: '1px solid #ddd', background: '#fff' }}
            aria-label="Population preset"
          >
            {PRESETS.map(p => (
              <option key={p.label} value={p.label}>{p.label}</option>
            ))}
          </select>
          <button
            onClick={populatePreset}
            style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #ddd', background: '#fafafa' }}
            disabled={populating}
          >
            {populating ? 'Populating…' : 'Populate binder'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 13, opacity: 0.75 }}>or Dex range</span>
          <input
            type="number"
            min={1}
            value={rangeStart}
            onChange={(e) => setRangeStart(parseInt(e.target.value || '1', 10))}
            style={{ width: 96, padding: 10, borderRadius: 10, border: '1px solid #ddd' }}
          />
          <span style={{ opacity: 0.6 }}>→</span>
          <input
            type="number"
            min={rangeStart}
            value={rangeEnd}
            onChange={(e) => setRangeEnd(parseInt(e.target.value || String(rangeStart), 10))}
            style={{ width: 96, padding: 10, borderRadius: 10, border: '1px solid #ddd' }}
          />
          <button
            onClick={() => populateFromRange(rangeStart, rangeEnd)}
            style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #ddd', background: '#fff' }}
            disabled={populating}
          >
            {populating ? 'Populating…' : 'Add range'}
          </button>
        </div>

        <Link href={`/binders/${binderId}/layout`} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #ddd', background: '#fff', textDecoration: 'none' }}>
          Binder page layout →
        </Link>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={needsOnly} onChange={(e) => setNeedsOnly(e.target.checked)} />
          Needs only
        </label>

        <div style={{ marginLeft: 'auto', opacity: 0.75, fontSize: 13 }}>
          Totals — Owned: {totals.totalOwned} • Target: {totals.totalTarget} • Need: {totals.totalNeed}
        </div>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #ddd', borderRadius: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr style={{ textAlign: 'left', background: '#fafafa' }}>
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
              const need = Math.max(0, (r.target_count ?? 0) - (r.owned_count ?? 0));
              return (
                <tr key={r.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ padding: 10 }}>{r.dex}</td>
                  <td style={{ padding: 10, fontWeight: 800 }}>{r.name}</td>
                  <td style={{ padding: 10 }}>{r.owned_count ?? 0}</td>
                  <td style={{ padding: 10 }}>
                    <input
                      type="number"
                      value={r.target_count ?? 0}
                      min={0}
                      onChange={(e) => updateTarget(r.id, parseInt(e.target.value || '0', 10))}
                      style={{ width: 90, padding: 8, borderRadius: 10, border: '1px solid #ddd' }}
                    />
                  </td>
                  <td style={{ padding: 10 }}>{need}</td>
                  <td style={{ padding: 10 }}>
                    <Link href={`/binders/${binderId}/pokemon/${r.dex}`} style={{ whiteSpace: 'nowrap' }}>
                      View cards →
                    </Link>
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 14, opacity: 0.7 }}>
                  No Pokémon in this binder yet. Click “Include original 151”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
