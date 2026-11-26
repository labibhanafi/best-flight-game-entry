// Coral Courier — the hand-in program for the best-flight-game bounty (Node 22, stdlib only).
// It copies this repository's game/ and screenshots/ beside it to /output and writes
// /output/dossier.json with the vendored make.fun library, exactly as the kit asks:
// outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output, e.g.
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// The program runs twice in the grader and both runs must write the same bytes; it only
// copies files and writes the dossier the library computes, so it is deterministic.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fail loudly instead of handing in an empty dossier: a missing game/ or
// screenshots/ means the repo is incomplete, and the grader would score it 0.
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');
if (!existsSync(gameDir)) throw new Error(`game/ not found beside main.ts (${gameDir})`);
if (!existsSync(shotsDir)) throw new Error(`screenshots/ not found beside main.ts (${shotsDir})`);

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (from the kit's reference/gate.json): only text_max_bytes shapes
// the bytes; the others refuse an entry the scorer would refuse — more than 4 screenshots
// or one over 256 KiB; more than 993 files in game/ or 48 MiB of game files in all, or a
// path under game/ over 1000 bytes. game/ counts beside /output's own 1000-entry cap,
// its screenshots/ and dossier.json.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);
console.log(`Coral Courier hand-in written to ${out} (${dossier.length} byte dossier).`);
