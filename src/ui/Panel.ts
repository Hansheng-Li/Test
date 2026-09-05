/** Base class for modal UI panels. Only one panel is open at a time (managed by Game). */
export abstract class Panel {
  el: HTMLDivElement;
  isOpen = false;
  /** Set by the game: the header's CLOSE button and ESC both go through here. */
  onCloseRequest: (() => void) | null = null;

  constructor(public id: string, title: string, parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'panel';
    this.el.id = id;
    this.el.innerHTML = `<h2>${title}<button type="button" class="close-hint" title="Close (Esc)">✕ CLOSE · ESC</button></h2><div class="body"></div>`;
    parent.appendChild(this.el);
    (this.el.querySelector('.close-hint') as HTMLButtonElement).addEventListener('click', (e) => {
      e.stopPropagation();
      this.onCloseRequest?.();
    });
  }

  get body(): HTMLDivElement {
    return this.el.querySelector('.body') as HTMLDivElement;
  }

  open(): void {
    this.isOpen = true;
    this.el.classList.add('open');
    this.render();
  }

  close(): void {
    this.isOpen = false;
    this.el.classList.remove('open');
  }

  /** Re-render; called on open and when the game asks for a refresh. */
  abstract render(): void;

  /** Per-frame hook for panels with timers. */
  update(_dt: number): void {}

  /** Key handling while open; return true if consumed. */
  onKey(_code: string): boolean {
    return false;
  }

  protected button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = cls;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }
}
