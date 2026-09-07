import * as THREE from 'three';

/** One camera move: position and look target are eased from → to over dur seconds, with an optional caption. */
export interface Shot {
  from: [number, number, number];
  to: [number, number, number];
  lookFrom: [number, number, number];
  lookTo?: [number, number, number];
  dur: number;
  text?: string;
  sub?: string;
  /** 0..1 black overlay for this shot (1 = fade to black). */
  fade?: number;
}

const ease = (t: number): number => t * t * (3 - 2 * t);

/**
 * Minimal skippable cutscene player: letterbox bars, a caption and a black fade, driving the game
 * camera through a list of shots. Any key or click skips the whole sequence.
 */
export class Cutscene {
  el: HTMLDivElement;
  private caption: HTMLElement;
  private sub: HTMLElement;
  private black: HTMLElement;
  private shots: Shot[] = [];
  private index = 0;
  private t = 0;
  private done: (() => void) | null = null;
  active = false;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'cutscene';
    this.el.innerHTML = `<div class="black"></div><div class="bar top"></div><div class="bar bottom"></div><div class="cap"><div class="text"></div><div class="sub"></div></div><div class="skip">PRESS ANY KEY TO SKIP</div>`;
    parent.appendChild(this.el);
    this.caption = this.el.querySelector('.cap .text')!;
    this.sub = this.el.querySelector('.cap .sub')!;
    this.black = this.el.querySelector('.black')!;
  }

  play(shots: Shot[], onDone: () => void): void {
    this.shots = shots;
    this.index = 0;
    this.t = 0;
    this.done = onDone;
    this.active = true;
    this.el.classList.add('on');
    this.showCaption(shots[0]);
  }

  skip(): void {
    if (!this.active) return;
    this.finish();
  }

  /** Stop without running the completion callback (quitting to the title, loading another game). */
  cancel(): void {
    if (!this.active) return;
    this.done = null;
    this.finish();
  }

  private finish(): void {
    this.active = false;
    this.el.classList.remove('on');
    this.black.style.opacity = '0';
    const d = this.done;
    this.done = null;
    d?.();
  }

  private showCaption(shot: Shot): void {
    this.caption.textContent = shot.text ?? '';
    this.sub.textContent = shot.sub ?? '';
    const cap = this.el.querySelector('.cap') as HTMLElement;
    cap.classList.remove('show');
    void cap.offsetWidth;
    if (shot.text) cap.classList.add('show');
    this.black.style.opacity = String(shot.fade ?? 0);
  }

  /** Call once per frame (uncapped dt) before rendering; writes the camera transform. */
  update(dt: number, camera: THREE.Camera): void {
    if (!this.active) return;
    const shot = this.shots[this.index];
    this.t += dt;
    const k = ease(Math.min(1, this.t / shot.dur));
    this.pos.set(shot.from[0] + (shot.to[0] - shot.from[0]) * k, shot.from[1] + (shot.to[1] - shot.from[1]) * k, shot.from[2] + (shot.to[2] - shot.from[2]) * k);
    const lt = shot.lookTo ?? shot.lookFrom;
    this.look.set(shot.lookFrom[0] + (lt[0] - shot.lookFrom[0]) * k, shot.lookFrom[1] + (lt[1] - shot.lookFrom[1]) * k, shot.lookFrom[2] + (lt[2] - shot.lookFrom[2]) * k);
    camera.position.copy(this.pos);
    camera.lookAt(this.look);
    if (this.t >= shot.dur) {
      this.index++;
      this.t = 0;
      if (this.index >= this.shots.length) this.finish();
      else this.showCaption(this.shots[this.index]);
    }
  }
}
