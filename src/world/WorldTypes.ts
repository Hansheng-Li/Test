import * as THREE from 'three';

/** Gameplay anchor produced by the city builder; systems attach behaviour to these. */
export interface WorldObject {
  kind:
    | 'prep_table'
    | 'pack_table'
    | 'storage'
    | 'starter_box'
    | 'store_counter'
    | 'pawn_counter'
    | 'bed'
    | 'payphone'
    | 'warehouse_sign'
    | 'supplier'
    | 'runner_contact'
    | 'worker_contact'
    | 'dealer_contact'
    | 'club_bar'
    | 'placement_area'
    | 'fax';
  id: string;
  position: THREE.Vector3;
  mesh: THREE.Object3D;
  /** Which property this object belongs to ('safehouse' | 'warehouse'), if any. */
  property?: string;
  data?: Record<string, unknown>;
}

export interface NightToggle {
  /** Materials whose emissive intensity is animated with darkness. */
  emissive: THREE.MeshLambertMaterial[];
  lights: THREE.Light[];
  facades: { material: THREE.MeshLambertMaterial; day: THREE.Texture; night: THREE.Texture }[];
}
