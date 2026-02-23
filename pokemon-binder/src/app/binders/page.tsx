'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Binder = { id: string; name: string; created_at: string };

export default function BindersPage() {
  const [binders, setBinders] = useState<Binder[]>([]);
  const [name, setName] = useState('');

  async function load() {
    const { data, error } = await supabase.from('binders').select('*').order('created_at', { ascending: false });
    if (!error) setBinders((data as Binder[]) || []);
  }

  useEffect(() => { load(); }, []);

  async function createBinder() {
    const n = name.trim();
    if (!n) return;
    await supabase.from('binders').insert({ name: n });
    setName('');
    load();
  }

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: 16, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 26, marginBottom: 10 }}>Binders</h1>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New binder name (e.g., Kanto Favorites)"
          style={{ padding: 10, flex: '1 1 240px', border: '1px solid #ddd', borderRadius: 10 }}
        />
        <button onClick={createBinder} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #ddd', background: '#fafafa' }}>
          Create
        </button>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {binders.map((b) => (
          <Link
            key={b.id}
            href={`/binders/${b.id}`}
            style={{ border: '1px solid #ddd', borderRadius: 14, padding: 12, textDecoration: 'none', color: 'inherit' }}
          >
            <div style={{ fontWeight: 800 }}>{b.name}</div>
            <div style={{ opacity: 0.7, fontSize: 13 }}>Created {new Date(b.created_at).toLocaleString()}</div>
          </Link>
        ))}

        {binders.length === 0 && (
          <div style={{ opacity: 0.7 }}>No binders yet. Create one above.</div>
        )}
      </div>
    </main>
  );
}
