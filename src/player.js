// Maps keyboard/mouse to the player's fighter, with small input buffers so actions
// pressed slightly early still come out.

export const CONTROLS = [
  ['Q / E', 'High stance / Low stance'],
  ['W S', 'Close or open the distance'],
  ['A D', 'Circle around him'],
  ['Left click or J', 'Strike from your stance'],
  ['Right click or K (hold)', 'Guard your stance. Raise it as the blow lands to parry'],
  ['Guard during your own windup', 'Feint: pull the strike back to bait his guard'],
  ['Space', 'Evade back or sideways. With W held: a quick step in'],
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
    this.wanted = null;
  }

  update(dt) {
    const i = this.input, f = this.f;
    if (!f.alive) { f.moveInput.set(0, 0); return; }

    const x = (i.isDown('KeyD') ? 1 : 0) - (i.isDown('KeyA') ? 1 : 0);
    const y = (i.isDown('KeyW') ? 1 : 0) - (i.isDown('KeyS') ? 1 : 0);
    // strafe right is -x in fighter space (see models.js); moveInput.x is "right"
    f.moveInput.set(x, y);

    // stance: remember what was asked for, and switch as soon as the fighter is free to
    let s = this.wanted ?? f.displayStance;
    if (i.wasPressed('KeyQ', 'ArrowUp')) s = 0;
    if (i.wasPressed('KeyE', 'ArrowDown')) s = 2;
    this.wanted = s;
    if (s !== f.displayStance) f.setStance(s);

    // guard; raised during your own windup it becomes a feint
    if (f.state === 'windup' && i.wasPressed('Mouse2', 'KeyK')) f.cancelAttack();
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
