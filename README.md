# SUNSET SYNDICATE

*A first-person underground-business simulator set in the fictional Florida coastal city of **Sol Palma**, 1996.*

You arrive with $80, a pager and a rented back room behind a laundromat. You start by personally
prepping, bagging and hand-delivering fictional products to a handful of named customers. Every dollar
gets reinvested: better tools, a warehouse, a runner who delivers for you, and eventually a city-wide
operation that runs while you manage the bigger problems (police heat, product trends, customers who
cancel while you are halfway across town).

> **Content note:** every product, ingredient, effect and process in this game is fictional and
> abstract. There are no real-world recipes or instructions of any kind.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production bundle in dist/
npm test           # Vitest logic tests (economy, production, orders, heat, runner, save/load)
npm run test:e2e   # Playwright smoke test (game boots, HUD shows, no startup errors)
```

Desktop Chrome / Edge recommended. Click the canvas to capture the mouse (Pointer Lock).

## Controls

| Key | Action |
| --- | --- |
| `W A S D` | Move |
| Mouse | Look |
| `Shift` | Sprint |
| `Space` | Jump (also: STIR / SEAL inside station panels) |
| `E` | Interact (talk, buy, use station, sell, open storage…) |
| `Tab` | Backpack, product book, customer book |
| `P` | Pager (accept / decline orders, send the runner) |
| `M` | Paper map of Sol Palma |
| `1`–`8` | Select hotbar slot |
| `B` | Place equipment (inside your warehouse, with a station kit in your backpack) |
| `R` | Rotate equipment in placement mode |
| `Esc` | Close panel / pause menu (save, quit to title) |
| `F3` | Performance overlay (fps, draw calls, triangles) |

## The first five minutes

1. Open the **STARTER BOX** in your back room (3× Sunset Pulp, 6× Zip Baggies).
2. Use the **PREP TABLE**: pick the pulp, press START, tap `Space` when the needle is in the green zone.
3. Give the result a street name (it shows up on pagers, in your backpack and in sale messages).
4. Bag it at the **PACKAGING** table (one press per unit until you buy a Heat Sealer).
5. Your pager beeps: `2x SUNSET · $68 · DEL MAR RECORDS · BY 17:40 -TASHA`. Press `P`, ACCEPT.
6. Walk to Del Mar Records, find Tasha, press `E`. Cash, relationship, and a cartoon reaction.

## Progression loop

```
manual labor  →  better tools  →  semi-automation  →  employees  →  full automation  →  management problems
   (you)         Turbo Mixer       Heat Sealer         Runner         Warehouse +         heat, cancellations,
                 Backpack          Brick Phone         (Dizzy)        placed stations     rival trends (roadmap)
```

* **Supplies**: Rico's van at the container yard sells base supplies and street modifiers; Quick Stop 24
  sells baggies and "candy-aisle" modifiers; Sol Palma Pawn sells equipment and station kits.
* **Products**: 3 fictional bases (**SUNSET / VELVET / NEON**) × 6 modifiers (Flux Chips, Velvet Drops,
  Solar Tabs, Static Dust, Blue Sparks, Glow Powder). Modifiers are applied in order and *transform* existing
  effect tags, so `VELVET + Flux + Drops` ≠ `VELVET + Drops + Flux`. Named combos (Beach Party, Lava Lamp,
  Wall Street…) pay a bonus. Every product can be given a custom street name.
* **Customers**: 12 persistent named NPCs with personality, preferred product/effects, price generosity,
  reliability and risk. Deals raise relationship → bigger orders, better prices, friends-of-friends unlock.
* **Orders** arrive on the pager (accept / decline), have a meeting spot and a time window. Payphones let
  you "call around" for work; the Brick Phone raises order frequency.
* **Police & Heat**: witnessed deals and loud customer reactions raise Heat (0–100). Officers escalate
  through PATROL → NOTICE → INVESTIGATE → APPROACH → SEARCH → CHASE. Break line of sight or get home.
  Arrest = contraband confiscated + fine + suspicion + 6 lost hours. Never a game over.
* **Property**: buy **Warehouse 7** ($2,500) at the docks, then place shelves, prep stations and
  packaging tables inside it (grid-snapped placement mode).
* **Automation**: hire **Dizzy** ($600) near the Ocean View Motel. Stock packaged product in storage,
  then use *SEND RUNNER* on any accepted order. Dizzy walks there, closes the deal and keeps 20 %.
* **Day / night**: 1 real second = 1 game minute. Night brings neon, club crowds and lamp-lit streets.
* **Save / load**: autosave every minute and after every sale; NEW GAME / CONTINUE / RESET SAVE on the
  title screen; save from the pause menu. Stored in `localStorage`.

## Architecture

Vanilla TypeScript + Vite + Three.js (WebGLRenderer). No physics engine, no UI framework, no external assets.

```
src/
  main.ts                 bootstrap
  game/Game.ts            orchestrator: loop, wiring, GameAPI for the UI
  game/GameState.ts       plain serializable state (everything the save contains)
  core/                   Input (pointer lock + key codes), GameClock, EventBus
  player/                 first-person controller (AABB body, step-up, sprint, jump, head bob)
  physics/Colliders.ts    tiny AABB world with a broad-phase grid, moveBody, lineOfSight
  world/                  City builder (hand-authored layout in data/city.ts), procedural textures,
                          props (InstancedMesh palms/lamps), interiors, waypoint graph, DayNight
  entities/               NPC base + Civilian FSM, Police FSM, CustomerNPC reactions, RunnerNPC
  systems/                pure gameplay logic operating on GameState:
                          Inventory, Economy, Production, Customer, Order, Heat, Runner, Save, Interaction
  ui/                     DOM/CSS HUD, pager, backpack/storage, shops, prep & packaging stations, map, menu
  data/                   items & shops, product chemistry, customers, city layout
  audio/                  WebAudio-synthesised pager beep, cash, siren, ambience, club bass
tests/                    Vitest behavioural tests for the systems
e2e/                      Playwright smoke test
```

Design rules that shaped the code:

* Gameplay logic never touches Three.js objects; `Game.ts` is the only place that maps state to meshes.
  The state is a plain JSON object, which keeps save/load trivial and leaves the door open for co-op later.
* Rendering is cheap on purpose: shared Lambert materials, cached CanvasTextures, InstancedMesh for palms,
  lamps and road dashes, one shadow-casting directional light, a pool of six point lights that follow the
  player between street lamps, and distance-based LOD for pedestrian updates.
* Interaction uses a distance + view-cone test against registered anchors rather than mesh raycasting.

## Implemented systems (MVP v0.1)

- Compact 460 m × 380 m district: beach strip, downtown, industrial docks; 32 buildings, 6 interiors
  (back room, Quick Stop 24, Sol Palma Pawn, Ocean View Motel room, Warehouse 7, Club Mirage), alleys,
  piers, container yard, 8 payphones, police station exterior.
- First-person movement with collision, curbs/steps, sprint, jump.
- Reusable interactable system with contextual prompts.
- 8-slot inventory with stacks, categories, storage transfer, Courier Backpack upgrade.
- Three vendors, equipment upgrades, warehouse purchase, station kits and placement mode.
- Pager order system with time windows, accept/decline, expiry, cancellations, payphone "call around".
- 12 customers with relationships, tiers, friend-unlock chains, preferences, custom-name reactions.
- Prep table stir minigame, packaging table sealing, deterministic modifier chemistry, combo names,
  player-named products shown everywhere.
- Heat + suspicion, 4 patrol officers with a 7-state FSM, chase, arrest with soft penalties.
- 26 ambient pedestrians with wander/wait/react/flee, 7 club dancers at night.
- Runner employee (Dizzy) with visible deliveries and a 20 % cut.
- Accelerated day/night with neon, lit windows, lamp pool, fog and sunset tint; procedural audio.
- localStorage save/load with validation and repair of partial saves.
- 24 Vitest tests covering behavioural contracts + Playwright smoke test.

## Known limitations

* Art is entirely procedural box geometry; characters are stylised block figures.
* No vehicles yet (walking/sprinting only — the district is sized for it).
* Police navigate by steering toward the player through the collision world; they can get stuck on
  dense props for a moment (they recover via SEARCH/RETURN_TO_PATROL).
* The production worker employee is not in this build (runner is the automation proof of concept).
* Balance is tuned for a 30–45 minute demonstration, not long-term play.
* Headless/software-rendered browsers run far below 60 fps; a normal desktop GPU is expected.

## Roadmap

1. **Production worker**: assign a recipe and a station; watch the warehouse make product without you.
2. **Dynamic pressure events**: police crackdowns, supplier shortages, product trends, warehouse
   inspections, VIP orders — automation should create new management problems, not remove play.
3. **Arcade car** for faster deliveries and drive-by handoffs.
4. **Rival organisation** contesting neighbourhoods; dealer network with territory.
5. **Co-op** (one player produces, one sells, one manages, one drives) on top of the serializable state.
6. More interiors, richer NPC schedules, and a proper soundtrack made of original tracks.

## Licensing

All code and generated assets in this repository are original. No third-party art, audio or fonts are used
beyond system fonts.
