import { STATIONS } from '../audio/Radio';
import { t, getLang } from '../i18n';
import { esc } from './UIContext';

type SettingKey = 'sensitivity' | 'masterVolume' | 'radioVolume' | 'cutscenes' | 'radioStation' | 'lang';

const HOWTO_EN = `
        <b style="color:#4ff2e8">THE LOOP</b> · Pager beeps → accept → buy supplies from Rico (docks) → PREP TABLE → PACKAGING → walk to the meeting spot → E to sell.<br/>
        <b style="color:#4ff2e8">CUSTOMERS</b> · They walk around their home zone and carry limited cash (more as you get closer). Miss the window and they wait 30 min at 30% off, then leave. Offer locked ones a free sample; sell to unlocked ones on the street. Better relationship = bigger orders, friends unlock.<br/>
        <b style="color:#4ff2e8">PRODUCTS</b> · Base + up to 3 modifiers (order matters). Name your products. Customers ask for the daily hot effect (+25%). Haggling (one try per order) unlocks after your second sale. News breaks twice a day.<br/>
        <b style="color:#4ff2e8">HEAT</b> · Cops who see a deal raise it. Break line of sight, go home, or rest. Clean hands survive a stop-and-search; contraband does not. Dumpsters in the alleys are hiding spots (E) — but only once the cop has lost sight of you. Fog mornings (one in three, until about 08:30) cut everyone's sight range almost in half. Rojas resprays the sedan for $150: heat -30 and a chase called off. Driving hot past a cruiser starts a pursuit: outrun it, break line of sight for 8 s or leave the road grid; sit still in reach and you are pulled over and searched, trunk included.<br/>
        <b style="color:#4ff2e8">SCALE UP</b> · Pawn shop equipment → Dizzy the runner (motel) → Warehouse 7 (docks) → Marisol the worker (port) → Vince the dealer (arcade) → Teddy the handler (warehouse office, keeps Vince stocked) → the '88 sedan (Rojas).<br/>
        <b style="color:#4ff2e8">MARKERS</b> · Short on cash? Sol Palma Pawn writes markers ($300 and up): pay back +25% within 3 days or the balance grows 20% a day, the collectors take your cash (Vince's too) and your name gets around (suspicion).<br/>
        <b style="color:#4ff2e8">GETTING AROUND</b> · Orange bus stops (one per district, B on the map) ride you across town for $5 and 12 minutes — not while a cop is on you. The '88 sedan later.<br/>
        <b style="color:#4ff2e8">KEYS</b> · E interact · F trunk (beside the sedan; busted next to it and they pop it) · TAB backpack · P pager · M map · N radio · B place equipment · F3 fps.`;

const HOWTO_ZH = `
        <b style="color:#4ff2e8">基本循环</b> · 呼机响 → 接单 → 去码头找 Rico 买原料 → 调制台 → 包装台 → 走到约定地点 → 按 E 交货。<br/>
        <b style="color:#4ff2e8">顾客</b> · 顾客在自己的街区里走动，身上现金有限（关系越好带得越多）。错过时间窗他们会打七折等 30 分钟，然后离开。给还没解锁的人递一份免费样品；已解锁的人可以在街头直接卖。关系越好订单越大，朋友会介绍朋友。<br/>
        <b style="color:#4ff2e8">产品</b> · 一种基底 + 最多 3 种添加剂（先后顺序有影响）。给产品起名。顾客会点当天最抢手的效果（+25%）。第二单之后可以讨价还价（每单一次）。新闻一天播两次。<br/>
        <b style="color:#4ff2e8">热度</b> · 看见交易的警察会推高热度。躲开视线、回家或睡觉能降。身上干净就能扛过盘查，带货就会被捕。小巷里的垃圾箱可以躲（E）——但要先让警察跟丢你。雾天早晨（约三分之一，到 08:30 左右）所有人的视距几乎减半。Rojas 修车厂 $150 给轿车喷漆：热度 −30、追捕解除。热度高时开车经过警车会被追：甩开它、断视线 8 秒或者离开马路网；停在它跟前会被逼停搜车，后备箱也搜。<br/>
        <b style="color:#4ff2e8">做大</b> · 当铺买设备 → 汽车旅馆雇跑腿 Dizzy → 码头买 7 号仓库 → 港务局雇工人 Marisol → 街机厅雇经销商 Vince → 仓库办公室雇搬运工 Teddy（帮 Vince 补货）→ Rojas 买 88 年轿车。<br/>
        <b style="color:#4ff2e8">借条</b> · 缺钱？索尔帕尔马当铺可以打借条（$300 起）：3 天内还本息 +25%，否则每天涨 20%，收数人会拿走你（和 Vince）的现金，你的名字也会传到警察耳朵里（嫌疑上升）。<br/>
        <b style="color:#4ff2e8">出行</b> · 橙色公交站（每个街区一个，地图上的 B）$5、12 分钟跨城——警察在追你时司机不载。后面还有 88 年轿车。<br/>
        <b style="color:#4ff2e8">按键</b> · E 互动 · F 后备箱（站在轿车旁；车旁被捕会被搜车）· TAB 背包 · P 呼机 · M 地图 · N 电台 · B 摆放设备 · F3 帧率。`;

const CREDITS = `
        <b>SUNSET SYNDICATE</b> — an original game. All products, businesses, people and the city of Sol Palma are fictional.<br/><br/>
        <b>THIRD-PARTY ASSETS (all CC0 1.0 / public domain, used with thanks)</b><br/>
        Sound effects, UI sounds, music jingles, car and furniture models, faces and item icons: <b>Kenney</b> (kenney.nl) — Impact Sounds, RPG Audio, Interface Sounds, Casino Audio, Music Jingles, Car Kit, Furniture Kit, Blocky Characters, Generic Items.<br/>
        Radio music: <b>HoliznaCC0</b> — Back In The 80s, Night Driving, Retro Synths, City Lights, Night Life, Make Funk · <b>Komiku</b> — Sunset On The Beach, Beach · <b>Loyalty Freak Music</b> — Chillin' At The Club.<br/>
        SIGNAL ZERO and every other sound not listed above is synthesised in-game.<br/><br/>
        Full per-file table: public/assets/LICENSES.md in the repository.`;

export interface MenuSlot {
  slot: number;
  /** One-line run summary, null when the slot is empty. */
  summary: string | null;
  savedAt: number | null;
  /** The slot the running game writes to (pause) or the one CONTINUE would load (title). */
  current: boolean;
}

/** Title screen + pause overlay. */
export class Menu {
  el: HTMLDivElement;
  mode: 'title' | 'pause' = 'title';
  /** What the slot list does when a slot is clicked. */
  private slotMode: 'load' | 'new' | 'save' = 'load';

  constructor(
    parent: HTMLElement,
    private actions: { newGame: (slot?: number) => void; continueGame: (slot?: number) => void; deleteSlot: (slot: number) => void; resume: () => void; save: (slot?: number) => void; quit: () => void; hasSave: () => boolean; slots: () => MenuSlot[]; saveSummary: () => string | null; runStats: () => string | null; getSettings: () => Record<SettingKey, number>; setSetting: (key: SettingKey, value: number) => void },
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

  /** Re-render in place (after a language switch), keeping whichever fold-out was open. */
  refresh(): void {
    const open = ['.howto', '.settings', '.credits', '.slots'].find((sel) => (this.el.querySelector(sel) as HTMLElement | null)?.style.display === 'block') ?? null;
    this.render();
    if (open === '.slots') this.renderSlots();
    if (open) this.toggle(open);
  }

  private render(): void {
    const hasSave = this.actions.hasSave();
    this.el.innerHTML = `
      <div class="stripe top"></div>
      <h1>SUNSET SYNDICATE</h1>
      <div class="sub">${t('SOL PALMA, FLORIDA · 1996')}</div>
      <div class="runstats" style="display:none;font-family:var(--mono);font-size:13px;color:var(--cyan);letter-spacing:1px;margin-top:-18px;margin-bottom:6px"></div>
      <div class="buttons"></div>
      <div class="slots" style="display:none"></div>
      <div class="settings" style="display:none;min-width:360px;font-size:13px;color:#ddd;background:rgba(0,0,0,0.4);padding:12px 16px;border-radius:6px;border:1px solid #444"></div>
      <div class="howto" style="display:none;max-width:680px;font-size:14px;line-height:1.6;color:#ddd;background:rgba(0,0,0,0.4);padding:12px 16px;border-radius:6px;border:1px solid #444">${getLang() === 'zh' ? HOWTO_ZH : HOWTO_EN}</div>
      <div class="credits">${CREDITS}</div>
      <div class="controls">${t('WASD move · MOUSE look · SHIFT sprint · SPACE jump')}<br/>${t('E interact · TAB inventory · P pager · Y/X accept/decline page · M map · N radio · 1-8 select item · ESC pause')}<br/><br/><span style="color:#ff9a3c">${t('All products in this game are fictional. Click to capture the mouse.')}</span></div>
      <div class="stripe bottom"></div>`;
    const btns = this.el.querySelector('.buttons') as HTMLElement;
    btns.style.display = 'flex';
    btns.style.flexDirection = 'column';
    btns.style.gap = '10px';
    btns.style.minWidth = '260px';
    const add = (label: string, fn: () => void, cls = 'big'): void => {
      const b = document.createElement('button');
      b.className = cls;
      b.textContent = t(label);
      b.addEventListener('click', fn);
      btns.appendChild(b);
    };
    const settingsEl = this.el.querySelector('.settings') as HTMLElement;
    const st = this.actions.getSettings();
    const rowOf = (): HTMLDivElement => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.gap = '12px';
      row.style.margin = '6px 0';
      return row;
    };
    const slider = (label: string, key: 'sensitivity' | 'masterVolume' | 'radioVolume', min: number, max: number, step: number): void => {
      const row = rowOf();
      const lbl = document.createElement('span');
      lbl.textContent = t(label);
      const val = document.createElement('span');
      val.style.minWidth = '40px';
      val.style.textAlign = 'right';
      val.textContent = st[key].toFixed(2);
      const inp = document.createElement('input');
      inp.type = 'range';
      inp.min = String(min);
      inp.max = String(max);
      inp.step = String(step);
      inp.value = String(st[key]);
      inp.style.flex = '1';
      inp.addEventListener('input', () => { const v = parseFloat(inp.value); val.textContent = v.toFixed(2); this.actions.setSetting(key, v); });
      row.append(lbl, inp, val);
      settingsEl.appendChild(row);
    };
    const select = (label: string, key: 'radioStation' | 'lang', options: { value: number; label: string }[], current: number): void => {
      const row = rowOf();
      const sel = document.createElement('select');
      sel.dataset.key = key;
      sel.style.background = '#1a1026';
      sel.style.color = '#eee';
      sel.style.border = '1px solid #555';
      sel.style.padding = '2px 6px';
      for (const o of options) {
        const opt = document.createElement('option');
        opt.value = String(o.value);
        opt.textContent = o.label;
        opt.selected = o.value === current;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', () => this.actions.setSetting(key, parseInt(sel.value, 10)));
      row.append(t(label), sel);
      settingsEl.appendChild(row);
    };
    select('Language', 'lang', [{ value: 1, label: '简体中文' }, { value: 0, label: 'English' }], st.lang);
    slider('Mouse sensitivity', 'sensitivity', 0.2, 3, 0.05);
    slider('Master volume', 'masterVolume', 0, 1, 0.05);
    slider('Radio volume', 'radioVolume', 0, 1, 0.05);
    select('Radio station', 'radioStation', STATIONS.map((s, i) => ({ value: i, label: `${s.name} ${s.freq}` })), st.radioStation);
    const row = document.createElement('label');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';
    row.style.margin = '6px 0';
    row.style.cursor = 'pointer';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = st.cutscenes >= 0.5;
    cb.addEventListener('change', () => this.actions.setSetting('cutscenes', cb.checked ? 1 : 0));
    row.append(t('Cutscenes (intro, purchases, arrests)'), cb);
    settingsEl.appendChild(row);
    const stats = this.mode === 'title' ? this.actions.saveSummary() : this.actions.runStats();
    const statsEl = this.el.querySelector('.runstats') as HTMLElement;
    if (stats) {
      statsEl.textContent = stats;
      statsEl.style.display = 'block';
    }
    if (this.mode === 'title') {
      if (hasSave) add('CONTINUE', () => this.actions.continueGame(), 'big primary');
      add('NEW GAME', () => {
        // a free slot starts right away; when all three are taken the player picks which one to overwrite
        const free = this.actions.slots().find((sl) => sl.summary === null);
        if (free) this.actions.newGame(free.slot);
        else this.openSlots('new');
      }, hasSave ? 'big' : 'big primary');
      if (hasSave) add('LOAD GAME', () => this.openSlots('load'), 'big');
      add('HOW TO PLAY', () => this.toggle('.howto'), 'big');
      add('SETTINGS', () => this.toggle('.settings'), 'big');
      add('CREDITS', () => this.toggle('.credits'), 'big');
    } else {
      add('RESUME', this.actions.resume, 'big primary');
      add('HOW TO PLAY', () => this.toggle('.howto'), 'big');
      add('SETTINGS', () => this.toggle('.settings'), 'big');
      add('CREDITS', () => this.toggle('.credits'), 'big');
      add('SAVE GAME', () => { this.actions.save(); }, 'big');
      add('SAVE TO SLOT…', () => this.openSlots('save'), 'big');
      add('QUIT TO TITLE', () => { this.actions.save(); this.actions.quit(); this.show('title'); }, 'big');
    }
  }

  /** Open the slot list in the given mode (or close it when it is already open in that mode). */
  private openSlots(mode: 'load' | 'new' | 'save'): void {
    const el = this.el.querySelector('.slots') as HTMLElement;
    if (el.style.display === 'block' && this.slotMode === mode) {
      el.style.display = 'none';
      return;
    }
    this.slotMode = mode;
    this.renderSlots();
    for (const other of ['.howto', '.settings', '.credits']) (this.el.querySelector(other) as HTMLElement).style.display = 'none';
    el.style.display = 'block';
  }

  private renderSlots(): void {
    const el = this.el.querySelector('.slots') as HTMLElement;
    el.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'slots-head';
    head.textContent = this.slotMode === 'load' ? t('LOAD GAME') : this.slotMode === 'save' ? t('SAVE TO SLOT…') : t('ALL SLOTS ARE TAKEN · PICK ONE TO OVERWRITE');
    el.appendChild(head);
    const fmt = (ms: number): string => new Date(ms).toLocaleString(getLang() === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    for (const sl of this.actions.slots()) {
      const row = document.createElement('div');
      row.className = 'slot-row' + (sl.current ? ' current' : '');
      row.dataset.slot = String(sl.slot);
      const text = document.createElement('div');
      text.className = 'slot-text';
      text.innerHTML = `<b>${t('SLOT {n}', { n: sl.slot })}${sl.current ? ` <span class="tag">${t('CURRENT')}</span>` : ''}</b>` +
        `<span class="meta">${sl.summary ? `${esc(sl.summary)}${sl.savedAt ? ' · ' + t('saved {time}', { time: fmt(sl.savedAt) }) : ''}` : t('EMPTY')}</span>`;
      row.appendChild(text);
      const btn = (label: string, fn: () => void, cls = ''): void => {
        const b = document.createElement('button');
        b.className = cls;
        b.textContent = t(label);
        b.addEventListener('click', fn);
        row.appendChild(b);
      };
      if (this.slotMode === 'load') {
        if (sl.summary) {
          btn('LOAD', () => this.actions.continueGame(sl.slot), 'primary');
          btn('DELETE', () => { if (confirm(t('Delete slot {n}?', { n: sl.slot }))) { this.actions.deleteSlot(sl.slot); this.refresh(); } });
        }
      } else if (this.slotMode === 'new') {
        btn('START HERE', () => { if (!sl.summary || confirm(t('Overwrite slot {n}?', { n: sl.slot }))) this.actions.newGame(sl.slot); }, sl.summary ? '' : 'primary');
      } else {
        btn('SAVE HERE', () => {
          if (sl.summary && !sl.current && !confirm(t('Overwrite slot {n}?', { n: sl.slot }))) return;
          this.actions.save(sl.slot);
          this.renderSlots();
        }, sl.current ? 'primary' : '');
      }
      el.appendChild(row);
    }
  }

  /** Show one of the fold-out panels, hiding the others. */
  private toggle(sel: string): void {
    for (const other of ['.howto', '.settings', '.credits', '.slots']) {
      const el = this.el.querySelector(other) as HTMLElement;
      if (other === sel) el.style.display = el.style.display === 'none' || !el.style.display ? 'block' : 'none';
      else el.style.display = 'none';
    }
  }
}
