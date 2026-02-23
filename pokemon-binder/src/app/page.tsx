import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: 16, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 30, marginBottom: 8 }}>Pokémon Binder Tracker</h1>
      <p style={{ marginTop: 0, opacity: 0.75 }}>
        Multiple binders. Count-based needs (Target − Owned). Log specific cards with official images.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 18 }}>
        <Link href="/binders">Go to Binders →</Link>
      </div>

      <div style={{ marginTop: 24, opacity: 0.7, fontSize: 13 }}>
        Tip: set up your Supabase tables first, then add the Original 151 to a binder.
      </div>
    </main>
  );
}
