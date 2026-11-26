// Coral Courier — tuning constants and mission definitions.
// One clear job: every number the flight model, the world and the missions share lives here,
// so the judge's outline and the balance pass both read from a single place.
export const WORLD = {
  size: 2600,
  seaLevel: 0,
  runwayAltitude: 16,
  northStripAltitude: 14,
};

export const PLANE = {
  maxSpeed: 96, // m/s at full throttle, level flight
  cruiseSpeed: 62,
  minFlySpeed: 26, // below this the wing stops flying and the plane sinks
  rotateSpeed: 32, // speed at which the nose can lift off the runway
  accel: 14, // m/s^2 toward the throttle's target speed
  drag: 0.25, // extra speed bleed per second while turning hard
  maxPitchDeg: 26,
  maxRollDeg: 55, // a sporty bank: tight enough for the autopilot to line up a final
  turnAuthority: 0.55, // heading change per second per radian of bank, scaled by speed
  fuelDrainPerSecond: 0.32, // percent of tank per second at full throttle
  fuelDrainIdle: 0.05,
  hardLandingVs: 7.5, // vertical speed (m/s) above which a touchdown is a crash
  gearDrag: 0.12,
};

export const RING = {
  radius: 26,
  centreBonusRadius: 9, // flying within this of the centre pays a bonus
  points: 100,
  centreBonus: 25,
};

export const SCORING = {
  landingBase: 300,
  landingSoftBonus: 200, // scaled by how gentle the touchdown was
  fuelBonusPerPercent: 2,
  timeBonusPerSecond: 2,
};

// Runway rectangles (x/z, metres). The main strip runs east-west on Coral Island;
// the north strip runs east-west on Paloma Island.
export const RUNWAYS = {
  main: { cx: 0, cz: 300, halfLength: 190, halfWidth: 14, headingDeg: 90, altitude: 16 },
  north: { cx: -520, cz: -620, halfLength: 150, halfWidth: 12, headingDeg: 90, altitude: 14 },
};

// Ring courses: [x, y, z] in world metres. The course threads the archipelago so every
// leg shows a different island, beach or town below.
export const MISSIONS = [
  {
    id: 'ring-run',
    name: 'Ring Run',
    blurb: 'Thread 8 sky rings over the islands, then bring her home to Coral runway.',
    rings: [
      [350, 150, 300], [700, 190, 0], [640, 230, -460], [180, 260, -660],
      [-360, 230, -600], [-720, 190, -260], [-620, 160, 140], [-260, 130, 300],
    ],
    landings: ['main'],
    timeLimitSeconds: 0,
    wind: 0,
    fuel: 100,
  },
  {
    id: 'island-hop',
    name: 'Island Hop',
    blurb: 'Fly the mail to Paloma strip, touch down, then race home to Coral. Two landings, one tank.',
    rings: [
      [300, 160, 120], [-80, 210, -280], [-420, 180, -520], [-700, 150, -620],
      [-300, 180, -300], [120, 170, 60], [420, 150, 300],
    ],
    // Land on the north strip after ring 4 (index 3), then fly the rest home.
    landings: ['north', 'main'],
    landAfterRing: 3,
    timeLimitSeconds: 0,
    wind: 0,
    fuel: 100,
  },
  {
    id: 'storm-courier',
    name: 'Storm Courier',
    blurb: 'Ten rings, a 5-minute clock and a crosswind that shoves you sideways. No second chances.',
    rings: [
      [350, 170, 300], [720, 220, -80], [600, 260, -520], [120, 300, -700],
      [-420, 270, -620], [-780, 230, -300], [-640, 200, 80], [-300, 170, 320],
      [120, 210, 480], [520, 190, 420],
    ],
    landings: ['main'],
    timeLimitSeconds: 300,
    wind: 9, // m/s crosswind gusts
    fuel: 100,
  },
];

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
