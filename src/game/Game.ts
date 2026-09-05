import * as THREE from 'three';
import { Input } from '../core/Input';
import { loadSettings, saveSettings, Settings } from '../core/Settings';
import { STATIONS } from '../audio/Radio';
import { loadModel, instanceModel, upgradeParkedCars, CAR_SCALE } from '../world/Models';
import { Cutscene, Shot } from './Cutscene';
import { Weather } from '../world/Weather';
import { dressInteriors } from '../world/Dressing';
import { BusUI } from '../ui/BusUI';
import { DiceUI } from '../ui/DiceUI';
import { rollDice, DicePick, DiceResult } from '../systems/DiceSystem';
import { BUS_STOPS, BUS_FARE, BUS_MINUTES, CRUISER_ROUTE, CURFEW_CRUISER_ROUTE, RESPRAY_PRICE, RESPRAY_HEAT } from '../data/city';
import { hashString } from '../utils/math';
import { GameClock } from '../core/Time';
import { PlayerController } from '../player/PlayerController';
import { buildCity, CityResult } from '../world/City';
import { DayNight } from '../world/DayNight';
import { PropBuilder } from '../world/Props';
import { buildPlacedStation, InteriorContext } from '../world/Interiors';
import { WorldObject } from '../world/WorldTypes';
import { SPAWN, LANDMARKS, SAFEHOUSE_DOOR, BUILDINGS, WAREHOUSE_SIGN, CAR_SALE_SPOT, PROPERTY_ANCHORS, SUPPLIER_SPOT, STARTER_CAR_SPOT, zoneAt } from '../data/city';
import { swingTargets, BAT_STUN_SECONDS, BAT_HEAT_COP, BAT_HEAT_CIVILIAN } from '../systems/MeleeSystem';
import { makeFigure, makeLabel } from '../world/Interiors';
import { CUSTOMER_MAP } from '../data/customers';
import { WAREHOUSE_PRICE, RUNNER_HIRE_PRICE, WORKER_HIRE_PRICE, DEALER_HIRE_PRICE, HANDLER_HIRE_PRICE, VEHICLE_PRICE, MOTEL_PRICE, FRONT_PRICE, FRONT_DAILY_INCOME, FRONT_DAILY_SUSPICION, ITEMS } from '../data/items';
import { computeRecipe, parseRecipeKey, Effect } from '../data/products';
import { GameState, Order, PlacedStation } from './GameState';
import { createNewState, saveToSlot, loadFromSlot, listSlots, clearSlot, hasAnySave, latestSlot, firstEmptySlot, migrateLegacySave } from '../systems/SaveSystem';
import { InteractionSystem, Interactable } from '../systems/InteractionSystem';
import { addItem, countItem, removeItem, resolveItem, depositToStorage, withdrawFromStorage, packagedInInventory, looseProductsInInventory } from '../systems/InventorySystem';
import { buyFromShop, buyDelivered, spendCash, PurchaseResult } from '../systems/EconomySystem';
import { executePrep, executePackage, nameRecipe, recipeDisplayName, PrepPlan, PrepResult, PackageResult } from '../systems/ProductionSystem';
import { generateOrder, acceptOrder, declineOrder, activeOrders, pendingOrders, completeSale, expireOrders, findFulfillingItem, describeRequest, counterOffer, rollTrend, LATE_GRACE_MINUTES } from '../systems/OrderSystem';
import { decayHeat, witnessedDeal, applyArrest, addHeat, heatLevel, searchTrunk } from '../systems/HeatSystem';
import { hireRunner, assignRunner, tickRunner, runnerPickupProperty } from '../systems/RunnerSystem';
import { hireWorker, assignWorkerRecipe, tickWorker } from '../systems/WorkerSystem';
import { hireDealer, giveDealerStock, takeDealerStock, assignDealerCustomer, unassignDealerCustomer, collectDealerCash, tickDealer, dealerStockCount } from '../systems/DealerSystem';
import { DealerUI } from '../ui/DealerUI';
import { LedgerUI } from '../ui/LedgerUI';
import { checkMilestones } from '../systems/MilestoneSystem';
import { takeLoan, repayLoan, tickLoanDay, loanDaysLeft, LOAN_TIERS, LOAN_DAYS } from '../systems/LoanSystem';
import { resprayCar, carPaint } from '../systems/GarageSystem';
import { fogLevel, sightMultiplier } from '../systems/WeatherSystem';
import { onRoadGrid } from '../systems/RoadGrid';
import { t, tn, setLang } from '../i18n';
import { hireHandler, tickHandler } from '../systems/HandlerSystem';
import { rollWorldEvent, describeEvent, heatMultiplier, activeEvent, applyInspection, eventSlot, curfewExtraPolice, crackdownIn } from '../systems/EventSystem';
import { relationshipTier } from '../systems/CustomerSystem';
import { AudioSystem, SfxName } from '../audio/Audio';
import { HUD } from '../ui/HUD';
import { Menu } from '../ui/Menu';
import { Dialogue } from '../ui/Dialogue';
import { STORY_CARDS } from '../data/story';
import { storyStep, ordersAllowed, claimStoryCard, markStorySeen } from '../systems/StorySystem';
import { Panel } from '../ui/Panel';
import { PagerUI, landmarkName, pagerLine } from '../ui/PagerUI';
import { InventoryUI } from '../ui/InventoryUI';
import { ShopUI } from '../ui/ShopUI';
import { PrepUI, PackUI } from '../ui/StationUI';
import { MapUI } from '../ui/MapUI';
import { GameAPI, ToastKind } from '../ui/UIContext';
import { Civilian } from '../entities/NPC';
import { Police } from '../entities/Police';
import { Cruiser } from '../entities/Cruiser';
import { CustomerNPC, REACTION_LINES } from '../entities/CustomerNPC';
import { RunnerNPC } from '../entities/RunnerNPC';
import { WanderingCustomer } from '../entities/WanderingCustomer';
import { Vehicle } from '../player/Vehicle';
import { CUSTOMERS } from '../data/customers';
import { offerSample } from '../systems/CustomerSystem';
import { streetSale, canStreetSell, streetUnitPrice } from '../systems/OrderSystem';
import { lambert, boxGeo, cylGeo } from '../world/Materials';
import { signTexture } from '../world/Textures';

const CIVILIAN_COLORS = ['#e91e63', '#9c27b0', '#3f51b5', '#03a9f4', '#009688', '#8bc34a', '#ffeb3b', '#ff9800', '#795548', '#ffffff', '#f44336', '#00bcd4'];
const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
const PANTS = ['#2c3e50', '#37474f', '#5d4037', '#1a237e', '#455a64', '#c9b79c'];

/** Bigger deals get a bigger SOLD card: $35 -> 1.16x, $150 -> 1.35x, $600 -> 1.53x, capped at 1.7x. */
function flashScale(earned: number): number {
  return Math.min(1.7, 0.7 + Math.log10(Math.max(10, earned)) * 0.3);
}

export class Game implements GameAPI {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  input: Input;
  clock = new GameClock();
  player: PlayerController;
  city: CityResult;
  dayNight: DayNight;
  state: GameState = createNewState();
  audio = new AudioSystem();
  hud: HUD;
  menu: Menu;
  dialogue: Dialogue;
  interaction = new InteractionSystem();
  panels: Record<string, Panel> = {};
  pager: PagerUI;
  inventoryUI: InventoryUI;
  shopUI: ShopUI;
  prepUI: PrepUI;
  packUI: PackUI;
  mapUI: MapUI;
  dealerUI: DealerUI;
  ledgerUI: LedgerUI;
  busUI: BusUI;
  diceUI: DiceUI;
  private milestoneTimer = 0;
  private dealerStarvedTimer = 0;
  openPanelId: string | null = null;
  running = false;
  /** Save slot (1-3) the current run writes to. */
  activeSlot = 1;
  civilians: Civilian[] = [];
  police: Police[] = [];
  /** District 3's patrol cruisers, driving their loops on rails (a second one works the beach under curfew). */
  cruisers: Cruiser[] = [];
  /** The downtown cruiser, always present once spawned. */
  get cruiser(): Cruiser | null {
    return this.cruisers[0] ?? null;
  }
  private radioCooldown = 0;
  /** Pointer-lock changes before this time stamp do not open the pause menu (a panel just closed). */
  private lockGraceUntil = 0;
  /** Cruiser pursuit of the sedan: who is chasing, how long they have not seen you, off-grid time, and how long you have sat still in reach. */
  private pursuer: Cruiser | null = null;
  private pursuitLost = 0;
  private offGridFor = 0;
  private corneredFor = 0;
  private pursuitCooldown = 0;
  private handlerIdleTimer = 0;
  private policeSpawned = 0;
  customers = new Map<number, CustomerNPC>();
  wanderers = new Map<string, WanderingCustomer>();
  private wandererTimer = 0;
  private gossip: string[] = [];
  runnerNPC: RunnerNPC | null = null;
  private runnerTripFor: number | null = null;
  workerFigure: THREE.Group | null = null;
  vehicle: Vehicle | null = null;
  /** Rico's old hatchback (always present). */
  starterCar: Vehicle | null = null;
  /** Whichever vehicle is being driven right now. */
  ride: Vehicle | null = null;
  /** First-person bat, a child of the camera. */
  private batView: THREE.Group;
  /** Swing animation progress, 1 → 0. */
  private swingT = 0;
  boomboxOn = false;
  /** Car stereo stays on between rides unless you switch it off. */
  carRadioOn = true;
  settings: Settings = loadSettings();
  driving = false;
  /** Hiding inside a dumpster: invisible to police, cannot move. */
  hiding: { x: number; z: number; exitX: number; exitZ: number } | null = null;
  private hideLineTimer = 0;
  private carHitTimer = 0;
  private carEye = new THREE.Vector3();
  private carLook = new THREE.Vector3();
  cutscene: Cutscene;
  private titleAngle = 0;
  private weather!: Weather;
  private wasRaining = false;
  /** This frame's shower state, computed once in frame(). */
  private rainNow = false;
  /** Fog density this frame (0..1) and whether the fog notice has fired for this bank. */
  private fogNow = 0;
  private wasFoggy = false;
  private workerToastTimer = 0;
  private dealerPriceyTimer = 0;
  private workerBlockedTimer = 0;
  dancers: Civilian[] = [];
  nightCrowd: Civilian[] = [];
  private last = performance.now();
  private debugEl: HTMLElement;
  private frames = 0;
  private fpsTime = 0;
  fps = 0;
  private orderTimer = 25; // seconds until the next order attempt
  private autosaveTimer = 60;
  private arrested = false;
  private arrestTimer = 0;
  private expectUnlock = false;
  private placement: { kind: PlacedStation['kind']; ghost: THREE.Mesh; rot: number; item: string } | null = null;
  private placedObjects: WorldObject[] = [];
  private dynamicGroup = new THREE.Group();
  private cancelChecked = new Set<number>();
  private lastHeatLevel = 'calm';
  private payphoneCooldown = 0;
  private tips: string[] = [];
  private tipTimer = 0;
  private objectiveText = '';
  private orderText: string | null = null;
  private hudTextTimer = 0;
  /** Two-press confirmation (no browser dialogs: they would drop pointer lock). */
  private pendingConfirm: { key: string; until: number } | null = null;
  /** Real elapsed time (lightly capped) for UI timers, independent of the physics step cap. */
  private uiDt = 0.016;

  constructor(root: HTMLElement) {
    setLang(this.settings.lang >= 0.5 ? 'zh' : 'en');
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    root.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 600);
    this.input = new Input(this.renderer.domElement);
    this.city = buildCity();
    this.scene.add(this.city.group);
    this.weather = new Weather(this.scene);
    void dressInteriors(this.scene, this.city);
    void upgradeParkedCars(this.city);
    this.scene.add(this.dynamicGroup);
    this.scene.add(this.camera);
    this.batView = new THREE.Group();
    {
      const wood = lambert('#c9a060');
      const barrel = new THREE.Mesh(cylGeo(0.045, 0.028, 0.7, 10), wood);
      barrel.position.y = 0.42;
      const grip = new THREE.Mesh(cylGeo(0.026, 0.03, 0.22, 8), lambert('#2a1a10'));
      grip.position.y = -0.03;
      const knob = new THREE.Mesh(cylGeo(0.04, 0.04, 0.03, 8), lambert('#2a1a10'));
      knob.position.y = -0.15;
      this.batView.add(barrel, grip, knob);
      this.batView.position.set(0.36, -0.44, -0.8);
      this.batView.rotation.set(0.55, 0.1, -0.4);
      this.batView.scale.setScalar(0.8);
      this.batView.visible = false;
      this.camera.add(this.batView);
    }
    this.dayNight = new DayNight(this.scene, this.city.night);
    this.dayNight.setLampPositions(this.city.lampPositions);
    this.player = new PlayerController(this.camera, this.input, this.city.colliders);
    this.player.teleport(SPAWN.x, SPAWN.y + 0.2, SPAWN.z, SPAWN.yaw);

    this.hud = new HUD(root);
    this.dialogue = new Dialogue(root);
    this.pager = new PagerUI(root, this);
    this.inventoryUI = new InventoryUI(root, this);
    this.shopUI = new ShopUI(root, this);
    this.prepUI = new PrepUI(root, this);
    this.packUI = new PackUI(root, this);
    this.mapUI = new MapUI(root, this);
    this.dealerUI = new DealerUI(root, this);
    this.ledgerUI = new LedgerUI(root, this);
    this.busUI = new BusUI(root, this);
    this.diceUI = new DiceUI(root, this);
    for (const p of [this.pager, this.inventoryUI, this.shopUI, this.prepUI, this.packUI, this.mapUI, this.dealerUI, this.ledgerUI, this.busUI, this.diceUI]) {
      this.panels[p.id] = p;
      p.onCloseRequest = () => this.closePanel();
    }
    this.cutscene = new Cutscene(root);
    migrateLegacySave(localStorage);
    this.activeSlot = latestSlot(localStorage) ?? 1;
    this.menu = new Menu(root, {
      newGame: (slot) => this.startNewGame(true, slot),
      quit: () => this.quitToTitle(),
      continueGame: (slot) => this.continueGame(slot),
      deleteSlot: (slot) => clearSlot(localStorage, slot),
      resume: () => this.resume(),
      save: (slot) => { this.save(slot); this.toast(t('Saved to slot {n}.', { n: this.activeSlot })); },
      hasSave: () => hasAnySave(localStorage),
      slots: () => {
        const current = this.running ? this.activeSlot : latestSlot(localStorage);
        return listSlots(localStorage).map((sl) => ({ slot: sl.slot, summary: sl.state ? this.describeRun(sl.state) : null, savedAt: sl.savedAt, current: sl.slot === current }));
      },
      saveSummary: () => this.saveSummary(),
      runStats: () => (this.running ? this.describeRun(this.state) : null),
      getSettings: () => this.settings,
      setSetting: (key, value) => this.applySetting(key, value),
    });
    this.applySetting('sensitivity', this.settings.sensitivity, false);
    this.applySetting('masterVolume', this.settings.masterVolume, false);
    this.applySetting('radioVolume', this.settings.radioVolume, false);
    this.applySetting('radioStation', this.settings.radioStation, false);
    this.audio.radio.onAir = (st, track, line) => this.hud.setRadio(st, track, line);
    this.audio.radio.context = () => ({ heat: this.state.heat, night: this.clock.isNight, crewName: this.state.crewName, eventId: activeEvent(this.state)?.id ?? null, day: this.clock.day, trend: this.state.trend?.effect ?? null, raining: this.isRaining(), foggy: this.fogNow > 0.5, sales: this.state.stats.sales, arrests: this.state.stats.arrests });
    window.addEventListener('beforeunload', () => this.save());
    // the first click on the title screen is the gesture that unlocks audio: start the theme there
    this.menu.el.addEventListener('pointerdown', () => {
      this.audio.init();
      this.audio.resume();
      if (!this.running) this.audio.setTitleMusic(true);
    });
    this.hud.setVisible(false);
    this.debugEl = document.createElement('div');
    this.debugEl.id = 'debug';
    root.appendChild(this.debugEl);

    this.wireWorldObjects();
    this.spawnPedestrians();
    this.spawnPolice();
    this.spawnCruiser();
    window.addEventListener('resize', () => this.onResize());
    this.renderer.domElement.addEventListener('click', () => {
      if (this.running && !this.openPanelId && !this.menu.visible) {
        this.audio.init();
        this.input.requestLock();
        if (this.placement) this.confirmPlacement();
        else if (this.dialogue.active) this.dialogue.next();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      if (!locked && this.running && !this.openPanelId && !this.expectUnlock && !this.menu.visible && performance.now() > this.lockGraceUntil) this.pause();
      this.expectUnlock = false;
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keydown', (e) => { if (e.code === 'F3') { e.preventDefault(); this.debugEl.style.display = this.debugEl.style.display === 'block' ? 'none' : 'block'; } });
  }

  // ------------------------------------------------------------------ lifecycle

  start(): void {
    this.menu.show('title');
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  startNewGame(intro = false, slot?: number): void {
    this.activeSlot = slot ?? firstEmptySlot(localStorage) ?? this.activeSlot;
    this.state = createNewState();
    this.applyStateToWorld();
    this.orderTimer = 40;
    this.dialogue.clear();
    this.tips = [
      t('WASD to move · SHIFT to sprint · E to interact · TAB backpack · P pager · M map'),
      t('1-8 picks the hotbar slot: that is what you hand over as a free sample or a street deal.'),
    ];
    this.tipTimer = 12;
    this.beginPlay();
    if (intro && this.settings.cutscenes) this.playIntro();
  }

  /** Opening flyover: ocean → skyline → the back room. Any key skips it. */
  private playIntro(): void {
    const shots: Shot[] = [
      { from: [260, 70, 120], to: [200, 45, 40], lookFrom: [40, 0, 0], lookTo: [60, 4, 0], dur: 6, text: 'SOL PALMA, FLORIDA', sub: '1996' },
      { from: [175, 14, -50], to: [150, 9, 30], lookFrom: [135, 6, 5], lookTo: [110, 4, 20], dur: 5.5, text: t('NEON, SUNSCREEN AND BAD DECISIONS'), sub: t('a city that never checks ID') },
      { from: [30, 26, 60], to: [-2, 5, 22], lookFrom: [-21, 2, 14], dur: 6, text: t('$80, A PAGER AND A BACK ROOM'), sub: t("Sal's crew owns the streets. For now.") },
      { from: [-2, 5, 22], to: [-2, 5, 22], lookFrom: [-21, 2, 14], dur: 1.6, fade: 1, text: 'SUNSET SYNDICATE', sub: '' },
    ];
    this.hud.setVisible(false);
    this.audio.play('jingle_intro');
    this.cutscene.play(shots, () => {
      this.hud.setVisible(true);
      this.input.requestLock();
    });
  }

  /** One line about the save on the title screen, e.g. "DAY 3 · $1,240 · 4 CUSTOMERS · 2 PROPERTIES". */
  private saveSummary(): string | null {
    const slot = latestSlot(localStorage);
    const s = slot ? loadFromSlot(localStorage, slot) : null;
    return s ? this.describeRun(s) : null;
  }

  private describeRun(s: GameState): string {
    const day = Math.max(1, Math.floor(s.clockMinutes / (24 * 60)));
    const unlocked = Object.values(s.customers).filter((c) => c.unlocked).length;
    const crew = [s.runner?.hired, s.worker?.hired, s.dealer?.hired].filter(Boolean).length;
    const parts = [t('DAY {n}', { n: day }), `$${Math.round(s.cash).toLocaleString('en-US')}`, t('{n} SALES', { n: s.stats.sales }), t('{n} CUSTOMERS', { n: unlocked }), t(s.properties.length === 1 ? '{n} PROPERTY' : '{n} PROPERTIES', { n: s.properties.length })];
    if (crew) parts.push(t('{n} CREW', { n: crew }));
    if (s.crewName) parts.unshift(s.crewName);
    return parts.join(' · ');
  }

  quitToTitle(): void {
    this.running = false;
    this.cutscene.cancel();
    this.dialogue.clear();
    this.arrested = false;
    this.hud.arrestMode = false;
    this.hud.setVisible(false);
    if (this.audio.radio.playing) this.audio.radio.stop();
    this.audio.setEngine(false, 0);
    this.audio.setTitleMusic(true);
    this.clock.totalMinutes = Math.floor(this.clock.totalMinutes / (24 * 60)) * 24 * 60 + 19 * 60;
  }

  /** Fog density right now: seeded per day, mornings only. */
  fogDensity(): number {
    return fogLevel(this.state.seed ?? 0, this.clock.day, this.clock.hour);
  }

  /** How far anyone sees this frame, as a multiplier on the usual ranges. */
  private sight(): number {
    return sightMultiplier(this.fogNow);
  }

  /** Showers are decided per event slot from the save seed (about one slot in four). */
  isRaining(): boolean {
    const slot = eventSlot(this.clock.day, this.clock.hour);
    return hashString('rain' + slot + ':' + (this.state.seed ?? 0)) % 100 < 28;
  }

  /** Slow orbit over the city behind the title screen. */
  private updateTitleCamera(dt: number): void {
    this.titleAngle += dt * 0.06;
    const cx = 40;
    const cz = -10;
    const r = 150;
    this.camera.position.set(cx + Math.cos(this.titleAngle) * r, 42, cz + Math.sin(this.titleAngle) * r);
    this.camera.lookAt(cx, 6, cz);
  }

  continueGame(slot?: number): void {
    const n = slot ?? latestSlot(localStorage);
    const s = n ? loadFromSlot(localStorage, n) : null;
    if (!s || !n) {
      this.startNewGame();
      return;
    }
    this.activeSlot = n;
    this.state = s;
    // a run that is already past chapter one never replays its cards
    if (storyStep(s) === 'done') markStorySeen(s);
    this.dialogue.clear();
    this.applyStateToWorld();
    this.orderTimer = 20;
    this.beginPlay();
    this.toast(t('Welcome back to Sol Palma.'));
  }

  private beginPlay(): void {
    this.running = true;
    this.menu.hide();
    this.hud.setVisible(true);
    this.audio.init();
    this.audio.setTitleMusic(false);
    this.input.requestLock();
  }

  private settingsSaveTimer: number | null = null;

  applySetting(key: keyof Settings, value: number, persist = true): void {
    this.settings[key] = value;
    if (key === 'sensitivity') this.player.sensitivity = 0.0022 * value;
    if (key === 'masterVolume') this.audio.setMasterVolume(value);
    if (key === 'radioVolume') this.audio.radio.setVolume(value);
    if (key === 'radioStation') this.audio.radio.tune(value);
    if (key === 'lang') {
      setLang(value >= 0.5 ? 'zh' : 'en');
      this.hud.relabel();
      this.menu.refresh();
      if (this.openPanelId) {
        this.panels[this.openPanelId].setTitle(this.panels[this.openPanelId].title);
        this.panels[this.openPanelId].render();
      }
    }
    if (!persist) return;
    if (this.settingsSaveTimer !== null) clearTimeout(this.settingsSaveTimer);
    this.settingsSaveTimer = window.setTimeout(() => {
      this.settingsSaveTimer = null;
      saveSettings(this.settings);
    }, 300);
  }

  /** Behind the wheel of either car: engine, stereo and cruiser pursuits apply. */
  get inCar(): boolean {
    return this.driving && !!this.ride;
  }

  /** N: off → station 1 → … → last station → off. Works for the walkman on foot and the car stereo. */
  cycleRadio(): void {
    this.audio.init();
    const radio = this.audio.radio;
    const on = this.inCar ? this.carRadioOn : this.boomboxOn;
    let nowOn: boolean;
    if (!on) {
      nowOn = true;
      radio.tune(this.settings.radioStation);
    } else if (radio.station >= STATIONS.length - 1) {
      nowOn = false;
      this.applySetting('radioStation', 0); // next press starts the cycle again
    } else {
      nowOn = true;
      radio.next();
      this.applySetting('radioStation', radio.station);
    }
    if (this.inCar) this.carRadioOn = nowOn;
    else this.boomboxOn = nowOn;
    this.audio.play('switch');
    if (!nowOn) {
      radio.stop();
      this.toast(this.inCar ? 'Car stereo OFF' : 'Walkman OFF');
    } else {
      radio.start();
      const st = radio.current;
      this.toast(t('{v0} · {v1} {v2} (N: next station)', { v0: this.inCar ? 'Car stereo' : 'Walkman', v1: st.name, v2: st.freq }));
    }
  }

  pause(): void {
    if (!this.running) return;
    this.audio.setEngine(false, 0);
    this.expectUnlock = true;
    this.input.releaseLock();
    this.menu.show('pause');
  }

  resume(): void {
    this.menu.hide();
    this.input.requestLock();
  }

  /** Rebuild all state-dependent world objects (customers, runner, placed stations, player position). */
  private applyStateToWorld(): void {
    const s = this.state;
    this.clock.totalMinutes = s.clockMinutes;
    this.player.teleport(s.player.x, s.player.y + 0.1, s.player.z, s.player.yaw);
    for (const c of this.customers.values()) {
      c.dispose();
      this.dynamicGroup.remove(c.mesh);
    }
    this.customers.clear();
    for (const w of this.wanderers.values()) {
      w.dispose();
      this.dynamicGroup.remove(w.mesh);
      this.interaction.remove(w.id);
    }
    this.wanderers.clear();
    this.wandererTimer = 0;
    for (const o of activeOrders(s)) if (o.status === 'accepted') this.spawnCustomerFor(o);
    if (this.runnerNPC) {
      this.dynamicGroup.remove(this.runnerNPC.mesh);
      this.runnerNPC = null;
    }
    this.runnerTripFor = null;
    this.syncPoliceCount(false);
    if (s.runner?.hired) this.createRunnerNPC();
    this.updateWorkerFigure();
    this.driving = false;
    this.ride = null;
    this.hiding = null;
    this.hud.hiddenMode = false;
    this.hud.arrestMode = false;
    this.arrested = false;
    this.cutscene.cancel();
    this.wasRaining = this.isRaining(); // the shower notice only fires on a transition inside this game
    this.syncVehicle();
    this.syncStarterCar();
    // placed stations
    const stale: import('../physics/Colliders').AABB[] = [];
    for (const o of this.placedObjects) {
      this.interaction.remove(o.id);
      this.dynamicGroup.remove(o.mesh);
      if (o.colliders) stale.push(...o.colliders);
    }
    if (stale.length) this.city.colliders.removeMany(stale);
    this.placedObjects = [];
    for (const p of s.placedStations) this.instantiateStation(p);
    this.updateWarehouseSign();
    this.updateRunnerContact();
    const motelSign = this.city.objects.find((o) => o.kind === 'motel_sign');
    if (motelSign) motelSign.mesh.visible = !s.properties.includes('motel');
    const frontSign = this.city.objects.find((o) => o.kind === 'front_sign');
    if (frontSign) frontSign.mesh.visible = !s.properties.includes('laundromat');
    this.refreshCrewSign();
    this.syncStarterBox();
    this.cancelChecked.clear();
    this.hud.selectedSlot = 0;
  }

  // ------------------------------------------------------------------ world wiring

  private wireWorldObjects(): void {
    for (const o of this.city.objects) this.wireObject(o);
  }

  private wireObject(o: WorldObject): void {
    const base = { id: o.id, position: o.position };
    const owned = (): boolean => !o.property || this.state.properties.includes(o.property);
    const add = (i: Omit<Interactable, 'id' | 'position'>): void => this.interaction.add({ ...base, ...i });
    switch (o.kind) {
      case 'starter_box':
        add({ prompt: () => (this.state.flags.starterTaken ? null : t('[E] OPEN STARTER BOX')), onInteract: () => this.takeStarterBox() });
        break;
      case 'prep_table':
        add({ prompt: () => (owned() ? t('[E] USE PREP TABLE') : null), onInteract: () => this.openPanel('prep-panel') });
        break;
      case 'pack_table':
        add({ prompt: () => (owned() ? t('[E] USE PACKAGING TABLE') : null), onInteract: () => this.openPanel('pack-panel') });
        break;
      case 'storage':
        add({ prompt: () => (owned() ? t('[E] OPEN STORAGE') : null), onInteract: () => { this.inventoryUI.storageProperty = o.property ?? 'safehouse'; this.openPanel('inventory-panel'); } });
        break;
      case 'store_counter':
        add({ prompt: () => t('[E] BUY · QUICK STOP 24'), onInteract: () => this.openShop('store'), radius: 3.6 });
        break;
      case 'pawn_counter':
        add({ prompt: () => t('[E] BUY · SOL PALMA PAWN'), onInteract: () => this.openShop('pawn'), radius: 4.5 });
        break;
      case 'supplier':
        add({ prompt: () => t('[E] TALK · RICO (SUPPLIER)'), onInteract: () => this.openShop('supplier'), radius: 3.5 });
        break;
      case 'runner_contact':
        add({ prompt: () => (this.state.runner?.hired ? null : t('[E] TALK · DIZZY (HIRE RUNNER ${RUNNER_HIRE_PRICE})', { RUNNER_HIRE_PRICE })), onInteract: () => this.talkToDizzy(), radius: 3.5 });
        break;
      case 'worker_contact':
        add({ prompt: () => (this.state.worker?.hired ? null : t('[E] TALK · MARISOL (HIRE WORKER ${WORKER_HIRE_PRICE})', { WORKER_HIRE_PRICE })), onInteract: () => this.talkToMarisol(), radius: 3.5 });
        break;
      case 'dumpster':
        add({ prompt: () => (this.hiding ? null : this.state.heat >= 20 ? t('[E] HIDE IN DUMPSTER') : t('[E] HIDE IN DUMPSTER (nobody is looking for you… yet)')), onInteract: () => this.hideInDumpster(o), radius: 3, aimY: 0.8 });
        break;
      case 'handler_contact':
        add({ prompt: () => (!owned() || this.state.handler?.hired ? null : t('[E] TALK · TEDDY (HIRE HANDLER ${HANDLER_HIRE_PRICE})', { HANDLER_HIRE_PRICE })), onInteract: () => this.talkToTeddy(), radius: 3.5 });
        break;
      case 'dealer_contact':
        add({ prompt: () => (this.state.dealer?.hired ? t('[E] TALK · VINCE (DEALER · ${v0} waiting)', { v0: Math.round(this.state.dealer.cash) }) : t('[E] TALK · VINCE (HIRE DEALER ${DEALER_HIRE_PRICE})', { DEALER_HIRE_PRICE })), onInteract: () => this.talkToVince(), radius: 3.5 });
        break;
      case 'front_sign':
        add({ prompt: () => (this.state.properties.includes('laundromat') ? null : t('[E] BUY LUCKY LAUNDROMAT (${FRONT_PRICE}) · legit front', { FRONT_PRICE })), onInteract: () => this.buyFront(), radius: 3.5 });
        break;
      case 'motel_sign':
        add({ prompt: () => (this.state.properties.includes('motel') ? null : t('[E] RENT ROOM 6 (${MOTEL_PRICE}) · beach stash + safe spot', { MOTEL_PRICE })), onInteract: () => this.rentMotel(), radius: 3.5 });
        break;
      case 'car_sale':
        add({ prompt: () => (this.state.vehicle?.owned ? null : t("[E] BUY '88 SEDAN (${VEHICLE_PRICE})", { VEHICLE_PRICE })), onInteract: () => this.buyCar(), radius: 4 });
        break;
      case 'respray':
        add({ prompt: () => (!this.state.vehicle?.owned || this.driving ? null : this.carNearRespray(o) ? t('[E] ROJAS RESPRAY (${RESPRAY_PRICE})', { RESPRAY_PRICE }) : t('[E] ROJAS RESPRAY (bring the sedan here)')), onInteract: () => this.resprayCar(o), radius: 4 });
        break;
      case 'warehouse_sign':
        add({ prompt: () => (this.state.properties.includes('warehouse') ? null : t('[E] BUY WAREHOUSE 7 (${WAREHOUSE_PRICE})', { WAREHOUSE_PRICE })), onInteract: () => { this.buyWarehouse(); }, radius: 3.5 });
        break;
      case 'bed':
        add({ prompt: () => (o.data?.rest || owned() ? t('[E] REST UNTIL MORNING') : null), onInteract: () => this.rest(), radius: 3 });
        break;
      case 'dice_table':
        add({ prompt: () => t('[E] STREET DICE · high or low, ${v0}-${v1} a throw', { v0: 10, v1: 200 }), onInteract: () => this.openPanel('dice-panel'), radius: 3 });
        break;
      case 'bus_stop':
        add({ prompt: () => t('[E] BUS STOP · ride to another district (${BUS_FARE})', { BUS_FARE }), onInteract: () => { this.busUI.here = String(o.data?.stop ?? ''); this.openPanel('bus-panel'); }, radius: 3.5 });
        break;
      case 'payphone':
        add({ prompt: () => (this.payphoneCooldown > 0 ? null : t('[E] USE PAYPHONE · CALL AROUND ({v0})', { v0: this.state.cash < 1 ? 'FREE, you look broke' : '$1' })), onInteract: () => this.usePayphone(), radius: 2.8 });
        break;
      case 'club_bar':
        add({ prompt: () => t('[E] ORDER A DRINK ($5)'), onInteract: () => this.buyDrink(), radius: 3.5 });
        break;
      case 'fax':
        add({ prompt: () => t('[E] CHECK FAX / LEDGER'), onInteract: () => this.openPanel('ledger-panel'), radius: 2.5 });
        break;
      case 'placement_area':
        break;
    }
  }

  private openShop(id: string): void {
    this.shopUI.setShop(id);
    this.openPanel('shop-panel');
  }

  private spawnPedestrians(): void {
    const g = this.city.waypoints;
    for (let i = 0; i < 26; i++) {
      const n = g.random();
      const c = new Civilian('civ' + i, n.x + (Math.random() - 0.5) * 2, n.z + (Math.random() - 0.5) * 2, CIVILIAN_COLORS[i % CIVILIAN_COLORS.length], SKINS[i % SKINS.length], PANTS[i % PANTS.length], this.city.colliders, g);
      this.civilians.push(c);
      this.dynamicGroup.add(c.mesh);
    }
    // beach night crowd: extra pedestrians who only show up after dark near Club Mirage
    const beachNodes = this.city.waypoints.nodes.filter((n) => n.zone === 'beach');
    for (let i = 0; i < 8; i++) {
      const n = beachNodes[Math.floor(Math.random() * beachNodes.length)] ?? g.random();
      const c = new Civilian('night' + i, n.x, n.z, ['#ff4fd8', '#4ff2e8', '#ffe066', '#b388ff'][i % 4], SKINS[(i * 2) % SKINS.length], ['#ffffff', '#1a1a2e'][i % 2], this.city.colliders, g);
      c.mesh.visible = false;
      this.nightCrowd.push(c);
    }
    // club dancers (visible at night only)
    const club = BUILDINGS.find((b) => b.id === 'club')!;
    for (let i = 0; i < 7; i++) {
      const d = new Civilian('dancer' + i, club.x - 8 + (i % 4) * 3 + 1, club.z - 6 + Math.floor(i / 4) * 5, CIVILIAN_COLORS[(i * 5) % CIVILIAN_COLORS.length], SKINS[(i * 3) % SKINS.length], PANTS[i % PANTS.length], this.city.colliders, this.city.waypoints);
      d.state = 'WAIT';
      this.dancers.push(d);
      this.dynamicGroup.add(d.mesh);
    }
  }

  private spawnPolice(): void {
    const spots = [
      { x: 70, z: -24 },
      { x: 37, z: 47 },
      { x: 150, z: -36 },
      { x: -57, z: 47 },
    ];
    spots.forEach((s, i) => {
      const p = new Police('cop' + i, s.x, s.z, this.city.colliders, this.city.waypoints);
      this.police.push(p);
      this.dynamicGroup.add(p.mesh);
    });
    this.policeSpawned = spots.length;
  }

  /** Long-term suspicion puts more officers on the street (4 base, up to 6); a curfew adds two more until morning. */
  private syncPoliceCount(announce = true): void {
    const curfew = curfewExtraPolice(this.state);
    const want = 4 + (this.state.suspicion >= 30 ? 1 : 0) + (this.state.suspicion >= 60 ? 1 : 0) + curfew;
    while (this.police.length < want) {
      const n = this.city.waypoints.random();
      const p = new Police('cop' + this.policeSpawned++, n.x, n.z, this.city.colliders, this.city.waypoints);
      this.police.push(p);
      this.dynamicGroup.add(p.mesh);
      if (announce && !curfew) this.toast(t('District 3 added a patrol. Your name is getting around.'), 'warn', 5000);
    }
    // when the curfew lifts only idle officers clock off: one mid-chase does not vanish
    while (this.police.length > want) {
      const i = this.police.map((p) => p.pstate).lastIndexOf('PATROL');
      if (i < 0) break;
      const [p] = this.police.splice(i, 1);
      p.dispose();
      this.dynamicGroup.remove(p.mesh);
    }
  }

  private spawnCruiser(route: { x: number; z: number }[] = CRUISER_ROUTE): void {
    const c = new Cruiser(route);
    this.cruisers.push(c);
    this.dynamicGroup.add(c.mesh);
    void loadModel('police').then((m) => {
      if (m && this.cruisers.includes(c)) c.applyModel(instanceModel(m, { scale: CAR_SCALE }));
    });
  }

  /** Curfew puts a second cruiser on the beach loop; it clocks off at dawn once it is not holding anyone. */
  private syncCruisers(): void {
    const want = 1 + (curfewExtraPolice(this.state) > 0 ? 1 : 0);
    if (this.cruisers.length < want) this.spawnCruiser(CURFEW_CRUISER_ROUTE);
    while (this.cruisers.length > want) {
      const c = this.cruisers[this.cruisers.length - 1];
      if (c.holdTimer > 0) break;
      this.cruisers.pop();
      c.dispose();
      this.dynamicGroup.remove(c.mesh);
    }
  }

  /** A cruiser is a moving witness: close, and with a clear line to the spot. Returns the one that saw it. */
  private cruiserSeeing(x: number, z: number, range = 24): Cruiser | null {
    for (const c of this.cruisers) if (c.distanceTo(x, z) < range * this.sight() && this.city.colliders.lineOfSight(c.position.x, 1.4, c.position.z, x, 1.2, z, 10)) return c;
    return null;
  }

  private cruiserSees(x: number, z: number): boolean {
    return this.cruiserSeeing(x, z) !== null;
  }

  /**
   * Drive the cruiser, brake for whoever is in its lane, and when the city is hot let it
   * radio the nearest idle officer to the player's position (once every 45 s at most).
   */
  private updateCruiser(dt: number, safe: boolean): void {
    this.syncCruisers();
    const px = this.player.position.x;
    const pz = this.player.position.z;
    const alert = this.state.heat >= 60 || curfewExtraPolice(this.state) > 0;
    this.updatePursuit(dt);
    for (const c of this.cruisers) this.driveCruiser(c, dt, safe, alert, c === this.pursuer && this.ride ? { x: this.ride.position.x, z: this.ride.position.z } : null);
    this.radioCooldown -= dt;
    if (this.state.heat < 60 || safe || this.hiding || this.arrested || this.radioCooldown > 0) return;
    const spotter = this.cruiserSeeing(px, pz);
    if (!spotter) return;
    this.radioCooldown = 45;
    // a cruiser stops to radio only when it is not already chasing you
    if (spotter !== this.pursuer) spotter.holdTimer = 4;
    const idle = this.police.filter((p) => p.pstate === 'PATROL' || p.pstate === 'RETURN_TO_PATROL').sort((a, b) => a.distanceTo(px, pz) - b.distanceTo(px, pz))[0];
    if (idle) idle.dispatchTo(px, this.player.position.y, pz);
    this.audio.play('siren');
    this.toast(idle ? 'The cruiser radioed your position. A foot patrol is on the way — break line of sight.' : 'The cruiser radioed your position. Every unit is already busy — keep moving.', 'warn', 5000);
  }

  /**
   * GTA-style pursuit: a hot driver a cruiser can see gets chased along the road grid.
   * Sit still in reach and you are pulled over (searched, or busted if holding); lose them by
   * outrunning, breaking line of sight for 8 s, or leaving the road grid for 4 s.
   */
  private updatePursuit(dt: number): void {
    this.pursuitCooldown -= dt;
    if (this.pursuer && !this.cruisers.includes(this.pursuer)) this.pursuer = null;
    const v = this.ride;
    if (!this.pursuer) {
      if (!this.inCar || !v || this.state.heat < 60 || this.pursuitCooldown > 0 || this.arrested) return;
      const spotter = this.cruiserSeeing(v.position.x, v.position.z, 34);
      if (!spotter) return;
      this.pursuer = spotter;
      this.pursuitLost = 0;
      this.offGridFor = 0;
      this.corneredFor = 0;
      this.audio.play('siren');
      this.hud.flash(t('PURSUIT'), '#ff5c5c');
      this.toast(t('The cruiser is on you. Outrun it, break line of sight, or get off the road grid. Stopping means a search.'), 'warn', 6000);
      return;
    }
    const c = this.pursuer;
    if (!this.inCar || !v || this.arrested) {
      // on foot again: the cruiser parks and the foot patrols take it from here
      this.endPursuit(3, 15);
      return;
    }
    const sees = c.distanceTo(v.position.x, v.position.z) < 45 && this.city.colliders.lineOfSight(c.position.x, 1.4, c.position.z, v.position.x, 1.0, v.position.z, 10);
    this.pursuitLost = sees ? 0 : this.pursuitLost + dt;
    this.offGridFor = onRoadGrid(v.position.x, v.position.z, 6) ? 0 : this.offGridFor + dt;
    if (this.pursuitLost > 8 || this.offGridFor > 4) {
      this.state.flags.lostCruiser = true;
      this.endPursuit(2, 20);
      this.hud.flash(t('LOST THEM'), '#7dff9a');
      this.toast(this.offGridFor > 4 ? 'You lost the cruiser in the alleys. It cannot follow you off the roads.' : 'You lost the cruiser.', 'cash', 5000);
      return;
    }
    const cornered = c.distanceTo(v.position.x, v.position.z) < 7 && Math.abs(v.speed) < 2.5;
    this.corneredFor = cornered ? this.corneredFor + dt : 0;
    if (this.corneredFor > 1.5) this.pulledOver();
  }

  private endPursuit(hold: number, cooldown: number): void {
    if (this.pursuer) this.pursuer.holdTimer = hold;
    this.pursuer = null;
    this.pursuitCooldown = cooldown;
  }

  /** Cornered in a car: a search of you and the trunk; holding anything means a bust. */
  private pulledOver(): void {
    const s = this.state;
    const v = this.ride;
    if (!v) return;
    v.speed = 0;
    const holding = s.inventory.some((st) => st && (st.id.startsWith('pkg:') || st.id.startsWith('prod:'))) || (s.storage.trunk ?? []).some((st) => st.id.startsWith('pkg:') || st.id.startsWith('prod:'));
    this.endPursuit(5, 40);
    if (holding) {
      this.beginArrest();
      return;
    }
    s.flags.cleanSearch = true;
    s.heat = Math.max(0, s.heat - 15);
    this.audio.play('siren');
    this.toast(t('Pulled over. They looked through the car and the trunk, found nothing, and let you go (Heat -15).'), 'info', 6000);
  }

  private driveCruiser(c: Cruiser, dt: number, safe: boolean, alert: boolean, pursue: { x: number; z: number } | null = null): void {
    const px = this.player.position.x;
    const pz = this.player.position.z;
    const f = c.forward();
    const inLane = (x: number, z: number): boolean => {
      const ax = x - c.position.x;
      const az = z - c.position.z;
      const along = ax * f.x + az * f.z;
      return along > 0 && along < 8 && Math.abs(ax * f.z - az * f.x) < 3.5;
    };
    // the player on foot (or driving), or their car left in the lane
    const blockAhead = (!this.hiding && !safe && inLane(px, pz)) || [this.vehicle, this.starterCar].some((car) => !!car && car !== this.ride && inLane(car.position.x, car.position.z));
    c.update(dt, { blockAhead, alert, night: this.clock.isNight, pursue });
  }

  private createRunnerNPC(): void {
    const home = this.runnerHome();
    this.runnerNPC = new RunnerNPC(home.x, home.z, this.city.colliders, this.city.waypoints);
    this.dynamicGroup.add(this.runnerNPC.mesh);
  }

  private runnerHome(property?: string): { x: number; z: number } {
    const prop = runnerPickupProperty(this.state, property);
    if (prop === 'motel') return { x: PROPERTY_ANCHORS.motel.x + 3, z: PROPERTY_ANCHORS.motel.z };
    return prop === 'warehouse' ? { x: WAREHOUSE_SIGN.x + 2, z: WAREHOUSE_SIGN.z + 4 } : { x: SAFEHOUSE_DOOR.x + 2, z: SAFEHOUSE_DOOR.z - 3 };
  }

  private updateWarehouseSign(): void {
    const sign = this.city.objects.find((o) => o.kind === 'warehouse_sign');
    if (sign) sign.mesh.visible = !this.state.properties.includes('warehouse');
  }

  private updateRunnerContact(): void {
    const dizzy = this.city.objects.find((o) => o.kind === 'runner_contact');
    if (dizzy) dizzy.mesh.visible = !this.state.runner?.hired;
  }

  private instantiateStation(p: PlacedStation): void {
    const pb = new PropBuilder(this.dynamicGroup, this.city.colliders);
    const ctx: InteriorContext = { pb, objects: [], night: this.city.night, floorY: 0.15 };
    const obj = buildPlacedStation(ctx, p.kind, p.id, p.x, p.z, p.rot);
    obj.colliders = pb.added;
    this.placedObjects.push(obj);
    this.wireObject(obj);
  }

  // ------------------------------------------------------------------ frame

  onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private frame(): void {
    const now = performance.now();
    const rawDt = (now - this.last) / 1000;
    const dt = Math.min(0.05, rawDt);
    this.uiDt = Math.min(0.5, rawDt);
    this.last = now;
    const paused = this.menu.visible;
    if (this.running && !paused) this.tick(dt);
    if (!this.running) this.updateTitleCamera(this.uiDt);
    else if (this.cutscene.active && !paused) this.cutscene.update(this.uiDt, this.camera);
    this.rainNow = this.isRaining();
    this.fogNow = this.fogDensity();
    // showers stay outside: interiors are in place, so the cloud is switched off while you are under a roof
    this.weather.setRaining(this.rainNow && !(this.running && this.playerInsideAnyInterior()));
    this.weather.update(this.uiDt, this.camera.position);
    this.dayNight.update(this.clock, this.player.position, this.weather.intensity, this.fogNow);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 1) {
      this.fps = this.frames / this.fpsTime;
      this.frames = 0;
      this.fpsTime = 0;
      const p = this.player.position;
      this.debugEl.textContent = `fps ${this.fps.toFixed(0)}  calls ${this.renderer.info.render.calls}  tris ${this.renderer.info.render.triangles}\npos ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}  time ${this.clock.formatClock()}  heat ${this.state.heat.toFixed(0)}  police ${this.police.map((c) => c.pstate[0]).join('')}`;
    }
  }

  private tick(dt: number): void {
    const s = this.state;
    const uiOpen = !!this.openPanelId;
    this.input.uiCaptured = uiOpen;
    this.player.frozen = uiOpen || this.arrested || this.driving || !!this.hiding;
    this.clock.tick(dt);
    s.clockMinutes = this.clock.totalMinutes;
    s.stats.playSeconds += dt;
    if (this.cutscene.active) this.input.consumeMouse();
    else if (this.driving && this.ride) this.updateDriving(dt, uiOpen);
    else {
      this.player.update(dt);
      if (this.player.stepped && !this.hiding) this.audio.play('step');
    }
    s.player = { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z, yaw: this.player.yaw };

    if (this.arrested) this.updateArrest(dt);

    // interaction
    const target = this.driving || this.hiding || this.cutscene.active ? null : this.interaction.update(this.camera, this.camera.position);
    this.hud.setPrompt(uiOpen || this.arrested ? null : this.hiding ? t('[E] CLIMB OUT') : this.driving ? (Math.abs(this.ride!.speed) < 1 ? t(this.inCar ? '[E] GET OUT · SPACE HORN · SHIFT BRAKE' : '[E] GET OFF · SHIFT BRAKE') : null) : target ? target.prompt() : this.placement ? '[CLICK] PLACE · [R] ROTATE · [ESC] CANCEL' : null);
    if (this.hiding) this.updateHiding(dt);
    // E works whenever no panel or menu is up, locked or not: closing a panel with Escape leaves the mouse free
    if (!uiOpen && !this.arrested && !this.menu.visible && this.input.wasPressed('KeyE')) {
      if (this.hiding) this.leaveDumpster();
      else if (this.driving) this.dismount();
      else if (target) {
        this.audio.play('click');
        target.onInteract();
      }
    }

    // story cards (chapter one): play once per step, advance on click / Enter / E with nothing to interact with
    this.dialogue.setHidden(uiOpen || this.arrested || this.cutscene.active);
    if (!uiOpen && !this.arrested && !this.cutscene.active && !this.menu.visible) {
      const step = claimStoryCard(s);
      if (step && STORY_CARDS[step]) {
        this.dialogue.show(STORY_CARDS[step].map((c) => ({ ...c, speaker: t(c.speaker), lines: c.lines.map((l) => t(l)) })));
        this.audio.play('pager');
        // the first page follows Tasha's card; the second follows Rico's restock talk
        if (step === 'page') this.orderTimer = Math.min(this.orderTimer, 8);
        if (step === 'second') this.orderTimer = Math.min(this.orderTimer, 10);
      }
      this.dialogue.update(this.uiDt);
      if (this.dialogue.active && (this.input.wasPressed('Enter') || (this.input.wasPressed('KeyE') && !target && !this.driving && !this.hiding))) this.dialogue.next();
    }

    // panels
    if (this.openPanelId) this.panels[this.openPanelId].update(this.uiDt);

    // daily trend + world event
    if (rollTrend(s, this.clock.day)) {
      this.toast(t('STREET TALK: {v0} is the hot effect today — products with it sell for +25%.', { v0: tn(s.trend!.effect) }), 'pager', 7000);
    }
    const ev = rollWorldEvent(s, eventSlot(this.clock.day, this.clock.hour));
    if (ev) {
      this.audio.play('pager');
      this.hud.pagerNotify('NEWS FLASH\n' + describeEvent(ev)!.toUpperCase().slice(0, 60), '[P] PAGER');
      this.toast('NEWS: ' + describeEvent(ev), 'warn', 9000);
      if (ev.id === 'inspection') {
        const r = applyInspection(s);
        this.audio.play('siren');
        this.toast(r.seized > 0 ? `Inspectors seized ${r.seized} units from Warehouse 7. Keep less product on the shelves when your name is hot.` : 'Inspectors found nothing on your shelves. Lucky.', r.seized > 0 ? 'warn' : 'info', 8000);
      }
    }
    // orders
    this.orderTimer -= dt;
    if (this.orderTimer <= 0) this.tryGenerateOrder();
    const expired = expireOrders(s, this.clock.totalMinutes);
    for (const o of expired) {
      const c = CUSTOMER_MAP[o.customerId];
      this.despawnCustomer(o.id);
      // ignoring a page is free (declining is); standing up a customer you accepted is not
      if (o.status === 'expired' && o.expiredFrom === 'accepted' && s.customers[o.customerId]) {
        s.customers[o.customerId].relationship = Math.max(0, s.customers[o.customerId].relationship - 2);
        this.toast(t('{v0} got tired of waiting. Order expired.', { v0: c.name.split(' ')[0] }), 'warn');
      }
    }
    this.checkCancellations();

    // runner
    const runnerOrder = s.runner?.activeOrderId !== null && s.runner ? s.orders.find((o) => o.id === s.runner!.activeOrderId) : undefined;
    const runnerTierBefore = runnerOrder ? relationshipTier(s.customers[runnerOrder.customerId]?.relationship ?? 0) : null;
    const rr = tickRunner(s, dt);
    if (rr.mishap) {
      const c = CUSTOMER_MAP[rr.mishap.order.customerId];
      this.audio.play('siren');
      this.hud.flash(t('DELIVERY LOST'), '#ff6b6b');
      this.toast(t('Dizzy got stopped on the way to {v0}. Product gone, order lost, HEAT +10. Some runs you walk yourself.', { v0: c.name.split(' ')[0] }), 'warn', 8000);
      this.despawnCustomer(rr.mishap.order.id);
      this.save();
    }
    if (rr.completed) {
      const c = CUSTOMER_MAP[rr.completed.order.customerId];
      this.audio.play('cash');
      this.toast(t('Dizzy delivered to {v0}: +${v1} (Dizzy kept ${v2})', { v0: c.name.split(' ')[0], v1: rr.completed.earned, v2: rr.completed.cut }), 'cash');
      for (const id of rr.completed.unlocked) this.announceUnlock(id);
      if (runnerTierBefore) this.announceTier(rr.completed.order.customerId, runnerTierBefore);
      this.despawnCustomer(rr.completed.order.id);
      this.save();
    }
    // production worker
    const wr = tickWorker(s, dt);
    if (wr.produced) {
      this.workerToastTimer -= 1;
      if (this.workerToastTimer <= 0) {
        this.workerToastTimer = 4;
        this.toast(t('Marisol finished {v0} {v1} (in {v2} storage).', { v0: t(wr.produced.packaged ? 'a packaged' : 'a loose'), v1: recipeDisplayName(s, wr.produced.recipeKey), v2: tn(s.worker!.property) }), 'info', 3000);
      }
    } else if (wr.blocked && wr.blocked !== 'unassigned') {
      this.workerBlockedTimer -= dt;
      if (this.workerBlockedTimer <= 0) {
        this.workerBlockedTimer = 90;
        this.toast(t('Marisol is idle: {v0} in {v1} storage.', { v0: t(wr.blocked === 'no_base' ? 'no base supply' : wr.blocked === 'no_mods' ? 'no modifiers' : 'storage full'), v1: tn(s.worker!.property) }), 'warn', 4000);
      }
    }
    // handler: warehouse -> Vince
    const hr = tickHandler(s, this.clock.totalMinutes);
    if (hr.moved) this.toast(t("Teddy dropped {v0} units at Vince's corner.", { v0: hr.moved }), 'info', 3000);
    if (hr.lost) {
      this.audio.play('siren');
      this.toast(t('Teddy got stopped on the way to Vince: {v0} units gone, the port is asking questions (suspicion +5).', { v0: hr.lost }), 'warn', 6000);
    }
    if (hr.idle) {
      this.handlerIdleTimer -= 1;
      if (this.handlerIdleTimer <= 0) {
        this.handlerIdleTimer = 4;
        this.toast(hr.idle === 'no_stock' ? 'Teddy: "Nothing packaged in the warehouse. I am not carrying air."' : 'Teddy: "Vince is full up. I will wait."', 'info', 4000);
      }
    }
    // dealer
    const dr = tickDealer(s, this.clock.totalMinutes);
    for (const sale of dr.sales) this.toast(t('Vince sold {v0}x {v1} to {v2} (+${v3} held).', { v0: sale.qty, v1: recipeDisplayName(s, sale.itemKey), v2: CUSTOMER_MAP[sale.customerId].name.split(' ')[0], v3: sale.earned }), 'info', 3000);
    if (dr.tooPricey?.length && dr.sales.length === 0) {
      this.dealerPriceyTimer -= 1;
      if (this.dealerPriceyTimer <= 0) {
        this.dealerPriceyTimer = 6;
        this.toast(t("Vince: \"{v0} can't afford what you gave me. Corner people carry $75, not $200 — hand me something plain too.\"", { v0: CUSTOMER_MAP[dr.tooPricey[0]].name.split(' ')[0] }), 'warn', 7000);
      }
    }
    if (dr.hassled) {
      this.audio.play('siren');
      this.toast(t('Cops shook Vince down: {v0} units lost, HEAT +{v1}.', { v0: dr.hassled.lost, v1: dr.hassled.heat }), 'warn', 6000);
    }
    for (const poached of dr.poached ?? []) {
      this.audio.play('error');
      this.toast(t("{v0} got tired of Vince's empty corner and now buys from a rival crew. Keep him stocked!", { v0: CUSTOMER_MAP[poached].name.split(' ')[0] }), 'warn', 8000);
    }
    if (dr.starved) {
      this.dealerStarvedTimer -= 1;
      if (this.dealerStarvedTimer <= 0) {
        this.dealerStarvedTimer = 3;
        this.toast(t('Vince is out of stock. Customers are walking away from his corner.'), 'warn', 5000);
      }
    }
    if (this.workerFigure) {
      const busy = !!s.worker?.recipeKey && !wr.blocked;
      this.workerFigure.position.y = 0.15 + (busy ? Math.abs(Math.sin(performance.now() / 250)) * 0.08 : 0);
      this.workerFigure.rotation.y = busy ? Math.sin(performance.now() / 600) * 0.3 : 0;
    }
    if (this.runnerNPC) {
      const active = s.runner?.activeOrderId !== null && s.runner ? s.orders.find((o) => o.id === s.runner!.activeOrderId) : null;
      if (active && active.status === 'runner' && this.runnerTripFor !== active.id) {
        this.runnerTripFor = active.id;
        const l = LANDMARKS.find((x) => x.id === active.locationId)!;
        const home = this.runnerHome(active.runnerFrom);
        this.runnerNPC.setHome(home.x, home.z);
        this.runnerNPC.setTrip(l.x, l.z);
      }
      if (active && active.status === 'runner') this.runnerNPC.showProgress(active.runnerProgress ?? 0);
      else if (this.runnerNPC.velocity.lengthSq() > 0 || this.runnerNPC.distanceTo(this.runnerNPC.homeX, this.runnerNPC.homeZ) > 0.5) this.runnerNPC.clearTrip();
      this.runnerNPC.syncVisual(dt);
    }

    // heat
    const safe = this.playerInsideOwnedProperty() || !!this.hiding;
    decayHeat(s, dt, { atSafehouse: this.playerInsideOwnedProperty(), hidden: this.playerInsideAnyInterior() || !!this.hiding, rateMul: this.rainNow ? 1.2 : 1 });
    const lvl = heatLevel(s.heat);
    if (lvl !== this.lastHeatLevel) {
      if (lvl === 'hunted' || lvl === 'wanted') this.audio.play('siren');
      if (lvl === 'wanted') this.toast(t('The cops are actively hunting you. Break line of sight!'), 'warn');
      this.lastHeatLevel = lvl;
    }

    // NPCs
    this.updateNPCs(dt, safe);

    // ambient audio
    const club = BUILDINGS.find((b) => b.id === 'club')!;
    const dClub = Math.hypot(this.player.position.x - club.x, this.player.position.z - club.z);
    this.audio.update(dt, { club: Math.max(0, 1 - dClub / 45), beach: Math.max(0, Math.min(1, (this.player.position.x - 140) / 40)), night: this.clock.isNight, insideClub: this.playerInsideBuilding('club'), heat: this.state.heat });
    this.audio.setEngine(this.inCar, this.ride ? Math.abs(this.ride.speed) / this.ride.maxSpeed : 0);
    this.audio.setRain(this.weather.intensity * (this.playerInsideAnyInterior() || this.inCar ? 0.3 : 1));
    const raining = this.rainNow;
    if (raining !== this.wasRaining) {
      this.wasRaining = raining;
      if (raining) this.toast(t('Rain over Sol Palma. Heat cools a little faster while it lasts.'), 'info', 5000);
    }
    const foggy = this.fogNow > 0.5;
    if (foggy !== this.wasFoggy) {
      this.wasFoggy = foggy;
      if (foggy && this.running) this.toast(t('Fog over the bay. Nobody sees far this morning — cops included.'), 'info', 6000);
    }

    // radio: car stereo while driving, walkman when toggled
    const wantRadio = this.inCar ? this.carRadioOn : this.boomboxOn;
    if (wantRadio && !this.audio.radio.playing) this.audio.radio.start();
    if (!wantRadio && this.audio.radio.playing) this.audio.radio.stop();
    if (this.audio.radio.playing) {
      this.audio.radio.setLevel(this.inCar ? 1 : 0.7);
      this.audio.radio.update(this.uiDt);
    }
    // dancers + beach night crowd only at night
    const night = this.clock.isNight;
    for (const c of this.nightCrowd) {
      if (night && !c.mesh.parent) this.dynamicGroup.add(c.mesh);
      if (!night && c.mesh.parent) this.dynamicGroup.remove(c.mesh);
      c.mesh.visible = night;
    }
    for (const d of this.dancers) {
      d.mesh.visible = night;
      if (night) {
        d.yaw += dt * 2.5;
        d.position.y = 0.15 + Math.abs(Math.sin(performance.now() / 180 + d.position.x)) * 0.25;
        d.syncVisual(dt);
      }
    }

    // payphone cooldown, tips
    this.payphoneCooldown = Math.max(0, this.payphoneCooldown - dt);
    if (this.tips.length) {
      this.tipTimer -= dt;
      if (this.tipTimer <= 0) {
        this.toast(this.tips.shift()!, 'info', 6000);
        this.tipTimer = 6;
      }
    }

    // hotbar selection
    for (let i = 0; i < 8; i++) {
      if (this.input.wasPressed('Digit' + (i + 1)) && !uiOpen && this.hud.selectedSlot !== i) {
        this.hud.selectedSlot = i;
        this.audio.play('tick');
      }
    }

    // the bat: shown when selected, left click swings (pointer must be captured)
    const batOut = !uiOpen && !this.driving && !this.hiding && !this.arrested && !this.cutscene.active && !this.menu.visible && this.state.inventory[this.hud.selectedSlot]?.id === 'bat';
    this.batView.visible = batOut;
    if (batOut && !this.placement && this.swingT <= 0 && this.input.locked && this.input.wasPressed('Mouse0')) this.swingBat();
    if (this.swingT > 0) {
      this.swingT = Math.max(0, this.swingT - dt * 3.2);
      const k = Math.sin((1 - this.swingT) * Math.PI);
      this.batView.rotation.set(0.55 - k * 1.6, 0.1 - k * 0.5, -0.4 - k * 0.7);
    }

    // placement ghost
    if (this.placement) this.updatePlacement();

    // milestones + daily summary
    this.milestoneTimer -= dt;
    if (this.milestoneTimer <= 0) {
      this.milestoneTimer = 2;
      for (const m of checkMilestones(s)) {
        this.audio.play('jingle_goal');
        this.toast(t('GOAL: {v0} — +${v1}. ({v2})', { v0: m.title, v1: m.reward, v2: m.hint }), 'cash', 6000);
      }
      const day = this.clock.day;
      if (day !== s.stats.lastDay) {
        const earned = Math.round(s.stats.earned - s.stats.earnedAtDayStart);
        const sales = s.stats.sales - s.stats.salesAtDayStart;
        s.stats.lastDay = day;
        s.stats.earnedAtDayStart = s.stats.earned;
        s.stats.salesAtDayStart = s.stats.sales;
        this.hud.flash(`DAY ${day}`, '#4ff2e8');
        if (sales > 0 || earned > 0) this.toast(t('NEW DAY {day}: yesterday you made ${earned} from {sales} sales.', { day, earned, sales }), 'pager', 7000);
        if (s.properties.includes('laundromat')) {
          s.cash += FRONT_DAILY_INCOME;
          s.suspicion = Math.max(0, s.suspicion - FRONT_DAILY_SUSPICION);
          this.toast(t('Lucky Laundromat: +${FRONT_DAILY_INCOME} clean money, suspicion -{FRONT_DAILY_SUSPICION}.', { FRONT_DAILY_INCOME, FRONT_DAILY_SUSPICION }), 'cash', 5000);
        }
        const loan = tickLoanDay(s, day);
        if (loan.dueToday) this.toast(t('Pawn shop marker due TODAY: ${v0}. Pay at Sol Palma Pawn before midnight.', { v0: s.loan?.owed ?? 0 }), 'warn', 7000);
        if (loan.late) {
          this.audio.play('error');
          const took = loan.collected ? t(' The collectors took ${n}.', { n: loan.collected }) : t(' The collectors found no cash on you.');
          this.toast(t('MARKER OVERDUE: +20% interest and the collectors asked around (heat +{v0}, suspicion up).{took} {v2}', { v0: loan.late.heat, took, v2: loan.cleared ? t('Marker closed.') : t('Still owed ${n}.', { n: s.loan?.owed ?? 0 }) }), 'warn', 9000);
        }
      }
    }
    // autosave
    this.autosaveTimer -= dt;
    if (this.autosaveTimer <= 0) {
      this.autosaveTimer = 60;
      this.save();
    }

    this.hud.setClickHint(!this.input.locked && !uiOpen && !this.arrested);
    this.hud.speedText = this.driving && this.ride ? `${Math.round(this.ride.mph)} MPH` : null;
    this.hud.stamina = this.player.stamina;
    this.updateCompass();
    this.hudTextTimer -= dt;
    if (this.hudTextTimer <= 0) {
      this.hudTextTimer = 0.2;
      this.objectiveText = this.computeObjective();
      this.orderText = this.currentOrderText();
    }
    this.hud.update(s, this.clock.formatClock(), this.clock.day, this.objectiveText, this.orderText, dt);
  }

  // ------------------------------------------------------------------ NPC updates

  /** Everyone who reacts to deals, horns, cars and chases: regular civilians plus the night crowd after dark. */
  private pedestrians(): Civilian[] {
    return this.clock.isNight ? this.civilians.concat(this.nightCrowd) : this.civilians;
  }

  private updateNPCs(dt: number, safe: boolean): void {
    const px = this.player.position.x;
    const pz = this.player.position.z;
    const py = this.player.position.y;
    const los = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean => this.city.colliders.lineOfSight(ax, ay, az, bx, by, bz, 10);
    const peds = this.pedestrians();
    for (const c of peds) {
      const d2 = (c.position.x - px) ** 2 + (c.position.z - pz) ** 2;
      // LOD: far pedestrians update at a lower rate
      c.lodAccum += dt;
      const step = d2 > 120 * 120 ? 0.5 : d2 > 60 * 60 ? 0.12 : 0;
      if (c.lodAccum < step) continue;
      const ldt = Math.max(dt, c.lodAccum);
      c.lodAccum = 0;
      c.update(ldt, { playerX: px, playerZ: pz, night: this.clock.isNight, gossip: this.gossip });
      if (d2 < 200 * 200) c.syncVisual(ldt);
    }
    const holding = this.state.inventory.some((st) => st && (st.id.startsWith('pkg:') || st.id.startsWith('prod:')));
    for (const p of this.police) {
      const crack = heatMultiplier(this.state, zoneAt(p.position.x)) > 1;
      const result = p.update(dt, { playerX: px, playerZ: pz, playerY: py, heat: this.state.heat + (crack ? 15 : 0), playerSafe: safe, playerHolding: holding, los, sight: this.sight() });
      p.syncVisual(dt);
      if (result === 'arrest' && !this.arrested) this.beginArrest();
      if (result === 'searched') {
        this.state.flags.cleanSearch = true;
        this.state.heat = Math.max(0, this.state.heat - 15);
        this.toast(t('Stop-and-search: you were clean. The officer lost interest (Heat -15).'), 'info', 4000);
      }
      if (p.pstate === 'CHASE') {
        for (const c of peds) if (c.state !== 'FLEE' && c.distanceTo(p.position.x, p.position.z) < 7) c.reactTo(p.position.x, p.position.z, true);
      }
    }
    this.updateCruiser(dt, safe);
    this.wandererTimer -= dt;
    if (this.wandererTimer <= 0) {
      this.wandererTimer = 2;
      this.syncWanderers();
      this.gossip = this.buildGossip();
      this.syncPoliceCount();
    }
    for (const w of this.wanderers.values()) {
      const d2 = (w.position.x - px) ** 2 + (w.position.z - pz) ** 2;
      w.lodAccum += dt;
      const step = d2 > 120 * 120 ? 0.5 : d2 > 60 * 60 ? 0.12 : 0;
      if (w.lodAccum < step) continue;
      const ldt = Math.max(dt, w.lodAccum);
      w.lodAccum = 0;
      w.update(ldt, { playerX: px, playerZ: pz, night: this.clock.isNight });
      w.attend(px, pz, ldt);
      if (d2 < 200 * 200) w.syncVisual(ldt);
    }
    for (const [id, c] of this.customers) {
      c.update(dt, px, pz);
      c.syncVisual(dt);
      if (c.cstate === 'DONE') {
        c.dispose();
        this.dynamicGroup.remove(c.mesh);
        this.interaction.remove('customer_' + id);
        this.customers.delete(id);
      }
    }
  }

  // ------------------------------------------------------------------ orders & customers

  private tryGenerateOrder(): void {
    const s = this.state;
    if (!ordersAllowed(s)) {
      // chapter one: no pages until the first product is bagged, and none while Rico waits for a visit
      this.orderTimer = 5;
      return;
    }
    const pending = pendingOrders(s).length;
    const active = activeOrders(s).length;
    const hasPhone = s.upgrades.includes('eq_brickphone');
    const maxPending = hasPhone ? 3 : 2;
    const maxActive = hasPhone ? 4 : 3;
    if (pending >= maxPending || active >= maxActive) {
      this.orderTimer = 20;
      return;
    }
    const first = !s.flags.firstOrderSent;
    // the scripted first page comes from Tasha, but never let an unavailable Tasha block the pager forever
    const o = generateOrder(s, { now: this.clock.totalMinutes, customerId: first ? 'tasha' : undefined, simple: first || s.stats.sales < 2 }) ?? (first ? generateOrder(s, { now: this.clock.totalMinutes, simple: true }) : null);
    if (o) {
      if (first) s.flags.firstOrderSent = true;
      this.announceOrder(o);
      this.orderTimer = (hasPhone ? 45 : 75) + Math.random() * (hasPhone ? 40 : 70);
    } else this.orderTimer = 15;
  }

  private announceOrder(o: Order): void {
    this.audio.play('pager');
    this.hud.pagerNotify(pagerLine(o, describeRequest(this.state, o)));
    const c = CUSTOMER_MAP[o.customerId];
    this.toast(t('BEEP BEEP · Page from {v0}: {v1}x {v2} for ${v3}. Press P.', { v0: c.name, v1: o.qty, v2: describeRequest(this.state, o), v3: o.price }), 'pager', 6000);
    this.pager.render();
  }

  acceptOrder(id: number): void {
    if (!acceptOrder(this.state, id)) return;
    const o = this.state.orders.find((x) => x.id === id)!;
    this.spawnCustomerFor(o);
    this.audio.play('confirm');
    this.toast(t('Accepted. Meet {v0} at {v1}.', { v0: CUSTOMER_MAP[o.customerId].name.split(' ')[0], v1: landmarkName(o.locationId) }));
  }

  declineOrder(id: number): void {
    if (declineOrder(this.state, id)) this.audio.play('click');
  }

  haggle(id: number, markup: number): void {
    const r = counterOffer(this.state, id, markup);
    if (!r) return;
    const o = this.state.orders.find((x) => x.id === id)!;
    const who = CUSTOMER_MAP[o.customerId].name.split(' ')[0];
    if (r.outcome === 'accepted') {
      this.audio.play('cash');
      this.toast(t('{who}: "{v1}" — new price ${v2}.', { who, v1: r.line, v2: r.price }), 'cash');
    } else if (r.outcome === 'countered') {
      this.audio.play('pager');
      this.toast(t('{who}: "{v1}"', { who, v1: r.line }), 'pager', 5000);
    } else {
      this.audio.play('error');
      this.toast(t('{who}: "{v1}" — order lost.', { who, v1: r.line }), 'warn', 5000);
    }
  }

  private spawnCustomerFor(o: Order): void {
    if (this.customers.has(o.id)) return;
    const l = LANDMARKS.find((x) => x.id === o.locationId) ?? LANDMARKS[0];
    const def = CUSTOMER_MAP[o.customerId];
    const npc = new CustomerNPC(def, o.id, l.x + (Math.random() - 0.5) * 2, l.z + (Math.random() - 0.5) * 2, this.city.colliders, this.city.waypoints);
    npc.setTier(relationshipTier(this.state.customers[def.id]?.relationship ?? 0));
    this.customers.set(o.id, npc);
    this.dynamicGroup.add(npc.mesh);
    this.interaction.add({
      id: 'customer_' + o.id,
      position: npc.position,
      radius: 3.2,
      prompt: () => {
        if (npc.cstate !== 'WAITING') return null;
        const order = this.state.orders.find((x) => x.id === o.id);
        if (!order || order.status !== 'accepted') return null;
        const have = findFulfillingItem(this.state, order);
        const late = this.clock.totalMinutes > order.windowEnd;
        return have ? t('[E] SELL {v0}x {v1} · ${v2}{v3}', { v0: order.qty, v1: describeRequest(this.state, order), v2: late ? Math.round(order.price * 0.7) : order.price, v3: late ? t(' (LATE)') : '' }) : t('[E] TALK · {v0} (needs {v1}x {v2})', { v0: def.name.split(' ')[0], v1: order.qty, v2: describeRequest(this.state, order) });
      },
      onInteract: () => this.dealWith(npc),
    });
  }

  /** Pedestrian gossip about the player's named products once they are known around town. */
  private buildGossip(): string[] {
    const s = this.state;
    const sold = new Map<string, number>();
    for (const o of s.orders) if (o.status === 'completed' && o.recipeKey) sold.set(o.recipeKey, (sold.get(o.recipeKey) ?? 0) + o.qty);
    const out: string[] = [];
    for (const r of Object.values(s.recipes)) {
      if (!r.customName) continue;
      const n = (sold.get(r.key) ?? 0) + (s.stats.sales >= 3 ? 1 : 0);
      if (n < 2) continue;
      out.push(`Have you tried ${r.customName}?`, `${r.customName}… who names these?`, `My cousin swears by ${r.customName}.`);
    }
    if (s.stats.arrests > 0) out.push('Heard somebody got busted downtown.');
    const ev = activeEvent(s);
    if (ev?.id === 'crackdown') out.push(`Cops are all over the ${ev.param} today.`);
    if (ev?.id === 'club_night') out.push('Mirage is going OFF tonight.');
    return out;
  }

  /** Keep one wandering NPC per customer who is not currently waiting at a meeting spot. */
  private syncWanderers(): void {
    const s = this.state;
    const busy = new Set(s.orders.filter((o) => o.status === 'pending' || o.status === 'accepted' || o.status === 'runner').map((o) => o.customerId));
    const h = this.clock.hour;
    const awake = (pref: 'day' | 'night' | 'any'): boolean => (pref === 'any' ? true : pref === 'day' ? h >= 7 && h < 22 : h >= 17 || h < 5);
    for (const def of CUSTOMERS) {
      const cs = s.customers[def.id];
      const shouldExist = !busy.has(def.id) && awake(def.timePref);
      const existing = this.wanderers.get(def.id);
      if (shouldExist && !existing) {
        const zoneNodes = this.city.waypoints.nodes.filter((n) => n.zone === def.homeZone);
        const n = zoneNodes.length ? zoneNodes[Math.floor(Math.random() * zoneNodes.length)] : this.city.waypoints.random();
        // do not pop into existence right in front of the player
        if (Math.hypot(n.x - this.player.position.x, n.z - this.player.position.z) < 25) continue;
        const w = new WanderingCustomer(def, n.x, n.z, this.city.colliders, this.city.waypoints, !!cs?.unlocked);
        this.wanderers.set(def.id, w);
        this.dynamicGroup.add(w.mesh);
        this.interaction.add({
          id: w.id,
          position: w.position,
          radius: 3.2,
          prompt: () => this.wandererPrompt(w),
          onInteract: () => this.talkToWanderer(w),
        });
      } else if (!shouldExist && existing) {
        existing.dispose();
        this.dynamicGroup.remove(existing.mesh);
        this.interaction.remove(existing.id);
        this.wanderers.delete(def.id);
      } else if (existing) {
        existing.setUnlockedIfChanged(!!cs?.unlocked);
      }
    }
  }

  private wandererPrompt(w: WanderingCustomer): string | null {
    const s = this.state;
    const cs = s.customers[w.def.id];
    const first = w.def.name.split(' ')[0];
    if (!cs?.unlocked) {
      const sample = this.sampleItem();
      return sample ? t('[E] OFFER SAMPLE (1x {v0}) · {first}, {v2}', { v0: resolveItem(s, sample).name, first, v2: w.def.personality }) : t('[E] TALK · {first} ({v1}) — bring a sample', { first, v1: w.def.personality });
    }
    const gate = canStreetSell(s, w.def.id, this.clock.totalMinutes);
    if (gate.ok) return t('[E] SELL {v0} · ${v1}/unit · {first}', { v0: resolveItem(s, gate.item.id).name, v1: streetUnitPrice(s, w.def.id, gate.item.key), first });
    return t('[E] TALK · {first} ({v1})', { first, v1: w.def.personality });
  }

  /** Packaged product to hand out: the selected hotbar slot if it is one, else the first packaged stack. */
  private sampleItem(): string | null {
    const sel = this.state.inventory[this.hud.selectedSlot];
    if (sel && sel.id.startsWith('pkg:')) return sel.id;
    const any = this.state.inventory.find((st) => st && st.id.startsWith('pkg:'));
    return any ? any.id : null;
  }

  private talkToWanderer(w: WanderingCustomer): void {
    const s = this.state;
    const def = w.def;
    const cs = s.customers[def.id];
    const first = def.name.split(' ')[0];
    if (!cs?.unlocked) {
      const sample = this.sampleItem();
      if (!sample) {
        w.say(`Do I know you? …No. Come back with something.`, '#b0bec5', 3);
        this.toast(t('{first} ({v1}) does not know you yet. Offer a free sample of a packaged product to win them over.', { first, v1: def.personality }), 'info', 5000);
        return;
      }
      const r = offerSample(s, def.id, sample);
      if (!r.ok) return;
      w.say(r.line!, r.unlocked ? '#7dff9a' : '#ffd166', 4);
      if (r.unlocked) {
        this.audio.play('jingle_customer');
        this.toast(t('NEW CUSTOMER: {v0} liked the sample{v1}. They will start paging you.', { v0: def.name, v1: r.matched ? '' : t(' (eventually)') }), 'pager', 6000);
        w.setUnlocked(true);
        const eff = r.matched ? def.prefEffects[0] : null;
        if (eff) w.reactTo(this.player.position.x, this.player.position.z, false);
      } else {
        this.audio.play('click');
        this.toast(t('{first}: "{v1}"', { first, v1: r.line }), 'info', 5000);
      }
      this.save();
      return;
    }
    const tierBeforeStreet = relationshipTier(s.customers[def.id].relationship);
    const r = streetSale(s, def.id, this.clock.totalMinutes);
    if (!r.ok) {
      // small talk: sometimes they point you at a friend you have not met yet
      const locked = CUSTOMERS.filter((c) => c.introducedBy === def.id && !s.customers[c.id]?.unlocked);
      if (locked.length && Math.random() < 0.5) {
        const f = locked[Math.floor(Math.random() * locked.length)];
        const zone = f.homeZone === 'beach' ? 'the beach strip' : f.homeZone === 'docks' ? 'the docks' : 'downtown';
        const when = f.timePref === 'night' ? ' after dark' : f.timePref === 'day' ? ' during the day' : '';
        const tip = `You know ${f.name.split(' ')[0]}? ${f.personality}, hangs around ${zone}${when}. Loves ${f.prefBase}. Bring a sample.`;
        w.say(`Ask ${f.name.split(' ')[0]} about ${f.prefBase}.`, '#ffd166', 3);
        this.toast(t('{first}: "{tip}"', { first, tip }), 'info', 6000);
        return;
      }
      const hint = r.reason === 'cooldown' ? t('"I\'m good for now. Page you later."') : r.reason === 'too_pricey' ? t('"That is way over what I\'ve got on me. Got anything plain?"') : r.reason === 'dealer' ? t('"Vince takes care of me now. Nice guy. Weird sunglasses."') : r.reason === 'bored' ? t('"Same stuff again? Surprise me next time."') : t('"I like {base} with {effects}. Got any?"', { base: def.prefBase, effects: def.prefEffects.map(tn).join(t(' or ')) });
      w.say(hint.replace(/"/g, ''), '#ffd166', 3);
      this.toast(t('{first}: {hint}', { first, hint }), 'info', 4000);
      return;
    }
    this.audio.play('cash');
    this.hud.flash(r.wonBack ? `WON BACK FROM SAL  +$${r.earned}` : `STREET DEAL  +$${r.earned}`, '#7dff9a', flashScale(r.earned!));
    this.announceTier(def.id, tierBeforeStreet);
    if (r.wonBack) this.toast(t("{v0} is back with you. Sal's crew can keep walking.", { v0: def.name.split(' ')[0] }), 'cash', 5000);
    const name = recipeDisplayName(s, r.itemKey!);
    this.toast(t('+${v0} · Street deal: {v1}x {name} to {v3}{v4}', { v0: r.earned, v1: r.qty, name, v3: def.name, v4: r.trendHit ? t(' · TREND BONUS +25%') : '' }), 'cash');
    for (const id of r.unlocked ?? []) this.announceUnlock(id);
    w.say(tn(def.lines.thanks), '#7dff9a', 3);
    // same exposure rules as a pager deal, but a street corner is a little riskier
    let witnessed = false;
    for (const p of this.police) {
      if (p.distanceTo(w.position.x, w.position.z) < 28 * this.sight() && this.city.colliders.lineOfSight(p.position.x, p.position.y + 1.6, p.position.z, w.position.x, w.position.y + 1.2, w.position.z, 10)) {
        witnessed = true;
        break;
      }
    }
    const byCruiser = !witnessed && this.cruiserSees(w.position.x, w.position.z);
    if (byCruiser) witnessed = true;
    const zoneMult = heatMultiplier(s, zoneAt(w.position.x));
    const crackdown = crackdownIn(s, zoneAt(w.position.x));
    if (witnessed) {
      witnessedDeal(s, r.earned!, zoneMult);
      if (crackdown) addHeat(s, 10);
      this.audio.play('siren');
      this.toast(byCruiser ? 'The patrol cruiser rolled past mid-deal. HEAT is rising — move.' : crackdown ? 'Crackdown day and a cop saw that street deal. HEAT spikes!' : zoneMult > 1 ? 'A cop saw that street deal — under curfew. HEAT is rising fast.' : 'A cop saw that street deal. HEAT is rising.', 'warn');
    } else if (Math.random() < def.risk * 0.4 * zoneMult) addHeat(s, 5);
    this.save();
  }

  private despawnCustomer(orderId: number): void {
    const c = this.customers.get(orderId);
    if (!c) return;
    if (c.cstate === 'WAITING' || c.cstate === 'TALK') c.startLeaving();
  }

  private dealWith(npc: CustomerNPC): void {
    const s = this.state;
    const order = s.orders.find((x) => x.id === npc.orderId);
    if (!order || order.status !== 'accepted') return;
    const def = npc.def;
    const have = findFulfillingItem(s, order);
    if (!have) {
      npc.say(tn(def.lines.greet), '#ffd166', 3);
      this.toast(t('{v0}: "{v1}" — bring {v2}x {v3}.', { v0: def.name.split(' ')[0], v1: tn(def.lines.greet), v2: order.qty, v3: describeRequest(s, order) }));
      return;
    }
    const tierBefore = relationshipTier(s.customers[order.customerId].relationship);
    const r = completeSale(s, order.id, this.clock.totalMinutes);
    if (!r.ok) return;
    this.audio.play('cash');
    this.hud.flash(r.wonBack ? `WON BACK FROM SAL  +$${r.earned}` : `SOLD  +$${r.earned}`, '#7dff9a', flashScale(r.earned!));
    const name = recipeDisplayName(s, r.itemKey!);
    this.toast(t('+${v0} · Sold {v1}x {name} to {v3}{v4}{v5}', { v0: r.earned, v1: order.qty, name, v3: def.name, v4: r.onTime ? '' : t(' (late, 30% off)'), v5: r.trendHit ? t(' · TREND BONUS +25%') : '' }), 'cash');
    const rel = s.customers[def.id];
    this.toast(t('{v0} relationship {v1} ({v2})', { v0: def.name.split(' ')[0], v1: rel.relationship, v2: relationshipTier(rel.relationship) }), 'info', 2500);
    this.announceTier(def.id, tierBefore);
    for (const id of r.unlocked ?? []) this.announceUnlock(id);
    // ---- streamer moments
    const parsed = parseRecipeKey(r.itemKey!);
    const effects = parsed ? computeRecipe(parsed.base, parsed.mods).effects : [];
    const custom = s.recipes[r.itemKey!]?.customName;
    npc.cstate = 'TALK';
    const tooStrong = !!parsed && parsed.mods.length >= 3;
    const reaction: Effect | null = tooStrong ? 'CHAOTIC' : effects.length ? effects[Math.floor(Math.random() * effects.length)] : null;
    if (tooStrong) {
      this.toast(t('{v0} was not ready for a triple-modifier {name}. Half the block is watching.', { v0: def.name.split(' ')[0], name }), 'warn', 5000);
      addHeat(s, 8);
    }
    const line = custom && Math.random() < 0.5 ? `"${custom}"? Who names these things?!` : reaction ? REACTION_LINES[reaction][Math.floor(Math.random() * 3)] : def.lines.thanks;
    npc.say(line, reaction === 'CHAOTIC' || reaction === 'ENERGY' ? '#ff5c5c' : '#7dff9a', 3.5);
    setTimeout(() => npc.startReaction(reaction), 900);
    // loud reactions draw attention
    const loud = tooStrong || reaction === 'SOCIAL' || reaction === 'CHAOTIC' || reaction === 'CONFIDENT' || reaction === 'ENERGY';
    if (loud) {
      for (const c of this.pedestrians()) if (c.distanceTo(npc.position.x, npc.position.z) < (tooStrong ? 22 : 14)) c.reactTo(npc.position.x, npc.position.z, (tooStrong || reaction === 'CHAOTIC') && Math.random() < 0.6);
    }
    // police witness check
    let witnessed = false;
    for (const p of this.police) {
      const d = p.distanceTo(npc.position.x, npc.position.z);
      if (d < (loud ? 40 : 26) * this.sight() && this.city.colliders.lineOfSight(p.position.x, p.position.y + 1.6, p.position.z, npc.position.x, npc.position.y + 1.2, npc.position.z, 10)) {
        witnessed = true;
        break;
      }
    }
    const byCruiser = !witnessed && this.cruiserSees(npc.position.x, npc.position.z);
    if (byCruiser) witnessed = true;
    const zoneMult = heatMultiplier(s, zoneAt(npc.position.x));
    const crackdown = crackdownIn(s, zoneAt(npc.position.x));
    if (witnessed) {
      witnessedDeal(s, r.earned!, zoneMult);
      if (crackdown) addHeat(s, 10);
      this.audio.play('siren');
      this.toast(byCruiser ? 'The patrol cruiser rolled past mid-deal. HEAT is rising — get out of sight.' : crackdown ? 'A cop saw that — and it is crackdown day here. HEAT spikes!' : zoneMult > 1 ? 'A cop saw that — under curfew. HEAT is rising fast.' : 'A cop saw that. HEAT is rising — get out of sight.', 'warn');
    } else if (loud && def.risk > 0.3) {
      addHeat(s, 6);
    } else if (Math.random() < def.risk * 0.3) {
      addHeat(s, 4);
    }
    if (this.clock.isNight && Math.random() < 0.15) this.toast(t('Night deal bonus: nobody looks twice after dark.'), 'info', 2500);
    this.save();
  }

  private checkCancellations(): void {
    const s = this.state;
    for (const o of activeOrders(s)) {
      if (o.status !== 'accepted' || this.cancelChecked.has(o.id)) continue;
      const npc = this.customers.get(o.id);
      if (!npc) continue;
      const d = npc.distanceTo(this.player.position.x, this.player.position.z);
      if (d > 40 && d < 80) {
        this.cancelChecked.add(o.id);
        const def = npc.def;
        if (Math.random() > def.reliability && s.flags.firstOrderSent && s.stats.sales > 0) {
          o.status = 'failed';
          this.audio.play('pager');
          this.hud.pagerNotify(t('{v0}: CANT MAKE IT\nSORRY. NEXT TIME.', { v0: def.name.split(' ')[0].toUpperCase() }), '[P] PAGER');
          this.toast(t('{v0} cancelled while you were on the way. Classic {v1}.', { v0: def.name.split(' ')[0], v1: def.personality }), 'warn');
          npc.startLeaving();
        }
      }
    }
  }

  private announceUnlock(id: string): void {
    const c = CUSTOMER_MAP[id];
    if (!c) return;
    this.audio.play('jingle_customer');
    this.toast(t('NEW CUSTOMER: {v0} ({v1}) heard about you from {v2}.', { v0: c.name, v1: c.personality, v2: CUSTOMER_MAP[c.introducedBy ?? '']?.name.split(' ')[0] ?? 'a friend' }), 'pager', 6000);
  }

  // ------------------------------------------------------------------ actions (GameAPI)

  now(): number {
    return this.clock.totalMinutes;
  }

  toast(msg: string, kind: ToastKind = 'info', ms?: number): void {
    this.hud.toast(msg, kind, ms);
  }

  sfx(name: SfxName): void {
    this.audio.play(name);
  }

  openPanel(id: string): void {
    if (this.cutscene.active || this.arrested) return;
    if (this.placement) this.cancelPlacement();
    if (this.openPanelId && this.openPanelId !== id) this.panels[this.openPanelId].close();
    this.openPanelId = id;
    this.expectUnlock = true;
    this.input.releaseLock();
    this.panels[id].open();
    this.audio.play(id === 'pager-panel' ? 'page' : 'open');
  }

  /**
   * Close the open panel. Escape cannot grant pointer lock in browsers, so a close by Escape leaves the
   * mouse free (the CLICK TO CAPTURE hint shows) instead of firing a request that fails; the short grace
   * keeps a lock change around the close from opening the pause menu.
   */
  closePanel(relock = true): void {
    if (!this.openPanelId) return;
    this.panels[this.openPanelId].close();
    this.openPanelId = null;
    this.audio.play('close');
    this.inventoryUI.storageProperty = null;
    this.input.uiCaptured = false;
    this.lockGraceUntil = performance.now() + 1200;
    if (relock) this.input.requestLock();
  }

  sendRunner(id: number): void {
    const r = assignRunner(this.state, id);
    if (!r.ok) {
      this.audio.play('error');
      this.toast(r.reason === 'no_stock' ? 'Runner needs the packaged product in your STORAGE first.' : r.reason === 'busy' ? 'Dizzy is already on a run.' : r.reason === 'queue_full' ? 'Dizzy already has two runs lined up. This one you walk yourself.' : r.reason === 'late' ? 'They are already waiting past the window: walk this one yourself (30% off).' : 'Cannot send the runner.', 'warn');
      return;
    }
    const o = this.state.orders.find((x) => x.id === id)!;
    const l = LANDMARKS.find((x) => x.id === o.locationId)!;
    if (r.queued) {
      this.audio.play('click');
      this.toast(t('Queued for Dizzy: {v0}x {v1} to {v2} (after his current run).', { v0: o.qty, v1: describeRequest(this.state, o), v2: l.name }));
      this.despawnCustomer(o.id);
      return;
    }
    if (this.runnerNPC) {
      const home = this.runnerHome(r.property);
      this.runnerNPC.setHome(home.x, home.z);
      this.runnerNPC.setTrip(l.x, l.z);
      this.runnerTripFor = o.id;
      this.runnerNPC.say('On it, boss!', '#7fffd4', 2.5);
    }
    this.audio.play('click');
    this.toast(t('Dizzy grabbed {v0}x {v1} from {v2} storage and is heading to {v3}.', { v0: o.qty, v1: describeRequest(this.state, o), v2: r.property, v3: l.name }));
    this.despawnCustomer(o.id);
  }

  buy(shopId: string, itemId: string, qty: number): PurchaseResult {
    const r = buyFromShop(this.state, shopId, itemId, qty);
    if (r.ok && shopId === 'supplier') this.state.flags.boughtFromRico = true;
    if (r.ok && ITEMS[itemId].category === 'equipment' && !itemId.endsWith('_kit')) this.toast(t('Bought {v0}: {v1}', { v0: ITEMS[itemId].name, v1: ITEMS[itemId].desc }), 'cash', 5000);
    return r;
  }

  buyDelivered(shopId: string, itemId: string, qty: number): PurchaseResult {
    const r = buyDelivered(this.state, shopId, itemId, qty);
    if (r.ok && shopId === 'supplier') this.state.flags.boughtFromRico = true;
    if (r.ok) this.toast(t('{qty}x {v1} will be dropped at Warehouse 7 storage.', { qty, v1: ITEMS[itemId].name }), 'info', 2500);
    return r;
  }

  prep(plan: PrepPlan): PrepResult {
    return executePrep(this.state, plan);
  }

  packageProduct(key: string, qty: number): PackageResult {
    return executePackage(this.state, key, qty);
  }

  nameRecipe(key: string, name: string): boolean {
    const ok = nameRecipe(this.state, key, name);
    if (ok) this.toast(t('Product named "{v0}".', { v0: this.state.recipes[key].customName }));
    return ok;
  }

  deposit(property: string, id: string, qty: number): number {
    const n = depositToStorage(this.state, property, id, qty);
    if (n > 0) this.audio.play('click');
    else this.toast(t('Storage is full.'), 'warn');
    return n;
  }

  withdraw(property: string, id: string, qty: number): number {
    const n = withdrawFromStorage(this.state, property, id, qty);
    if (n > 0) this.audio.play('click');
    else this.toast(t('No room in your backpack.'), 'warn');
    return n;
  }

  hireRunner(): boolean {
    if (!hireRunner(this.state, RUNNER_HIRE_PRICE)) {
      this.audio.play('error');
      this.toast(t('Dizzy wants ${RUNNER_HIRE_PRICE} up front.', { RUNNER_HIRE_PRICE }), 'warn');
      return false;
    }
    this.audio.play('unlock');
    this.hud.flash(t('DIZZY JOINED THE CREW'), '#7fffd4');
    this.toast(t('Dizzy is on the payroll! Stock packaged products in STORAGE, then use SEND RUNNER on the pager. Dizzy keeps 20%.'), 'cash', 8000);
    this.createRunnerNPC();
    this.updateRunnerContact();
    this.save();
    return true;
  }

  dealerGive(itemId: string, qty: number): number {
    const n = giveDealerStock(this.state, itemId, qty);
    if (n > 0) this.audio.play('click');
    else this.toast(t('Vince cannot carry more.'), 'warn');
    return n;
  }
  dealerTake(itemId: string, qty: number): number {
    const n = takeDealerStock(this.state, itemId, qty);
    if (n > 0) this.audio.play('click');
    else this.toast(t('No room in your backpack.'), 'warn');
    return n;
  }
  dealerAssign(customerId: string, on: boolean): boolean {
    const ok = on ? assignDealerCustomer(this.state, customerId) : unassignDealerCustomer(this.state, customerId);
    if (ok) {
      this.audio.play('click');
      const first = CUSTOMER_MAP[customerId].name.split(' ')[0];
      this.toast(on ? `${first} now buys from Vince. One less page for you.` : `${first} is back on your pager.`);
      this.save();
    }
    return ok;
  }
  dealerCollect(): number {
    const n = collectDealerCash(this.state);
    if (n > 0) {
      this.audio.play('collect');
      this.toast(t('Collected ${n} from Vince.', { n }), 'cash');
      this.save();
    }
    return n;
  }

  private talkToVince(): void {
    const s = this.state;
    if (s.dealer?.hired) {
      this.openPanel('dealer-panel');
      return;
    }
    if (s.cash < DEALER_HIRE_PRICE) {
      this.toast(t('Vince: "I move product for people who have product. ${DEALER_HIRE_PRICE} buys my corner. You have ${v1}."', { DEALER_HIRE_PRICE, v1: Math.floor(s.cash) }), 'info', 5000);
      this.audio.play('error');
      return;
    }
    if (!this.confirmTwice('dealer', t('Hire Vince as a dealer for ${DEALER_HIRE_PRICE}? Give him stock, assign customers, collect cash', { DEALER_HIRE_PRICE }))) return;
    if (hireDealer(s, DEALER_HIRE_PRICE)) {
      this.audio.play('unlock');
      this.hud.flash(t('VINCE JOINED THE CREW'), '#7fffd4');
      this.toast(t('Vince works for you now. Hand him packaged product, assign up to 5 customers, and come back for the cash.'), 'cash', 8000);
      this.save();
      this.openPanel('dealer-panel');
    }
  }

  assignWorker(recipeKey: string | null): boolean {
    const ok = assignWorkerRecipe(this.state, recipeKey);
    if (ok) this.toast(recipeKey ? `Marisol will keep making ${recipeDisplayName(this.state, recipeKey)} from storage.` : 'Marisol is taking a break.');
    return ok;
  }

  private updateWorkerFigure(): void {
    if (this.workerFigure) {
      this.dynamicGroup.remove(this.workerFigure);
      this.workerFigure = null;
    }
    const contact = this.city.objects.find((o) => o.kind === 'worker_contact');
    if (contact) contact.mesh.visible = !this.state.worker?.hired;
    if (!this.state.worker?.hired) return;
    const property = this.state.properties.includes(this.state.worker.property) ? this.state.worker.property : 'safehouse';
    const station = [...this.city.objects, ...this.placedObjects].find((o) => o.kind === 'prep_table' && o.property === property) ?? this.city.objects.find((o) => o.kind === 'storage' && o.property === property);
    const fig = makeFigure('#8e24aa', '#c68642', '#263238', 'marisol');
    const label = makeLabel('MARISOL · WORKER', '#e1bee7');
    label.position.y = 2.3;
    fig.add(label);
    const p = station ? station.position : new THREE.Vector3(WAREHOUSE_SIGN.x - 6, 0.15, WAREHOUSE_SIGN.z);
    fig.position.set(p.x, 0.15, p.z + 1.4);
    fig.rotation.y = Math.PI;
    this.dynamicGroup.add(fig);
    this.workerFigure = fig;
  }

  /** Returns true on the second press within 5 seconds; otherwise asks for confirmation. */
  private confirmTwice(key: string, question: string): boolean {
    const now = performance.now();
    if (this.pendingConfirm && this.pendingConfirm.key === key && now < this.pendingConfirm.until) {
      this.pendingConfirm = null;
      return true;
    }
    this.pendingConfirm = { key, until: now + 5000 };
    this.audio.play('click');
    this.toast(t('{question} — press E again to confirm.', { question }), 'pager', 5000);
    return false;
  }

  private talkToMarisol(): void {
    const s = this.state;
    if (s.worker?.hired) return;
    if (!s.properties.includes('warehouse')) {
      this.toast(t("Marisol: \"I do production work, but not in somebody's back room. Get a real workspace and we talk.\""), 'info', 5000);
      return;
    }
    if (s.cash < WORKER_HIRE_PRICE) {
      this.toast(t('Marisol: "${WORKER_HIRE_PRICE} and I run your prep line all day. You have ${v1}."', { WORKER_HIRE_PRICE, v1: Math.floor(s.cash) }), 'info', 5000);
      this.audio.play('error');
      return;
    }
    if (!this.confirmTwice('worker', t('Hire Marisol for ${WORKER_HIRE_PRICE}? She turns warehouse supplies into packaged product non-stop', { WORKER_HIRE_PRICE }))) return;
    if (hireWorker(s, WORKER_HIRE_PRICE, 'warehouse')) {
      this.audio.play('unlock');
      this.hud.flash(t('MARISOL JOINED THE CREW'), '#7fffd4');
      this.toast(t('Marisol is hired! Stock base supplies, modifiers and baggies in WAREHOUSE STORAGE, then assign her a recipe at a PREP TABLE.'), 'cash', 9000);
      this.updateWorkerFigure();
      this.save();
    }
  }

  private talkToTeddy(): void {
    const s = this.state;
    if (s.handler?.hired) return;
    if (!s.dealer?.hired) {
      this.toast(t('Teddy: "I move product to a corner. You do not have a corner. Go hire Vince at the arcade, then we talk."'), 'info', 6000);
      return;
    }
    if (s.cash < HANDLER_HIRE_PRICE) {
      this.audio.play('error');
      this.toast(t('Teddy: "${HANDLER_HIRE_PRICE} and Vince never runs dry. You have ${v1}."', { HANDLER_HIRE_PRICE, v1: Math.floor(s.cash) }), 'info', 5000);
      return;
    }
    if (!this.confirmTwice('handler', t('Hire Teddy for ${HANDLER_HIRE_PRICE}? Every hour he carries up to 20 packaged units from Warehouse 7 storage to Vince', { HANDLER_HIRE_PRICE }))) return;
    if (hireHandler(s, HANDLER_HIRE_PRICE)) {
      this.audio.play('unlock');
      this.hud.flash(t('TEDDY JOINED THE CREW'), '#ffd180');
      this.toast(t("Teddy is hired! Keep packaged product in WAREHOUSE STORAGE and he keeps Vince's corner stocked. Now and then a trip meets a patrol."), 'cash', 9000);
      this.save();
    }
  }

  private talkToDizzy(): void {
    if (this.state.runner?.hired) return;
    const s = this.state;
    if (s.cash < RUNNER_HIRE_PRICE) {
      this.toast(t("Dizzy: \"I run packages all over town. ${RUNNER_HIRE_PRICE} and I'm yours. You got ${v1}. Come back richer.\"", { RUNNER_HIRE_PRICE, v1: Math.floor(s.cash) }), 'info', 5000);
      this.audio.play('error');
      return;
    }
    if (this.confirmTwice('runner', t('Hire Dizzy for ${RUNNER_HIRE_PRICE}? Dizzy delivers orders from your storage and keeps 20%', { RUNNER_HIRE_PRICE }))) this.hireRunner();
  }

  buyWarehouse(): boolean {
    const s = this.state;
    if (s.properties.includes('warehouse')) return false;
    if (s.cash < WAREHOUSE_PRICE) {
      this.audio.play('error');
      this.toast(t('Warehouse 7 costs ${WAREHOUSE_PRICE}. You have ${v1}.', { WAREHOUSE_PRICE, v1: Math.floor(s.cash) }), 'warn');
      return false;
    }
    if (!this.confirmTwice('warehouse', t('Buy Warehouse 7 for ${WAREHOUSE_PRICE}? Big storage, room for equipment, runner base', { WAREHOUSE_PRICE }))) return false;
    spendCash(s, WAREHOUSE_PRICE);
    s.properties.push('warehouse');
    s.storage.warehouse = s.storage.warehouse ?? [];
    this.audio.play('jingle_property');
    this.hud.flash(t('WAREHOUSE 7 IS YOURS'), '#ffd166');
    this.establishingShot('warehouse', 'WAREHOUSE 7', 'storage · equipment · your crew');
    this.toast(t('YOU OWN WAREHOUSE 7. Buy station kits at the pawn shop and place them inside (walk in with a kit, press B).'), 'cash', 8000);
    if (!s.crewName) this.toast(t('Name your operation at the fax/ledger in your back room — it goes up in neon on the warehouse.'), 'info', 7000);
    this.updateWarehouseSign();
    this.refreshCrewSign();
    if (this.runnerNPC) {
      const home = this.runnerHome();
      this.runnerNPC.setHome(home.x, home.z);
    }
    this.save();
    return true;
  }

  rest(): void {
    const s = this.state;
    const h = this.clock.hour;
    // sleeping is a night-time reset, not a day-skip button (each skipped day would pay the laundromat and cool suspicion)
    if (h >= 7 && h < 19) {
      this.audio.play('error');
      this.toast(t('Too early to sleep. The bed is for nights (after 19:00) — it is {v0}.', { v0: this.clock.formatClock() }), 'warn');
      return;
    }
    const target = h < 7 ? 7 : 7 + 24;
    const add = (target - h) * 60;
    this.clock.totalMinutes += add;
    s.clockMinutes = this.clock.totalMinutes;
    s.heat = 0;
    s.suspicion = Math.max(0, s.suspicion - 5);
    this.audio.play('unlock');
    this.toast(t('You slept until morning. Heat is gone.'), 'info');
    for (const o of expireOrders(s, this.clock.totalMinutes)) {
      this.despawnCustomer(o.id);
      if (o.expiredFrom === 'accepted' && s.customers[o.customerId]) s.customers[o.customerId].relationship = Math.max(0, s.customers[o.customerId].relationship - 2);
    }
    this.orderTimer = 10;
    this.save();
  }

  callAround(): void {
    if (!this.state.upgrades.includes('eq_brickphone')) return;
    if (this.payphoneCooldown > 0) {
      this.toast(t('Battery is recharging… try again in {v0}s.', { v0: Math.ceil(this.payphoneCooldown) }), 'warn');
      return;
    }
    this.usePayphone(true);
  }

  private usePayphone(fromPhone = false): void {
    const s = this.state;
    // broke players still get to call around: the operator takes pity
    const broke = s.cash < 1;
    if (pendingOrders(s).length >= 2) {
      this.toast(t('Your pager is already full of messages. Deal with those first.'), 'warn');
      return;
    }
    if (!fromPhone && !broke) spendCash(s, 1);
    this.payphoneCooldown = fromPhone ? 30 : 45;
    this.audio.play('click');
    const o = generateOrder(s, { now: this.clock.totalMinutes, simple: s.stats.sales < 2 });
    if (o) {
      this.toast(t('You called around… someone paged you back.'), 'info');
      setTimeout(() => { if (this.running && this.state.orders.includes(o) && o.status === 'pending') this.announceOrder(o); }, 1200);
    } else this.toast(t('Nobody is picking up right now. Try later.'), 'warn');
  }

  private buyDrink(): void {
    if (!spendCash(this.state, 5)) {
      this.toast(t('Bartender: "No money, no drink."'), 'warn');
      return;
    }
    this.audio.play('cash');
    this.state.heat = Math.max(0, this.state.heat - 5);
    this.toast(t('You nurse a $5 drink and blend in. Heat -5.'));
  }

  private syncStarterBox(): void {
    const box = this.city.objects.find((o) => o.kind === 'starter_box');
    if (!box) return;
    const taken = !!this.state.flags.starterTaken;
    box.mesh.visible = !taken;
    if (box.colliders && box.colliders.length) {
      const present = this.city.colliders.boxes.includes(box.colliders[0]);
      if (taken && present) this.city.colliders.removeMany(box.colliders);
      if (!taken && !present) for (const c of box.colliders) this.city.colliders.add(c);
    }
  }

  private takeStarterBox(): void {
    const s = this.state;
    if (s.flags.starterTaken) return;
    const leftPulp = addItem(s, 'pulp_sunset', 3);
    const leftBags = addItem(s, 'baggies', 6);
    const leftBat = addItem(s, 'bat', 1);
    if (leftPulp > 0 || leftBags > 0 || leftBat > 0) {
      // not enough room: take back only what the box managed to add and let the player make space
      removeItem(s, 'pulp_sunset', 3 - leftPulp);
      removeItem(s, 'baggies', 6 - leftBags);
      removeItem(s, 'bat', 1 - leftBat);
      this.audio.play('error');
      this.toast(t('Your backpack is full. Make room for 3 Sunset Pulp, 6 baggies and a bat first.'), 'warn');
      return;
    }
    s.flags.starterTaken = true;
    this.syncStarterBox();
    this.audio.play('unlock');
    this.toast(t('Starter box: 3x Sunset Pulp, 6x Zip Baggies, 1x Baseball Bat. Prep the pulp at the PREP TABLE, then bag it at PACKAGING.'), 'cash', 7000);
  }

  placeStation(kind: 'prep_table' | 'pack_table' | 'storage'): boolean {
    const kit = kind === 'prep_table' ? 'prep_station_kit' : kind === 'pack_table' ? 'pack_station_kit' : 'shelf_kit';
    if (countItem(this.state, kit) === 0) return false;
    this.beginPlacement(kind, kit);
    return true;
  }

  // ------------------------------------------------------------------ hiding

  private hideInDumpster(o: WorldObject): void {
    if (this.hiding || this.driving) return;
    const px = this.player.position.x;
    const pz = this.player.position.z;
    // a cop who is close and looking at you watches you climb in: break line of sight first
    const watcher = this.police.find((p) => (p.pstate === 'CHASE' || p.pstate === 'APPROACH') && p.distanceTo(px, pz) < 10 && this.city.colliders.lineOfSight(p.position.x, p.position.y + 1.6, p.position.z, px, this.player.position.y + 1.2, pz, 10));
    if (watcher) {
      watcher.say('Nice try. Out of the trash.', '#9ecbff', 2.5);
      this.audio.play('error');
      this.toast(t('He is right on top of you — break line of sight before you hide.'), 'warn', 3500);
      return;
    }
    this.hiding = { x: o.position.x, z: o.position.z, exitX: px, exitZ: pz };
    this.player.velocity.set(0, 0, 0);
    this.player.position.set(o.position.x, -0.55, o.position.z);
    this.player.pitch = 0.5;
    this.hud.hiddenMode = true;
    this.hideLineTimer = 1.5;
    this.audio.play('thud');
    this.toast(this.state.heat >= 20 ? 'You are in a dumpster. Cops cannot see you here. It smells like 1994.' : 'You are in a dumpster for no reason. Respect.', 'info', 4000);
    for (const p of this.police) if (p.pstate === 'CHASE' || p.pstate === 'APPROACH') p.say('Where did he go?!', '#9ecbff', 2.5);
  }

  private updateHiding(dt: number): void {
    if (!this.hiding) return;
    // physics pushed us back onto the ground this frame; sink back in and re-sync the camera
    this.player.teleport(this.hiding.x, -0.55, this.hiding.z, this.player.yaw);
    this.hideLineTimer -= dt;
    if (this.hideLineTimer <= 0) {
      this.hideLineTimer = 6 + Math.random() * 6;
      const near = this.pedestrians().find((c) => c.distanceTo(this.hiding!.x, this.hiding!.z) < 8);
      if (near) near.say(['Is somebody in there?', 'Raccoons are getting big.', 'I am NOT looking in there.'][Math.floor(Math.random() * 3)], '#bbbbbb', 3);
    }
  }

  private leaveDumpster(): void {
    if (!this.hiding) return;
    const h = this.hiding;
    this.hiding = null;
    this.hud.hiddenMode = false;
    this.player.teleport(h.exitX, 0.3, h.exitZ, this.player.yaw);
    this.player.pitch = 0;
    this.audio.play('thud');
    this.state.flags.hidDumpster = true;
  }

  // ------------------------------------------------------------------ vehicle

  private syncVehicle(): void {
    const v = this.state.vehicle;
    if (this.vehicle) {
      this.dynamicGroup.remove(this.vehicle.mesh);
      this.interaction.remove('car');
      this.vehicle = null;
    }
    const sign = this.city.objects.find((o) => o.kind === 'car_sale');
    if (sign) sign.mesh.visible = !v?.owned;
    if (!v?.owned) return;
    const vehicle = new Vehicle(v.x, v.z, v.yaw, this.city.colliders);
    vehicle.setPaint(carPaint(this.state).hex);
    this.vehicle = vehicle;
    this.dynamicGroup.add(vehicle.mesh);
    void loadModel('sedanSports').then((m) => {
      if (m && this.vehicle === vehicle) vehicle.applyModel(instanceModel(m, { paint: carPaint(this.state).hex, scale: CAR_SCALE }));
    });
    this.interaction.add({
      id: 'car',
      position: this.vehicle.position,
      radius: 4,
      aimY: 0.8,
      prompt: () => (this.driving ? null : t('[E] ENTER CAR · [F] TRUNK')),
      onInteract: () => this.mount(this.vehicle!),
    });
  }

  private syncStarterCar(): void {
    if (this.starterCar) {
      this.dynamicGroup.remove(this.starterCar.mesh);
      this.interaction.remove('starter_car');
      this.starterCar = null;
    }
    const b = this.state.starterCar ?? STARTER_CAR_SPOT;
    const car = new Vehicle(b.x, b.z, b.yaw, this.city.colliders, 'beater');
    this.starterCar = car;
    this.dynamicGroup.add(car.mesh);
    void loadModel('hatchbackSports').then((m) => {
      if (m && this.starterCar === car) car.applyModel(instanceModel(m, { paint: '#9a5b34', scale: CAR_SCALE }));
    });
    this.interaction.add({
      id: 'starter_car',
      position: car.position,
      radius: 4,
      aimY: 0.8,
      prompt: () => (this.driving ? null : t('[E] ENTER CAR')),
      onInteract: () => this.mount(car),
    });
  }

  private buyFront(): void {
    const s = this.state;
    if (s.properties.includes('laundromat')) return;
    if (s.cash < FRONT_PRICE) {
      this.audio.play('error');
      this.toast(t('The laundromat is ${FRONT_PRICE}. A legit business washes more than socks.', { FRONT_PRICE }), 'info', 5000);
      return;
    }
    if (!this.confirmTwice('front', t('Buy Lucky Laundromat for ${FRONT_PRICE}? +${FRONT_DAILY_INCOME}/day clean income and suspicion drops {FRONT_DAILY_SUSPICION}/day', { FRONT_PRICE, FRONT_DAILY_INCOME, FRONT_DAILY_SUSPICION }))) return;
    spendCash(s, FRONT_PRICE);
    s.properties.push('laundromat');
    this.audio.play('jingle_property');
    this.establishingShot('laundromat', 'LUCKY LAUNDROMAT', 'clean money every morning');
    this.toast(t('You are now a legitimate businessman. Allegedly. The laundromat pays out every morning and cools your reputation.'), 'cash', 8000);
    const sign = this.city.objects.find((o) => o.kind === 'front_sign');
    if (sign) sign.mesh.visible = false;
    this.save();
  }

  private rentMotel(): void {
    const s = this.state;
    if (s.properties.includes('motel')) return;
    if (s.cash < MOTEL_PRICE) {
      this.audio.play('error');
      this.toast(t('Room 6 is ${MOTEL_PRICE} for the season. You have ${v1}.', { MOTEL_PRICE, v1: Math.floor(s.cash) }), 'info', 5000);
      return;
    }
    if (!this.confirmTwice('motel', t('Rent Room 6 at the Ocean View Motel for ${MOTEL_PRICE}? Beach-side stash, bed, cops stay out', { MOTEL_PRICE }))) return;
    spendCash(s, MOTEL_PRICE);
    s.properties.push('motel');
    s.storage.motel = s.storage.motel ?? [];
    this.audio.play('jingle_property');
    this.establishingShot('motel', 'OCEAN VIEW MOTEL · ROOM 6', 'beach-side stash · no cops inside');
    this.toast(t('Room 6 is yours: a stash by the beach strip, a bed to rest in, and no cops inside.'), 'cash', 7000);
    const sign = this.city.objects.find((o) => o.kind === 'motel_sign');
    if (sign) sign.mesh.visible = false;
    this.save();
  }

  private buyCar(): void {
    const s = this.state;
    if (s.vehicle?.owned) return;
    if (s.cash < VEHICLE_PRICE) {
      this.audio.play('error');
      this.toast(t('Rojas: "${VEHICLE_PRICE}, runs great, A/C is a rumor." You have ${v1}.', { VEHICLE_PRICE, v1: Math.floor(s.cash) }), 'info', 5000);
      return;
    }
    if (!this.confirmTwice('car', t("Buy the '88 sedan for ${VEHICLE_PRICE}? Cross town in seconds, drive-by deliveries", { VEHICLE_PRICE }))) return;
    spendCash(s, VEHICLE_PRICE);
    s.vehicle = { owned: true, x: CAR_SALE_SPOT.x, z: CAR_SALE_SPOT.z + 4, yaw: CAR_SALE_SPOT.yaw };
    this.audio.play('jingle_property');
    const cx = CAR_SALE_SPOT.x;
    const cz = CAR_SALE_SPOT.z + 4;
    this.playShots([{ from: [cx + 9, 3.5, cz + 9], to: [cx + 5, 2, cz + 4.5], lookFrom: [cx, 0.8, cz], dur: 4, text: "'88 SEDAN", sub: t('yours · E to get in · N radio') }]);
    this.toast(t('You own a car. W/S drive · A/D steer · SHIFT brake · SPACE horn · E get out. It saves where you leave it.'), 'cash', 8000);
    this.syncVehicle();
    this.save();
  }

  private carNearRespray(o: WorldObject): boolean {
    return !!this.vehicle && Math.hypot(this.vehicle.position.x - o.position.x, this.vehicle.position.z - o.position.z) < 12;
  }

  /** Rojas resprays the sedan: a new colour, heat down, any chase called off. */
  private resprayCar(o: WorldObject): void {
    if (!this.vehicle || this.driving) return;
    if (!this.carNearRespray(o)) {
      this.audio.play('error');
      this.toast(t('Rojas: "Bring the car into the lot first. I do not paint from memory."'), 'info', 4000);
      return;
    }
    const r = resprayCar(this.state);
    if (!r.ok) {
      this.audio.play('error');
      this.toast(t('Rojas wants ${RESPRAY_PRICE} for a respray. You have ${v1}.', { RESPRAY_PRICE, v1: Math.floor(this.state.cash) }), 'warn');
      return;
    }
    this.vehicle.setPaint(r.paint!);
    this.audio.play('cash');
    this.audio.play('door');
    let called = 0;
    for (const p of this.police) if (p.loseTrack()) called++;
    this.toast(t('Rojas sprayed the sedan {v0}. {v1}{v2}', { v0: r.name, v1: r.heatDropped ? t('Heat -{n}. ', { n: r.heatDropped }) : '', v2: t(called ? 'The cops are looking for the old colour.' : 'Looks new.') }), 'cash', 6000);
    this.save();
  }

  /** F beside the parked sedan: the trunk is a 24-unit stash that travels with you. */
  private openTrunk(): void {
    if (!this.vehicle || this.driving || this.hiding || this.arrested || this.cutscene.active || this.openPanelId) return;
    if (this.vehicle.distanceTo(this.player.position.x, this.player.position.z) > 4.5) return;
    this.inventoryUI.storageProperty = 'trunk';
    this.openPanel('inventory-panel');
  }

  /** Get into the sedan or the hatchback. */
  private mount(v: Vehicle): void {
    if (this.driving || this.hiding || this.arrested || this.cutscene.active) return;
    this.ride = v;
    this.driving = true;
    this.player.pitch = 0;
    this.player.yaw = v.cameraYaw;
    this.audio.play('door');
    this.cancelPlacement();
    if (v.kind === 'beater' && !this.state.flags.droveStarter) {
      this.state.flags.droveStarter = true;
      this.toast(t("Rico's hatchback: W/S drive · A/D steer · SHIFT brake · SPACE horn · E get out. It saves where you leave it."), 'info', 7000);
    }
  }

  /** Write the ridden vehicle's resting place into the state. */
  private storeRide(): void {
    const v = this.ride;
    if (!v) return;
    if (v === this.vehicle) this.state.vehicle = { owned: true, x: v.position.x, z: v.position.z, yaw: v.yaw, paint: this.state.vehicle?.paint };
    else if (v === this.starterCar) this.state.starterCar = { x: v.position.x, z: v.position.z, yaw: v.yaw };
  }

  private dismount(): void {
    const v = this.ride;
    if (!v || !this.driving) return;
    if (Math.abs(v.speed) > 1) return;
    this.driving = false;
    this.ride = null;
    this.audio.play('door');
    const spot = v.exitSpot();
    this.player.teleport(spot.x, v.position.y + 0.3, spot.z, v.cameraYaw);
    this.ride = v;
    this.storeRide();
    this.ride = null;
    this.save();
  }

  private updateDriving(dt: number, uiOpen: boolean): void {
    const v = this.ride!;
    const r = uiOpen ? null : v.update(dt, this.input);
    v.setNight(this.clock.isNight);
    // player rides along so every other system (police, customers, map) sees the car position
    this.player.position.copy(v.position);
    this.player.velocity.set(0, 0, 0);
    // mouse look relative to the car heading
    const { dx, dy } = this.input.consumeMouse();
    if (this.input.locked && !uiOpen) {
      this.player.yaw -= dx * this.player.sensitivity;
      this.player.pitch = Math.max(-0.6, Math.min(0.5, this.player.pitch - dy * this.player.sensitivity));
      // ease the view back toward the heading when not looking around
      const rel = ((this.player.yaw - v.cameraYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.player.yaw = v.cameraYaw + rel * Math.max(0, 1 - dt * 1.5);
    }
    // chase camera: sits behind the car, orbits with the mouse, pulls in when a wall is in the way
    const yaw = this.player.yaw;
    const look = this.carLook.set(v.position.x, v.position.y + 1.1, v.position.z);
    const dist = 7.5;
    const camY = Math.max(0.7, 2.6 - this.player.pitch * 4);
    const desired = this.carEye.set(look.x + Math.sin(yaw) * dist, camY, look.z + Math.cos(yaw) * dist);
    let t = 1;
    for (; t > 0.35; t -= 0.1) {
      if (this.city.colliders.lineOfSight(look.x, look.y, look.z, look.x + (desired.x - look.x) * t, look.y + (desired.y - look.y) * t, look.z + (desired.z - look.z) * t, 10)) break;
    }
    t = Math.max(0.3, t - 0.08); // stay a little clear of the wall so the near plane does not clip it
    this.camera.position.set(look.x + (desired.x - look.x) * t, look.y + (desired.y - look.y) * t, look.z + (desired.z - look.z) * t);
    this.camera.rotation.order = 'YXZ';
    // aim a little ahead of the car so the road, not the roof, fills the screen
    this.camera.lookAt(look.x - Math.sin(yaw) * 4, look.y + 0.2, look.z - Math.cos(yaw) * 4);
    if (r === 'hit') {
      this.audio.play('bump');
      this.carHitTimer -= dt;
      if (this.carHitTimer <= 0) {
        this.carHitTimer = 2;
        addHeat(this.state, 3);
      }
    }
    if (r === 'horn') {
      this.audio.play('horn');
      for (const c of this.pedestrians()) if (c.distanceTo(v.position.x, v.position.z) < 12) c.reactTo(v.position.x, v.position.z, false);
      for (const w of this.wanderers.values()) if (w.distanceTo(v.position.x, v.position.z) < 12) w.say('HEY! I am walking here!', '#ffd166', 2);
    }
    // pedestrians scatter from a moving car
    if (Math.abs(v.speed) > 3) {
      for (const c of this.pedestrians()) {
        if (c.state !== 'FLEE' && c.distanceTo(v.position.x, v.position.z) < 3.5) {
          c.reactTo(v.position.x, v.position.z, true);
          addHeat(this.state, 4);
        }
      }
    }
  }

  /** Left click with the bat out: cops in the arc go down for a few seconds, civilians scatter, heat climbs. */
  private swingBat(): void {
    this.swingT = 1;
    const s = this.state;
    const px = this.player.position.x;
    const pz = this.player.position.z;
    const yaw = this.player.yaw;
    let hit = false;
    for (const i of swingTargets(px, pz, yaw, this.police.map((p) => p.position))) {
      const p = this.police[i];
      if (p.stunned) continue;
      p.stun(BAT_STUN_SECONDS);
      addHeat(s, BAT_HEAT_COP);
      this.hud.flash(t('OFFICER DOWN'), '#ff5c5c');
      this.toast(t('You clubbed an officer. Run: District 3 will not forget that.'), 'warn', 6000);
      hit = true;
    }
    const peds: Civilian[] = [...this.pedestrians(), ...this.wanderers.values()];
    for (const i of swingTargets(px, pz, yaw, peds.map((c) => c.position))) {
      const c = peds[i];
      if (c.state === 'FLEE') continue;
      c.reactTo(px, pz, true);
      addHeat(s, BAT_HEAT_CIVILIAN);
      hit = true;
    }
    if (hit) {
      this.audio.play('thud');
      // a beating in the street clears the block
      for (const c of peds) if (c.state !== 'FLEE' && c.distanceTo(px, pz) < 12) c.reactTo(px, pz, Math.random() < 0.5);
    } else this.audio.play('switch');
  }

  // ------------------------------------------------------------------ placement mode (warehouse)

  private beginPlacement(kind: PlacedStation['kind'], item: string): void {
    if (this.placement) this.cancelPlacement();
    const size = kind === 'storage' ? [3, 2.2, 0.6] : [2.2, 1, 1];
    const ghost = new THREE.Mesh(boxGeo(size[0], size[1], size[2]), lambert('#4ff2e8', { transparent: true, opacity: 0.45 }));
    this.dynamicGroup.add(ghost);
    this.placement = { kind, ghost, rot: 0, item };
    this.toast(t('Placement mode: aim at the floor, CLICK to place, R to rotate, ESC to cancel.'), 'info', 5000);
  }

  private placementArea(): WorldObject | null {
    return this.city.objects.find((o) => o.kind === 'placement_area') ?? null;
  }

  private placementPoint(): { x: number; z: number } | null {
    const pt = this.placementPointRaw();
    // never on top of the player: a shelf spawned around you cannot be climbed out of
    if (pt && Math.hypot(pt.x - this.player.position.x, pt.z - this.player.position.z) < 2.4) return null;
    return pt;
  }

  private placementPointRaw(): { x: number; z: number } | null {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    if (dir.y > -0.05) return null;
    const t = (0.15 - this.camera.position.y) / dir.y;
    if (t < 0 || t > 12) return null;
    const x = Math.round((this.camera.position.x + dir.x * t) / 2) * 2;
    const z = Math.round((this.camera.position.z + dir.z * t) / 2) * 2;
    const area = this.placementArea();
    const b = area?.data as { minX: number; maxX: number; minZ: number; maxZ: number } | undefined;
    if (!b) return null;
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return null;
    return { x, z };
  }

  private updatePlacement(): void {
    if (!this.placement) return;
    if (this.input.wasPressed('KeyR')) this.placement.rot = (this.placement.rot + Math.PI / 2) % (Math.PI * 2);
    const p = this.placementPoint();
    this.placement.ghost.visible = !!p;
    if (p) {
      this.placement.ghost.position.set(p.x, 0.15 + 0.5, p.z);
      this.placement.ghost.rotation.y = this.placement.rot;
      const clash = this.state.placedStations.some((s) => Math.abs(s.x - p.x) < 2 && Math.abs(s.z - p.z) < 2);
      (this.placement.ghost.material as THREE.MeshLambertMaterial).color.set(clash ? '#ff5c5c' : '#4ff2e8');
    }
  }

  private confirmPlacement(): void {
    if (!this.placement) return;
    const p = this.placementPoint();
    if (!p) return;
    if (this.state.placedStations.some((s) => Math.abs(s.x - p.x) < 2 && Math.abs(s.z - p.z) < 2)) {
      this.audio.play('error');
      return;
    }
    if (!removeItem(this.state, this.placement.item, 1)) return;
    const st: PlacedStation = { id: 'placed_' + Date.now(), kind: this.placement.kind, x: p.x, z: p.z, rot: this.placement.rot };
    this.state.placedStations.push(st);
    this.instantiateStation(st);
    this.audio.play('unlock');
    this.toast(t('Placed {v0}.', { v0: ITEMS[this.placement.item].name.replace(' Kit', '') }), 'cash');
    this.dynamicGroup.remove(this.placement.ghost);
    this.placement = null;
    this.save();
  }

  private cancelPlacement(): void {
    if (!this.placement) return;
    this.dynamicGroup.remove(this.placement.ghost);
    this.placement = null;
  }

  private tryStartPlacementFromInventory(): void {
    if (!this.state.properties.includes('warehouse')) {
      this.toast(t('Equipment placement needs a warehouse. Warehouse 7 is for sale at the docks.'), 'warn');
      return;
    }
    if (!this.playerInsideBuilding('warehouse')) {
      this.toast(t('Go inside your warehouse to place equipment.'), 'warn');
      return;
    }
    const kits: [string, PlacedStation['kind']][] = [['prep_station_kit', 'prep_table'], ['pack_station_kit', 'pack_table'], ['shelf_kit', 'storage']];
    const sel = this.state.inventory[this.hud.selectedSlot];
    const chosen = kits.find(([k]) => sel?.id === k) ?? kits.find(([k]) => countItem(this.state, k) > 0);
    if (!chosen) {
      this.toast(t('You have no station kits. The pawn shop sells them once you own the warehouse.'), 'warn');
      return;
    }
    this.beginPlacement(chosen[1], chosen[0]);
  }

  // ------------------------------------------------------------------ police / arrest

  private beginArrest(): void {
    if (this.driving && this.ride) {
      const v = this.ride;
      v.speed = 0;
      this.storeRide();
      this.driving = false;
      this.ride = null;
      const spot = v.exitSpot();
      this.player.teleport(spot.x, 0.3, spot.z, v.cameraYaw);
    }
    this.arrested = true;
    this.arrestTimer = 6.2;
    this.audio.play('jingle_bust');
    this.hud.arrestMode = true;
    if (this.settings.cutscenes) this.hud.setVisible(false);
    else {
      this.arrestTimer = 3.2;
      this.hud.flash(t('BUSTED'), '#7fbfff');
    }
    const r = applyArrest(this.state);
    // busted in or beside the sedan: they pop the trunk too
    const trunkTaken = this.vehicle && this.vehicle.distanceTo(this.player.position.x, this.player.position.z) < 6 ? searchTrunk(this.state) : 0;
    if (trunkTaken > 0) this.toast(t('They popped the trunk: {trunkTaken} units gone.', { trunkTaken }), 'warn', 6000);
    this.clock.totalMinutes = this.state.clockMinutes;
    const items = r.confiscated.map((c) => `${c.qty}x ${resolveItem(this.state, c.id).name}`).join(', ');
    const p = this.player.position;
    const eye: [number, number, number] = [p.x, p.y + 1.6, p.z];
    if (this.settings.cutscenes) this.cutscene.play(
      [
        { from: eye, to: [p.x + 5, p.y + 9, p.z + 7], lookFrom: [p.x, p.y + 1, p.z], dur: 3.6, text: t('BUSTED'), sub: items ? `confiscated: ${items} · fine $${r.fine}` : `fine $${r.fine}` },
        { from: [p.x + 5, p.y + 9, p.z + 7], to: [p.x + 6, p.y + 10, p.z + 8], lookFrom: [p.x, p.y + 1, p.z], dur: 2.6, fade: 1, text: t('6 HOURS LATER'), sub: 'Sol Palma County Jail' },
      ],
      () => {
        if (this.arrested) this.arrestTimer = Math.min(this.arrestTimer, 0.01);
      },
    );
    this.toast(t('BUSTED. {v0}Fine: ${v1}. You lost 6 hours in a holding cell.', { v0: items ? t('Confiscated: {items}. ', { items }) : '', v1: r.fine }), 'warn', 9000);
    for (const o of this.state.orders) if (o.status === 'failed' || o.status === 'expired') this.despawnCustomer(o.id);
    if (this.openPanelId) this.closePanel();
    this.cancelPlacement();
    // the penalty is persisted right away so closing the tab during the BUSTED sequence cannot undo it
    this.state.player = { x: 70, y: 0.3, z: -24, yaw: Math.PI };
    saveToSlot(this.state, localStorage, this.activeSlot);
  }

  private updateArrest(dt: number): void {
    this.arrestTimer -= dt;
    if (this.arrestTimer <= 0) {
      this.arrested = false;
      this.hud.arrestMode = false;
      this.hud.setVisible(true);
      this.cutscene.skip();
      // released in front of the police station
      this.player.teleport(70, 0.3, -24, Math.PI);
      for (const p of this.police) p.pstate = 'PATROL';
      this.toast(t('Released. "Stay out of trouble." Your customers are still out there.'), 'info', 5000);
      this.orderTimer = 15;
      this.save();
    }
  }

  private playerInsideBuilding(id: string): boolean {
    const b = this.city.buildings.get(id);
    if (!b) return false;
    const p = this.player.position;
    return p.x > b.box.min.x && p.x < b.box.max.x && p.z > b.box.min.z && p.z < b.box.max.z;
  }

  private playerInsideOwnedProperty(): boolean {
    return this.state.properties.some((p) => this.playerInsideBuilding(p));
  }

  private playerInsideAnyInterior(): boolean {
    for (const b of BUILDINGS) if (b.interior && this.playerInsideBuilding(b.id)) return true;
    return false;
  }

  // ------------------------------------------------------------------ HUD helpers

  /** Where the player should be heading right now, if the game can tell. */
  private compassTarget(): { label: string; x: number; z: number } | null {
    const s = this.state;
    if (!s.flags.starterTaken) return null;
    const active = activeOrders(s).filter((o) => o.status === 'accepted');
    if (active.length) {
      const o = active[0];
      const c = CUSTOMER_MAP[o.customerId];
      if (findFulfillingItem(s, o)) {
        const npc = this.customers.get(o.id);
        const l = LANDMARKS.find((x) => x.id === o.locationId);
        const x = npc ? npc.position.x : l?.x ?? 0;
        const z = npc ? npc.position.z : l?.z ?? 0;
        return { label: `${c.name.split(' ')[0]} · ${landmarkName(o.locationId)}`, x, z };
      }
      const hasBase = ['pulp_sunset', 'wax_velvet', 'gel_neon'].some((id) => countItem(s, id) > 0);
      const loose = looseProductsInInventory(s).length > 0;
      if (!hasBase && !loose) return { label: 'Rico (supplies)', x: SUPPLIER_SPOT.x, z: SUPPLIER_SPOT.z };
      const prop = s.properties.includes('warehouse') && this.playerInsideBuilding('warehouse') ? 'warehouse' : 'safehouse';
      const station = [...this.city.objects, ...this.placedObjects].find((o) => o.kind === (loose ? 'pack_table' : 'prep_table') && o.property === prop);
      if (station) return { label: loose ? 'Packaging table' : 'Prep table', x: station.position.x, z: station.position.z };
    }
    if (s.dealer?.hired && s.dealer.cash >= 200) return { label: `Vince · $${Math.round(s.dealer.cash)} waiting`, x: 154, z: 100 };
    return null;
  }

  private updateCompass(): void {
    const t = this.compassTarget();
    if (!t) {
      this.hud.setCompass(null, 0, 0);
      return;
    }
    const dx = t.x - this.player.position.x;
    const dz = t.z - this.player.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 4) {
      this.hud.setCompass(null, 0, 0);
      return;
    }
    // player forward is (-sin yaw, -cos yaw); angle of target relative to forward, clockwise positive
    const bearing = Math.atan2(-dx, -dz);
    let rel = bearing - this.player.yaw;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    this.hud.setCompass(t.label, -rel, dist);
  }

  private computeObjective(): string {
    const s = this.state;
    if (this.arrested) return t('Being processed at District 3…');
    if (!s.flags.starterTaken) return t('Open the STARTER BOX in your back room.');
    const step = storyStep(s);
    if (step === 'page') return t('Product is bagged. Keep the pager on: Tasha is about to page you.');
    const pending = pendingOrders(s);
    if (step === 'restock' && !pending.length) return t('Restock: buy Sunset Pulp from Rico at the Container Yard (docks). Bring cash.');
    if (pending.length) return t(pending.length > 1 ? 'Pager: {v0} new orders. Press P to accept or decline.' : 'Pager: {v0} new order. Press P to accept or decline.', { v0: pending.length });
    if (s.loan && loanDaysLeft(s.loan, this.clock.day) <= 0) return t('Pawn shop marker {v0}: pay ${v1} at Sol Palma Pawn.', { v0: loanDaysLeft(s.loan, this.clock.day) < 0 ? 'OVERDUE' : 'due today', v1: s.loan.owed });
    if (s.heat >= 60 && s.vehicle?.owned && !this.hiding) return t('Hot. Break line of sight, hide in a dumpster, or get the sedan resprayed at Rojas (${RESPRAY_PRICE}, heat -{RESPRAY_HEAT}).', { RESPRAY_PRICE, RESPRAY_HEAT });
    const active = activeOrders(s).filter((o) => o.status === 'accepted');
    if (active.length) {
      const o = active[0];
      const c = CUSTOMER_MAP[o.customerId];
      const have = findFulfillingItem(s, o);
      if (have) return t('Deliver {v0}x {v1} to {v2} at {v3}.', { v0: o.qty, v1: describeRequest(s, o), v2: c.name.split(' ')[0], v3: landmarkName(o.locationId) });
      const loose = looseProductsInInventory(s);
      if (loose.length) return t('Package {v0} at the PACKAGING table (need {v1} baggies).', { v0: describeRequest(s, o), v1: o.qty });
      const hasBase = ['pulp_sunset', 'wax_velvet', 'gel_neon'].some((id) => countItem(s, id) > 0);
      if (hasBase) return t('Prep {v0} at the PREP TABLE{v1}.', { v0: describeRequest(s, o), v1: o.effects.length ? t(' — use modifiers to get {effects}', { effects: o.effects.map(tn).join('+') }) : '' });
      return t('Buy supplies from Rico at the Container Yard (docks) for {v0}.', { v0: describeRequest(s, o) });
    }
    if (s.runner?.activeOrderId !== null && s.runner?.hired) return t('Dizzy is out on a delivery. Prep more stock while you wait.');
    const looseNow = looseProductsInInventory(s);
    if (looseNow.length && countItem(s, 'baggies') > 0) return t('Package your {v0} at the PACKAGING table.', { v0: recipeDisplayName(s, looseNow[0].key) });
    if (['pulp_sunset', 'wax_velvet', 'gel_neon'].some((id) => countItem(s, id) > 0) && s.stats.produced === 0) return t('Prep your Sunset Pulp at the PREP TABLE while you wait for a page.');
    if (s.cash < 30 && !s.loan && s.stats.sales >= 1 && !['pulp_sunset', 'wax_velvet', 'gel_neon'].some((id) => countItem(s, id) > 0) && packagedInInventory(s).length === 0) return t('Broke? Sol Palma Pawn writes a ${v0} marker — pay it back within {LOAN_DAYS} days.', { v0: LOAN_TIERS[0], LOAN_DAYS });
    if (countItem(s, 'baggies') < 3) return t('Stock up on baggies at Quick Stop 24. Wait for the next page.');
    if (s.cash >= WAREHOUSE_PRICE && !s.properties.includes('warehouse')) return t('You can afford WAREHOUSE 7 (${WAREHOUSE_PRICE}) at the docks.', { WAREHOUSE_PRICE });
    if (s.cash >= RUNNER_HIRE_PRICE && !s.runner?.hired && s.stats.sales >= 4) return t('Hire Dizzy the runner near the Ocean View Motel (${RUNNER_HIRE_PRICE}).', { RUNNER_HIRE_PRICE });
    if (s.properties.includes('warehouse') && !s.worker?.hired && s.cash >= WORKER_HIRE_PRICE) return t('Hire Marisol (production worker) at the Port Authority (${WORKER_HIRE_PRICE}).', { WORKER_HIRE_PRICE });
    if (!s.dealer?.hired && s.cash >= DEALER_HIRE_PRICE && Object.values(s.customers).filter((c) => c.unlocked).length >= 5) return t('Hire Vince as a dealer near Neptune Arcade (${DEALER_HIRE_PRICE}) to offload customers.', { DEALER_HIRE_PRICE });
    if (s.dealer?.hired && dealerStockCount(s) === 0 && s.dealer.customers.length > 0) return t('Vince is out of stock: bring him packaged product at Neptune Arcade.');
    if (s.dealer?.hired && s.properties.includes('warehouse') && !s.handler?.hired && s.cash >= HANDLER_HIRE_PRICE + 200) return t('Hire Teddy in the Warehouse 7 office (${HANDLER_HIRE_PRICE}) to keep Vince stocked from the warehouse.', { HANDLER_HIRE_PRICE });
    if (s.dealer?.hired && s.dealer.cash >= 200) return t('Vince is holding ${v0} for you. Swing by Neptune Arcade.', { v0: Math.round(s.dealer.cash) });
    if (s.worker?.hired && !s.worker.recipeKey) return t('Assign Marisol a recipe at a PREP TABLE and stock the warehouse storage.');
    if (s.cash >= 220 && !s.upgrades.includes('eq_mixer')) return t('Buy a Turbo Mixer at Sol Palma Pawn ($220) to prep faster.');
    if (!s.properties.includes('laundromat') && s.cash >= FRONT_PRICE + 300 && s.suspicion >= 20) return t('Buy the Lucky Laundromat (${FRONT_PRICE}) as a legit front to cool your reputation.', { FRONT_PRICE });
    if (!s.properties.includes('motel') && s.cash >= MOTEL_PRICE + 200 && s.properties.includes('warehouse')) return t('Rent Room 6 at the Ocean View Motel (${MOTEL_PRICE}) for a beach-side stash.', { MOTEL_PRICE });
    if (!s.vehicle?.owned && s.cash >= VEHICLE_PRICE + 100 && s.stats.sales >= 6) return t("Buy the '88 sedan at Rojas Auto Repair (${VEHICLE_PRICE}) to cross town fast.", { VEHICLE_PRICE });
    if (packagedInInventory(s).length && s.runner?.hired) return t('Store packaged product in STORAGE so Dizzy can deliver it.');
    if (s.inventory.filter((st) => !st).length <= 1) return t('Backpack nearly full: the shelf in your back room is STORAGE (E) for supplies and product.');
    return t('Waiting for a page… restock at Rico (Container Yard, docks) or Quick Stop 24, or use a payphone to call around.');
  }

  private currentOrderText(): string | null {
    const s = this.state;
    const list = activeOrders(s);
    if (!list.length) return null;
    return list
      .slice(0, 3)
      .map((o) => {
        const c = CUSTOMER_MAP[o.customerId];
        const have = findFulfillingItem(s, o);
        const tag = o.status === 'runner' ? `<span class="runner">RUNNER ${Math.round((o.runnerProgress ?? 0) * 100)}%</span>` : have ? '<span style="color:#7dff9a">READY</span>' : '<span style="color:#ffb3c1">NEED PRODUCT</span>';
        const left = Math.round(o.windowEnd - this.clock.totalMinutes);
        const timeTag = o.status === 'runner' ? '' : left < 0 ? ` · <span style="color:#ffb3c1">LATE · 30% off · leaves in ${Math.max(0, LATE_GRACE_MINUTES + left)} min</span>` : ` · ${left} min left`;
        return `${c.name.split(' ')[0]} · ${o.qty}x ${describeRequest(s, o)} · $${o.price}${o.vip ? ' · <span style="color:#ffd166">VIP</span>' : ''}<br/>${landmarkName(o.locationId)} · by ${GameClock.formatMinutes(o.windowEnd)}${timeTag} · ${tag}`;
      })
      .join('<hr style="border:0;border-top:1px solid #444;margin:4px 0"/>');
  }

  playerXZ(): { x: number; z: number } {
    return { x: this.player.position.x, z: this.player.position.z };
  }
  policeXZ(): { x: number; z: number }[] {
    const out = this.police.map((p) => ({ x: p.position.x, z: p.position.z }));
    for (const c of this.cruisers) out.push({ x: c.position.x, z: c.position.z });
    return out;
  }
  customerXZ(): { id: string; x: number; z: number; orderId: number }[] {
    return Array.from(this.customers.values()).map((c) => ({ id: c.def.id, x: c.position.x, z: c.position.z, orderId: c.orderId }));
  }
  runnerXZ(): { x: number; z: number } | null {
    return this.runnerNPC ? { x: this.runnerNPC.position.x, z: this.runnerNPC.position.z } : null;
  }
  hasScanner(): boolean {
    return this.state.upgrades.includes('eq_scanner');
  }

  setCrewName(name: string): void {
    const clean = name.replace(/[<>&"'`]/g, '').trim().slice(0, 24).toUpperCase();
    if (!clean) return;
    this.state.crewName = clean;
    this.audio.play('jingle_property');
    this.toast(t('Your operation is now known as {clean}.{v1}', { clean, v1: this.state.properties.includes('warehouse') ? t(' The sign on Warehouse 7 is lit.') : '' }), 'cash', 5000);
    this.refreshCrewSign();
    this.save();
    // the neon goes up: a short establishing shot of the sign (only once the warehouse is yours)
    const sign = this.city.objects.find((x) => x.kind === 'crew_sign');
    if (sign && this.state.properties.includes('warehouse')) {
      const sp = sign.position;
      this.playShots([{ from: [sp.x + 18, 3, sp.z + 14], to: [sp.x + 9, 4.2, sp.z + 3], lookFrom: [sp.x, sp.y, sp.z], dur: 4.5, text: clean, sub: 'WAREHOUSE 7 · SOL PALMA' }]);
    }
  }

  /** A relationship tier changed hands: say so big, because it changes order sizes and haggling. */
  private announceTier(customerId: string, before: ReturnType<typeof relationshipTier>): void {
    const cs = this.state.customers[customerId];
    if (!cs) return;
    const after = relationshipTier(cs.relationship);
    if (after === before) return;
    const first = CUSTOMER_MAP[customerId].name.split(' ')[0].toUpperCase();
    const perk = after === 'regular' ? 'orders +1 · haggles easier' : after === 'friend' ? 'orders +2 · double effects' : after === 'family' ? 'top prices' : 'effect requests begin';
    const stateAtCall = this.state;
    setTimeout(() => {
      if (!this.running || this.state !== stateAtCall) return;
      this.audio.play('jingle_customer');
      this.hud.flash(t('{first} IS NOW {v1} {v2}', { first, v1: after === 'acquaintance' ? 'AN' : 'A', v2: tn(after).toUpperCase() }), '#ffd166');
      this.toast(t('{v0} is now a {after}: {perk}.', { v0: CUSTOMER_MAP[customerId].name, after, perk }), 'cash', 6000);
    }, 1700);
  }

  /** Street dice: a throw, a sound, a flash on a big win; the crate does not care who is watching. */
  playDice(bet: number, pick: DicePick): DiceResult {
    const r = rollDice(this.state, bet, pick);
    if (!r.ok) {
      this.audio.play('error');
      this.toast(r.reason === 'no_cash' ? 'You are light. Come back with cash.' : 'That is not a bet.', 'warn');
      return r;
    }
    this.audio.play('dice');
    if (r.payout! > 0) {
      setTimeout(() => this.audio.play('collect'), 350);
      if (r.net! >= 150) this.hud.flash(r.payout === 3 ? `SNAKE EYES  +$${r.net}` : `DICE  +$${r.net}`, '#ffd166', flashScale(r.net!));
    } else setTimeout(() => this.audio.play('chips'), 350);
    if ((this.state.stats.diceRolls ?? 0) % 10 === 0) this.toast(t('The guys at the crate are getting loud. Cops notice loud.'), 'warn', 4000);
    return r;
  }

  /** Sol Palma Pawn writes a marker: cash now, 25% on top by the due day. */
  takeLoan(amount: number): boolean {
    const r = takeLoan(this.state, amount, this.clock.day);
    if (!r.ok) {
      this.audio.play('error');
      this.toast(r.reason === 'active' ? 'One marker at a time. Pay this one off first.' : r.reason === 'locked' ? 'The pawn shop wants to see a track record before writing that size.' : 'No.', 'warn');
      return false;
    }
    this.audio.play('cash');
    this.toast(t('Marker written: ${amount} in hand, ${v1} due by the end of day {v2}. Miss it and the collectors come.', { amount, v1: r.owed, v2: this.state.loan?.dueDay }), 'cash', 7000);
    return true;
  }

  repayLoan(amount: number): number {
    const paid = repayLoan(this.state, amount);
    if (paid <= 0) {
      this.audio.play('error');
      this.toast(t('Not enough cash on hand.'), 'warn');
      return 0;
    }
    this.audio.play('cash');
    this.toast(this.state.loan ? `Paid $${paid} on the marker. $${this.state.loan.owed} to go.` : `Marker paid off. Sol Palma Pawn remembers people who pay.`, 'cash');
    return paid;
  }

  /** Y accepts / X declines the newest page; says so when there is nothing to answer. */
  private answerPage(accept: boolean): void {
    const pending = pendingOrders(this.state);
    if (!pending.length) {
      this.toast(t('No new pages to answer. Customers page you when they need something.'), 'info', 3000);
      this.hud.hidePager();
      return;
    }
    const o = pending[pending.length - 1];
    if (accept) this.acceptOrder(o.id);
    else {
      this.declineOrder(o.id);
      this.toast(t("Declined {v0}'s order.", { v0: CUSTOMER_MAP[o.customerId].name.split(' ')[0] }));
    }
    if (!pendingOrders(this.state).length) this.hud.hidePager();
  }

  /** Sol Palma Transit: a fade, a few minutes, and you are across town. Not with a cop on your heels. */
  rideBus(stopId: string): void {
    const s = this.state;
    const dest = BUS_STOPS.find((b) => b.id === stopId);
    if (!dest || this.driving || this.hiding || this.arrested) return;
    const px = this.player.position.x;
    const pz = this.player.position.z;
    const tail = this.police.find((p) => (p.pstate === 'CHASE' || p.pstate === 'APPROACH') && p.distanceTo(px, pz) < 30);
    if (tail) {
      this.audio.play('error');
      this.toast(t('The driver takes one look at the cop behind you and closes the door.'), 'warn', 4000);
      return;
    }
    if (!spendCash(s, BUS_FARE)) {
      this.audio.play('error');
      this.toast(t('Fare is ${BUS_FARE}. Exact change, no stories.', { BUS_FARE }), 'warn');
      return;
    }
    this.closePanel();
    this.audio.play('door');
    const arrive = (): void => {
      this.clock.totalMinutes += BUS_MINUTES;
      s.clockMinutes = this.clock.totalMinutes;
      this.player.teleport(dest.x + Math.sin(dest.rot + Math.PI / 2) * 2.5, 0.3, dest.z + Math.cos(dest.rot + Math.PI / 2) * 2.5, dest.rot + Math.PI);
      s.stats.busRides = (s.stats.busRides ?? 0) + 1;
      this.toast(t('{v0}. {BUS_MINUTES} minutes and ${BUS_FARE} well spent.', { v0: dest.name, BUS_MINUTES, BUS_FARE }), 'info', 4000);
      this.save();
    };
    if (this.settings.cutscenes) {
      const p = this.player.position;
      this.hud.setVisible(false);
      this.cutscene.play([{ from: [p.x, p.y + 1.6, p.z], to: [p.x, p.y + 1.6, p.z], lookFrom: [p.x + 1, p.y + 1.6, p.z], dur: 1.6, fade: 1, text: 'SOL PALMA TRANSIT', sub: dest.name.toUpperCase() }], () => {
        arrive();
        this.hud.setVisible(true);
        this.input.requestLock();
      });
    } else arrive();
  }

  /** Run an in-game cutscene: closes panels, hides the HUD and hands control back afterwards. */
  private playShots(shots: Shot[]): void {
    if (!this.settings.cutscenes) return;
    if (this.openPanelId) this.closePanel();
    this.hud.setVisible(false);
    this.cutscene.play(shots, () => {
      this.hud.setVisible(true);
      this.input.requestLock();
    });
  }

  /** A four-second exterior of a building you just bought, seen from outside its front door. */
  private establishingShot(id: string, text: string, sub: string): void {
    const b = this.city.buildings.get(id);
    if (!b) return;
    const dir = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[b.spec.facing];
    const perp = [-dir[1], dir[0]];
    const cx = (b.box.min.x + b.box.max.x) / 2;
    const cz = (b.box.min.z + b.box.max.z) / 2;
    const h = b.box.max.y - b.box.min.y;
    const size = Math.max(b.spec.w, b.spec.d);
    const d = b.doorPos;
    const from: [number, number, number] = [d.x + dir[0] * size * 0.9 + perp[0] * size * 0.5, h * 0.8 + 3, d.z + dir[1] * size * 0.9 + perp[1] * size * 0.5];
    const to: [number, number, number] = [d.x + dir[0] * size * 0.6 + perp[0] * size * 0.2, h * 0.45 + 2, d.z + dir[1] * size * 0.6 + perp[1] * size * 0.2];
    this.playShots([{ from, to, lookFrom: [cx, h * 0.4, cz], dur: 4, text, sub }]);
  }

  private refreshCrewSign(): void {
    const o = this.city.objects.find((x) => x.kind === 'crew_sign');
    if (!o) return;
    const mesh = o.mesh as THREE.Mesh;
    const show = !!this.state.crewName && this.state.properties.includes('warehouse');
    mesh.visible = show;
    if (!show) return;
    const mat = mesh.material as THREE.MeshLambertMaterial;
    const tex = signTexture(this.state.crewName, { color: '#ff4fd8', sub: 'IMPORT · EXPORT · LOGISTICS' });
    mat.map = tex;
    mat.emissiveMap = tex;
    mat.needsUpdate = true;
  }

  save(slot?: number): void {
    if (slot) this.activeSlot = slot;
    if (this.settingsSaveTimer !== null) {
      clearTimeout(this.settingsSaveTimer);
      this.settingsSaveTimer = null;
      saveSettings(this.settings);
    }
    if (!this.running || this.arrested) return;
    this.state.clockMinutes = this.clock.totalMinutes;
    if (this.vehicle && this.state.vehicle) this.state.vehicle = { owned: true, x: this.vehicle.position.x, z: this.vehicle.position.z, yaw: this.vehicle.yaw, paint: this.state.vehicle.paint };
    if (this.hiding) this.state.player = { x: this.hiding.exitX, y: 0.15, z: this.hiding.exitZ, yaw: this.player.yaw };
    if (this.starterCar && this.ride !== this.starterCar) this.state.starterCar = { x: this.starterCar.position.x, z: this.starterCar.position.z, yaw: this.starterCar.yaw };
    if (this.driving && this.ride) {
      // never save the player "inside" the car: put them next to it
      this.storeRide();
      const spot = this.ride.exitSpot();
      this.state.player = { x: spot.x, y: this.ride.position.y, z: spot.z, yaw: this.ride.cameraYaw };
    }
    saveToSlot(this.state, localStorage, this.activeSlot);
  }

  // ------------------------------------------------------------------ input

  private onKey(e: KeyboardEvent): void {
    if (!this.running) return;
    if (this.cutscene.active && !this.menu.visible) {
      if (e.code !== 'Escape') this.cutscene.skip();
      else this.pause();
      return;
    }
    if (this.menu.visible) {
      if (e.code === 'Escape' && this.menu.mode === 'pause') this.resume();
      return;
    }
    if (this.openPanelId) {
      const panel = this.panels[this.openPanelId];
      if (e.code === 'Escape' || (e.code === 'Tab' && this.openPanelId === 'inventory-panel') || (e.code === 'KeyP' && this.openPanelId === 'pager-panel') || (e.code === 'KeyM' && this.openPanelId === 'map-panel')) {
        e.preventDefault();
        e.stopPropagation();
        this.closePanel(e.code !== 'Escape');
        return;
      }
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      // Y / X answer the newest page from inside the pager too
      if (this.openPanelId === 'pager-panel' && (e.code === 'KeyY' || e.code === 'KeyX')) {
        this.answerPage(e.code === 'KeyY');
        panel.render();
        return;
      }
      if (panel.onKey(e.code)) e.preventDefault();
      return;
    }
    if (this.arrested) return;
    // a movement key re-captures a mouse a panel let go of (Escape never counts as activation in browsers;
    // keys that open panels are left alone so the lock cannot land on top of a freshly opened panel)
    if (!this.input.locked && !this.placement && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'Space'].includes(e.code)) this.input.requestLock();
    switch (e.code) {
      case 'Tab':
        e.preventDefault();
        this.inventoryUI.storageProperty = null;
        this.openPanel('inventory-panel');
        break;
      case 'KeyP':
        this.openPanel('pager-panel');
        break;
      case 'KeyM':
        this.openPanel('map-panel');
        break;
      case 'KeyB':
        this.tryStartPlacementFromInventory();
        break;
      case 'KeyH':
        this.hud.toggleHidden();
        break;
      case 'KeyY':
      case 'KeyX':
        this.answerPage(e.code === 'KeyY');
        break;
      case 'KeyN':
        this.cycleRadio();
        break;
      case 'KeyF':
        this.openTrunk();
        break;
      case 'Escape':
        if (this.placement) this.cancelPlacement();
        else this.pause();
        break;
    }
  }

  // exposed for automated tests / debugging
  debugState(): { cash: number; heat: number; orders: Order[]; pos: THREE.Vector3; fps: number } {
    return { cash: this.state.cash, heat: this.state.heat, orders: this.state.orders, pos: this.player.position, fps: this.fps };
  }
}

