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
| `Shift` | Sprint (drains stamina; refills when you slow down) |
| `Space` | Jump (also: STIR / SEAL inside station panels) |
| `E` | Interact (talk, buy, use station, sell, open storage…) |
| `Tab` | Backpack, product book, customer book |
| `P` | Pager (accept / decline / haggle, send the runner) |
| `Y` / `X` | Accept / decline the newest page without opening the pager |
| `M` | Paper map of Sol Palma |
| `1`–`8` | Select hotbar slot |
| `B` | Place equipment (inside your warehouse, with a station kit in your backpack) |
| `N` | Radio: cycles SOL PALMA FM → THE WAVE → FUNK CITY → SIGNAL ZERO → off (walkman on foot, car stereo while driving) |
| any key | Skips a cutscene (Escape pauses instead) |
| `H` | Hide/show the HUD (screenshot mode) |
| `W S A D` / `Shift` / `Space` | In the car: drive / brake / horn |
| `R` | Rotate equipment in placement mode |
| `Esc` | Close panel / pause menu (save, how to play, settings: sensitivity & volumes) |
| `F3` | Performance overlay (fps, draw calls, triangles) |

A compass at the top of the screen points at the current target (the waiting customer, Rico when you need
supplies, the right table when you need to prep or bag, or Vince when he is holding cash).

## The first five minutes

1. Open the **STARTER BOX** in your back room (3× Sunset Pulp, 6× Zip Baggies).
2. Use the **PREP TABLE**: pick the pulp, press START, tap `Space` when the needle is in the green zone
   (3 good stirs = +1 bonus unit, 5 = +2).
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
* **Orders** arrive on the pager (accept / decline / haggle for +10–35 %), have a meeting spot and a
  time window. Payphones let you "call around" for work; the Brick Phone raises order frequency.
* **Customers walk the city** on their own schedule (night owls after dark, day people by day). Locked
  customers can be won over with a free sample of a packaged product (their taste decides); unlocked
  customers buy straight out of your backpack in street deals.
* **Street talk & news**: every day one effect is "hot" (+25 % on sales), and from day 2 a world event
  may hit — police crackdown in a zone, a supply shortage that doubles Rico's price, a beach club
  night that pays +30 % after dark, a port authority inspection that seizes a quarter of the product on
  your warehouse shelves (once you own it and have a reputation), or Sal's rival crew working one of your
  customers for the day — no pages from them until you show up in person and close a deal.
* **Police & Heat**: witnessed deals and loud customer reactions raise Heat (0–100). Officers escalate
  through PATROL → NOTICE → INVESTIGATE → APPROACH → SEARCH → CHASE. At medium heat they stop and
  search you: carrying contraband means arrest, being clean means they lose interest. Break line of
  sight, dive into an alley dumpster (E), or get home. Arrest = contraband confiscated + fine + suspicion + 6 lost hours. Never a game over.
  Long-term suspicion puts extra patrols on the street (4 → 6 officers).
* **Property**: buy **Warehouse 7** ($1,800) at the docks, then place shelves, prep stations and
  packaging tables inside it (grid-snapped placement mode).
* **Automation**: hire **Dizzy** ($600) near the Ocean View Motel. Stock packaged product in storage,
  then use *SEND RUNNER* on any accepted order. Dizzy walks there, closes the deal and keeps 20 %.
  Once you own the warehouse, hire **Marisol** ($900) at the Port Authority: assign her a recipe at a prep
  table and she turns stored supplies + baggies into packaged product around the clock. Hire **Vince**
  ($1,000) near Neptune Arcade as a dealer: hand him stock, assign up to five customers, and they stop
  paging you — he sells on his corner and holds the cash until you collect it (and sometimes gets shaken
  down by the cops; leave him without stock for too long and a rival crew poaches his customers). Dizzy
  takes a queue of deliveries; once you own the warehouse Rico delivers supplies there for a 20 % fee. Supplies in, dealer out — the loop you used to do by hand now runs itself.
* **Legit front**: buy the Lucky Laundromat ($2,200) — clean income every morning and your long-term
  suspicion cools down 12 points a day.
* **Second stash**: rent Room 6 at the Ocean View Motel ($1,200) for beach-side storage and a bed.
* **Wheels**: the '88 sedan at Rojas Auto Repair ($900) crosses town in seconds, honks pedestrians out
  of the way, and stays wherever you park it.
* **Boredom**: sell a customer the same product three times in a row and they start asking for a
  different effect (and refuse the usual on the street) — keep experimenting.
* **VIP rush orders**: regulars sometimes page a double-size order at +60 % pay with a 50-minute window.
* **Name your crew** at the ledger: it goes up in neon on Warehouse 7.
* **Goals**: the fax/CRT ledger in your back room lists 14 milestones with cash rewards, crew status and
  today's street talk; each morning you get yesterday's numbers.
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
  audio/                  WebAudio sfx (CC0 samples with synth fallbacks), ambience, 4-station radio with DJ chatter
tests/                    Vitest behavioural tests for the systems
e2e/                      Playwright smoke test
```

Design rules that shaped the code:

* Gameplay logic never touches Three.js objects; `Game.ts` is the only place that maps state to meshes.
  The state is a plain JSON object, which keeps save/load trivial and leaves the door open for co-op later.
* Rendering is cheap on purpose: shared Lambert materials, cached CanvasTextures, InstancedMesh for palms,
  lamps and road dashes, a static-merge pass that folds ~1,900 prop meshes into ~460 draw buckets,
  one shadow-casting directional light, a pool of six point lights that follow the
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
- 12 customers with relationships, tiers, friend-unlock chains, sample unlocks, street deals, haggling,
  preferences, custom-name reactions; they wander their home zones when not waiting for you.
- Prep table stir minigame, packaging table sealing, deterministic modifier chemistry, combo names,
  player-named products shown everywhere.
- Heat + suspicion, 4 patrol officers with a 7-state FSM, stop-and-search, chase, arrest with soft penalties.
- 26 ambient pedestrians with wander/wait/react/flee, 7 club dancers at night.
- Runner employee (Dizzy) with visible deliveries and a 20 % cut; production worker (Marisol) who
  converts warehouse storage into packaged product; dealer (Vince) with stock, assigned customers,
  automatic corner sales and shakedown events.
- Customers carry a wallet ($75 + $6 per relationship point, more when generous): dealer rounds and
  street deals only move what they can afford, so premium product needs real relationships first.
- Haggling is one attempt per order with a mood factor (the REL and personality tags are hints, not a
  table); it unlocks after your second sale. The runner queues at most two runs and one in twenty
  deliveries goes wrong.
- Daily trend bonus, world events twice a day (crackdown / shortage / club night), pedestrian gossip about
  your named products, 14 milestone goals with rewards, morning summaries.
- Drivable arcade sedan (Kenney CC0 model, box fallback) with a chase camera that orbits with the mouse
  and pulls in at walls; horn, headlights and persisted parking spot. Streets are lined with Kenney
  sedans, hatchbacks, SUVs, taxis and vans merged into a handful of draw calls.
- GTA-style radio: three CC0 music stations plus a procedural pirate synth loop, each with its own DJ,
  fake 1996 commercials for in-game businesses and topical lines (police heat, world events); stations
  keep running while you are tuned elsewhere and the last station is remembered.
- CC0 sample sound effects (Kenney) for footsteps, cash, UI, doors, jingles for goals/customers/busts,
  with the original procedural synth sounds as fallback when a file is missing.
- Accelerated day/night with neon, lit windows, lamp pool, fog and sunset tint. Showers roll in about
  one event slot in four (per-save seed): rain streaks, greyer sky and denser fog, a rain bed that is
  muffled indoors and in the car, and heat that cools 20% faster while it lasts.
- Skippable cutscenes: an opening flyover over Sol Palma with title cards, and a BUSTED / 6 HOURS LATER
  sequence on arrest. The title screen orbits the live city at sunset with a CC0 theme (starts on the first
  click) and shows the save at a glance; the menu has HOW TO PLAY, SETTINGS and a CREDITS page listing
  every CC0 asset.
- Engine drone while driving; Club Mirage streams a CC0 track that is muffled from the street and
  full-range inside.
- localStorage save/load with validation and repair of partial saves.
- 56 Vitest tests covering behavioural contracts + Playwright smoke and core-loop tests.

## Known limitations

* Art is entirely procedural box geometry; characters are stylised block figures.
* The car uses a square collision footprint and bounces off walls; there is no damage model.
* Police navigate by steering toward the player through the collision world; when they get wedged on
  props they detour along the sidewalk graph for a few seconds, then give up if they still cannot see you.
* Balance is tuned for a 30–45 minute demonstration, not long-term play.
* Headless/software-rendered browsers run far below 60 fps; a normal desktop GPU is expected.

## Roadmap

1. **Handler employee** moving goods between warehouse, dealer and motel, plus multiple workers and dealers.
2. **Animated characters** (Kenney CC0 rigs) for customers, police and crew; police cruisers that patrol.
3. A talk/news station that reports the day's events in full.
4. **Co-op** (one player produces, one sells, one manages, one drives) on top of the serializable state.
5. More interiors and richer NPC schedules.

## Development report (v0.1)

**Implemented** — everything listed under *Implemented systems*, built in nine iterations after the MVP:
haggling, wandering customers with samples and street deals, dealer network, world events, milestones,
crew naming, drivable sedan, procedural radio, motel and laundromat properties, VIP orders, boredom,
stamina, dumpster hiding, warehouse inspections, settings, and five code-review rounds of fixes.

**Tested** — 56 Vitest behavioural tests (economy, production chemistry, orders, haggling, samples,
street deals, dealer, worker, runner queue, heat/arrest, events, milestones, save repair and migration);
Playwright smoke, core-loop, warehouse/worker, runner/dealer, police and front-end e2e; scripted browser regressions for warehouse placement, worker, dealer,
runner queue, motel, car, hiding, arrest; a 6-game-hour automated soak of the late-game economy with
reload; screenshot passes for every district by day and night.

**v0.2 (audio-visual pass)** — four-station radio with DJ chatter, commercials and topical lines;
Kenney CC0 sample sound effects and jingles with synth fallbacks; Kenney car models for the player's
sedan, parked cars and police cruisers, with a chase camera; skippable cutscenes (opening flyover,
property purchases, crew sign, arrest) that can be switched off in SETTINGS; live 3D title screen with
theme music and a credits page; engine drone, club music by proximity, surf and distant sirens; a
seventh code-review round (car orientation, mirrored-wheel winding, radio cycle, cutscene cancel on
quit, sample preloading). Verified with scripted headless-browser passes for every new feature plus
the existing Vitest and Playwright suites.

**v0.3 (adversarial pass)** — hostile-save fuzzing, monkey testing with state invariants, injection probes,
a 120-minute scripted-player balance simulation and two review agents drove: full save repair, a stored-XSS
fix, night-only sleeping, the dumpster line-of-sight rule, customer wallets, haggle mood noise, runner
limits and mishaps, late-order grace, half-day event slots with a v3 save migration, per-save seeds,
witnessed deals that trigger a stop-and-search, and a 60% triangle cut on parked cars.

**Known issues** — see *Known limitations*; additionally pointer-lock recovery after a browser-forced
exit can need one extra click, and the software-rendered headless browser used for CI-style checks runs
at ~4 fps, so timing-sensitive checks there rely on frame counting.

**Next 5 priorities** — 1. a persistent rival crew with territory (beyond the daily event); 2. handler employee
and multi-worker warehouses; 3. richer NPC schedules (customers at work/home/club by hour);
4. co-op on top of the serialisable state; 5. more original radio stations and interiors.

## Licensing

All code, textures and world geometry in this repository are original. The only third-party content is in
`public/assets/` and every file there is CC0 1.0 (public domain): Kenney sound effects, music jingles and
car models, and music by HoliznaCC0, Komiku and Loyalty Freak Music. The full per-file attribution table is in
[`public/assets/LICENSES.md`](public/assets/LICENSES.md). None of these files is required: if they are
missing the game falls back to the procedural sounds and the synth radio loop.
