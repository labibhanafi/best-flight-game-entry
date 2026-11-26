[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/labibhanafi/best-flight-game-entry/rank.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/labibhanafi/best-flight-game-entry/reward.svg)](https://make.fun/c/best-flight-game-20261126-0057)

# Coral Courier — Island Air Mail

An original 3D flight game built for the [make.fun best flight game bounty](https://make.fun/bounty/best-flight-game-20261126-0057): fly the mail plane through glowing sky rings over a tropical archipelago, mind your fuel, and bring her home to the Coral runway.

## How to play

Open `game/index.html` in desktop Chrome (or run `node serve.ts` and visit http://localhost:8080). No network, no build step — every file the game loads lives under `game/`.

| Control | Action |
| --- | --- |
| ↑ / W | Climb |
| ↓ / S | Dive |
| ← → / Q E | Bank and turn |
| Shift / Ctrl | Throttle up / down |
| Mouse drag | Steer like a yoke |
| Mouse wheel | Trim throttle |
| A | Autopilot assist |
| P | Pause · R restart |

## Missions

1. **Ring Run** — thread 8 sky rings, then land on Coral runway.
2. **Island Hop** — fly the mail to Paloma strip, touch down, race home. Two landings, one tank.
3. **Storm Courier** — 10 rings, a 5-minute clock and gusting crosswind.

Score: rings are 100 points each (25 bonus for a dead-centre pass), plus landing, soft-touchdown, fuel and time bonuses. Fly too slow and the wing stalls; land hard, ditch in the sea or clip a hillside and the sortie is lost.

## What is inside

- `game/index.html` — the page, HUD and screens
- `game/src/main.js` — bootstrap, loop, chase camera, state machine
- `game/src/world.js` — archipelago terrain, sea, sky, town, runways, rings
- `game/src/plane.js` — low-poly mail plane, flight physics, autopilot
- `game/src/missions.js` — missions, rings, scoring, win/lose
- `game/src/hud.js` — live instruments: attitude indicator, compass, fuel, throttle
- `game/src/input.js` — keyboard, mouse and touch
- `game/src/audio.js` — synthesized engine, wind and chimes (WebAudio, no files)
- `game/src/config.js` — all tuning numbers and mission definitions
- `game/src/shots.js` — the `?shot=` scenes the screenshots were staged from
- `game/vendor/three.module.min.js` — vendored Three.js r160
- `main.ts` — the hand-in program (Node 22): copies `game/` + `screenshots/` to `/output` and writes `dossier.json`

## Screenshots

Real renders of the game's own code, staged with `?shot=` (see `shots.json`): mid-course flight, threading a ring, final approach to Coral runway, and the mission-complete screen.

## License

MIT — see [LICENSE](LICENSE).
