import { GameState } from '../game/GameState';
import { PurchaseResult } from '../systems/EconomySystem';
import { PrepPlan, PrepResult, PackageResult } from '../systems/ProductionSystem';
import { SfxName } from '../audio/Audio';
import { DicePick, DiceResult } from '../systems/DiceSystem';

/** Escape player-typed text (product/crew names) before it goes into innerHTML. */
export function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export type ToastKind = 'info' | 'cash' | 'warn' | 'pager';

/** What UI panels are allowed to ask the game to do. Implemented by Game. */
export interface GameAPI {
  readonly state: GameState;
  now(): number;
  toast(msg: string, kind?: ToastKind): void;
  sfx(name: SfxName): void;
  closePanel(): void;
  /** Take the bus from the current stop to another district's stop. */
  rideBus(stopId: string): void;
  /** One throw of street dice. */
  playDice(bet: number, pick: DicePick): DiceResult;
  acceptOrder(id: number): void;
  haggle(id: number, markup: number): void;
  declineOrder(id: number): void;
  sendRunner(id: number): void;
  buy(shopId: string, itemId: string, qty: number): PurchaseResult;
  buyDelivered(shopId: string, itemId: string, qty: number): PurchaseResult;
  /** Sol Palma Pawn markers: borrow a tier amount / pay some of it back. */
  takeLoan(amount: number): boolean;
  repayLoan(amount: number): number;
  prep(plan: PrepPlan): PrepResult;
  packageProduct(key: string, qty: number): PackageResult;
  nameRecipe(key: string, name: string): boolean;
  deposit(property: string, id: string, qty: number): number;
  withdraw(property: string, id: string, qty: number): number;
  hireRunner(): boolean;
  callAround(): void;
  assignWorker(recipeKey: string | null): boolean;
  dealerGive(itemId: string, qty: number): number;
  dealerTake(itemId: string, qty: number): number;
  dealerAssign(customerId: string, on: boolean): boolean;
  dealerCollect(): number;
  buyWarehouse(): boolean;
  rest(): void;
  placeStation(kind: 'prep_table' | 'pack_table' | 'storage'): boolean;
  playerXZ(): { x: number; z: number };
  policeXZ(): { x: number; z: number }[];
  customerXZ(): { id: string; x: number; z: number; orderId: number }[];
  runnerXZ(): { x: number; z: number } | null;
  hasScanner(): boolean;
  setCrewName(name: string): void;
}
