#!/bin/bash
# Rifà il video da zero con i dati demo. Database di PROVA locale (mai quello vero).
# Variabili: PG (default postgres://postgres@localhost:5433), PORTA (3999).
set -e
cd "$(dirname "$0")/.."
PG=${PG:-postgres://postgres@localhost:5433}; PORTA=${PORTA:-3999}; DB=$PG/demo
TMP=$(mktemp -d)
psql "$PG/postgres" -qc "drop database if exists demo" -c "create database demo"
DATABASE_URL=$DB ADMIN_EMAIL=demo@esempio.it ADMIN_PASSWORD='DemoPortale2026!' PORT=$PORTA SESSION_SECRET=demo npx tsx src/server/index.ts > $TMP/portale.log 2>&1 &
SERVER=$!; trap "kill $SERVER" EXIT
for i in $(seq 60); do curl -s localhost:$PORTA/login >/dev/null && break; sleep 1; done
DATABASE_URL=$DB npx tsx video-promo/dati-demo/semina.ts
python3 video-promo/dati-demo/scheda_demo.py $TMP/scheda
DATABASE_URL=$DB npx tsx video-promo/dati-demo/pacchetto.ts $TMP/scheda
MOUSER_API_KEY=demo FARNELL_API_KEY=demo TME_APP_TOKEN=demo TME_APP_SECRET=demo DATABASE_URL=$DB npx tsx video-promo/dati-demo/prezzi-demo.ts $TMP/scheda/NE-MC410_BOM_revB.csv
mkdir -p video-promo/video/riprese
NODE_PATH=$(npm root -g) node video-promo/video/riprese.cjs "$PWD/video-promo/video/riprese.json" "$PWD/video-promo/video/riprese" "$PWD/video-promo/video/zone.json"
# voce (una battuta per file)
python3 - <<'PY'
import json, subprocess
t = json.load(open('video-promo/testi.json'))
for b in t['battute']:
    subprocess.run(['edge-tts', '--voice', t['voceTts'], '--rate', t['velocita'], '--text', b['voce'], '--write-media', f"video-promo/voce/{b['id']}.mp3"], check=True)
PY
NODE_PATH=$(npm root -g) node video-promo/video/render.cjs
