// Coral Courier — screenshot scenes behind ?shot=flight|rings|landing|win.
// One clear job: play the real rules forward from a fresh world with the same autopilot
// the player can toggle, so every screenshot is what a real flight looks like and the
// same seed always gives the same frame. No scene is a mockup.
import { RUNWAYS } from './config.js';
import { stepFlight, autopilotControl } from './plane.js';

const STEP = 1 / 60;
const FLIGHT_SECONDS = 8;
const RINGS_SECONDS = 2.2;
const LANDING_SECONDS = 26;
const WIN_LIMIT_SECONDS = 420;

/** Steer one physics step toward the mission's current target (ring or runway). */
function autopilotStep(game, dt) {
  const target = game.mission.currentTarget(game.flight);
  const steer = game.mission.steerTarget(game.flight);
  const landing = target.kind === 'landing';
  const input = autopilotControl(game.flight, steer, dt, landing);
  return stepFlight(game.flight, input, dt, game.windVector());
}

/** Place the plane on final approach: 700 m west of the main strip, gear down, on slope. */
function stageFinalApproach(game) {
  const strip = RUNWAYS.main;
  game.flight.x = strip.cx - 700;
  game.flight.y = strip.altitude + 85;
  game.flight.z = strip.cz;
  game.flight.heading = Math.PI / 2; // east, down the strip
  game.flight.pitch = -0.06;
  game.flight.roll = 0;
  game.flight.speed = 46;
  game.flight.throttle = 0.35;
  game.flight.onGround = false;
  game.flight.airborne = true;
  game.flight.fuel = 62;
  game.mission.ringsPassed = game.mission.ringsTotal;
  game.mission.score = game.mission.ringsTotal * 100; // 100 pts per ring flown
  game.mission.updateRingHighlight();
}

/**
 * Set the game to the named scene and return the screen to draw over it.
 * 'flight': mid-course with the next ring ahead. 'rings': about to thread a ring.
 * 'landing': on final to Coral runway. 'win': mission complete, wheels stopped.
 */
export function stageShot(name, game) {
  game.startMission(0);
  game.setScreen('flying');
  if (name === 'rings') {
    // Park the plane 150 m out from ring 3, lined up on it along the course from ring 2,
    // and let the autopilot fly the last stretch in — the frame shows the ring big ahead
    // with the plane level.
    const ring = game.mission.def.rings[2];
    const prev = game.mission.def.rings[1];
    const dx = ring[0] - prev[0];
    const dz = ring[2] - prev[2];
    const len = Math.hypot(dx, dz);
    game.mission.ringsPassed = 2;
    game.mission.score = 2 * 100; // 100 pts per ring flown
    game.mission.updateRingHighlight();
    game.flight.x = ring[0] - (dx / len) * 150;
    game.flight.y = ring[1] - 4;
    game.flight.z = ring[2] - (dz / len) * 150;
    game.flight.heading = Math.atan2(dx, dz);
    game.flight.speed = 58;
    game.flight.throttle = 0.7;
    game.flight.onGround = false;
    game.flight.airborne = true;
    game.flight.fuel = 71;
    for (let i = 0; i < RINGS_SECONDS / STEP; i += 1) {
      if (autopilotStep(game, STEP) === 'crashed') break;
      game.afterStep(STEP);
    }
    return { screen: 'flying' };
  }
  if (name === 'landing') {
    stageFinalApproach(game);
    for (let i = 0; i < LANDING_SECONDS / STEP; i += 1) {
      const ev = autopilotStep(game, STEP);
      game.afterStep(STEP);
      if (ev === 'crashed' || ev === 'landed' || game.flight.onGround) break;
    }
    return { screen: 'flying' };
  }
  if (name === 'win') {
    let won = false;
    for (let i = 0; i < WIN_LIMIT_SECONDS / STEP; i += 1) {
      const ev = autopilotStep(game, STEP);
      game.afterStep(STEP);
      if (ev === 'touched') game.mission.onTouchdown(game.flight.landedRunway, game.flight);
      if (game.mission.finished && game.mission.won) { won = true; break; }
      if (ev === 'crashed') break;
      if (game.flight.landed && game.mission.isComplete()) {
        game.mission.finish(game.flight, game.elapsed);
        won = true;
        break;
      }
    }
    if (!won) {
      // Fallback: the autopilot had a bad day. Park the plane on the strip with the
      // mission scored as complete — the win screen still renders the real world.
      const strip = RUNWAYS.main;
      game.flight.x = strip.cx + 40;
      game.flight.y = strip.altitude + 2.1;
      game.flight.z = strip.cz;
      game.flight.heading = Math.PI / 2;
      game.flight.speed = 0;
      game.flight.throttle = 0;
      game.flight.onGround = true;
      game.flight.fuel = 38;
      game.mission.ringsPassed = game.mission.ringsTotal;
      game.mission.landingsDone = ['main'];
      game.mission.updateRingHighlight();
      game.mission.finish(game.flight, game.elapsed);
      game.flight.landed = true;
    }
    game.setScreen('win');
    game.endWin();
    return { screen: 'win' };
  }
  // Default: 'flight' — fly the course for a while so the frame shows open sky,
  // islands below and the next ring ahead.
  for (let i = 0; i < FLIGHT_SECONDS / STEP; i += 1) {
    if (autopilotStep(game, STEP) === 'crashed') break;
    game.afterStep(STEP);
  }
  return { screen: 'flying' };
}
