import { SAFEHOUSE_DOOR, SUPPLIER_SPOT, RUNNER_CONTACT_SPOT, WORKER_CONTACT_SPOT, DEALER_CONTACT_SPOT, HANDLER_CONTACT_SPOT, RESPRAY_PRICE, BUS_FARE, BUS_MINUTES } from './city';
import { WAREHOUSE_PRICE, RUNNER_HIRE_PRICE, WORKER_HIRE_PRICE, DEALER_HIRE_PRICE, HANDLER_HIRE_PRICE, VEHICLE_PRICE, MOTEL_PRICE, FRONT_PRICE } from './items';
import { GameState } from '../game/GameState';

/** A place in the journal's directory: what it is for and where the compass should point. */
export interface PlaceEntry {
  id: string;
  /** English name (translated with tn). */
  name: string;
  /** English blurb (translated with t; may contain price placeholders). */
  what: string;
  vars?: Record<string, number>;
  x: number;
  z: number;
  color: string;
}

export const PLACES: PlaceEntry[] = [
  { id: 'safehouse', name: 'Back Room', what: 'Home. Prep table, packaging table, storage shelf and the fax ledger. Cops stay out.', x: SAFEHOUSE_DOOR.x, z: SAFEHOUSE_DOOR.z, color: '#2e7d32' },
  { id: 'containers', name: 'Container Yard', what: "Rico's van: base supplies (pulp, wax, gel) and modifiers. Delivers to Warehouse 7 once you own it.", x: SUPPLIER_SPOT.x, z: SUPPLIER_SPOT.z, color: '#ff9800' },
  { id: 'store', name: 'Quick Stop 24', what: 'Baggies and a few supplies, open all night.', x: 7, z: -40, color: '#c9a227' },
  { id: 'pawn', name: 'Sol Palma Pawn', what: 'Equipment (backpack, mixer, scanner, sealer, brick phone), station kits, the pistol and rounds, and markers when you are short of cash.', x: -27, z: -40, color: '#c9a227' },
  { id: 'rojas', name: 'Rojas Auto Repair', what: "The '88 sedan for ${VEHICLE_PRICE}; resprays for ${RESPRAY_PRICE} (heat -30, chase called off).", vars: { VEHICLE_PRICE, RESPRAY_PRICE }, x: -90, z: -40, color: '#b9b1a4' },
  { id: 'warehouse', name: 'Warehouse 7', what: 'For sale at ${WAREHOUSE_PRICE}: place stations and shelves, Marisol works here, Teddy keeps the office.', vars: { WAREHOUSE_PRICE }, x: -175, z: -36, color: '#2e7d32' },
  { id: 'motel', name: 'Ocean View Motel', what: 'Dizzy the runner for hire (${RUNNER_HIRE_PRICE}). Room 6 for rent (${MOTEL_PRICE}): a beach-side stash and a bed.', vars: { RUNNER_HIRE_PRICE, MOTEL_PRICE }, x: RUNNER_CONTACT_SPOT.x, z: RUNNER_CONTACT_SPOT.z, color: '#00838f' },
  { id: 'port', name: 'Port Authority', what: 'Marisol the production worker for hire (${WORKER_HIRE_PRICE}).', vars: { WORKER_HIRE_PRICE }, x: WORKER_CONTACT_SPOT.x, z: WORKER_CONTACT_SPOT.z, color: '#6a1b9a' },
  { id: 'arcade', name: 'Neptune Arcade', what: 'Vince the dealer for hire (${DEALER_HIRE_PRICE}); street dice behind the building.', vars: { DEALER_HIRE_PRICE }, x: DEALER_CONTACT_SPOT.x, z: DEALER_CONTACT_SPOT.z, color: '#8e24aa' },
  { id: 'laundromat', name: 'Lucky Laundromat', what: 'A legit front for sale (${FRONT_PRICE}): clean income every morning and a cooler reputation.', vars: { FRONT_PRICE }, x: -27, z: 2, color: '#26a69a' },
  { id: 'bus', name: 'Sol Palma Transit', what: 'Orange bus stops, one per district: ${BUS_FARE} and {BUS_MINUTES} minutes to another district. Not while a cop is on your heels.', vars: { BUS_FARE, BUS_MINUTES }, x: 70, z: -111, color: '#e67e22' },
];

/** People worth knowing, with what they do and where to find them. */
export interface ContactEntry {
  id: string;
  name: string;
  role: string;
  where: string;
  what: string;
  vars?: Record<string, number>;
  x: number;
  z: number;
  color: string;
  /** null when there is nothing to hire; otherwise whether they are on the payroll. */
  hired: (s: GameState) => boolean | null;
}

export const CONTACTS: ContactEntry[] = [
  { id: 'rico', name: 'Rico', role: 'Supplier', where: 'Container Yard', what: 'Sells base supplies and modifiers, no receipts. Left you the starter box and the hatchback.', x: SUPPLIER_SPOT.x, z: SUPPLIER_SPOT.z, color: '#f39c12', hired: () => null },
  { id: 'dizzy', name: 'Dizzy', role: 'Runner', where: 'Ocean View Motel', what: 'Delivers pager orders from your storage for ${RUNNER_HIRE_PRICE}. Two runs queued, one trip in twenty goes wrong.', vars: { RUNNER_HIRE_PRICE }, x: RUNNER_CONTACT_SPOT.x, z: RUNNER_CONTACT_SPOT.z, color: '#00bcd4', hired: (s) => !!s.runner?.hired },
  { id: 'marisol', name: 'Marisol', role: 'Production worker', where: 'Port Authority', what: 'Preps and bags a recipe from warehouse storage for ${WORKER_HIRE_PRICE}. Needs Warehouse 7.', vars: { WORKER_HIRE_PRICE }, x: WORKER_CONTACT_SPOT.x, z: WORKER_CONTACT_SPOT.z, color: '#8e24aa', hired: (s) => !!s.worker?.hired },
  { id: 'vince', name: 'Vince', role: 'Dealer', where: 'Neptune Arcade', what: 'Works a corner with your stock for ${DEALER_HIRE_PRICE}: sells to the customers you assign him, holds the cash until you collect.', vars: { DEALER_HIRE_PRICE }, x: DEALER_CONTACT_SPOT.x, z: DEALER_CONTACT_SPOT.z, color: '#212121', hired: (s) => !!s.dealer?.hired },
  { id: 'teddy', name: 'Teddy', role: 'Handler', where: 'Warehouse 7 office', what: 'Carries packaged product from the warehouse to Vince every hour for ${HANDLER_HIRE_PRICE}. Needs Warehouse 7 and Vince.', vars: { HANDLER_HIRE_PRICE }, x: HANDLER_CONTACT_SPOT.x, z: HANDLER_CONTACT_SPOT.z, color: '#795548', hired: (s) => !!s.handler?.hired },
  { id: 'rojas', name: 'Rojas', role: 'Mechanic', where: 'Rojas Auto Repair', what: "Sells the '88 sedan and resprays it when the city is hot.", x: -90, z: -40, color: '#b9b1a4', hired: () => null },
];
