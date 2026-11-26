// Coral Courier — the archipelago: terrain, sea, sky, town, runways and rings.
// One clear job: everything the pilot sees outside the aircraft, plus the height function
// the flight model uses for ground collision.
import * as THREE from 'three';
import { WORLD, RUNWAYS } from './config.js';
import { makeRng, smoothNoise } from './random.js';

// Islands: gaussian hills. [x, z, radius, height]
const ISLANDS = [
  [0, 300, 430, 58], // Coral Island — home airfield
  [-520, -620, 320, 44], // Paloma Island — north strip
  [720, -260, 200, 26], // Gull Rock
  [420, 760, 150, 18], // Turtle Islet
  [-860, 460, 170, 24], // Heron Islet
  [960, 560, 130, 16], // Crab Cay
  [-240, -980, 150, 20], // North Beacon rock
  [980, -820, 120, 14], // Far East rock
];

function flattenNearStrip(x, z, strip, altitude) {
  // A flat plateau across the whole strip, easing back to natural terrain outside it,
  // so the asphalt always sits on the ground instead of under a hill.
  const dx = Math.abs(x - strip.cx) / strip.halfLength;
  const dz = Math.abs(z - strip.cz) / strip.halfWidth;
  const d = Math.max(dx, dz);
  if (d <= 1) return { blend: 1, altitude };
  if (d >= 1.6) return null;
  const t = (d - 1) / 0.6;
  return { blend: 1 - t * t * (3 - 2 * t), altitude };
}

/** Ground height in metres at (x, z). Sea floor sits below 0; land rises above it. */
export function heightAt(x, z) {
  let h = -7;
  for (let i = 0; i < ISLANDS.length; i += 1) {
    const [ix, iz, r, peak] = ISLANDS[i];
    const dx = x - ix;
    const dz = z - iz;
    const d2 = dx * dx + dz * dz;
    const sigma = r / 2.1;
    h += peak * Math.exp(-d2 / (2 * sigma * sigma));
  }
  if (h > 1.5) h += smoothNoise(x * 0.012, z * 0.012) * 3.2 + smoothNoise(x * 0.05, z * 0.05) * 0.9;
  const flatMain = flattenNearStrip(x, z, RUNWAYS.main, RUNWAYS.main.altitude);
  if (flatMain) h = h * (1 - flatMain.blend) + flatMain.altitude * flatMain.blend;
  const flatNorth = flattenNearStrip(x, z, RUNWAYS.north, RUNWAYS.north.altitude);
  if (flatNorth) h = h * (1 - flatNorth.blend) + flatNorth.altitude * flatNorth.blend;
  return Math.max(h, -8);
}

export function isWater(x, z) {
  return heightAt(x, z) < 0.5;
}

function terrainColor(h, x, z) {
  // Sand ring at the waterline, grass inland, deep forest on the slopes, grey rock on tops.
  const n = smoothNoise(x * 0.03 + 40, z * 0.03 + 40) * 0.5 + 0.5;
  if (h < 2.5) return [0.93, 0.83, 0.58]; // beach sand
  if (h < 14) return [0.32 + n * 0.08, 0.62 + n * 0.08, 0.28]; // meadow green
  if (h < 32) return [0.16 + n * 0.06, 0.42 + n * 0.06, 0.20]; // forest green
  if (h < 48) return [0.45, 0.38, 0.30]; // rock
  return [0.62, 0.60, 0.56]; // high crag
}

function buildTerrain(scene) {
  const size = WORLD.size;
  const seg = 150;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const [r, g, b] = terrainColor(h, x, z);
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0, 0);
  scene.add(mesh);
  return mesh;
}

function buildSea(scene) {
  const geo = new THREE.PlaneGeometry(7000, 7000, 1, 1);
  const mat = new THREE.MeshPhongMaterial({
    color: 0x1673ad, transparent: true, opacity: 0.94, shininess: 140, specular: 0x99ccff,
  });
  const sea = new THREE.Mesh(geo, mat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = WORLD.seaLevel;
  scene.add(sea);
  return sea;
}

function buildSky(scene, rng) {
  scene.background = new THREE.Color(0x8ec9ee);
  scene.fog = new THREE.Fog(0xa8d4f0, 1000, 2800);
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.35);
  sun.position.set(600, 900, -400);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x3d7a4a, 0.85));

  // Sun disc + halo, drawn as flat sprites so it reads at any heading.
  const sunGroup = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(46, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false }),
  );
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(90, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff9d0, transparent: true, opacity: 0.35, fog: false }),
  );
  disc.position.set(0, 0, 0.5);
  sunGroup.add(halo);
  sunGroup.add(disc);
  sunGroup.position.set(1500, 620, -1900);
  sunGroup.lookAt(0, 0, 0);
  scene.add(sunGroup);

  // Puffy low-poly clouds: clusters of white ellipsoids drifting slowly east.
  // Unlit material: clouds read as bright white puffs at any sun angle.
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
  const clouds = [];
  for (let i = 0; i < 26; i += 1) {
    const group = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 3);
    for (let p = 0; p < puffs; p += 1) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(16 + rng() * 22, 10, 8), cloudMat);
      s.position.set((rng() - 0.5) * 70, (rng() - 0.5) * 10, (rng() - 0.5) * 34);
      s.scale.y = 0.45;
      group.add(s);
    }
    group.position.set((rng() - 0.5) * 2600, 300 + rng() * 160, (rng() - 0.5) * 2600);
    group.userData.speed = 2 + rng() * 3;
    scene.add(group);
    clouds.push(group);
  }
  return { clouds };
}

function buildPalms(scene, rng) {
  // Two instanced meshes: trunks and frond cones. ~380 palms on grassy ground.
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.9, 9, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  const frondGeo = new THREE.ConeGeometry(5.2, 7, 7);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
  const spots = [];
  let guard = 0;
  while (spots.length < 380 && guard < 6000) {
    guard += 1;
    const x = (rng() - 0.5) * 2400;
    const z = (rng() - 0.5) * 2400;
    const h = heightAt(x, z);
    if (h < 3 || h > 34) continue;
    const nearMain = Math.abs(x - RUNWAYS.main.cx) < 230 && Math.abs(z - RUNWAYS.main.cz) < 60;
    const nearNorth = Math.abs(x - RUNWAYS.north.cx) < 190 && Math.abs(z - RUNWAYS.north.cz) < 50;
    if (nearMain || nearNorth) continue;
    spots.push([x, h, z]);
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  for (let i = 0; i < spots.length; i += 1) {
    const [x, h, z] = spots[i];
    const lean = (rng() - 0.5) * 0.14;
    e.set(lean, rng() * Math.PI * 2, lean * 0.6);
    q.setFromEuler(e);
    s.setScalar(0.8 + rng() * 0.6);
    m.compose(new THREE.Vector3(x, h + 4.2 * s.y, z), q, s);
    trunks.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(x, h + 9.6 * s.y, z), q, s);
    fronds.setMatrixAt(i, m);
  }
  scene.add(trunks);
  scene.add(fronds);
}

function buildTown(scene, rng) {
  // A little harbour town south of the main runway: pastel boxes, a control tower,
  // a hangar and a lighthouse on the eastern point.
  const group = new THREE.Group();
  const palette = [0xf2e3c6, 0xe8a87c, 0x9fc5e8, 0xf4d35e, 0xee964b, 0xffffff, 0xc9a0dc];
  for (let i = 0; i < 30; i += 1) {
    const x = -260 + rng() * 520;
    const z = 420 + rng() * 130;
    const h = heightAt(x, z);
    if (h < 2) continue;
    const w = 8 + rng() * 10;
    const d = 8 + rng() * 10;
    const tall = 6 + rng() * 12;
    const house = new THREE.Mesh(
      new THREE.BoxGeometry(w, tall, d),
      new THREE.MeshLambertMaterial({ color: palette[i % palette.length] }),
    );
    house.position.set(x, h + tall / 2, z);
    house.rotation.y = rng() * Math.PI;
    group.add(house);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(w, d) * 0.75, 3.5, 4),
      new THREE.MeshLambertMaterial({ color: 0xb5533c }),
    );
    roof.position.set(x, h + tall + 1.7, z);
    roof.rotation.y = Math.PI / 4 + house.rotation.y;
    group.add(roof);
  }
  // Control tower beside the runway.
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 5, 26, 10),
    new THREE.MeshLambertMaterial({ color: 0xe8e2d0 }),
  );
  tower.position.set(60, heightAt(60, 350) + 13, 350);
  group.add(tower);
  const cab = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 5.5, 6, 10),
    new THREE.MeshPhongMaterial({ color: 0x2e6da4, shininess: 90 }),
  );
  cab.position.set(60, heightAt(60, 350) + 28, 350);
  group.add(cab);
  // Hangar.
  const hangar = new THREE.Mesh(
    new THREE.BoxGeometry(34, 12, 24),
    new THREE.MeshLambertMaterial({ color: 0x8fa8bf }),
  );
  hangar.position.set(-120, heightAt(-120, 348) + 6, 348);
  group.add(hangar);
  // Lighthouse on the eastern point of Coral Island.
  const lightBase = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 4.5, 22, 10),
    new THREE.MeshLambertMaterial({ color: 0xf5f0e6 }),
  );
  lightBase.position.set(330, heightAt(330, 120) + 11, 120);
  group.add(lightBase);
  const lightTop = new THREE.Mesh(
    new THREE.SphereGeometry(3.4, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe27a }),
  );
  lightTop.position.set(330, heightAt(330, 120) + 23, 120);
  group.add(lightTop);
  scene.add(group);
}

function buildRunway(scene, strip, label) {
  const group = new THREE.Group();
  const y = strip.altitude + 0.4;
  const asphalt = new THREE.Mesh(
    new THREE.BoxGeometry(strip.halfLength * 2, 0.8, strip.halfWidth * 2),
    new THREE.MeshLambertMaterial({ color: 0x3a3f46 }),
  );
  asphalt.position.set(strip.cx, y, strip.cz);
  group.add(asphalt);
  // Centreline dashes.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5f5f0 });
  for (let x = -strip.halfLength + 20; x < strip.halfLength - 10; x += 30) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 1.2), dashMat);
    dash.position.set(strip.cx + x, y + 0.5, strip.cz);
    group.add(dash);
  }
  // Threshold bars at both ends.
  for (const end of [-1, 1]) {
    for (let k = -2; k <= 2; k += 1) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 2), dashMat);
      bar.position.set(strip.cx + end * (strip.halfLength - 10), y + 0.5, strip.cz + k * 4);
      group.add(bar);
    }
  }
  // Edge lights: warm amber studs so the strip reads at a glance.
  const lightGeo = new THREE.SphereGeometry(0.9, 8, 6);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffc861 });
  for (let x = -strip.halfLength; x <= strip.halfLength; x += 30) {
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(lightGeo, lightMat);
      lamp.position.set(strip.cx + x, y + 0.8, strip.cz + side * (strip.halfWidth + 1.5));
      group.add(lamp);
    }
  }
  // Windsock: orange cone on a pole at the strip's side.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 9, 6),
    new THREE.MeshLambertMaterial({ color: 0xdddddd }),
  );
  pole.position.set(strip.cx + strip.halfLength - 30, y + 4.5, strip.cz + strip.halfWidth + 8);
  group.add(pole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(1.6, 5, 8),
    new THREE.MeshBasicMaterial({ color: 0xff7f2a }),
  );
  sock.rotation.z = Math.PI / 2;
  sock.position.set(strip.cx + strip.halfLength - 27, y + 8.5, strip.cz + strip.halfWidth + 8);
  group.add(sock);
  group.userData.label = label;
  scene.add(group);
  return group;
}

/** A glowing ring the pilot flies through. Passed rings turn green. */
export function buildRingMesh(position, index) {
  const group = new THREE.Group();
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(26, 2.4, 12, 42),
    new THREE.MeshStandardMaterial({
      color: 0xffc93c, emissive: 0xcc8800, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.4,
    }),
  );
  group.add(torus);
  const inner = new THREE.Mesh(
    new THREE.TorusGeometry(26, 0.9, 8, 42),
    new THREE.MeshBasicMaterial({ color: 0xfff3b0 }),
  );
  group.add(inner);
  group.position.set(position[0], position[1], position[2]);
  group.userData.index = index;
  group.userData.torus = torus;
  return group;
}

export function buildWorld(scene, seed) {
  const rng = makeRng(seed);
  buildTerrain(scene);
  buildSea(scene);
  const sky = buildSky(scene, rng);
  buildPalms(scene, rng);
  buildTown(scene, rng);
  buildRunway(scene, RUNWAYS.main, 'main');
  buildRunway(scene, RUNWAYS.north, 'north');
  return { sky, rng };
}
