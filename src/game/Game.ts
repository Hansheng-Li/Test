import * as THREE from 'three';
import { Input } from '../core/Input';
import { GameClock } from '../core/Time';
import { PlayerController } from '../player/PlayerController';
import { buildCity, CityResult } from '../world/City';
import { DayNight } from '../world/DayNight';
import { PropBuilder } from '../world/Props';
import { buildPlacedStation, InteriorContext } from '../world/Interiors';
import { WorldObject } from '../world/WorldTypes';
import { SPAWN, LANDMARKS, SAFEHOUSE_DOOR, BUILDINGS, WAREHOUSE_SIGN, CAR_SALE_SPOT, zoneAt } from '../data/city';
import { makeFigure, makeLabel } from '../world/Interiors';
import { CUSTOMER_MAP } from '../data/customers';
import { WAREHOUSE_PRICE, RUNNER_HIRE_PRICE, WORKER_HIRE_PRICE, DEALER_HIRE_PRICE, VEHICLE_PRICE, MOTEL_PRICE, ITEMS } from '../data/items';
import { computeRecipe, parseRecipeKey, Effect } from '../data/products';
import { GameState, Order, PlacedStation } from './GameState';
import { createNewState, saveToStorage, loadFromStorage, hasSave, clearSave } from '../systems/SaveSystem';
import { InteractionSystem, Interactable } from '../systems/InteractionSystem';
import { addItem, countItem, removeItem, resolveItem, depositToStorage, withdrawFromStorage, packagedInInventory, looseProductsInInventory } from '../systems/InventorySystem';
import { buyFromShop, buyDelivered, spendCash, PurchaseResult } from '../systems/EconomySystem';
import { executePrep, executePackage, nameRecipe, recipeDisplayName, PrepPlan, PrepResult, PackageResult } from '../systems/ProductionSystem';
import { generateOrder, acceptOrder, declineOrder, activeOrders, pendingOrders, completeSale, expireOrders, findFulfillingItem, describeRequest, counterOffer, rollTrend } from '../systems/OrderSystem';
import { decayHeat, witnessedDeal, applyArrest, addHeat, heatLevel } from '../systems/HeatSystem';
import { hireRunner, assignRunner, tickRunner } from '../systems/RunnerSystem';
import { hireWorker, assignWorkerRecipe, tickWorker } from '../systems/WorkerSystem';
import { hireDealer, giveDealerStock, takeDealerStock, assignDealerCustomer, unassignDealerCustomer, collectDealerCash, tickDealer, dealerStockCount } from '../systems/DealerSystem';
import { DealerUI } from '../ui/DealerUI';
import { LedgerUI } from '../ui/LedgerUI';
import { checkMilestones } from '../systems/MilestoneSystem';
import { rollWorldEvent, describeEvent, heatMultiplier, activeEvent } from '../systems/EventSystem';
import { relationshipTier } from '../systems/CustomerSystem';
import { AudioSystem, SfxName } from '../audio/Audio';
import { HUD } from '../ui/HUD';
import { Menu } from '../ui/Menu';
import { Panel } from '../ui/Panel';
import { PagerUI, landmarkName, pagerLine } from '../ui/PagerUI';
import { InventoryUI } from '../ui/InventoryUI';
import { ShopUI } from '../ui/ShopUI';
import { PrepUI, PackUI } from '../ui/StationUI';
import { MapUI } from '../ui/MapUI';
import { GameAPI, ToastKind } from '../ui/UIContext';
import { Civilian } from '../entities/NPC';
import { Police } from '../entities/Police';
import { CustomerNPC, REACTION_LINES } from '../entities/CustomerNPC';
import { RunnerNPC } from '../entities/RunnerNPC';
import { WanderingCustomer } from '../entities/WanderingCustomer';
import { Vehicle } from '../player/Vehicle';
import { CUSTOMERS } from '../data/customers';
import { offerSample } from '../systems/CustomerSystem';
import { streetSale, streetSaleCandidate, streetUnitPrice, STREET_SALE_COOLDOWN } from '../systems/OrderSystem';
import { lambert, boxGeo } from '../world/Materials';

const CIVILIAN_COLORS = ['#e91e63', '#9c27b0', '#3f51b5', '#03a9f4', '#009688', '#8bc34a', '#ffeb3b', '#ff9800', '#795548', '#ffffff', '#f44336', '#00bcd4'];
const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
const PANTS = ['#2c3e50', '#37474f', '#5d4037', '#1a237e', '#455a64', '#c9b79c'];

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
  private milestoneTimer = 0;
  private dealerStarvedTimer = 0;
  openPanelId: string | null = null;
  running = false;
  civilians: Civilian[] = [];
  police: Police[] = [];
  customers = new Map<number, CustomerNPC>();
  wanderers = new Map<string, WanderingCustomer>();
  private wandererTimer = 0;
  private gossip: string[] = [];
  runnerNPC: RunnerNPC | null = null;
  private runnerTripFor: number | null = null;
  workerFigure: THREE.Group | null = null;
  vehicle: Vehicle | null = null;
  boomboxOn = false;
  driving = false;
  private carHitTimer = 0;
  private carEye = new THREE.Vector3();
  private workerToastTimer = 0;
  private workerBlockedTimer = 0;
  dancers: Civilian[] = [];
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
    this.scene.add(this.dynamicGroup);
    this.dayNight = new DayNight(this.scene, this.city.night);
    this.dayNight.setLampPositions(this.city.lampPositions);
    this.player = new PlayerController(this.camera, this.input, this.city.colliders);
    this.player.teleport(SPAWN.x, SPAWN.y + 0.2, SPAWN.z, SPAWN.yaw);

    this.hud = new HUD(root);
    this.pager = new PagerUI(root, this);
    this.inventoryUI = new InventoryUI(root, this);
    this.shopUI = new ShopUI(root, this);
    this.prepUI = new PrepUI(root, this);
    this.packUI = new PackUI(root, this);
    this.mapUI = new MapUI(root, this);
    this.dealerUI = new DealerUI(root, this);
    this.ledgerUI = new LedgerUI(root, this);
    for (const p of [this.pager, this.inventoryUI, this.shopUI, this.prepUI, this.packUI, this.mapUI, this.dealerUI, this.ledgerUI]) this.panels[p.id] = p;
    this.menu = new Menu(root, {
      newGame: () => this.startNewGame(),
      continueGame: () => this.continueGame(),
      resetSave: () => clearSave(localStorage),
      resume: () => this.resume(),
      save: () => { this.save(); this.toast('Game saved.'); },
      hasSave: () => hasSave(localStorage),
    });
    this.hud.setVisible(false);
    this.debugEl = document.createElement('div');
    this.debugEl.id = 'debug';
    root.appendChild(this.debugEl);

    this.wireWorldObjects();
    this.spawnPedestrians();
    this.spawnPolice();
    window.addEventListener('resize', () => this.onResize());
    this.renderer.domElement.addEventListener('click', () => {
      if (this.running && !this.openPanelId && !this.menu.visible) {
        this.audio.init();
        this.input.requestLock();
        if (this.placement) this.confirmPlacement();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      if (!locked && this.running && !this.openPanelId && !this.expectUnlock && !this.menu.visible) this.pause();
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

  startNewGame(): void {
    this.state = createNewState();
    this.applyStateToWorld();
    this.orderTimer = 40;
    this.tips = [
      'Grab the STARTER BOX in your back room. Your pager will go off soon.',
      'WASD to move · SHIFT to sprint · E to interact · TAB backpack · P pager · M map',
    ];
    this.tipTimer = 0.5;
    this.beginPlay();
  }

  continueGame(): void {
    const s = loadFromStorage(localStorage);
    if (!s) {
      this.startNewGame();
      return;
    }
    this.state = s;
    this.applyStateToWorld();
    this.orderTimer = 20;
    this.beginPlay();
    this.toast('Welcome back to Sol Palma.');
  }

  private beginPlay(): void {
    this.running = true;
    this.menu.hide();
    this.hud.setVisible(true);
    this.audio.init();
    this.input.requestLock();
  }

  pause(): void {
    if (!this.running) return;
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
    for (const c of this.customers.values()) this.dynamicGroup.remove(c.mesh);
    this.customers.clear();
    for (const w of this.wanderers.values()) {
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
    if (s.runner?.hired) this.createRunnerNPC();
    this.updateWorkerFigure();
    this.driving = false;
    this.syncVehicle();
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
        add({ prompt: () => (this.state.flags.starterTaken ? null : '[E] OPEN STARTER BOX'), onInteract: () => this.takeStarterBox() });
        break;
      case 'prep_table':
        add({ prompt: () => (owned() ? '[E] USE PREP TABLE' : null), onInteract: () => this.openPanel('prep-panel') });
        break;
      case 'pack_table':
        add({ prompt: () => (owned() ? '[E] USE PACKAGING TABLE' : null), onInteract: () => this.openPanel('pack-panel') });
        break;
      case 'storage':
        add({ prompt: () => (owned() ? '[E] OPEN STORAGE' : null), onInteract: () => { this.inventoryUI.storageProperty = o.property ?? 'safehouse'; this.openPanel('inventory-panel'); } });
        break;
      case 'store_counter':
        add({ prompt: () => '[E] BUY · QUICK STOP 24', onInteract: () => this.openShop('store'), radius: 3.6 });
        break;
      case 'pawn_counter':
        add({ prompt: () => '[E] BUY · SOL PALMA PAWN', onInteract: () => this.openShop('pawn'), radius: 4.5 });
        break;
      case 'supplier':
        add({ prompt: () => "[E] TALK · RICO (SUPPLIER)", onInteract: () => this.openShop('supplier'), radius: 3.5 });
        break;
      case 'runner_contact':
        add({ prompt: () => (this.state.runner?.hired ? null : `[E] TALK · DIZZY (HIRE RUNNER $${RUNNER_HIRE_PRICE})`), onInteract: () => this.talkToDizzy(), radius: 3.5 });
        break;
      case 'worker_contact':
        add({ prompt: () => (this.state.worker?.hired ? null : `[E] TALK · MARISOL (HIRE WORKER $${WORKER_HIRE_PRICE})`), onInteract: () => this.talkToMarisol(), radius: 3.5 });
        break;
      case 'dealer_contact':
        add({ prompt: () => (this.state.dealer?.hired ? `[E] TALK · VINCE (DEALER · $${Math.round(this.state.dealer.cash)} waiting)` : `[E] TALK · VINCE (HIRE DEALER $${DEALER_HIRE_PRICE})`), onInteract: () => this.talkToVince(), radius: 3.5 });
        break;
      case 'motel_sign':
        add({ prompt: () => (this.state.properties.includes('motel') ? null : `[E] RENT ROOM 6 ($${MOTEL_PRICE}) · beach stash + safe spot`), onInteract: () => this.rentMotel(), radius: 3.5 });
        break;
      case 'car_sale':
        add({ prompt: () => (this.state.vehicle?.owned ? null : `[E] BUY '88 SEDAN ($${VEHICLE_PRICE})`), onInteract: () => this.buyCar(), radius: 4 });
        break;
      case 'warehouse_sign':
        add({ prompt: () => (this.state.properties.includes('warehouse') ? null : `[E] BUY WAREHOUSE 7 ($${WAREHOUSE_PRICE})`), onInteract: () => { this.buyWarehouse(); }, radius: 3.5 });
        break;
      case 'bed':
        add({ prompt: () => (o.data?.rest || owned() ? '[E] REST UNTIL MORNING' : null), onInteract: () => this.rest(), radius: 3 });
        break;
      case 'payphone':
        add({ prompt: () => (this.payphoneCooldown > 0 ? null : '[E] USE PAYPHONE · CALL AROUND ($1)'), onInteract: () => this.usePayphone(), radius: 2.8 });
        break;
      case 'club_bar':
        add({ prompt: () => '[E] ORDER A DRINK ($5)', onInteract: () => this.buyDrink(), radius: 3.5 });
        break;
      case 'fax':
        add({ prompt: () => '[E] CHECK FAX / LEDGER', onInteract: () => this.openPanel('ledger-panel'), radius: 2.5 });
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
  }

  /** Long-term suspicion puts more officers on the street (4 base, up to 6). */
  private syncPoliceCount(): void {
    const want = 4 + (this.state.suspicion >= 30 ? 1 : 0) + (this.state.suspicion >= 60 ? 1 : 0);
    while (this.police.length < want) {
      const n = this.city.waypoints.random();
      const p = new Police('cop' + this.police.length, n.x, n.z, this.city.colliders, this.city.waypoints);
      this.police.push(p);
      this.dynamicGroup.add(p.mesh);
      this.toast('District 3 added a patrol. Your name is getting around.', 'warn', 5000);
    }
    while (this.police.length > want) {
      const p = this.police.pop()!;
      this.dynamicGroup.remove(p.mesh);
    }
  }

  private createRunnerNPC(): void {
    const home = this.runnerHome();
    this.runnerNPC = new RunnerNPC(home.x, home.z, this.city.colliders, this.city.waypoints);
    this.dynamicGroup.add(this.runnerNPC.mesh);
  }

  private runnerHome(): { x: number; z: number } {
    return this.state.properties.includes('warehouse') ? { x: WAREHOUSE_SIGN.x + 2, z: WAREHOUSE_SIGN.z + 4 } : { x: SAFEHOUSE_DOOR.x + 2, z: SAFEHOUSE_DOOR.z - 3 };
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
    this.dayNight.update(this.clock, this.player.position);
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
    this.player.frozen = uiOpen || this.arrested || this.driving;
    this.clock.tick(dt);
    s.clockMinutes = this.clock.totalMinutes;
    s.stats.playSeconds += dt;
    if (this.driving && this.vehicle) this.updateDriving(dt, uiOpen);
    else this.player.update(dt);
    s.player = { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z, yaw: this.player.yaw };

    if (this.arrested) this.updateArrest(dt);

    // interaction
    const target = this.driving ? null : this.interaction.update(this.camera, this.camera.position);
    this.hud.setPrompt(uiOpen || this.arrested ? null : this.driving ? (Math.abs(this.vehicle!.speed) < 1 ? '[E] GET OUT · SPACE HORN · SHIFT BRAKE' : null) : target ? target.prompt() : this.placement ? '[CLICK] PLACE · [R] ROTATE · [ESC] CANCEL' : null);
    if (!uiOpen && !this.arrested && this.input.wasPressed('KeyE') && this.input.locked) {
      if (this.driving) this.exitCar();
      else if (target) {
        this.audio.play('click');
        target.onInteract();
      }
    }

    // panels
    if (this.openPanelId) this.panels[this.openPanelId].update(this.uiDt);

    // daily trend + world event
    if (rollTrend(s, this.clock.day)) {
      this.toast(`STREET TALK: ${s.trend!.effect} is the hot effect today — products with it sell for +25%.`, 'pager', 7000);
    }
    const ev = rollWorldEvent(s, this.clock.day);
    if (ev) {
      this.audio.play('pager');
      this.hud.pagerNotify('NEWS FLASH\n' + describeEvent(ev)!.toUpperCase().slice(0, 60));
      this.toast('NEWS: ' + describeEvent(ev), 'warn', 9000);
    }
    // orders
    this.orderTimer -= dt;
    if (this.orderTimer <= 0) this.tryGenerateOrder();
    const expired = expireOrders(s, this.clock.totalMinutes);
    for (const o of expired) {
      const c = CUSTOMER_MAP[o.customerId];
      this.despawnCustomer(o.id);
      if (o.status === 'expired' && s.customers[o.customerId]) {
        s.customers[o.customerId].relationship = Math.max(0, s.customers[o.customerId].relationship - 2);
        this.toast(`${c.name.split(' ')[0]} got tired of waiting. Order expired.`, 'warn');
      }
    }
    this.checkCancellations();

    // runner
    const rr = tickRunner(s, dt);
    if (rr.completed) {
      const c = CUSTOMER_MAP[rr.completed.order.customerId];
      this.audio.play('cash');
      this.toast(`Dizzy delivered to ${c.name.split(' ')[0]}: +$${rr.completed.earned} (Dizzy kept $${rr.completed.cut})`, 'cash');
      for (const id of rr.completed.unlocked) this.announceUnlock(id);
      this.despawnCustomer(rr.completed.order.id);
      this.save();
    }
    // production worker
    const wr = tickWorker(s, dt);
    if (wr.produced) {
      this.workerToastTimer -= 1;
      if (this.workerToastTimer <= 0) {
        this.workerToastTimer = 4;
        this.toast(`Marisol finished ${wr.produced.packaged ? 'a packaged' : 'a loose'} ${recipeDisplayName(s, wr.produced.recipeKey)} (in ${s.worker!.property} storage).`, 'info', 3000);
      }
    } else if (wr.blocked && wr.blocked !== 'unassigned') {
      this.workerBlockedTimer -= dt;
      if (this.workerBlockedTimer <= 0) {
        this.workerBlockedTimer = 90;
        this.toast(`Marisol is idle: ${wr.blocked === 'no_base' ? 'no base supply' : wr.blocked === 'no_mods' ? 'no modifiers' : 'storage full'} in ${s.worker!.property} storage.`, 'warn', 4000);
      }
    }
    // dealer
    const dr = tickDealer(s, this.clock.totalMinutes);
    for (const sale of dr.sales) this.toast(`Vince sold ${sale.qty}x ${recipeDisplayName(s, sale.itemKey)} to ${CUSTOMER_MAP[sale.customerId].name.split(' ')[0]} (+$${sale.earned} held).`, 'info', 3000);
    if (dr.hassled) {
      this.audio.play('siren');
      this.toast(`Cops shook Vince down: ${dr.hassled.lost} units lost, HEAT +8.`, 'warn', 6000);
    }
    if (dr.poached) {
      this.audio.play('error');
      this.toast(`${CUSTOMER_MAP[dr.poached].name.split(' ')[0]} got tired of Vince's empty corner and now buys from a rival crew. Keep him stocked!`, 'warn', 8000);
    }
    if (dr.starved) {
      this.dealerStarvedTimer -= 1;
      if (this.dealerStarvedTimer <= 0) {
        this.dealerStarvedTimer = 3;
        this.toast('Vince is out of stock. Customers are walking away from his corner.', 'warn', 5000);
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
        const home = this.runnerHome();
        this.runnerNPC.setHome(home.x, home.z);
        this.runnerNPC.setTrip(l.x, l.z);
      }
      if (active && active.status === 'runner') this.runnerNPC.showProgress(active.runnerProgress ?? 0);
      else if (this.runnerNPC.velocity.lengthSq() > 0 || this.runnerNPC.distanceTo(this.runnerNPC.homeX, this.runnerNPC.homeZ) > 0.5) this.runnerNPC.clearTrip();
      this.runnerNPC.syncVisual(dt);
    }

    // heat
    const safe = this.playerInsideOwnedProperty();
    decayHeat(s, dt, { atSafehouse: safe, hidden: this.playerInsideAnyInterior() });
    const lvl = heatLevel(s.heat);
    if (lvl !== this.lastHeatLevel) {
      if (lvl === 'hunted' || lvl === 'wanted') this.audio.play('siren');
      if (lvl === 'wanted') this.toast('The cops are actively hunting you. Break line of sight!', 'warn');
      this.lastHeatLevel = lvl;
    }

    // NPCs
    this.updateNPCs(dt, safe);

    // ambient audio
    const club = BUILDINGS.find((b) => b.id === 'club')!;
    const dClub = Math.hypot(this.player.position.x - club.x, this.player.position.z - club.z);
    this.audio.update(dt, { club: Math.max(0, 1 - dClub / 45), beach: Math.max(0, Math.min(1, (this.player.position.x - 140) / 40)), night: this.clock.isNight });

    // radio: car stereo while driving, walkman when toggled
    const wantRadio = this.driving || this.boomboxOn;
    if (wantRadio && !this.audio.radio.playing) this.audio.radio.start();
    if (!wantRadio && this.audio.radio.playing) this.audio.radio.stop();
    if (this.audio.radio.playing) this.audio.radio.setLevel(this.driving ? 1 : 0.7);
    // dancers only at night
    const night = this.clock.isNight;
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
    for (let i = 0; i < 8; i++) if (this.input.wasPressed('Digit' + (i + 1)) && !uiOpen) this.hud.selectedSlot = i;

    // placement ghost
    if (this.placement) this.updatePlacement();

    // milestones + daily summary
    this.milestoneTimer -= dt;
    if (this.milestoneTimer <= 0) {
      this.milestoneTimer = 2;
      for (const m of checkMilestones(s)) {
        this.audio.play('unlock');
        this.toast(`GOAL: ${m.title} — +$${m.reward}. (${m.hint})`, 'cash', 6000);
      }
      const day = this.clock.day;
      if (day !== s.stats.lastDay) {
        const earned = Math.round(s.stats.earned - s.stats.earnedAtDayStart);
        const sales = s.stats.sales - s.stats.salesAtDayStart;
        s.stats.lastDay = day;
        s.stats.earnedAtDayStart = s.stats.earned;
        s.stats.salesAtDayStart = s.stats.sales;
        if (sales > 0 || earned > 0) this.toast(`NEW DAY ${day}: yesterday you made $${earned} from ${sales} sales.`, 'pager', 7000);
      }
    }
    // autosave
    this.autosaveTimer -= dt;
    if (this.autosaveTimer <= 0) {
      this.autosaveTimer = 60;
      this.save();
    }

    this.hud.speedText = this.driving && this.vehicle ? `${Math.round(this.vehicle.mph)} MPH` : null;
    this.hudTextTimer -= dt;
    if (this.hudTextTimer <= 0) {
      this.hudTextTimer = 0.2;
      this.objectiveText = this.computeObjective();
      this.orderText = this.currentOrderText();
    }
    this.hud.update(s, this.clock.formatClock(), this.clock.day, this.objectiveText, this.orderText, dt);
  }

  // ------------------------------------------------------------------ NPC updates

  private updateNPCs(dt: number, safe: boolean): void {
    const px = this.player.position.x;
    const pz = this.player.position.z;
    const py = this.player.position.y;
    const los = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean => this.city.colliders.lineOfSight(ax, ay, az, bx, by, bz, 10);
    for (const c of this.civilians) {
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
      const result = p.update(dt, { playerX: px, playerZ: pz, playerY: py, heat: this.state.heat + (crack ? 15 : 0), playerSafe: safe, playerHolding: holding, los });
      p.syncVisual(dt);
      if (result === 'arrest' && !this.arrested) this.beginArrest();
      if (result === 'searched') {
        this.state.flags.cleanSearch = true;
        this.state.heat = Math.max(0, this.state.heat - 15);
        this.toast('Stop-and-search: you were clean. The officer lost interest (Heat -15).', 'info', 4000);
      }
      if (p.pstate === 'CHASE') {
        for (const c of this.civilians) if (c.state !== 'FLEE' && c.distanceTo(p.position.x, p.position.z) < 7) c.reactTo(p.position.x, p.position.z, true);
      }
    }
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
        this.dynamicGroup.remove(c.mesh);
        this.interaction.remove('customer_' + id);
        this.customers.delete(id);
      }
    }
  }

  // ------------------------------------------------------------------ orders & customers

  private tryGenerateOrder(): void {
    const s = this.state;
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
    const o = generateOrder(s, { now: this.clock.totalMinutes, customerId: first ? 'tasha' : undefined, simple: first || s.stats.sales < 2 });
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
    this.toast(`BEEP BEEP · Page from ${c.name}: ${o.qty}x ${describeRequest(this.state, o)} for $${o.price}. Press P.`, 'pager', 6000);
    this.pager.render();
  }

  acceptOrder(id: number): void {
    if (!acceptOrder(this.state, id)) return;
    const o = this.state.orders.find((x) => x.id === id)!;
    this.spawnCustomerFor(o);
    this.audio.play('click');
    this.toast(`Accepted. Meet ${CUSTOMER_MAP[o.customerId].name.split(' ')[0]} at ${landmarkName(o.locationId)}.`);
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
      this.toast(`${who}: "${r.line}" — new price $${r.price}.`, 'cash');
    } else if (r.outcome === 'countered') {
      this.audio.play('pager');
      this.toast(`${who}: "${r.line}"`, 'pager', 5000);
    } else {
      this.audio.play('error');
      this.toast(`${who}: "${r.line}" — order lost.`, 'warn', 5000);
    }
  }

  private spawnCustomerFor(o: Order): void {
    if (this.customers.has(o.id)) return;
    const l = LANDMARKS.find((x) => x.id === o.locationId) ?? LANDMARKS[0];
    const def = CUSTOMER_MAP[o.customerId];
    const npc = new CustomerNPC(def, o.id, l.x + (Math.random() - 0.5) * 2, l.z + (Math.random() - 0.5) * 2, this.city.colliders, this.city.waypoints);
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
        return have ? `[E] SELL ${order.qty}x ${describeRequest(this.state, order)} · $${order.price}` : `[E] TALK · ${def.name.split(' ')[0]} (needs ${order.qty}x ${describeRequest(this.state, order)})`;
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
      return sample ? `[E] OFFER SAMPLE (1x ${resolveItem(s, sample).name}) · ${first}, ${w.def.personality}` : `[E] TALK · ${first} (${w.def.personality}) — bring a sample`;
    }
    const cand = streetSaleCandidate(s, w.def.id);
    const cooling = this.clock.totalMinutes - cs.lastOrderMinute < STREET_SALE_COOLDOWN;
    if (cand && !cooling) return `[E] SELL ${resolveItem(s, cand.id).name} · $${streetUnitPrice(s, w.def.id, cand.key)}/unit · ${first}`;
    return `[E] TALK · ${first} (${w.def.personality})`;
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
        this.toast(`${first} (${def.personality}) does not know you yet. Offer a free sample of a packaged product to win them over.`, 'info', 5000);
        return;
      }
      const r = offerSample(s, def.id, sample);
      if (!r.ok) return;
      w.say(r.line!, r.unlocked ? '#7dff9a' : '#ffd166', 4);
      if (r.unlocked) {
        this.audio.play('unlock');
        this.toast(`NEW CUSTOMER: ${def.name} liked the sample${r.matched ? '' : ' (eventually)'}. They will start paging you.`, 'pager', 6000);
        w.setUnlocked(true);
        const eff = r.matched ? def.prefEffects[0] : null;
        if (eff) w.reactTo(this.player.position.x, this.player.position.z, false);
      } else {
        this.audio.play('click');
        this.toast(`${first}: "${r.line}"`, 'info', 5000);
      }
      this.save();
      return;
    }
    const r = streetSale(s, def.id, this.clock.totalMinutes);
    if (!r.ok) {
      const hint = r.reason === 'cooldown' ? `"I'm good for now. Page you later."` : `"I like ${def.prefBase} with ${def.prefEffects.join(' or ')}. Got anything?"`;
      w.say(hint.replace(/"/g, ''), '#ffd166', 3);
      this.toast(`${first}: ${hint}`, 'info', 4000);
      return;
    }
    this.audio.play('cash');
    const name = recipeDisplayName(s, r.itemKey!);
    this.toast(`+$${r.earned} · Street deal: ${r.qty}x ${name} to ${def.name}${r.trendHit ? ' · TREND BONUS +25%' : ''}`, 'cash');
    for (const id of r.unlocked ?? []) this.announceUnlock(id);
    w.say(def.lines.thanks, '#7dff9a', 3);
    // same exposure rules as a pager deal, but a street corner is a little riskier
    let witnessed = false;
    for (const p of this.police) {
      if (p.distanceTo(w.position.x, w.position.z) < 28 && this.city.colliders.lineOfSight(p.position.x, p.position.y + 1.6, p.position.z, w.position.x, w.position.y + 1.2, w.position.z, 10)) {
        witnessed = true;
        break;
      }
    }
    const zoneMult = heatMultiplier(s, zoneAt(w.position.x));
    if (witnessed) {
      witnessedDeal(s, r.earned! * zoneMult);
      if (zoneMult > 1) addHeat(s, 10);
      this.audio.play('siren');
      this.toast(zoneMult > 1 ? 'Crackdown day and a cop saw that street deal. HEAT spikes!' : 'A cop saw that street deal. HEAT is rising.', 'warn');
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
      npc.say(def.lines.greet, '#ffd166', 3);
      this.toast(`${def.name.split(' ')[0]}: "${def.lines.greet}" — bring ${order.qty}x ${describeRequest(s, order)}.`);
      return;
    }
    const r = completeSale(s, order.id, this.clock.totalMinutes);
    if (!r.ok) return;
    this.audio.play('cash');
    const name = recipeDisplayName(s, r.itemKey!);
    this.toast(`+$${r.earned} · Sold ${order.qty}x ${name} to ${def.name}${r.onTime ? '' : ' (late, 30% off)'}${r.trendHit ? ' · TREND BONUS +25%' : ''}`, 'cash');
    const rel = s.customers[def.id];
    this.toast(`${def.name.split(' ')[0]} relationship ${rel.relationship} (${relationshipTier(rel.relationship)})`, 'info', 2500);
    for (const id of r.unlocked ?? []) this.announceUnlock(id);
    // ---- streamer moments
    const parsed = parseRecipeKey(r.itemKey!);
    const effects = parsed ? computeRecipe(parsed.base, parsed.mods).effects : [];
    const custom = s.recipes[r.itemKey!]?.customName;
    npc.cstate = 'TALK';
    const tooStrong = !!parsed && parsed.mods.length >= 3;
    const reaction: Effect | null = tooStrong ? 'CHAOTIC' : effects.length ? effects[Math.floor(Math.random() * effects.length)] : null;
    if (tooStrong) {
      this.toast(`${def.name.split(' ')[0]} was not ready for a triple-modifier ${name}. Half the block is watching.`, 'warn', 5000);
      addHeat(s, 8);
    }
    const line = custom && Math.random() < 0.5 ? `"${custom}"? Who names these things?!` : reaction ? REACTION_LINES[reaction][Math.floor(Math.random() * 3)] : def.lines.thanks;
    npc.say(line, reaction === 'CHAOTIC' || reaction === 'ENERGY' ? '#ff5c5c' : '#7dff9a', 3.5);
    setTimeout(() => npc.startReaction(reaction), 900);
    // loud reactions draw attention
    const loud = tooStrong || reaction === 'SOCIAL' || reaction === 'CHAOTIC' || reaction === 'CONFIDENT' || reaction === 'ENERGY';
    if (loud) {
      for (const c of this.civilians) if (c.distanceTo(npc.position.x, npc.position.z) < (tooStrong ? 22 : 14)) c.reactTo(npc.position.x, npc.position.z, (tooStrong || reaction === 'CHAOTIC') && Math.random() < 0.6);
    }
    // police witness check
    let witnessed = false;
    for (const p of this.police) {
      const d = p.distanceTo(npc.position.x, npc.position.z);
      if (d < (loud ? 40 : 26) && this.city.colliders.lineOfSight(p.position.x, p.position.y + 1.6, p.position.z, npc.position.x, npc.position.y + 1.2, npc.position.z, 10)) {
        witnessed = true;
        break;
      }
    }
    const zoneMult = heatMultiplier(s, zoneAt(npc.position.x));
    if (witnessed) {
      witnessedDeal(s, r.earned! * zoneMult);
      if (zoneMult > 1) addHeat(s, 10);
      this.audio.play('siren');
      this.toast(zoneMult > 1 ? 'A cop saw that — and it is crackdown day here. HEAT spikes!' : 'A cop saw that. HEAT is rising — get out of sight.', 'warn');
    } else if (loud && def.risk > 0.3) {
      addHeat(s, 6);
    } else if (Math.random() < def.risk * 0.3) {
      addHeat(s, 4);
    }
    if (this.clock.isNight && Math.random() < 0.15) this.toast('Night deal bonus: nobody looks twice after dark.', 'info', 2500);
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
          this.hud.pagerNotify(`${def.name.split(' ')[0].toUpperCase()}: CANT MAKE IT\nSORRY. NEXT TIME.`);
          this.toast(`${def.name.split(' ')[0]} cancelled while you were on the way. Classic ${def.personality}.`, 'warn');
          npc.startLeaving();
        }
      }
    }
  }

  private announceUnlock(id: string): void {
    const c = CUSTOMER_MAP[id];
    if (!c) return;
    this.audio.play('unlock');
    this.toast(`NEW CUSTOMER: ${c.name} (${c.personality}) heard about you from ${CUSTOMER_MAP[c.introducedBy ?? '']?.name.split(' ')[0] ?? 'a friend'}.`, 'pager', 6000);
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
    if (this.placement) this.cancelPlacement();
    if (this.openPanelId && this.openPanelId !== id) this.panels[this.openPanelId].close();
    this.openPanelId = id;
    this.expectUnlock = true;
    this.input.releaseLock();
    this.panels[id].open();
  }

  closePanel(): void {
    if (!this.openPanelId) return;
    this.panels[this.openPanelId].close();
    this.openPanelId = null;
    this.inventoryUI.storageProperty = null;
    this.input.uiCaptured = false;
    this.input.requestLock();
  }

  sendRunner(id: number): void {
    const r = assignRunner(this.state, id);
    if (!r.ok) {
      this.audio.play('error');
      this.toast(r.reason === 'no_stock' ? 'Runner needs the packaged product in your STORAGE first.' : r.reason === 'busy' ? 'Dizzy is already on a run.' : 'Cannot send the runner.', 'warn');
      return;
    }
    const o = this.state.orders.find((x) => x.id === id)!;
    const l = LANDMARKS.find((x) => x.id === o.locationId)!;
    if (r.queued) {
      this.audio.play('click');
      this.toast(`Queued for Dizzy: ${o.qty}x ${describeRequest(this.state, o)} to ${l.name} (after his current run).`);
      this.despawnCustomer(o.id);
      return;
    }
    if (this.runnerNPC) {
      const home = this.runnerHome();
      this.runnerNPC.setHome(home.x, home.z);
      this.runnerNPC.setTrip(l.x, l.z);
      this.runnerTripFor = o.id;
      this.runnerNPC.say('On it, boss!', '#7fffd4', 2.5);
    }
    this.audio.play('click');
    this.toast(`Dizzy grabbed ${o.qty}x ${describeRequest(this.state, o)} from ${r.property} storage and is heading to ${l.name}.`);
    this.despawnCustomer(o.id);
  }

  buy(shopId: string, itemId: string, qty: number): PurchaseResult {
    const r = buyFromShop(this.state, shopId, itemId, qty);
    if (r.ok && ITEMS[itemId].category === 'equipment' && !itemId.endsWith('_kit')) this.toast(`Bought ${ITEMS[itemId].name}: ${ITEMS[itemId].desc}`, 'cash', 5000);
    return r;
  }

  buyDelivered(shopId: string, itemId: string, qty: number): PurchaseResult {
    const r = buyDelivered(this.state, shopId, itemId, qty);
    if (r.ok) this.toast(`Rico will drop ${qty}x ${ITEMS[itemId].name} at Warehouse 7 storage.`, 'info', 2500);
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
    if (ok) this.toast(`Product named "${this.state.recipes[key].customName}".`);
    return ok;
  }

  deposit(property: string, id: string, qty: number): number {
    const n = depositToStorage(this.state, property, id, qty);
    if (n > 0) this.audio.play('click');
    else this.toast('Storage is full.', 'warn');
    return n;
  }

  withdraw(property: string, id: string, qty: number): number {
    const n = withdrawFromStorage(this.state, property, id, qty);
    if (n > 0) this.audio.play('click');
    else this.toast('No room in your backpack.', 'warn');
    return n;
  }

  hireRunner(): boolean {
    if (!hireRunner(this.state, RUNNER_HIRE_PRICE)) {
      this.audio.play('error');
      this.toast(`Dizzy wants $${RUNNER_HIRE_PRICE} up front.`, 'warn');
      return false;
    }
    this.audio.play('unlock');
    this.toast('Dizzy is on the payroll! Stock packaged products in STORAGE, then use SEND RUNNER on the pager. Dizzy keeps 20%.', 'cash', 8000);
    this.createRunnerNPC();
    this.updateRunnerContact();
    this.save();
    return true;
  }

  dealerGive(itemId: string, qty: number): number {
    const n = giveDealerStock(this.state, itemId, qty);
    if (n > 0) this.audio.play('click');
    else this.toast('Vince cannot carry more.', 'warn');
    return n;
  }
  dealerTake(itemId: string, qty: number): number {
    const n = takeDealerStock(this.state, itemId, qty);
    if (n > 0) this.audio.play('click');
    else this.toast('No room in your backpack.', 'warn');
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
      this.audio.play('cash');
      this.toast(`Collected $${n} from Vince.`, 'cash');
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
      this.toast(`Vince: "I move product for people who have product. $${DEALER_HIRE_PRICE} buys my corner. You have $${Math.floor(s.cash)}."`, 'info', 5000);
      this.audio.play('error');
      return;
    }
    if (!this.confirmTwice('dealer', `Hire Vince as a dealer for $${DEALER_HIRE_PRICE}? Give him stock, assign customers, collect cash`)) return;
    if (hireDealer(s, DEALER_HIRE_PRICE)) {
      this.audio.play('unlock');
      this.toast('Vince works for you now. Hand him packaged product, assign up to 5 customers, and come back for the cash.', 'cash', 8000);
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
    const fig = makeFigure('#8e24aa', '#c68642', '#263238');
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
    this.toast(`${question} — press E again to confirm.`, 'pager', 5000);
    return false;
  }

  private talkToMarisol(): void {
    const s = this.state;
    if (s.worker?.hired) return;
    if (!s.properties.includes('warehouse')) {
      this.toast('Marisol: "I do production work, but not in somebody\'s back room. Get a real workspace and we talk."', 'info', 5000);
      return;
    }
    if (s.cash < WORKER_HIRE_PRICE) {
      this.toast(`Marisol: "$${WORKER_HIRE_PRICE} and I run your prep line all day. You have $${Math.floor(s.cash)}."`, 'info', 5000);
      this.audio.play('error');
      return;
    }
    if (!this.confirmTwice('worker', `Hire Marisol for $${WORKER_HIRE_PRICE}? She turns warehouse supplies into packaged product non-stop`)) return;
    if (hireWorker(s, WORKER_HIRE_PRICE, 'warehouse')) {
      this.audio.play('unlock');
      this.toast('Marisol is hired! Stock base supplies, modifiers and baggies in WAREHOUSE STORAGE, then assign her a recipe at a PREP TABLE.', 'cash', 9000);
      this.updateWorkerFigure();
      this.save();
    }
  }

  private talkToDizzy(): void {
    if (this.state.runner?.hired) return;
    const s = this.state;
    if (s.cash < RUNNER_HIRE_PRICE) {
      this.toast(`Dizzy: "I run packages all over town. $${RUNNER_HIRE_PRICE} and I'm yours. You got $${Math.floor(s.cash)}. Come back richer."`, 'info', 5000);
      this.audio.play('error');
      return;
    }
    if (this.confirmTwice('runner', `Hire Dizzy for $${RUNNER_HIRE_PRICE}? Dizzy delivers orders from your storage and keeps 20%`)) this.hireRunner();
  }

  buyWarehouse(): boolean {
    const s = this.state;
    if (s.properties.includes('warehouse')) return false;
    if (s.cash < WAREHOUSE_PRICE) {
      this.audio.play('error');
      this.toast(`Warehouse 7 costs $${WAREHOUSE_PRICE}. You have $${Math.floor(s.cash)}.`, 'warn');
      return false;
    }
    if (!this.confirmTwice('warehouse', `Buy Warehouse 7 for $${WAREHOUSE_PRICE}? Big storage, room for equipment, runner base`)) return false;
    spendCash(s, WAREHOUSE_PRICE);
    s.properties.push('warehouse');
    s.storage.warehouse = s.storage.warehouse ?? [];
    this.audio.play('unlock');
    this.toast('YOU OWN WAREHOUSE 7. Buy station kits at the pawn shop and place them inside (walk in with a kit, press B).', 'cash', 8000);
    this.updateWarehouseSign();
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
    const target = h < 7 ? 7 : 7 + 24;
    const add = (target - h) * 60;
    this.clock.totalMinutes += add;
    s.clockMinutes = this.clock.totalMinutes;
    s.heat = 0;
    s.suspicion = Math.max(0, s.suspicion - 5);
    this.audio.play('unlock');
    this.toast('You slept until morning. Heat is gone.', 'info');
    for (const o of expireOrders(s, this.clock.totalMinutes)) {
      this.despawnCustomer(o.id);
      if (s.customers[o.customerId]) s.customers[o.customerId].relationship = Math.max(0, s.customers[o.customerId].relationship - 2);
    }
    this.orderTimer = 10;
    this.save();
  }

  callAround(): void {
    if (!this.state.upgrades.includes('eq_brickphone')) return;
    if (this.payphoneCooldown > 0) {
      this.toast(`Battery is recharging… try again in ${Math.ceil(this.payphoneCooldown)}s.`, 'warn');
      return;
    }
    this.usePayphone(true);
  }

  private usePayphone(fromPhone = false): void {
    const s = this.state;
    if (!fromPhone && s.cash < 1) {
      this.toast('You need a dollar for the payphone.', 'warn');
      return;
    }
    if (pendingOrders(s).length >= 2) {
      this.toast('Your pager is already full of messages. Deal with those first.', 'warn');
      return;
    }
    if (!fromPhone) spendCash(s, 1);
    this.payphoneCooldown = fromPhone ? 30 : 45;
    this.audio.play('click');
    const o = generateOrder(s, { now: this.clock.totalMinutes, simple: s.stats.sales < 2 });
    if (o) {
      this.toast('You called around… someone paged you back.', 'info');
      setTimeout(() => this.announceOrder(o), 1200);
    } else this.toast('Nobody is picking up right now. Try later.', 'warn');
  }

  private buyDrink(): void {
    if (!spendCash(this.state, 5)) {
      this.toast('Bartender: "No money, no drink."', 'warn');
      return;
    }
    this.audio.play('cash');
    this.state.heat = Math.max(0, this.state.heat - 5);
    this.toast('You nurse a $5 drink and blend in. Heat -5.');
  }

  private takeStarterBox(): void {
    const s = this.state;
    if (s.flags.starterTaken) return;
    s.flags.starterTaken = true;
    addItem(s, 'pulp_sunset', 3);
    addItem(s, 'baggies', 6);
    this.audio.play('unlock');
    this.toast('Starter box: 3x Sunset Pulp, 6x Zip Baggies. Prep the pulp at the PREP TABLE, then bag it at PACKAGING.', 'cash', 7000);
  }

  placeStation(kind: 'prep_table' | 'pack_table' | 'storage'): boolean {
    const kit = kind === 'prep_table' ? 'prep_station_kit' : kind === 'pack_table' ? 'pack_station_kit' : 'shelf_kit';
    if (countItem(this.state, kit) === 0) return false;
    this.beginPlacement(kind, kit);
    return true;
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
    this.vehicle = new Vehicle(v.x, v.z, v.yaw, this.city.colliders);
    this.dynamicGroup.add(this.vehicle.mesh);
    this.interaction.add({
      id: 'car',
      position: this.vehicle.position,
      radius: 4,
      aimY: 0.8,
      prompt: () => (this.driving ? null : '[E] ENTER CAR'),
      onInteract: () => this.enterCar(),
    });
  }

  private rentMotel(): void {
    const s = this.state;
    if (s.properties.includes('motel')) return;
    if (s.cash < MOTEL_PRICE) {
      this.audio.play('error');
      this.toast(`Room 6 is $${MOTEL_PRICE} for the season. You have $${Math.floor(s.cash)}.`, 'info', 5000);
      return;
    }
    if (!this.confirmTwice('motel', `Rent Room 6 at the Ocean View Motel for $${MOTEL_PRICE}? Beach-side stash, bed, cops stay out`)) return;
    spendCash(s, MOTEL_PRICE);
    s.properties.push('motel');
    s.storage.motel = s.storage.motel ?? [];
    this.audio.play('unlock');
    this.toast('Room 6 is yours: a stash by the beach strip, a bed to rest in, and no cops inside.', 'cash', 7000);
    const sign = this.city.objects.find((o) => o.kind === 'motel_sign');
    if (sign) sign.mesh.visible = false;
    this.save();
  }

  private buyCar(): void {
    const s = this.state;
    if (s.vehicle?.owned) return;
    if (s.cash < VEHICLE_PRICE) {
      this.audio.play('error');
      this.toast(`Rojas: "$${VEHICLE_PRICE}, runs great, A/C is a rumor." You have $${Math.floor(s.cash)}.`, 'info', 5000);
      return;
    }
    if (!this.confirmTwice('car', `Buy the '88 sedan for $${VEHICLE_PRICE}? Cross town in seconds, drive-by deliveries`)) return;
    spendCash(s, VEHICLE_PRICE);
    s.vehicle = { owned: true, x: CAR_SALE_SPOT.x, z: CAR_SALE_SPOT.z + 4, yaw: CAR_SALE_SPOT.yaw };
    this.audio.play('unlock');
    this.toast("You own a car. W/S drive · A/D steer · SHIFT brake · SPACE horn · E get out. It saves where you leave it.", 'cash', 8000);
    this.syncVehicle();
    this.save();
  }

  private enterCar(): void {
    if (!this.vehicle || this.driving) return;
    this.driving = true;
    this.player.pitch = 0;
    this.player.yaw = this.vehicle.cameraYaw;
    this.audio.play('click');
    this.cancelPlacement();
  }

  private exitCar(): void {
    if (!this.vehicle || !this.driving) return;
    if (Math.abs(this.vehicle.speed) > 1) return;
    this.driving = false;
    const spot = this.vehicle.exitSpot();
    this.player.teleport(spot.x, this.vehicle.position.y + 0.3, spot.z, this.vehicle.cameraYaw);
    this.state.vehicle = { owned: true, x: this.vehicle.position.x, z: this.vehicle.position.z, yaw: this.vehicle.yaw };
    this.save();
  }

  private updateDriving(dt: number, uiOpen: boolean): void {
    const v = this.vehicle!;
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
    v.eye(this.carEye);
    this.camera.position.copy(this.carEye);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.player.pitch, this.player.yaw, 0);
    if (r === 'hit') {
      this.audio.play('error');
      this.carHitTimer -= dt;
      if (this.carHitTimer <= 0) {
        this.carHitTimer = 2;
        addHeat(this.state, 3);
      }
    }
    if (r === 'horn') {
      this.audio.play('siren');
      for (const c of this.civilians) if (c.distanceTo(v.position.x, v.position.z) < 12) c.reactTo(v.position.x, v.position.z, false);
      for (const w of this.wanderers.values()) if (w.distanceTo(v.position.x, v.position.z) < 12) w.say('HEY! I am walking here!', '#ffd166', 2);
    }
    // pedestrians scatter from a moving car
    if (Math.abs(v.speed) > 3) {
      for (const c of this.civilians) {
        if (c.state !== 'FLEE' && c.distanceTo(v.position.x, v.position.z) < 3.5) {
          c.reactTo(v.position.x, v.position.z, true);
          addHeat(this.state, 4);
        }
      }
    }
  }

  // ------------------------------------------------------------------ placement mode (warehouse)

  private beginPlacement(kind: PlacedStation['kind'], item: string): void {
    if (this.placement) this.cancelPlacement();
    const size = kind === 'storage' ? [3, 2.2, 0.6] : [2.2, 1, 1];
    const ghost = new THREE.Mesh(boxGeo(size[0], size[1], size[2]), lambert('#4ff2e8', { transparent: true, opacity: 0.45 }));
    this.dynamicGroup.add(ghost);
    this.placement = { kind, ghost, rot: 0, item };
    this.toast('Placement mode: aim at the floor, CLICK to place, R to rotate, ESC to cancel.', 'info', 5000);
  }

  private placementArea(): WorldObject | null {
    return this.city.objects.find((o) => o.kind === 'placement_area') ?? null;
  }

  private placementPoint(): { x: number; z: number } | null {
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
    this.toast(`Placed ${ITEMS[this.placement.item].name.replace(' Kit', '')}.`, 'cash');
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
      this.toast('Equipment placement needs a warehouse. Warehouse 7 is for sale at the docks.', 'warn');
      return;
    }
    if (!this.playerInsideBuilding('warehouse')) {
      this.toast('Go inside your warehouse to place equipment.', 'warn');
      return;
    }
    const kits: [string, PlacedStation['kind']][] = [['prep_station_kit', 'prep_table'], ['pack_station_kit', 'pack_table'], ['shelf_kit', 'storage']];
    const sel = this.state.inventory[this.hud.selectedSlot];
    const chosen = kits.find(([k]) => sel?.id === k) ?? kits.find(([k]) => countItem(this.state, k) > 0);
    if (!chosen) {
      this.toast('You have no station kits. The pawn shop sells them once you own the warehouse.', 'warn');
      return;
    }
    this.beginPlacement(chosen[1], chosen[0]);
  }

  // ------------------------------------------------------------------ police / arrest

  private beginArrest(): void {
    if (this.driving && this.vehicle) {
      this.vehicle.speed = 0;
      this.driving = false;
      const spot = this.vehicle.exitSpot();
      this.player.teleport(spot.x, 0.3, spot.z, this.vehicle.cameraYaw);
    }
    this.arrested = true;
    this.arrestTimer = 3.2;
    this.audio.play('arrest');
    this.hud.flashArrest(true);
    const r = applyArrest(this.state);
    this.clock.totalMinutes = this.state.clockMinutes;
    const items = r.confiscated.map((c) => `${c.qty}x ${resolveItem(this.state, c.id).name}`).join(', ');
    this.toast(`BUSTED. ${items ? 'Confiscated: ' + items + '. ' : ''}Fine: $${r.fine}. You lost 6 hours in a holding cell.`, 'warn', 9000);
    for (const o of this.state.orders) if (o.status === 'accepted' || o.status === 'failed' || o.status === 'expired') this.despawnCustomer(o.id);
    if (this.openPanelId) this.closePanel();
    this.cancelPlacement();
  }

  private updateArrest(dt: number): void {
    this.arrestTimer -= dt;
    if (this.arrestTimer <= 0) {
      this.arrested = false;
      this.hud.flashArrest(false);
      // released in front of the police station
      this.player.teleport(70, 0.3, -24, Math.PI);
      for (const p of this.police) p.pstate = 'PATROL';
      this.toast('Released. "Stay out of trouble." Your customers are still out there.', 'info', 5000);
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

  private computeObjective(): string {
    const s = this.state;
    if (this.arrested) return 'Being processed at District 3…';
    if (!s.flags.starterTaken) return 'Open the STARTER BOX in your back room.';
    const pending = pendingOrders(s);
    if (pending.length) return `Pager: ${pending.length} new order${pending.length > 1 ? 's' : ''}. Press P to accept or decline.`;
    const active = activeOrders(s).filter((o) => o.status === 'accepted');
    if (active.length) {
      const o = active[0];
      const c = CUSTOMER_MAP[o.customerId];
      const have = findFulfillingItem(s, o);
      if (have) return `Deliver ${o.qty}x ${describeRequest(s, o)} to ${c.name.split(' ')[0]} at ${landmarkName(o.locationId)}.`;
      const loose = looseProductsInInventory(s);
      if (loose.length) return `Package ${describeRequest(s, o)} at the PACKAGING table (need ${o.qty} baggies).`;
      const hasBase = ['pulp_sunset', 'wax_velvet', 'gel_neon'].some((id) => countItem(s, id) > 0);
      if (hasBase) return `Prep ${describeRequest(s, o)} at the PREP TABLE${o.effects.length ? ' — use modifiers to get ' + o.effects.join('+') : ''}.`;
      return `Buy supplies from Rico at the Container Yard (docks) for ${describeRequest(s, o)}.`;
    }
    if (s.runner?.activeOrderId !== null && s.runner?.hired) return 'Dizzy is out on a delivery. Prep more stock while you wait.';
    const looseNow = looseProductsInInventory(s);
    if (looseNow.length && countItem(s, 'baggies') > 0) return `Package your ${recipeDisplayName(s, looseNow[0].key)} at the PACKAGING table.`;
    if (['pulp_sunset', 'wax_velvet', 'gel_neon'].some((id) => countItem(s, id) > 0) && s.stats.produced === 0) return 'Prep your Sunset Pulp at the PREP TABLE while you wait for a page.';
    if (countItem(s, 'baggies') < 3) return 'Stock up on baggies at Quick Stop 24. Wait for the next page.';
    if (s.cash >= WAREHOUSE_PRICE && !s.properties.includes('warehouse')) return `You can afford WAREHOUSE 7 ($${WAREHOUSE_PRICE}) at the docks.`;
    if (s.cash >= RUNNER_HIRE_PRICE && !s.runner?.hired && s.stats.sales >= 4) return `Hire Dizzy the runner near the Ocean View Motel ($${RUNNER_HIRE_PRICE}).`;
    if (s.properties.includes('warehouse') && !s.worker?.hired && s.cash >= WORKER_HIRE_PRICE) return `Hire Marisol (production worker) at the Port Authority ($${WORKER_HIRE_PRICE}).`;
    if (!s.dealer?.hired && s.cash >= DEALER_HIRE_PRICE && Object.values(s.customers).filter((c) => c.unlocked).length >= 5) return `Hire Vince as a dealer near Neptune Arcade ($${DEALER_HIRE_PRICE}) to offload customers.`;
    if (s.dealer?.hired && dealerStockCount(s) === 0 && s.dealer.customers.length > 0) return 'Vince is out of stock: bring him packaged product at Neptune Arcade.';
    if (s.dealer?.hired && s.dealer.cash >= 200) return `Vince is holding $${Math.round(s.dealer.cash)} for you. Swing by Neptune Arcade.`;
    if (s.worker?.hired && !s.worker.recipeKey) return 'Assign Marisol a recipe at a PREP TABLE and stock the warehouse storage.';
    if (s.cash >= 220 && !s.upgrades.includes('eq_mixer')) return 'Buy a Turbo Mixer at Sol Palma Pawn ($220) to prep faster.';
    if (!s.properties.includes('motel') && s.cash >= MOTEL_PRICE + 200 && s.properties.includes('warehouse')) return `Rent Room 6 at the Ocean View Motel ($${MOTEL_PRICE}) for a beach-side stash.`;
    if (!s.vehicle?.owned && s.cash >= VEHICLE_PRICE + 100 && s.stats.sales >= 6) return `Buy the '88 sedan at Rojas Auto Repair ($${VEHICLE_PRICE}) to cross town fast.`;
    if (packagedInInventory(s).length && s.runner?.hired) return 'Store packaged product in STORAGE so Dizzy can deliver it.';
    return 'Waiting for a page… restock, or use a payphone to call around for work.';
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
        return `${c.name.split(' ')[0]} · ${o.qty}x ${describeRequest(s, o)} · $${o.price}<br/>${landmarkName(o.locationId)} · by ${GameClock.formatMinutes(o.windowEnd)} · ${tag}`;
      })
      .join('<hr style="border:0;border-top:1px solid #444;margin:4px 0"/>');
  }

  playerXZ(): { x: number; z: number } {
    return { x: this.player.position.x, z: this.player.position.z };
  }
  policeXZ(): { x: number; z: number }[] {
    return this.police.map((p) => ({ x: p.position.x, z: p.position.z }));
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

  save(): void {
    if (!this.running || this.arrested) return;
    this.state.clockMinutes = this.clock.totalMinutes;
    if (this.vehicle && this.state.vehicle) this.state.vehicle = { owned: true, x: this.vehicle.position.x, z: this.vehicle.position.z, yaw: this.vehicle.yaw };
    if (this.driving) {
      // never save the player "inside" the car: put them next to it
      const spot = this.vehicle!.exitSpot();
      this.state.player = { x: spot.x, y: this.vehicle!.position.y, z: spot.z, yaw: this.vehicle!.cameraYaw };
    }
    saveToStorage(this.state, localStorage);
  }

  // ------------------------------------------------------------------ input

  private onKey(e: KeyboardEvent): void {
    if (!this.running) return;
    if (this.menu.visible) {
      if (e.code === 'Escape' && this.menu.mode === 'pause') this.resume();
      return;
    }
    if (this.openPanelId) {
      const panel = this.panels[this.openPanelId];
      if (e.code === 'Escape' || (e.code === 'Tab' && this.openPanelId === 'inventory-panel') || (e.code === 'KeyP' && this.openPanelId === 'pager-panel') || (e.code === 'KeyM' && this.openPanelId === 'map-panel')) {
        e.preventDefault();
        this.closePanel();
        return;
      }
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (panel.onKey(e.code)) e.preventDefault();
      return;
    }
    if (this.arrested) return;
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
      case 'KeyN':
        this.boomboxOn = !this.boomboxOn;
        this.audio.init();
        this.toast(this.boomboxOn ? 'Walkman ON · SOL PALMA FM (press N to stop)' : 'Walkman OFF');
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

