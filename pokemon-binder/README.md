# Pokémon Binder Tracker

A phone-friendly web app to track multiple Pokémon card binders:
- multiple binders
- populate binder with Kanto/Johto/etc or any National Dex range
- per-Pokémon Owned / Target / Need (Needs = count-based)
- add specific cards (with images + set/number/rarity)
- simple 3×3 binder page layout view
- TCGplayer pricing (Market/Low/Mid/High) when available, cached in Supabase

## 1) Supabase setup (required)

1. Create a Supabase project
2. In Supabase **SQL Editor**, run:
   - your base schema (binders, binder_pokemon, owned_cards)
   - then run `SUPABASE_SQL_UPGRADES.sql`

3. In Supabase, grab:
   - Project URL
   - Anon public key

## 2) Environment variables

Create `.env.local` in the project folder:

```
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
POKEMONTCG_API_KEY=OPTIONAL_BUT_RECOMMENDED
```

## 3) Run locally (macOS)

### Easiest
- Double-click `start.command`
- It will install dependencies the first time, then open the app.

(You may need to right-click → Open the first time because macOS Gatekeeper.)

## 4) Make it work like an app on your phone (recommended)

Deploy it to a free hosting platform (Vercel) so it runs at a normal URL over HTTPS.

### No-terminal deploy path (GitHub Web UI + Vercel)

1. Create a new GitHub repository (private is fine).
2. Upload the project files via GitHub’s web upload.
3. Create a Vercel account and click **New Project** → import that repo.
4. In Vercel project settings, add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `POKEMONTCG_API_KEY` (optional)
5. Deploy.

Then on iPhone:
- open the site in Safari
- Share → **Add to Home Screen**

## Notes
- Prices come from the Pokémon TCG API’s `tcgplayer.prices` fields when present.
- If a card has no TCGplayer data, prices will show as —.
