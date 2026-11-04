// Maps keyboard/mouse to the player's fighter, with small input buffers so actions
// pressed slightly early still come out.

export const CONTROLS = [
  ['W A S D', 'Step and circle (always facing your opponent)'],
  ['1 / 2 / 3, Q / E, or mouse wheel', 'High / Mid / Low stance'],
  ['Left click or J', 'Strike from your stance'],
  ['Right click or K (hold)', 'Guard your stance. Raise it as the blow lands to parry'],
  ['Space', 'Dodge (toward the direction you are moving, back by default)'],
  ['F or Shift (hold, release)', 'Draw-cut: sheathe, charge, release to strike'],
  ['Esc', 'Pause'],
];

export class PlayerController {
  constructor(fighter, input) {
    this.f = fighter;
    this.input = input;
    this.attackBuffer = 0;
    this.dodgeBuffer = 0;
    this.iaiLatched = false;
  }

  update(dt) {
    const i = this.input, f = this.f;
    if (!f.alive) { f.moveInput.set(0, 0); return; }

    const x = (i.isDown('KeyD') ? 1 : 0) - (i.isDown('KeyA') ? 1 : 0);
    const y = (i.isDown('KeyW') ? 1 : 0) - (i.isDown('KeyS') ? 1 : 0);
    // strafe right is -x in fighter space (see models.js); moveInput.x is "right"
    f.moveInput.set(x, y);

    // stance
    let s = f.displayStance;
    if (i.wasPressed('Digit1')) s = 0;
    if (i.wasPressed('Digit2')) s = 1;
    if (i.wasPressed('Digit3')) s = 2;
    if (i.wasPressed('KeyQ', 'ArrowUp') || i.wheel < 0) s = Math.max(0, s - 1);
    if (i.wasPressed('KeyE', 'ArrowDown') || i.wheel > 0) s = Math.min(2, s + 1);
    if (s !== f.displayStance) f.setStance(s);

    // guard
    f.setBlock(i.isDown('Mouse2', 'KeyK'));

    // strike
    if (i.wasPressed('Mouse0', 'KeyJ')) this.attackBuffer = 0.2;
    if (this.attackBuffer > 0) {
      this.attackBuffer -= dt;
      if (!f.busy && f.state !== 'block' && f.startAttack()) this.attackBuffer = 0;
      else if (f.state === 'block' && !f.busy) {
        // striking out of guard: drop it and swing
        f.setState('idle');
        if (f.startAttack()) this.attackBuffer = 0;
      }
    }

    // dodge
    if (i.wasPressed('Space')) this.dodgeBuffer = 0.15;
    if (this.dodgeBuffer > 0) {
      this.dodgeBuffer -= dt;
      if (!f.busy) {
        if (f.state === 'block') f.setState('idle');
        if (f.dodge(f.moveInput)) this.dodgeBuffer = 0;
      }
    }

    // draw-cut
    const iaiKey = i.isDown('KeyF', 'ShiftLeft', 'ShiftRight');
    if (iaiKey && !this.iaiLatched && !f.busy) {
      if (f.state === 'block') f.setState('idle');
      if (f.startIai()) this.iaiLatched = true;
    }
    if (!iaiKey && this.iaiLatched) {
      this.iaiLatched = false;
      f.releaseIai();
    }
    if (this.iaiLatched && !f.state.startsWith('iai')) this.iaiLatched = iaiKey; // interrupted
  }
}
