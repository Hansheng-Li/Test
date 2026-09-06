/**
 * Arcade car model, pure so it can be unit-tested: throttle, brakes, steering, a kart-style drift
 * (hold the handbrake while steering: the nose swings further than the car travels, the drift
 * charges the nitro and letting go fires a short boost-out) and a nitro that kicks on the first frame.
 * Yaw convention matches the world: the car's nose points along (sin yaw, cos yaw).
 */

export interface CarSpec {
  maxSpeed: number;
  reverseMax: number;
  accel: number;
  brake: number;
  friction: number;
}

export interface CarControls {
  throttle: boolean;
  reverse: boolean;
  /** +1 left, -1 right, 0 straight. */
  steer: number;
  handbrake: boolean;
  nitro: boolean;
}

export interface CarSim {
  speed: number;
  yaw: number;
  /** Direction the car actually travels; lags behind `yaw` in a drift. */
  travelYaw: number;
  /** Smoothed steering input. */
  steer: number;
  drifting: boolean;
  /** +1 drifting left, -1 right, 0 none. */
  driftDir: number;
  driftTime: number;
  /** 0..1 nitro charge. */
  nitro: number;
  boosting: boolean;
  /** Seconds left on the drift boost-out. */
  kick: number;
}

export interface CarEvents {
  driftStart: boolean;
  driftEnd: boolean;
  /** A drift long enough to earn a boost-out just ended. */
  boostOut: boolean;
  nitroStart: boolean;
}

/** Below this the handbrake only brakes; above it, with steering, the car drifts. */
export const DRIFT_MIN_SPEED = 7;
/** A drift breaks off when the car scrubs down to this. */
export const DRIFT_KEEP_SPEED = 4;
/** Nitro gained per second of drifting (a full bar in 2.5 s). */
export const DRIFT_CHARGE = 0.4;
/** Passive refill when the car is not drifting or boosting. */
export const NITRO_REFILL_SECONDS = 14;
export const NITRO_BURN_SECONDS = 2.5;
/** An empty bar has to refill to this before nitro fires again (no stuttering on the last drop). */
export const NITRO_MIN_START = 0.25;
/** Drifts at least this long earn a boost-out on release. */
export const BOOST_OUT_MIN_DRIFT = 0.5;
/** Largest angle between the nose and the travel direction while drifting. */
export const MAX_SLIP = 0.85;

export function newCarSim(yaw: number): CarSim {
  return { speed: 0, yaw, travelYaw: yaw, steer: 0, drifting: false, driftDir: 0, driftTime: 0, nitro: 1, boosting: false, kick: 0 };
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Angle between the nose and the travel direction (positive when the nose points left of travel). */
export function slipAngle(s: CarSim): number {
  return wrap(s.yaw - s.travelYaw);
}

/** Advance the car one frame. Mutates `s`; returns the events that started or ended this frame. */
export function stepCar(s: CarSim, spec: CarSpec, c: CarControls, dt: number): CarEvents {
  const ev: CarEvents = { driftStart: false, driftEnd: false, boostOut: false, nitroStart: false };
  // --- nitro: hold to burn; the first frame also throws the car forward
  const wantBoost = c.nitro && c.throttle && s.speed > 1 && (s.boosting ? s.nitro > 0 : s.nitro >= NITRO_MIN_START);
  if (wantBoost && !s.boosting) ev.nitroStart = true;
  s.boosting = wantBoost;
  // --- drift state: handbrake + steering at speed, forward only
  const wasDrifting = s.drifting;
  const canDrift = c.handbrake && s.speed >= (wasDrifting ? DRIFT_KEEP_SPEED : DRIFT_MIN_SPEED) && !c.reverse;
  if (!wasDrifting && canDrift && c.steer !== 0) {
    s.drifting = true;
    s.driftDir = Math.sign(c.steer);
    s.driftTime = 0;
    ev.driftStart = true;
  } else if (wasDrifting && !canDrift) {
    s.drifting = false;
    ev.driftEnd = true;
    if (s.driftTime >= BOOST_OUT_MIN_DRIFT) {
      ev.boostOut = true;
      s.kick = 0.7;
      s.speed = Math.min(spec.maxSpeed * 1.15, s.speed + Math.min(6, 2 + s.driftTime * 2));
    }
    s.driftDir = 0;
    s.driftTime = 0;
  }
  if (s.drifting) s.driftTime += dt;
  s.kick = Math.max(0, s.kick - dt);
  // --- charge: drifting fills the bar fast, idling refills it slowly, boosting drains it
  if (s.boosting) s.nitro = Math.max(0, s.nitro - dt / NITRO_BURN_SECONDS);
  else if (s.drifting) s.nitro = Math.min(1, s.nitro + dt * DRIFT_CHARGE);
  else s.nitro = Math.min(1, s.nitro + dt / NITRO_REFILL_SECONDS);
  // --- longitudinal
  let top = spec.maxSpeed * (s.boosting ? 1.35 : 1);
  if (s.kick > 0) top = Math.max(top, spec.maxSpeed * 1.15);
  if (ev.nitroStart) s.speed = Math.min(top, s.speed + 5);
  // above the top speed (a boost that just ended) the excess bleeds off gently instead of snapping
  const underTop = s.speed <= top;
  if (c.throttle) s.speed += spec.accel * (s.boosting ? 2.4 : s.drifting ? 0.55 : 1) * dt;
  else if (c.reverse) s.speed -= (s.speed > 0 ? spec.brake : spec.accel * 0.6) * dt;
  else s.speed -= Math.sign(s.speed) * Math.min(Math.abs(s.speed), spec.friction * dt);
  if (c.handbrake && !s.drifting) s.speed -= Math.sign(s.speed) * Math.min(Math.abs(s.speed), spec.brake * 1.2 * dt);
  if (s.drifting) {
    // the tyres scrub sideways: a slow bleed plus a little more the harder the slide
    const scrub = spec.friction * 1.2 + Math.abs(slipAngle(s)) * 1.5;
    s.speed -= Math.min(s.speed, scrub * dt);
  }
  if (underTop) s.speed = Math.min(top, s.speed);
  else if (s.speed > top) s.speed -= (s.speed - top) * Math.min(1, dt * 2.5);
  s.speed = Math.max(spec.reverseMax, s.speed);
  // --- steering
  s.steer += (c.steer - s.steer) * Math.min(1, dt * (s.drifting ? 12 : 8));
  const speedFactor = Math.min(1, Math.abs(s.speed) / (s.drifting ? 8 : 6));
  if (s.drifting) {
    // the slide keeps turning on its own; steering into it tightens, counter-steering straightens
    s.yaw += (s.driftDir * 1.3 + s.steer * 1.5) * speedFactor * dt;
  } else {
    s.yaw += s.steer * 1.8 * speedFactor * dt * Math.sign(s.speed || 1);
  }
  // --- travel direction: instant with grip, lazy in a drift, a quick snap after one
  const rate = s.drifting ? 1.3 : s.kick > 0 ? 6 : 14;
  let rel = wrap(s.yaw - s.travelYaw);
  if (s.drifting && Math.abs(rel) > MAX_SLIP) {
    s.travelYaw = s.yaw - Math.sign(rel) * MAX_SLIP;
    rel = Math.sign(rel) * MAX_SLIP;
  }
  s.travelYaw += rel * Math.min(1, dt * rate);
  s.yaw = wrap(s.yaw);
  s.travelYaw = wrap(s.travelYaw);
  return ev;
}
