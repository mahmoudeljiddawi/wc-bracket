#!/usr/bin/env node
/**
 * sync-worldcup.mjs
 * Pulls FIFA World Cup 2026 knockout results from football-data.org
 * and writes them to public/results.json in the shape the bracket expects:
 *
 *   { "L5": { "winner": "POR", "score": "2–1" }, ... }
 *
 * Usage:
 *   FOOTBALL_DATA_KEY=your_key node sync-worldcup.mjs
 *
 * Get a free key at https://www.football-data.org/client/register
 * (free tier includes the World Cup, 10 req/min — plenty for this).
 *
 * Run it manually, on a cron, or from an npm script:
 *   "scripts": { "sync": "node sync-worldcup.mjs" }
 */

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const API_KEY = process.env.FOOTBALL_DATA_KEY;
const OUT_FILE = process.env.OUT_FILE || path.join("public", "results.json");

if (!API_KEY) {
  console.error("Missing FOOTBALL_DATA_KEY env var. Get a free key at https://www.football-data.org/client/register");
  process.exit(1);
}

// ── Our bracket's team codes, keyed by names football-data.org uses ──
// Matched loosely (lowercased, punctuation stripped) so minor naming
// differences ("Côte d'Ivoire" vs "Ivory Coast") still resolve.
const NAME_TO_CODE = {
  "south africa": "RSA",
  "canada": "CAN",
  "brazil": "BRA",
  "japan": "JPN",
  "germany": "GER",
  "paraguay": "PAR",
  "netherlands": "NED",
  "morocco": "MAR",
  "ivory coast": "CIV",
  "cote divoire": "CIV",
  "norway": "NOR",
  "france": "FRA",
  "sweden": "SWE",
  "mexico": "MEX",
  "ecuador": "ECU",
  "england": "ENG",
  "dr congo": "COD",
  "congo dr": "COD",
  "democratic republic of the congo": "COD",
  "belgium": "BEL",
  "senegal": "SEN",
  "united states": "USA",
  "usa": "USA",
  "bosnia and herzegovina": "BIH",
  "bosnia herzegovina": "BIH",
  "spain": "ESP",
  "austria": "AUT",
  "portugal": "POR",
  "croatia": "CRO",
  "switzerland": "SUI",
  "algeria": "ALG",
  "australia": "AUS",
  "egypt": "EGY",
  "argentina": "ARG",
  "cape verde": "CPV",
  "cabo verde": "CPV",
  "colombia": "COL",
  "ghana": "GHA",
};

// FIFA three-letter codes (football-data's `tla`) that map 1:1 to ours
const TLA_ALIASES = {
  RSA: "RSA", CAN: "CAN", BRA: "BRA", JPN: "JPN", GER: "GER", PAR: "PAR",
  NED: "NED", MAR: "MAR", CIV: "CIV", NOR: "NOR", FRA: "FRA", SWE: "SWE",
  MEX: "MEX", ECU: "ECU", ENG: "ENG", COD: "COD", BEL: "BEL", SEN: "SEN",
  USA: "USA", BIH: "BIH", ESP: "ESP", AUT: "AUT", POR: "POR", CRO: "CRO",
  SUI: "SUI", ALG: "ALG", AUS: "AUS", EGY: "EGY", ARG: "ARG", CPV: "CPV",
  COL: "COL", GHA: "GHA",
};

// ── Bracket structure (must mirror the React component) ──
// slots: team code string, or { from: matchId } meaning "winner of that match"
const BRACKET = {
  L1: { slots: ["GER", "PAR"] },
  L2: { slots: ["FRA", "SWE"] },
  L3: { slots: ["CAN", "RSA"] },
  L4: { slots: ["NED", "MAR"] },
  L5: { slots: ["POR", "CRO"] },
  L6: { slots: ["ESP", "AUT"] },
  L7: { slots: ["USA", "BIH"] },
  L8: { slots: ["BEL", "SEN"] },
  R1: { slots: ["BRA", "JPN"] },
  R2: { slots: ["CIV", "NOR"] },
  R3: { slots: ["MEX", "ECU"] },
  R4: { slots: ["ENG", "COD"] },
  R5: { slots: ["AUS", "EGY"] },
  R6: { slots: ["ARG", "CPV"] },
  R7: { slots: ["SUI", "ALG"] },
  R8: { slots: ["COL", "GHA"] },
  M89: { slots: [{ from: "L1" }, { from: "L2" }] },
  M90: { slots: [{ from: "L3" }, { from: "L4" }] },
  M93: { slots: [{ from: "L5" }, { from: "L6" }] },
  M94: { slots: [{ from: "L7" }, { from: "L8" }] },
  M91: { slots: [{ from: "R1" }, { from: "R2" }] },
  M92: { slots: [{ from: "R3" }, { from: "R4" }] },
  M95: { slots: [{ from: "R5" }, { from: "R6" }] },
  M96: { slots: [{ from: "R7" }, { from: "R8" }] },
  M97: { slots: [{ from: "M89" }, { from: "M90" }] },
  M98: { slots: [{ from: "M93" }, { from: "M94" }] },
  M99: { slots: [{ from: "M91" }, { from: "M92" }] },
  M100: { slots: [{ from: "M95" }, { from: "M96" }] },
  SF1: { slots: [{ from: "M97" }, { from: "M98" }] },
  SF2: { slots: [{ from: "M99" }, { from: "M100" }] },
  FIN: { slots: [{ from: "SF1" }, { from: "SF2" }] },
};

const KNOCKOUT_STAGES = new Set([
  "LAST_32", "ROUND_OF_32", "LAST_16", "ROUND_OF_16",
  "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE", "FINAL",
]);

const normalize = (s) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

function teamCode(apiTeam) {
  if (apiTeam?.tla && TLA_ALIASES[apiTeam.tla]) return TLA_ALIASES[apiTeam.tla];
  for (const key of [apiTeam?.name, apiTeam?.shortName]) {
    const code = NAME_TO_CODE[normalize(key)];
    if (code) return code;
  }
  return null;
}

function formatScore(match) {
  const ft = match.score?.fullTime;
  const pens = match.score?.penalties;
  const dur = match.score?.duration; // REGULAR | EXTRA_TIME | PENALTY_SHOOTOUT
  const base = `${ft?.home ?? "?"}–${ft?.away ?? "?"}`;
  if (dur === "PENALTY_SHOOTOUT" && pens) return `${base} (${pens.home}–${pens.away} pens)`;
  if (dur === "EXTRA_TIME") return `${base} aet`;
  return base;
}

function matchWinnerCode(match, homeCode, awayCode) {
  const w = match.score?.winner; // HOME_TEAM | AWAY_TEAM | DRAW
  if (w === "HOME_TEAM") return homeCode;
  if (w === "AWAY_TEAM") return awayCode;
  // DRAW shouldn't happen in knockouts, but fall back to penalty score
  const pens = match.score?.penalties;
  if (pens) return pens.home > pens.away ? homeCode : awayCode;
  return null;
}

async function main() {
  console.log("Fetching World Cup matches from football-data.org…");
  const res = await fetch("https://api.football-data.org/v4/competitions/WC/matches", {
    headers: { "X-Auth-Token": API_KEY },
  });
  if (!res.ok) {
    console.error(`API error ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const data = await res.json();

  const finished = (data.matches || []).filter(
    (m) => m.status === "FINISHED" && KNOCKOUT_STAGES.has(m.stage)
  );
  console.log(`Found ${finished.length} finished knockout matches.`);

  // Resolve bracket iteratively: as results fill in, later matches'
  // participants become known, so we can keep matching until stable.
  const results = {}; // { bracketId: { winner, score } }

  const winnerOf = (id) => results[id]?.winner || null;
  const resolveSlot = (slot) => (typeof slot === "string" ? slot : winnerOf(slot.from));

  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const apiMatch of finished) {
      const home = teamCode(apiMatch.homeTeam);
      const away = teamCode(apiMatch.awayTeam);
      if (!home || !away) continue;

      for (const [id, def] of Object.entries(BRACKET)) {
        if (results[id]) continue;
        const a = resolveSlot(def.slots[0]);
        const b = resolveSlot(def.slots[1]);
        if (!a || !b) continue;
        const samePair = (a === home && b === away) || (a === away && b === home);
        if (!samePair) continue;

        const winner = matchWinnerCode(apiMatch, home, away);
        if (!winner) continue;

        results[id] = { winner, score: formatScore(apiMatch) };
        console.log(`  ${id}: ${home} vs ${away} → ${winner} (${results[id].score})`);
        progressed = true;
      }
    }
  }

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(
    OUT_FILE,
    JSON.stringify({ updatedAt: new Date().toISOString(), results }, null, 2)
  );
  console.log(`\nWrote ${Object.keys(results).length} results → ${OUT_FILE}`);
}

main().catch((err) => {
  console.error("Sync failed:", err.message);
  process.exit(1);
});
