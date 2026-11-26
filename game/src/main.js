// Coral Courier — bootstrap, game loop, chase camera and state machine.
// One clear job: wire the world, plane, missions, HUD and audio together and run the frames.
import * as THREE from 'three';
import { MISSIONS, RUNWAYS, DEG, RAD } from './config.js';
import { buildWorld, heightAt } from './world.js';
import { buildPlaneMesh, freshFlight, stepFlight, posePlane, autopilotControl, runwayUnder } from './plane.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { AudioEngine } from './audio.js';
import { Mission } from './missions.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') || 7);
const SHOT = params.get('shot') || '';

export class Game {
  constructor() {
    this.screen = 'title'; // title | flying | paused | win | crash
    this.selectedMission = Number(params.get('mission') || 0);
    this.elapsed = 0;
    this.time = 0;
    this.lowFuelWarned = false;
    this.engineOutWarned = false;
    this.autopilot = false;
    this.cameraPos = new THREE.Vector3();
    this.cameraInit = false;

    const canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 6000);

    const { sky } = buildWorld(this.scene, SEED);
    this.clouds = sky.clouds;
    this.planeMesh = buildPlaneMesh();
    this.scene.add(this.planeMesh);
    this.flight = freshFlight();

    // Beacon pillar over the next ring so the pilot always sees where to go.
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 2, 150, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffc93c, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    this.scene.add(this.beacon);

    this.hud = new Hud();
    this.hud.onMissionPick = (i) => this.selectMission(i);
    this.input = new Input(canvas);
    this.input.onFirstGesture = () => this.audio.ensure();
    this.input.onPause = () => this.togglePause();
    this.input.onRestart = () => this.restart();
    this.input.onMissionKey = (i) => {
      if (i === -2) this.beginFlight();
      else if (this.screen === 'title') this.selectMission(i);
    };
    document.getElementById('start-btn').addEventListener('click', () => this.beginFlight());
    document.getElementById('again-btn').addEventListener('click', () => this.restart());
    document.getElementById('retry-btn').addEventListener('click', () => this.restart());
    document.getElementById('menu-btn').addEventListener('click', () => this.toTitle());
    document.getElementById('menu-btn-2').addEventListener('click', () => this.toTitle());
    document.getElementById('resume-btn').addEventListener('click', () => this.togglePause());
    this.audio = new AudioEngine();

    this.mission = new Mission(MISSIONS[this.selectedMission], this.scene);
    this.hud.selectMission(this.selectedMission);
    this.setScreen('title');
    this.syncPlaneMesh();

    window.addEventListener('resize', () => this.onResize());
  }

  windVector() {
    const w = this.mission.def.wind;
    if (!w) return { x: 0, z: 0 };
    const gust = 0.6 + 0.4 * Math.sin(this.time * 0.7) * Math.sin(this.time * 0.23);
    return { x: -w * gust, z: w * 0.35 * Math.sin(this.time * 0.5) };
  }

  selectMission(i) {
    if (i < 0 || i >= MISSIONS.length) return;
    this.selectedMission = i;
    this.hud.selectMission(i);
    this.audio.click();
  }

  startMission(i) {
    this.mission.dispose(this.scene);
    this.mission = new Mission(MISSIONS[i], this.scene);
    this.flight = freshFlight();
    this.flight.fuel = MISSIONS[i].fuel;
    this.elapsed = 0;
    this.lowFuelWarned = false;
    this.engineOutWarned = false;
    this.cameraInit = false;
    this.syncPlaneMesh();
  }

  beginFlight() {
    this.startMission(this.selectedMission);
    this.audio.ensure();
    this.audio.click();
    this.setScreen('flying');
    this.hud.showMessage(`${MISSIONS[this.selectedMission].name} — throttle up, pull back to lift off!`, 4);
  }

  restart() {
    this.startMission(this.selectedMission);
    this.setScreen('flying');
  }

  toTitle() {
    this.startMission(this.selectedMission);
    this.setScreen('title');
  }

  togglePause() {
    if (this.screen === 'flying') this.setScreen('paused');
    else if (this.screen === 'paused') this.setScreen('flying');
  }

  setScreen(name) {
    this.screen = name;
    this.hud.showScreen(name);
  }

  syncPlaneMesh() {
    posePlane(this.planeMesh, this.flight, this.time);
  }

  /** Shared post-step bookkeeping: rings, mission clock, messages. Runs in play and in shots. */
  afterStep(dt) {
    this.elapsed += dt;
    const missionEvent = this.mission.tick(dt);
    if (missionEvent === 'timeout' && this.screen === 'flying') {
      this.endCrash('Out of time — the mail is late');
      return;
    }
    const pts = this.mission.checkRing(this.flight);
    if (pts > 0) {
      this.audio.chime();
      const centre = pts > 100 ? ' Dead centre!' : '';
      this.hud.showMessage(`RING ${this.mission.ringsPassed}/${this.mission.ringsTotal}  +${pts}${centre}`);
    }
    if (this.flight.fuel < 25 && !this.lowFuelWarned) {
      this.lowFuelWarned = true;
      this.hud.showMessage('LOW FUEL — make the landing count', 3);
    }
    if (this.flight.fuel <= 0 && !this.engineOutWarned) {
      this.engineOutWarned = true;
      this.hud.showMessage('ENGINE OUT — glide her in!', 3.5);
    }
  }

  endCrash(reason) {
    this.audio.crash();
    document.getElementById('crash-reason').textContent = reason;
    document.getElementById('crash-score').textContent = String(this.mission.score);
    document.getElementById('crash-rings').textContent = `${this.mission.ringsPassed}/${this.mission.ringsTotal}`;
    this.setScreen('crash');
  }

  endWin() {
    const report = this.mission.landingReport;
    this.audio.fanfare();
    document.getElementById('win-score').textContent = String(report.total);
    document.getElementById('win-breakdown').textContent =
      `Rings ${report.rings}  ·  Landing ${report.landing}  ·  Soft touchdown +${report.softness}  ·  Fuel +${report.fuel}  ·  Time +${report.time}`;
    document.getElementById('win-time').textContent = `Sortie time ${Math.floor(report.timeUsedSeconds / 60)}:${String(Math.floor(report.timeUsedSeconds % 60)).padStart(2, '0')}`;
    this.setScreen('win');
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /** Heading as a compass bearing: north (-z) is 0, east (+x) is 90. */
  headingDeg() {
    return (((180 - this.flight.heading * RAD) % 360) + 360) % 360;
  }

  hudSnapshot() {
    const f = this.flight;
    const m = this.mission;
    const target = m.currentTarget(f);
    const dist = m.distanceToTarget(f);
    let nextRingText;
    if (target.kind === 'ring') {
      nextRingText = `NEXT RING ${m.ringsPassed + 1}/${m.ringsTotal} — ${Math.round(dist)} m`;
    } else {
      const name = target.runway === 'main' ? 'Coral runway' : 'Paloma strip';
      nextRingText = `LAND ON ${name.toUpperCase()} — ${Math.round(dist)} m`;
    }
    return {
      altitudeFt: (f.y - 0) * 3.28084,
      speedKts: f.speed * 1.94384,
      headingDeg: this.headingDeg(),
      pitchDeg: f.pitch * RAD,
      rollDeg: f.roll * RAD,
      score: m.score,
      ringsPassed: m.ringsPassed,
      ringsTotal: m.ringsTotal,
      fuel: f.fuel,
      throttle: f.throttle,
      gearDown: f.gearDown,
      timeLeft: m.timeLeft,
      missionName: m.def.name,
      nextRingText,
      windText: m.def.wind ? `WIND ${m.def.wind} m/s GUSTING` : 'WIND CALM',
      autopilot: this.autopilot,
    };
  }

  updateCamera(dt) {
    const f = this.flight;
    const fx = Math.sin(f.heading);
    const fz = Math.cos(f.heading);
    const desired = new THREE.Vector3(
      f.x - fx * 27 + Math.sin(f.roll) * 2,
      f.y + 7 - f.pitch * 6,
      f.z - fz * 27,
    );
    // Keep the camera out of the hills.
    desired.y = Math.max(desired.y, heightAt(desired.x, desired.z) + 3);
    if (!this.cameraInit) {
      this.cameraPos.copy(desired);
      this.cameraInit = true;
    }
    const k = 1 - Math.exp(-dt * 5);
    this.cameraPos.lerp(desired, k);
    this.camera.position.copy(this.cameraPos);
    this.camera.lookAt(f.x + fx * 30, f.y + 1, f.z + fz * 30);
    this.camera.rotateZ(f.roll * 0.2);
    this.camera.fov = 62 + f.speed * 0.14;
    this.camera.updateProjectionMatrix();
  }

  frame(dt) {
    this.time += dt;
    this.input.update();
    if (this.screen === 'flying') {
      this.autopilot = this.input.autopilotToggle;
      let stick;
      if (this.autopilot) {
        const target = this.mission.currentTarget(this.flight);
        const steer = this.mission.steerTarget(this.flight);
        stick = autopilotControl(this.flight, steer, dt, target.kind === 'landing');
      } else {
        stick = { pitch: this.input.pitch, roll: this.input.roll, throttleDelta: this.input.throttleDelta };
      }
      const ev = stepFlight(this.flight, stick, dt, this.windVector());
      this.afterStep(dt);
      if (ev === 'tookoff') this.hud.showMessage('Airborne! Gear up, on course.');
      if (ev === 'touched') {
        const note = this.mission.onTouchdown(this.flight.landedRunway, this.flight);
        this.audio.thud();
        this.hud.showMessage(note || 'Touchdown! Rolling out…');
      }
      if (ev === 'landed') {
        if (this.mission.isComplete()) {
          this.mission.finish(this.flight, this.elapsed);
          this.endWin();
        } else {
          // Intermediate stop (Island Hop): clear the flags so she can take off again.
          this.flight.landed = false;
          this.flight.airborne = false;
          this.flight.rollingOut = false;
          this.hud.showMessage('Mail delivered — throttle up and go again!', 3.5);
        }
      }
      if (ev === 'crashed') this.endCrash(this.flight.crashReason);
      this.audio.setFlight(this.flight.throttle, this.flight.speed, !this.flight.onGround);
    }
    // Clouds drift; the beacon follows the next ring.
    for (const cloud of this.clouds) {
      cloud.position.x += cloud.userData.speed * dt;
      if (cloud.position.x > 1400) cloud.position.x = -1400;
    }
    const target = this.mission.currentTarget(this.flight);
    this.beacon.position.set(target.x, target.y + 75, target.z);
    this.beacon.material.opacity = this.screen === 'flying' ? 0.12 + 0.04 * Math.sin(this.time * 3) : 0;
    this.updateCamera(dt);
    this.syncPlaneMesh();
    this.hud.update(this.hudSnapshot(), dt);
    this.renderer.render(this.scene, this.camera);
  }

  run() {
    if (SHOT) {
      // Screenshot staging: run the real sim synchronously, then keep re-rendering the
      // frozen frame so the compositor always holds it (a single render can be dropped
      // before a headless screenshot is taken).
      stageShot(SHOT, this);
      this.updateCamera(0.5);
      this.syncPlaneMesh();
      this.hud.update(this.hudSnapshot(), 0.016);
      this.renderer.render(this.scene, this.camera);
      const frozen = () => {
        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame(frozen);
      };
      requestAnimationFrame(frozen);
      return;
    }
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

const game = new Game();
game.run();
