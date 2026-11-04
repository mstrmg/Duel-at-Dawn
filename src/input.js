// Keyboard + mouse state with per-frame "pressed" edges.
export class Input {
  constructor(el) {
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.wheel = 0;
    const key = (e) => (e.code.startsWith('Key') || e.code.startsWith('Digit') ? e.code : e.key === ' ' ? 'Space' : e.code);
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = key(e);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(k)) e.preventDefault();
      this.down.add(k);
      this.pressed.add(k);
    });
    addEventListener('keyup', (e) => {
      const k = key(e);
      this.down.delete(k);
      this.released.add(k);
    });
    el.addEventListener('mousedown', (e) => {
      const k = 'Mouse' + e.button;
      this.down.add(k);
      this.pressed.add(k);
    });
    addEventListener('mouseup', (e) => {
      const k = 'Mouse' + e.button;
      this.down.delete(k);
      this.released.add(k);
    });
    this.mouseY = 0.5;
    this.mouseX = 0.5;
    this.mouseMoved = false;
    addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX / innerWidth;
      this.mouseY = e.clientY / innerHeight;
      this.mouseMoved = true;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    addEventListener('blur', () => {
      for (const k of this.down) this.released.add(k);
      this.down.clear();
    });
  }
  isDown(...keys) { return keys.some((k) => this.down.has(k)); }
  wasPressed(...keys) { return keys.some((k) => this.pressed.has(k)); }
  wasReleased(...keys) { return keys.some((k) => this.released.has(k)); }
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.wheel = 0;
    this.mouseMoved = false;
  }
}
