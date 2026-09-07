/** Keyboard + mouse state with pointer lock. Uses KeyboardEvent.code so layouts do not matter. */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  locked = false;
  /** When true, gameplay ignores key presses (a UI panel has focus). */
  uiCaptured = false;
  private element: HTMLElement;

  constructor(element: HTMLElement) {
    this.element = element;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    // mouse buttons only count while the pointer is captured (otherwise they are UI clicks)
    window.addEventListener('mousedown', (e) => {
      if (this.locked) this.pressed.add('Mouse' + e.button);
    });
    window.addEventListener('blur', () => this.down.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
    });
  }

  requestLock(): void {
    if (!this.locked) {
      const p = this.element.requestPointerLock() as unknown;
      if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return !this.uiCaptured && this.down.has(code);
  }

  /** True once for the frame in which the key went down. */
  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  consumeMouse(): { dx: number; dy: number } {
    const r = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return r;
  }

  /** Call at the end of each frame. */
  endFrame(): void {
    this.pressed.clear();
  }
}
