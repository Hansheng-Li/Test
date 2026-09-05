import { StoryCard } from '../data/story';
import { esc } from './UIContext';
import { faceImg } from './Icons';
import { t } from '../i18n';

const PAGE_SECONDS = 14;

/** Story cards: face on the left, one page of text on the right. Non-blocking; click / Enter advances. */
export class Dialogue {
  el: HTMLDivElement;
  private queue: { card: StoryCard; line: string }[] = [];
  private timer = 0;
  private hidden = false;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'dialogue';
    this.el.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.next(); });
    parent.appendChild(this.el);
    this.render();
  }

  get active(): boolean {
    return this.queue.length > 0;
  }

  /** Show cards (already translated). A new beat replaces whatever the player had not read yet. */
  show(cards: StoryCard[]): void {
    this.queue.length = 0;
    for (const card of cards) for (const line of card.lines) this.queue.push({ card, line });
    if (this.queue.length) this.timer = PAGE_SECONDS;
    this.render();
  }

  next(): void {
    if (!this.queue.length) return;
    this.queue.shift();
    this.timer = PAGE_SECONDS;
    this.render();
  }

  clear(): void {
    this.queue.length = 0;
    this.render();
  }

  /** Hide while a panel is open (the panel is what the player is reading). */
  setHidden(hidden: boolean): void {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    this.render();
  }

  update(dt: number): void {
    if (!this.queue.length || this.hidden) return;
    this.timer -= dt;
    if (this.timer <= 0) this.next();
  }

  private render(): void {
    const cur = this.queue[0];
    if (!cur || this.hidden) {
      this.el.classList.remove('on');
      return;
    }
    const total = this.queue.length;
    this.el.innerHTML = `${faceImg(cur.card.face, cur.card.color, 'avatar big')}<div class="text"><div class="who" style="color:${cur.card.color}">${esc(cur.card.speaker)}</div><div class="line">${esc(cur.line)}</div><div class="hint">${t('[CLICK / ENTER] continue')}${total > 1 ? ` · ${total - 1}` : ''}</div></div>`;
    this.el.classList.add('on');
  }
}
