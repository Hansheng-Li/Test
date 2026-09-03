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
| `N` | Walkman on/off (original procedural synth radio, also plays in the car) |
| `H` | Hide/show the HUD (screenshot mode) |
| `W S A D` / `Shift` / `Space` | In the car: drive / brake / horn |
| `R` | Rotate equipment in placement mode |
| `Esc` | Close panel / pause menu (save, how to play, settings: sensitivity & volumes) |
| `F3` | Performance overlay (fps, draw calls, triangles) |

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
  night that pays +30 % after dark, or (once you own the warehouse and have a reputation) a port
  authority inspection that seizes a quarter of the product on your shelves.
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
* **Legit front**: buy the Lucky Laundromat ($3,000) — clean income every morning and your long-term
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
  audio/                  WebAudio-synthesised pager beep, cash, siren, ambience, club bass
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
- Daily trend bonus, daily world events (crackdown / shortage / club night), pedestrian gossip about
  your named products, 14 milestone goals with rewards, morning summaries.
- Drivable arcade sedan with horn, headlights and persisted parking spot; procedural synth radio.
- Accelerated day/night with neon, lit windows, lamp pool, fog and sunset tint; procedural audio.
- localStorage save/load with validation and repair of partial saves.
- 55 Vitest tests covering behavioural contracts + Playwright smoke and core-loop tests.

## Known limitations

* Art is entirely procedural box geometry; characters are stylised block figures.
* The car uses a square collision footprint and bounces off walls; there is no damage model.
* Police navigate by steering toward the player through the collision world; they can get stuck on
  dense props for a moment (they recover via SEARCH/RETURN_TO_PATROL).
* Balance is tuned for a 30–45 minute demonstration, not long-term play.
* Headless/software-rendered browsers run far below 60 fps; a normal desktop GPU is expected.

## Roadmap

1. **Rival organisation** contesting neighbourhoods and poaching dealer customers.
2. **More pressure events**: warehouse inspections, VIP orders, dealer loyalty problems.
3. **Handler employee** moving goods between stations, plus multiple workers and dealers.
4. **Co-op** (one player produces, one sells, one manages, one drives) on top of the serializable state.
5. More interiors, richer NPC schedules, and more original radio stations.

## Licensing

All code and generated assets in this repository are original. No third-party art, audio or fonts are used
beyond system fonts.
