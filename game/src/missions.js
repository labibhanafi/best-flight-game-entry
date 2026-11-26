// Coral Courier — missions, rings, scoring and win/lose.
// One clear job: what the sortie asks for, whether a ring counts, and what the flight earns.
import { MISSIONS, RING, SCORING, RUNWAYS } from './config.js';
import { buildRingMesh } from './world.js';

export class Mission {
  constructor(def, scene) {
    this.def = def;
    this.ringsTotal = def.rings.length;
    this.ringsPassed = 0;
    this.score = 0;
    this.centrePasses = 0;
    this.ringMeshes = def.rings.map((pos, i) => {
      const mesh = buildRingMesh(pos, i);
      scene.add(mesh);
      return mesh;
    });
    this.landingsDone = [];
    this.landingsNeeded = def.landings;
    this.landAfterRing = def.landAfterRing ?? -1;
    this.timeLeft = def.timeLimitSeconds > 0 ? def.timeLimitSeconds : null;
    this.finished = false;
    this.won = false;
    this.landingReport = null;
    this.updateRingHighlight();
  }

  get nextRingIndex() {
    return this.ringsPassed;
  }

  get nextRingPos() {
    return this.ringsPassed < this.ringsTotal ? this.def.rings[this.ringsPassed] : null;
  }

  /** The next objective: a ring, or the runway when the rings are done. */
  currentTarget(flight) {
    const ring = this.nextRingPos;
    if (ring) return { kind: 'ring', x: ring[0], y: ring[1], z: ring[2] };
    const runwayName = this.landingsNeeded[this.landingsDone.length] || 'main';
    const strip = RUNWAYS[runwayName];
    // Aim at a touchdown zone 100 m short of the strip's far end: the glide slope ends
    // there, so the wheels meet the asphalt with runway to spare for the roll-out.
    return {
      kind: 'landing',
      runway: runwayName,
      x: strip.cx + strip.halfLength - 100,
      y: strip.altitude,
      z: strip.cz,
    };
  }

  /**
   * Where the autopilot actually steers: line-following along the course leg from the
   * previous ring to the next one. The aim is the closest point on that leg, 150 m
   * ahead of the plane — so the plane intercepts the line, lines up, and flies
   * THROUGH each hoop instead of orbiting its centre (a turn radius is wider than
   * a ring). For a landing the aim is the touchdown zone itself.
   */
  steerTarget(flight) {
    const ring = this.nextRingPos;
    if (!ring) return this.currentTarget(flight);
    const i = this.ringsPassed;
    const from = i > 0
      ? this.def.rings[i - 1]
      : [RUNWAYS.main.cx - RUNWAYS.main.halfLength + 40, RUNWAYS.main.altitude + 2, RUNWAYS.main.cz];
    const ax = ring[0] - from[0];
    const ay = ring[1] - from[1];
    const az = ring[2] - from[2];
    const len2 = ax * ax + ay * ay + az * az || 1;
    const segLen = Math.sqrt(len2);
    let t = ((flight.x - from[0]) * ax + (flight.y - from[1]) * ay + (flight.z - from[2]) * az) / len2;
    t = Math.max(0, Math.min(1, t));
    const ahead = Math.min(150, (1 - t) * segLen + 120);
    return {
      kind: 'ring',
      x: from[0] + ax * t + (ax / segLen) * ahead,
      y: from[1] + ay * t + (ay / segLen) * ahead,
      z: from[2] + az * t + (az / segLen) * ahead,
    };
  }

  /** Distance from the plane to the next ring, for the HUD and the ring beacon. */
  distanceToTarget(flight) {
    const t = this.currentTarget(flight);
    return Math.hypot(t.x - flight.x, t.y - flight.y, t.z - flight.z);
  }

  /** Check whether the plane just flew through the next ring. Returns points earned or 0. */
  checkRing(flight) {
    const ring = this.nextRingPos;
    if (!ring) return 0;
    const dx = flight.x - ring[0];
    const dy = flight.y - ring[1];
    const dz = flight.z - ring[2];
    const dist = Math.hypot(dx, dy, dz);
    if (dist > RING.radius) return 0;
    // Must pass through the hoop's plane, not just graze its edge: the ring faces the
    // course, so a pass within the radius while moving counts.
    const centre = dist <= RING.centreBonusRadius;
    this.ringsPassed += 1;
    if (centre) this.centrePasses += 1;
    const pts = RING.points + (centre ? RING.centreBonus : 0);
    this.score += pts;
    const mesh = this.ringMeshes[this.ringsPassed - 1];
    mesh.userData.torus.material = mesh.userData.torus.material.clone();
    mesh.userData.torus.material.color.setHex(0x37d67a);
    mesh.userData.torus.material.emissive.setHex(0x0a7a33);
    this.updateRingHighlight();
    return pts;
  }

  updateRingHighlight() {
    this.ringMeshes.forEach((mesh, i) => {
      const active = i === this.ringsPassed;
      const done = i < this.ringsPassed;
      const s = active ? 1.18 : 1;
      mesh.scale.setScalar(s);
      if (!done) {
        mesh.userData.torus.material.emissiveIntensity = active ? 1.6 : 0.9;
      }
    });
  }

  /** Called when the plane touches down on a runway. Returns a report string or ''. */
  onTouchdown(runwayName, flight) {
    const expected = this.landingsNeeded[this.landingsDone.length];
    if (runwayName !== expected) {
      return `Wrong strip — the mail goes to ${expected === 'main' ? 'Coral' : 'Paloma'} next`;
    }
    // Island Hop needs the intermediate landing only after its 4th ring.
    if (this.landAfterRing >= 0 && this.landingsDone.length === 0 && this.ringsPassed <= this.landAfterRing) {
      return 'Fly the rings first — the mail is not due yet';
    }
    this.landingsDone.push(runwayName);
    return '';
  }

  /** A landing only counts as a win when every ring and every landing is done. */
  isComplete() {
    return this.ringsPassed >= this.ringsTotal
      && this.landingsDone.length >= this.landingsNeeded.length;
  }

  /** Final score once the plane has rolled to a stop after completing everything. */
  finish(flight, timeUsedSeconds) {
    if (this.finished) return this.score;
    this.finished = true;
    this.won = true;
    const softness = Math.max(0, 1 - Math.abs(flight.verticalSpeed) / 7.5);
    const softBonus = Math.round(SCORING.landingSoftBonus * softness);
    const fuelBonus = Math.round(flight.fuel * SCORING.fuelBonusPerPercent);
    const timeBonus = this.timeLeft === null ? 0 : Math.round(this.timeLeft * SCORING.timeBonusPerSecond);
    this.score += SCORING.landingBase + softBonus + fuelBonus + timeBonus;
    this.landingReport = {
      landing: SCORING.landingBase,
      softness: softBonus,
      fuel: fuelBonus,
      time: timeBonus,
      rings: this.ringsPassed * RING.points + this.centrePasses * RING.centreBonus,
      total: this.score,
      timeUsedSeconds,
    };
    return this.score;
  }

  tick(dt) {
    if (this.timeLeft !== null) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        return 'timeout';
      }
    }
    return '';
  }

  dispose(scene) {
    for (const mesh of this.ringMeshes) scene.remove(mesh);
    this.ringMeshes = [];
  }
}
