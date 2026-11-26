// Coral Courier — keyboard + mouse (+ touch) input.
// One clear job: turn keys, mouse drag and wheel into stick inputs the flight model reads.
// Pitch: ArrowUp/W climbs, ArrowDown/S dives. Roll: ArrowLeft/A banks left, ArrowRight/D
// banks right. Throttle: Shift speeds up, Control slows down, mouse wheel trims it.
// Holding the left mouse button and dragging steers the same way; A toggles autopilot assist.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pitch = 0; // -1 dive .. +1 climb
    this.roll = 0; // -1 left .. +1 right
    this.throttleDelta = 0;
    this.autopilotToggle = false;
    this.anyKey = false;
    this.mouseDown = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
    this.onFirstGesture = null;
    this.onPause = null;
    this.onRestart = null;
    this.onMissionKey = null;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.anyKey = true;
      if (this.onFirstGesture) this.onFirstGesture();
      if (e.code === 'KeyA') this.autopilotToggle = !this.autopilotToggle;
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (this.onPause) this.onPause();
      }
      if (e.code === 'KeyR') {
        if (this.onRestart) this.onRestart();
      }
      if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
        if (this.onMissionKey) this.onMissionKey(Number(e.code.slice(-1)) - 1);
      }
      if (e.code === 'Enter') {
        if (this.onMissionKey) this.onMissionKey(-2); // start with the selected mission
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      if (this.onFirstGesture) this.onFirstGesture();
    });
    window.addEventListener('mouseup', () => { this.mouseDown = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.mouseDown) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.wheelDelta += -Math.sign(e.deltaY);
    }, { passive: false });

    // Touch: one finger drag steers; a second finger's swipe up/down trims throttle.
    let lastTouch = null;
    canvas.addEventListener('touchstart', (e) => {
      if (this.onFirstGesture) this.onFirstGesture();
      lastTouch = e.touches[0];
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (lastTouch) {
        this.mouseDX += (t.clientX - lastTouch.clientX) * 2;
        this.mouseDY += (t.clientY - lastTouch.clientY) * 2;
        this.mouseDown = true;
      }
      lastTouch = t;
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchend', () => { this.mouseDown = false; lastTouch = null; });
  }

  /** Recompute the stick position from the current keys and mouse drag. Call once per frame. */
  update() {
    const k = this.keys;
    let pitch = 0;
    let roll = 0;
    if (k.has('ArrowUp') || k.has('KeyW')) pitch += 1;
    if (k.has('ArrowDown') || k.has('KeyS')) pitch -= 1;
    if (k.has('ArrowLeft') || k.has('KeyQ')) roll -= 1;
    if (k.has('ArrowRight') || k.has('KeyD') || k.has('KeyE')) roll += 1;
    // Mouse drag steers like a yoke: drag right to bank right, drag up to climb.
    if (this.mouseDown) {
      roll += Math.max(-1, Math.min(1, this.mouseDX / 120));
      pitch += Math.max(-1, Math.min(1, -this.mouseDY / 120));
    }
    this.pitch = Math.max(-1, Math.min(1, pitch));
    this.roll = Math.max(-1, Math.min(1, roll));
    let throttleDelta = 0;
    if (k.has('ShiftLeft') || k.has('ShiftRight')) throttleDelta += 1;
    if (k.has('ControlLeft') || k.has('ControlRight')) throttleDelta -= 1;
    if (this.wheelDelta !== 0) {
      throttleDelta += this.wheelDelta * 0.35;
      this.wheelDelta = 0;
    }
    this.throttleDelta = throttleDelta;
    // Drag decays so the stick recentres when the mouse stops moving.
    this.mouseDX *= 0.82;
    this.mouseDY *= 0.82;
  }
}
