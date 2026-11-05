// A seal stamped on the screen whenever the wanderer gains or loses something that changes
// how he fights: a technique, a blessing, a charm, a wound, or a wound mended. Each kind has
// its own color, the same color its label carries on the HUD and the run panel.
export const KINDS = {
  technique: { kanji: '技', label: 'technique learned', color: '#2f5596' },
  blessing: { kanji: '祝', label: 'blessing', color: '#c4416f' },
  charm: { kanji: '守', label: 'charm', color: '#b8801a' },
  wound: { kanji: '傷', label: 'wounded', color: '#b3171d' },
  mended: { kanji: '癒', label: 'wound mended', color: '#3f8a5a' },
};

let box = null;
export function showGain(kind, name, text = '') {
  const K = KINDS[kind];
  if (!K) return;
  if (!box) {
    box = document.createElement('div');
    box.id = 'gains';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `gain ${kind}`;
  el.style.setProperty('--c', K.color);
  el.innerHTML = `<i>${K.kanji}</i><div><small>${K.label}</small><b>${name}</b>${text ? `<span>${text}</span>` : ''}</div>`;
  box.appendChild(el);
  while (box.childElementCount > 4) box.firstElementChild.remove();
  setTimeout(() => el.classList.add('out'), 3600);
  setTimeout(() => el.remove(), 4200);
}
