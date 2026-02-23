#!/bin/zsh
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node LTS from https://nodejs.org and re-run this file."
  read -n 1 -s -r "REPLY?Press any key to exit..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies (one-time)…"
  npm install
fi

echo "Starting the app…"

# Try to open the site after a short delay
( sleep 2 && open "http://localhost:3000" ) >/dev/null 2>&1 &

npm run dev
