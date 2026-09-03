import { GameState } from '../game/GameState';
import { PurchaseResult } from '../systems/EconomySystem';
import { PrepPlan, PrepResult, PackageResult } from '../systems/ProductionSystem';
import { SfxName } from '../audio/Audio';

export type ToastKind = 'info' | 'cash' | 'warn' | 'pager';

/** What UI panels are allowed to ask the game to do. Implemented by Game. */
export interface GameAPI {
  readonly state: GameState;
  now(): number;
  toast(msg: string, kind?: ToastKind): void;
  sfx(name: SfxName): void;
  closePanel(): void;
  acceptOrder(id: number): void;
  declineOrder(id: number): void;
  sendRunner(id: number): void;
  buy(shopId: string, itemId: string, qty: number): PurchaseResult;
  prep(plan: PrepPlan): PrepResult;
  packageProduct(key: string, qty: number): PackageResult;
  nameRecipe(key: string, name: string): boolean;
  deposit(property: string, id: string, qty: number): number;
  withdraw(property: string, id: string, qty: number): number;
  hireRunner(): boolean;
  assignWorker(recipeKey: string | null): boolean;
  buyWarehouse(): boolean;
  rest(): void;
  placeStation(kind: 'prep_table' | 'pack_table' | 'storage'): boolean;
  playerXZ(): { x: number; z: number };
  policeXZ(): { x: number; z: number }[];
  customerXZ(): { id: string; x: number; z: number; orderId: number }[];
  runnerXZ(): { x: number; z: number } | null;
  hasScanner(): boolean;
}
