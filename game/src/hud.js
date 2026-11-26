// Coral Courier — the HUD and instruments.
// One clear job: everything the pilot reads — altitude/speed/heading, fuel, rings, score,
// the artificial horizon, the compass strip, messages and the title/win/crash screens.
// All instruments are drawn live from the flight state, so they are always lit.
import { MISSIONS } from './config.js';

function $(id) {
  return document.getElementById(id);
}

export class Hud {
  constructor() {
    this.horizon = $('horizon');
    this.horizonCtx = this.horizon.getContext('2d');
    this.compass = $('compass');
    this.compassCtx = this.compass.getContext('2d');
    this.messageTimer = 0;
    this.buildMissionList();
  }

  buildMissionList() {
    const list = $('mission-list');
    list.innerHTML = '';
    MISSIONS.forEach((m, i) => {
      const card = document.createElement('div');
      card.className = 'mission-card';
      card.dataset.index = String(i);
      card.innerHTML = `<b>${i + 1}. ${m.name}</b><span>${m.blurb}</span>`;
      card.addEventListener('click', () => {
        if (this.onMissionPick) this.onMissionPick(i);
      });
      list.appendChild(card);
    });
  }

  selectMission(i) {
    document.querySelectorAll('.mission-card').forEach((el) => {
      el.classList.toggle('selected', Number(el.dataset.index) === i);
    });
  }

  showScreen(name) {
    for (const id of ['screen-title', 'screen-win', 'screen-crash', 'screen-pause']) {
      $(id).classList.toggle('hidden', id !== `screen-${name}`);
    }
    $('hud').classList.toggle('hidden', name === 'title');
  }

  showMessage(text, seconds = 2.4) {
    const el = $('message');
    el.textContent = text;
    el.classList.remove('hidden');
    this.messageTimer = seconds;
  }

  hideMessage() {
    $('message').classList.add('hidden');
  }

  /** Per-frame update. `s` is the game state snapshot main.js assembles. */
  update(s, dt) {
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.hideMessage();
    }
    $('alt').textContent = `${Math.max(0, Math.round(s.altitudeFt))}`;
    $('spd').textContent = `${Math.round(s.speedKts)}`;
    $('hdg').textContent = `${String(Math.round(s.headingDeg)).padStart(3, '0')}°`;
    $('score').textContent = String(s.score);
    $('rings').textContent = `${s.ringsPassed}/${s.ringsTotal}`;
    $('fuel-bar').style.width = `${Math.max(0, s.fuel)}%`;
    $('fuel-num').textContent = `${Math.round(s.fuel)}%`;
    $('fuel-bar').classList.toggle('low', s.fuel < 25);
    $('thr-bar').style.width = `${Math.round(s.throttle * 100)}%`;
    $('thr-num').textContent = `${Math.round(s.throttle * 100)}%`;
    $('gear').textContent = s.gearDown ? 'GEAR DOWN' : 'GEAR UP';
    $('gear').classList.toggle('on', s.gearDown);
    $('timer').textContent = s.timeLeft === null ? '--:--' : fmtTime(s.timeLeft);
    $('timer').classList.toggle('low', s.timeLeft !== null && s.timeLeft < 60);
    $('mission-name').textContent = s.missionName;
    $('next-ring').textContent = s.nextRingText;
    $('wind').textContent = s.windText;
    $('ap').classList.toggle('on', s.autopilot);
    $('ap').textContent = s.autopilot ? 'AUTOPILOT ON (A)' : 'AUTOPILOT OFF (A)';
    this.drawHorizon(s.pitchDeg, s.rollDeg);
    this.drawCompass(s.headingDeg);
  }

  drawHorizon(pitchDeg, rollDeg) {
    const ctx = this.horizonCtx;
    const w = this.horizon.width;
    const h = this.horizon.height;
    const cx = w / 2;
    const cy = h / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 62, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-rollDeg * Math.PI / 180);
    const pitchPx = pitchDeg * 2.2;
    ctx.fillStyle = '#3f8fd2';
    ctx.fillRect(-80, -80, 160, pitchPx + 80);
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(-80, pitchPx, 160, 80 - pitchPx);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-80, pitchPx);
    ctx.lineTo(80, pitchPx);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    for (const d of [-20, -10, 10, 20]) {
      const y = pitchPx + d * 2.2;
      const len = d % 20 === 0 ? 26 : 14;
      ctx.beginPath();
      ctx.moveTo(-len, y);
      ctx.lineTo(len, y);
      ctx.stroke();
    }
    ctx.restore();
    // Fixed aircraft symbol + bezel.
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 26, cy);
    ctx.lineTo(cx - 8, cy);
    ctx.moveTo(cx + 8, cy);
    ctx.lineTo(cx + 26, cy);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy + 7);
    ctx.stroke();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0b2233';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, 62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#cfe8ff';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ATTITUDE', cx, h - 6);
  }

  drawCompass(headingDeg) {
    const ctx = this.compassCtx;
    const w = this.compass.width;
    const h = this.compass.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(8, 26, 40, 0.78)';
    ctx.fillRect(0, 0, w, h);
    const pxPerDeg = 3;
    const centre = w / 2;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let d = -60; d <= 60; d += 5) {
      let deg = Math.round(headingDeg + d);
      deg = ((deg % 360) + 360) % 360;
      const x = centre + d * pxPerDeg;
      const major = deg % 30 === 0;
      ctx.strokeStyle = major ? '#ffd23f' : 'rgba(207,232,255,0.6)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, major ? 8 : 16);
      ctx.lineTo(x, 28);
      ctx.stroke();
      if (major) {
        const label = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[deg] || String(deg).padStart(3, '0');
        ctx.fillStyle = '#ffd23f';
        ctx.fillText(label, x, 44);
      }
    }
    // Centre lubber line.
    ctx.strokeStyle = '#ff5a3c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(centre, 2);
    ctx.lineTo(centre, 30);
    ctx.stroke();
    ctx.fillStyle = '#cfe8ff';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(`HDG ${String(Math.round(headingDeg)).padStart(3, '0')}°`, centre, h - 6);
  }
}

export function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
