/** Title screen + pause overlay. */
export class Menu {
  el: HTMLDivElement;
  mode: 'title' | 'pause' = 'title';

  constructor(
    parent: HTMLElement,
    private actions: { newGame: () => void; continueGame: () => void; resetSave: () => void; resume: () => void; save: () => void; hasSave: () => boolean },
  ) {
    this.el = document.createElement('div');
    this.el.id = 'menu';
    parent.appendChild(this.el);
    this.render();
  }

  show(mode: 'title' | 'pause'): void {
    this.mode = mode;
    this.render();
    this.el.style.display = 'flex';
  }

  hide(): void {
    this.el.style.display = 'none';
  }

  get visible(): boolean {
    return this.el.style.display !== 'none';
  }

  private render(): void {
    const hasSave = this.actions.hasSave();
    this.el.innerHTML = `
      <div class="stripe top"></div>
      <h1>SUNSET SYNDICATE</h1>
      <div class="sub">SOL PALMA, FLORIDA · 1996</div>
      <div class="buttons"></div>
      <div class="controls">WASD move · MOUSE look · SHIFT sprint · SPACE jump<br/>E interact · TAB inventory · P pager · M map · N walkman · 1-8 select item · ESC pause<br/><br/><span style="color:#ff9a3c">All products in this game are fictional. Click to capture the mouse.</span></div>
      <div class="stripe bottom"></div>`;
    const btns = this.el.querySelector('.buttons') as HTMLElement;
    btns.style.display = 'flex';
    btns.style.flexDirection = 'column';
    btns.style.gap = '10px';
    btns.style.minWidth = '260px';
    const add = (label: string, fn: () => void, cls = 'big'): void => {
      const b = document.createElement('button');
      b.className = cls;
      b.textContent = label;
      b.addEventListener('click', fn);
      btns.appendChild(b);
    };
    if (this.mode === 'title') {
      if (hasSave) add('CONTINUE', this.actions.continueGame, 'big primary');
      add('NEW GAME', this.actions.newGame, hasSave ? 'big' : 'big primary');
      if (hasSave) add('RESET SAVE', () => { if (confirm('Delete your save?')) { this.actions.resetSave(); this.render(); } }, 'big');
    } else {
      add('RESUME', this.actions.resume, 'big primary');
      add('SAVE GAME', () => { this.actions.save(); }, 'big');
      add('QUIT TO TITLE', () => { this.actions.save(); this.show('title'); }, 'big');
    }
  }
}
