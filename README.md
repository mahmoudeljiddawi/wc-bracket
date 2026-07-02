# World Cup 2026 — Live Prediction Bracket

Interactive knockout bracket for the 2026 FIFA World Cup. Real results are
pulled from football-data.org; undecided matches are clickable predictions
that cascade through Round of 16 → Quarterfinals → Semis → Final → Champion.

## Files

- `WorldCupBracket.jsx` — React component (the bracket UI)
- `sync-worldcup.mjs`   — Node script: fetches finished knockout results and writes `public/results.json`
- `Makefile`            — setup / sync / dev / watch / build automation

## Quick start

1. Scaffold a Vite React app (if you don't have one):

       npm create vite@latest wc-bracket -- --template react
       cd wc-bracket

2. Copy these three files into the project root, then render the bracket:

       // src/App.jsx
       import WorldCupBracket from "../WorldCupBracket";   // or move it into src/
       export default function App() { return <WorldCupBracket />; }

3. Get a free API key: https://www.football-data.org/client/register

4. Run:

       make setup   # installs deps, prompts for the key, writes .env
       make dev     # syncs latest results, starts the dev server

## Other targets

- `make sync`   — one-off results refresh → public/results.json
- `make watch`  — re-sync every 5 minutes (match days)
- `make build`  — production build with fresh results baked in
- `make clean`  — remove results.json and dist/

## Notes

- Baseline results (through July 2, 2026) are hardcoded in the component,
  so the bracket renders even before the first sync.
- The sync script resolves later rounds iteratively, so it keeps working
  untouched through the Final on July 19.
- Makefile recipes require tab indentation — don't let an editor convert them.
