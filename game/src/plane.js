// Coral Courier — the aircraft: low-poly mail plane, flight physics and autopilot.
// One clear job: how the plane looks, how it flies, and how it lands or crashes.
import * as THREE from 'three';
import { PLANE, RUNWAYS, DEG } from './config.js';
import { heightAt, isWater } from './world.js';

/** Build the mail plane from primitives: coral-orange livery, white wings, spinning prop. */
export function buildPlaneMesh() {
  const group = new THREE.Group();
  const orange = new THREE.MeshLambertMaterial({ color: 0xe86a2c });
  const cream = new THREE.MeshLambertMaterial({ color: 0xf7ead7 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x333a44 });
  const glass = new THREE.MeshPhongMaterial({ color: 0x9fd8ef, shininess: 120, specular: 0xffffff });

  // Fuselage: a tapered cylinder along -z (nose forward is -z in local space).
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.75, 6.4, 12), orange);
  fuselage.rotation.x = Math.PI / 2;
  group.add(fuselage);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.15, 1.6, 12), cream);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -4.0;
  group.add(nose);
  // Canopy.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.95, 12, 10), glass);
  canopy.scale.set(1, 0.72, 1.5);
  canopy.position.set(0, 0.85, -1.2);
  group.add(canopy);
  // Main wing.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.28, 2.1), cream);
  wing.position.set(0, -0.1, -0.4);
  group.add(wing);
  const wingTipL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 2.1), orange);
  wingTipL.position.set(-5.9, -0.1, -0.4);
  group.add(wingTipL);
  const wingTipR = wingTipL.clone();
  wingTipR.position.x = 5.9;
  group.add(wingTipR);
  // Tail: horizontal stabiliser + fin, coral striped.
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.22, 1.3), cream);
  tailplane.position.set(0, 0.25, 3.1);
  group.add(tailplane);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.0, 1.6), orange);
  fin.position.set(0, 1.0, 3.1);
  group.add(fin);
  // Propeller: spinner + two blades, spins with throttle.
  const prop = new THREE.Group();
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 10), dark);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -0.4;
  prop.add(spinner);
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x22262c });
  for (const a of [0, Math.PI]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 3.6, 0.12), bladeMat);
    blade.rotation.z = a;
    prop.add(blade);
  }
  prop.position.z = -4.9;
  group.add(prop);
  // Fixed landing gear: two wheels + struts.
  const gear = new THREE.Group();
  const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.35, 12);
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.5, 6), dark);
    strut.position.set(side * 1.1, -1.3, -0.8);
    gear.add(strut);
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.1, -2.0, -0.8);
    gear.add(wheel);
  }
  group.add(gear);
  // Navigation lights: red port, green starboard, white tail — they blink in the loop.
  const navLights = {};
  const lightDefs = [
    ['port', 0xff2a2a, -5.9, -0.1, -0.4],
    ['starboard', 0x2aff5a, 5.9, -0.1, -0.4],
    ['tail', 0xffffff, 0, 0.3, 3.6],
  ];
  for (const [name, color, x, y, z] of lightDefs) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshBasicMaterial({ color }),
    );
    lamp.position.set(x, y, z);
    group.add(lamp);
    navLights[name] = lamp;
  }
  group.userData.prop = prop;
  group.userData.gear = gear;
  group.userData.navLights = navLights;
  return group;
}

/** A fresh flight state, parked at the start of the main runway, heading east. */
export function freshFlight() {
  const strip = RUNWAYS.main;
  return {
    x: strip.cx - strip.halfLength + 40,
    y: strip.altitude + 2.1,
    z: strip.cz,
    heading: 90 * DEG, // east, down the strip
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: 100,
    onGround: true,
    gearDown: true,
    rollingOut: false, // true while braking after a touchdown (never during the takeoff roll)
    verticalSpeed: 0,
    crashed: false,
    crashReason: '',
    landed: false,
    landedRunway: null,
    airborne: false,
  };
}

/** Which runway strip (if any) the point (x, z) is over. */
export function runwayUnder(x, z) {
  for (const [name, strip] of Object.entries(RUNWAYS)) {
    if (Math.abs(x - strip.cx) <= strip.halfLength && Math.abs(z - strip.cz) <= strip.halfWidth + 4) {
      return { name, strip };
    }
  }
  return null;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * One physics step. `input` carries pitch/roll/throttle targets in [-1, 1] plus flags.
 * Returns an event string: '' | 'tookoff' | 'touched' | 'landed' | 'crashed'.
 */
export function stepFlight(f, input, dt, wind) {
  if (f.crashed || f.landed) return '';
  const prevY = f.y;

  // Throttle: fuel empty means the engine is dead and the plane glides.
  if (f.fuel <= 0) f.throttle = 0;
  else f.throttle = clamp(f.throttle + input.throttleDelta * dt * 1.6, 0, 1);
  const targetSpeed = f.throttle * PLANE.maxSpeed;
  const accel = f.onGround ? PLANE.accel * 1.25 : PLANE.accel;
  f.speed += clamp(targetSpeed - f.speed, -accel * dt, accel * dt);
  if (Math.abs(f.roll) > 0.5 && !f.onGround) f.speed -= PLANE.drag * dt * 4;

  // Attitude follows the stick with a little lag, so the plane feels weighty.
  const targetPitch = input.pitch * PLANE.maxPitchDeg * DEG;
  const targetRoll = input.roll * PLANE.maxRollDeg * DEG;
  f.pitch += clamp(targetPitch - f.pitch, -1.9 * dt, 1.9 * dt);
  f.roll += clamp(targetRoll - f.roll, -2.4 * dt, 2.4 * dt);

  // Turning: bank into the turn; heading rate grows with bank and falls with speed,
  // so the plane is nimble slow and steady fast.
  if (!f.onGround) {
    f.heading -= Math.tan(f.roll) * 9.81 / Math.max(f.speed, 25) * 1.6 * dt;
  }

  // Vertical: climb with pitch while the wing flies; sink when slow or throttled back.
  const flying = f.speed > PLANE.minFlySpeed;
  if (f.onGround) {
    f.verticalSpeed = 0;
    if (f.speed > PLANE.rotateSpeed && input.pitch > 0.15) {
      f.onGround = false;
      f.airborne = true;
      f.rollingOut = false;
      f.y += 0.5;
      return 'tookoff';
    }
  } else {
    let vs = Math.sin(f.pitch) * f.speed;
    if (!flying) vs -= (PLANE.minFlySpeed - f.speed) * 0.9; // stall sink
    if (f.throttle < 0.15) vs -= 3.5; // idle glide sinks
    f.verticalSpeed = vs;
    f.y += vs * dt;
  }

  // Forward motion + wind drift.
  const fx = Math.sin(f.heading);
  const fz = Math.cos(f.heading);
  f.x += fx * f.speed * dt + (wind ? wind.x * dt : 0);
  f.z += fz * f.speed * dt + (wind ? wind.z * dt : 0);

  // Fuel burn scales with throttle.
  const burn = PLANE.fuelDrainIdle + (PLANE.fuelDrainPerSecond - PLANE.fuelDrainIdle) * f.throttle;
  f.fuel = Math.max(0, f.fuel - burn * dt);

  // Ground contact.
  const ground = heightAt(f.x, f.z);
  if (f.y <= ground + 2.1) {
    f.y = ground + 2.1;
    const strip = runwayUnder(f.x, f.z);
    if (isWater(f.x, f.z) && !strip) {
      f.crashed = true;
      f.crashReason = 'Ditched in the sea';
      return 'crashed';
    }
    if (strip) {
      // Touchdown checks run only at the moment the wheels meet the strip, never
      // during the roll-out: banking on the ground is not a crash.
      if (!f.onGround) {
        if (f.verticalSpeed < -PLANE.hardLandingVs || Math.abs(f.roll) > 0.6) {
          f.crashed = true;
          f.crashReason = f.verticalSpeed < -PLANE.hardLandingVs ? 'Hard landing — airframe broke up' : 'Landed on a wingtip';
          return 'crashed';
        }
        f.onGround = true;
        f.verticalSpeed = 0;
        f.landedRunway = strip.name;
        f.rollingOut = true;
        return 'touched';
      }
      // Rolling out on the strip after a touchdown: power comes off by itself and
      // the brakes bite, so the plane stops well before the strip ends.
      if (f.rollingOut) {
        f.throttle = Math.max(0, f.throttle - 1.5 * dt);
        f.speed = Math.max(0, f.speed - 26 * dt);
        if (f.speed < 6 && f.airborne) {
          f.landed = true;
          return 'landed';
        }
      }
      return '';
    }
    // Rough ground anywhere else.
    if (!f.onGround && f.speed > 12) {
      f.crashed = true;
      f.crashReason = 'Crashed into the hillside';
      return 'crashed';
    }
    if (!f.onGround) {
      f.crashed = true;
      f.crashReason = 'Forced landing in rough terrain';
      return 'crashed';
    }
  } else if (f.onGround && f.y > ground + 3) {
    // Rolled off a drop with the wheels in the air: flying again, not parked.
    f.onGround = false;
    f.airborne = true;
  }

  // World edge: turn the pilot back with a warning instead of letting them fly off the map.
  if (Math.abs(f.x) > 1300 || Math.abs(f.z) > 1300) {
    f.heading += Math.PI * dt * 0.4;
  }
  return '';
}

/** Apply the flight state to the 3D mesh: position, bank, pitch, prop spin, nav lights. */
export function posePlane(mesh, f, time) {
  mesh.position.set(f.x, f.y, f.z);
  mesh.rotation.order = 'YXZ';
  mesh.rotation.y = f.heading + Math.PI; // model nose is -z; heading 0 faces +z
  mesh.rotation.x = f.pitch;
  mesh.rotation.z = -f.roll;
  mesh.userData.prop.rotation.z += (2 + f.throttle * 38) * 0.016;
  const blink = Math.sin(time * 6) > 0;
  mesh.userData.navLights.tail.material.color.setHex(blink ? 0xffffff : 0x555555);
}

/**
 * PD roll: steer toward a heading error, damped by the plane's current turn rate.
 * A plain proportional roll overshoots and orbits the line it is trying to join —
 * the plane banks hard, turns past the bearing, banks hard the other way, and
 * circles forever. Damping by the turn rate it already has settles it on the line.
 */
function rollForHeadingErr(f, err) {
  // Near a full reversal (|err| ~ 180°), the normalized error flips sign at the
  // ±180° boundary and the roll chatters back and forth, so the plane circles
  // forever instead of completing the turn. Keep turning the way it is already
  // turning until the error is well inside the boundary.
  if (Math.abs(err) > 2.8) return f.roll >= 0 ? 1 : -1;
  const turnRate = -Math.tan(f.roll) * 9.81 / Math.max(f.speed, 25) * 1.6;
  return clamp(-err * 1.6 + turnRate * 0.3, -1, 1);
}

/**
 * Autopilot: steer toward `target` {x, y, z} (or a runway for landing).
 * Returns stick inputs in the same shape stepFlight takes.
 */
export function autopilotControl(f, target, dt, landing) {
  const dx = target.x - f.x;
  const dz = target.z - f.z;
  const dist = Math.hypot(dx, dz);
  const wantHeading = Math.atan2(dx, dz);
  const headingErr = angleDiff(wantHeading, f.heading);
  let rollTarget = clamp(-headingErr * 1.6, -1, 1);
  let pitchTarget;
  let throttleDelta = 0;
  if (landing) {
    // Rolling out after a touchdown: hold still, let the brakes work. Steering a
    // banked turn on the ground is how a good landing becomes a wingtip crash.
    if (f.onGround) return { pitch: 0, roll: 0, throttleDelta: 0 };
    const strip = RUNWAYS[target.runway];
    const zone = { x: strip.cx + strip.halfLength - 100, z: strip.cz };
    // Approach fix 600 m west of the strip: the final is always flown eastbound,
    // along the strip, never diagonally across it from wherever the last ring was.
    // 600 m of line gives the plane room to turn onto it — its turn radius at
    // 34 m/s is ~120 m, so a 250 m line is not enough to intercept from the side.
    const fix = { x: strip.cx - strip.halfLength - 600, y: strip.altitude + 100, z: strip.cz };
    const distZone = Math.hypot(zone.x - f.x, zone.z - f.z);
    // Overshot the touchdown zone: climb out, turn around, fly back to the
    // approach fix and line up again — never bank into the ground past the strip.
    // Only when actually ON the centreline: a plane still 100 m off the line is
    // not on final, it is still intercepting — treating it as an overshoot traps
    // it in a limit cycle at the zone's x (both branches flip every frame).
    if (Math.abs(f.z - strip.cz) < 40 && f.x > zone.x + 40 && distZone < 500) {
      const fdx = fix.x - f.x;
      const fdz = fix.z - f.z;
      const fixErr = angleDiff(Math.atan2(fdx, fdz), f.heading);
      if (f.y - heightAt(f.x, f.z) < 45) return { pitch: 1.0, roll: 0, throttleDelta: 1 };
      return {
        pitch: clamp((fix.y - f.y) * 0.02, -0.7, 0.7),
        roll: rollForHeadingErr(f, fixErr),
        throttleDelta: f.speed < 40 ? 1 : -0.4,
      };
    }
    // Fly directly at the touchdown zone (pure pursuit on a point, not
    // line-following on a line the plane cannot join from the side). A point
    // target converges: the plane spirals in on it instead of orbiting a line.
    // Descend only when actually lined up on the flat corridor and heading east;
    // otherwise hold 120 m and keep flying at the zone — the plane overshoots,
    // goes around, and retries from a better angle, instead of descending into
    // the hillside beside the strip.
    const dx = zone.x - f.x;
    const dz = zone.z - f.z;
    const wantHeading = Math.atan2(dx, dz);
    const headingErr = angleDiff(wantHeading, f.heading);
    rollTarget = rollForHeadingErr(f, headingErr);
    const linedUpFinal = Math.abs(f.z - strip.cz) < 20
      && Math.abs(angleDiff(Math.PI / 2, f.heading)) < 0.8;
    let wantY = strip.altitude + 120;
    if (linedUpFinal) wantY = strip.altitude + 2 + distZone * 0.1;
    else wantY = Math.max(wantY, heightAt(f.x, f.z) + 45);
    // Short final, close to the ground and the zone: never bank, keep sinking.
    // A banked wingtip at touchdown is a crash, and the strip is long enough to
    // absorb a touchdown a few metres past the zone.
    const onShortFinal = f.y < strip.altitude + 8 && distZone < 200 && Math.abs(f.z - strip.cz) < 20;
    if (onShortFinal) {
      return { pitch: -0.25, roll: 0, throttleDelta: f.speed > 36 ? -0.5 : 0 };
    }
    // Low over the strip itself: wings level, keep sinking.
    const lowOverStrip = f.y < strip.altitude + 12
      && Math.abs(f.x - strip.cx) <= strip.halfLength
      && Math.abs(f.z - strip.cz) <= strip.halfWidth + 10;
    if (lowOverStrip) {
      return { pitch: -0.25, roll: 0, throttleDelta: f.speed > 36 ? -0.5 : 0 };
    }
    const gain = distZone < 100 ? 0.25 : 0.12;
    pitchTarget = clamp((wantY - f.y) * gain, -0.8, 0.6);
    if (distZone < 60) pitchTarget = Math.min(pitchTarget, -0.2); // keep sinking onto the zone
    if (distZone < 60) throttleDelta = f.speed > 38 ? -0.5 : (f.speed < 34 ? 0.6 : -0.2);
    // Still lining up (not on the final yet): stay slow at 28 m/s so the turn
    // stays tight. Speeding up while the plane is still circling in is what
    // makes it overshoot and orbit instead of settling on the final.
    else if (!linedUpFinal && distZone > 150) throttleDelta = f.speed > 28 ? -1 : 0.6;
    else throttleDelta = f.speed > 40 ? -1 : (f.speed < 34 ? 0.6 : -0.2);
    // Terrain clearance while lining up off the corridor: never let the glide
    // slope fly us into a hill. (Over the corridor the strip is flat.)
    if (Math.abs(f.z - strip.cz) > 20 && distZone > 150 && f.y - heightAt(f.x, f.z) < 30) {
      pitchTarget = 1.0;
      rollTarget = 0;
    }
  } else {
    const altErr = target.y - f.y;
    pitchTarget = clamp(altErr * 0.02, -0.7, 0.7);
    // Slow down for a big heading change and near the target: a tight turn at cruise
    // speed overshoots the ring and the plane spends minutes circling back.
    let speedTarget = PLANE.cruiseSpeed;
    if (Math.abs(headingErr) > 0.5) speedTarget = 40;
    if (dist < 160) speedTarget = Math.min(speedTarget, 34);
    throttleDelta = f.speed < speedTarget ? 1 : -0.4;
    // Terrain clearance: if the ground below is close, climb hard and fast in a
    // straight line instead of turning toward the ring. A ring behind a hill is
    // not worth flying into the hillside for; climb out first, then turn.
    const clearance = f.y - heightAt(f.x, f.z);
    if (!f.onGround && clearance < 45) {
      pitchTarget = 1.0;
      rollTarget = 0;
      throttleDelta = 1;
    }
    if (f.onGround) {
      pitchTarget = f.speed > PLANE.rotateSpeed ? 0.5 : 0;
      throttleDelta = 1;
    }
  }
  return { pitch: pitchTarget, roll: rollTarget, throttleDelta };
}
