'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type OwnedCard = {
  id: string;
  dex: number;
  pokemon_name: string;
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

const ROWS = 3;
const COLS = 3;

export default function BinderLayoutPage() {
  const params = useParams<{ id: string }>();
  const binderId = params.id;

  const [binderName, setBinderName] = useState('Binder');
  const [page, setPage] = useState(1);
  const [owned, setOwned] = useState<OwnedCard[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);

  async function loadBinder() {
    const binder = await supabase.from('binders').select('name').eq('id', binderId).single();
    if (!binder.error) setBinderName(binder.data?.name ?? 'Binder');
  }

  async function loadOwned() {
    const { data, error } = await supabase
      .from('owned_cards')
      .select('id,dex,pokemon_name,set_name,card_number,image_small')
      .eq('binder_id', binderId)
      .order('dex', { ascending: true });

    if (!error) setOwned((data as OwnedCard[]) || []);
  }

  async function ensureSlotsForPage(p: number) {
    const { data, error } = await supabase
      .from('binder_slots')
      .select('*')
      .eq('binder_id', binderId)
      .eq('page', p);

    if (!error && (data as Slot[])?.length === ROWS * COLS) {
      setSlots((data as Slot[]) || []);
      return;
    }

    // Create missing slots for this page.
    const existing = new Set(((data as Slot[]) || []).map(s => `${s.row}-${s.col}`));
    const toCreate: Partial<Slot>[] = [];
    for (let r = 1; r <= ROWS; r++) {
      for (let c = 1; c <= COLS; c++) {
        if (!existing.has(`${r}-${c}`)) {
          toCreate.push({ binder_id: binderId, page: p, row: r, col: c, owned_card_id: null });
        }
      }
    }

    if (toCreate.length > 0) {
      await supabase.from('binder_slots').insert(toCreate);
    }

    const again = await supabase
      .from('binder_slots')
      .select('*')
      .eq('binder_id', binderId)
      .eq('page', p);

    if (!again.error) setSlots((again.data as Slot[]) || []);
  }

  async function loadAll() {
    await loadBinder();
    await loadOwned();
    await ensureSlotsForPage(page);
  }

  useEffect(() => { loadAll(); }, [binderId]);
  useEffect(() => { ensureSlotsForPage(page); }, [page]);

  const slotByKey = useMemo(() => {
    const map = new Map<string, Slot>();
    for (const s of slots) map.set(`${s.row}-${s.col}`, s);
    return map;
  }, [slots]);

  const ownedById = useMemo(() => {
    const map = new Map<string, OwnedCard>();
    for (const c of owned) map.set(c.id, c);
    return map;
  }, [owned]);

  async function setSlot(slotId: string, ownedCardId: string | null) {
    await supabase.from('binder_slots').update({ owned_card_id: ownedCardId }).eq('id', slotId);
    ensureSlotsForPage(page);
  }

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: 16, fontFamily: 'system-ui' }}>
      <Link href={`/binders/${binderId}`} style={{ display: 'inline-block', marginBottom: 10 }}>
        ← Back
      </Link>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>{binderName} — Layout</h1>
      <div style={{ opacity: 0.75, marginBottom: 14 }}>
        This is a simple 3×3 page grid (most binders). Assign any logged card to a slot.
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          Page
          <input
            type="number"
            min={1}
            value={page}
            onChange={(e) => setPage(parseInt(e.target.value || '1', 10))}
            style={{ width: 90, padding: 8, borderRadius: 10, border: '1px solid #ddd' }}
          />
        </label>
        <div style={{ opacity: 0.75, fontSize: 13 }}>Cards available: {owned.length}</div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
          gap: 12
        }}
      >
        {Array.from({ length: ROWS * COLS }).map((_, idx) => {
          const r = Math.floor(idx / COLS) + 1;
          const c = (idx % COLS) + 1;
          const slot = slotByKey.get(`${r}-${c}`);
          const selected = slot?.owned_card_id ? ownedById.get(slot.owned_card_id) : undefined;

          return (
            <div
              key={`${r}-${c}`}
              style={{ border: '1px solid #ddd', borderRadius: 14, padding: 12, minHeight: 170 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontWeight: 800 }}>Slot {r},{c}</div>
                {selected?.dex ? (
                  <Link href={`/binders/${binderId}/pokemon/${selected.dex}`} style={{ fontSize: 13, opacity: 0.85 }}>
                    Go →
                  </Link>
                ) : (
                  <span style={{ fontSize: 13, opacity: 0.6 }}>—</span>
                )}
              </div>

              {selected?.image_small ? (
                <img src={selected.image_small} alt={selected.pokemon_name} style={{ width: '100%', borderRadius: 12 }} />
              ) : (
                <div style={{ background: '#fafafa', borderRadius: 12, height: 92, display: 'grid', placeItems: 'center', opacity: 0.65 }}>
                  Empty
                </div>
              )}

              <div style={{ marginTop: 10 }}>
                <select
                  value={slot?.owned_card_id ?? ''}
                  onChange={(e) => setSlot(slot!.id, e.target.value ? e.target.value : null)}
                  style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #ddd' }}
                  disabled={!slot}
                >
                  <option value="">(empty)</option>
                  {owned.map((card) => (
                    <option key={card.id} value={card.id}>
                      #{card.dex} {card.pokemon_name} — {card.set_name ?? 'Set?'} {card.card_number ?? ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 16, opacity: 0.75, fontSize: 13 }}>
        Next upgrade: drag-and-drop + supporting 4×3 / 2×2 binder formats.
      </div>
    </main>
  );
}
