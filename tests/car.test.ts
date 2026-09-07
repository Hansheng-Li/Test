import { describe, it, expect } from 'vitest';
import { stepCar, newCarSim, slipAngle, DRIFT_MIN_SPEED, MAX_SLIP, type CarControls, type CarSpec, type CarEvents } from '../src/systems/CarSystem';

const SEDAN: CarSpec = { maxSpeed: 29, reverseMax: -7, accel: 15.5, brake: 26, friction: 3.5 };
const idle: CarControls = { throttle: false, reverse: false, steer: 0, handbrake: false, nitro: false };
const DT = 1 / 60;

function run(sim: ReturnType<typeof newCarSim>, c: Partial<CarControls>, seconds: number): CarEvents[] {
  const out: CarEvents[] = [];
  for (let t = 0; t < seconds; t += DT) out.push(stepCar(sim, SEDAN, { ...idle, ...c }, DT));
  return out;
}

describe('car model', () => {
  it('accelerates to the top speed and coasts down with friction', () => {
    const s = newCarSim(0);
    run(s, { throttle: true }, 6);
    expect(s.speed).toBeCloseTo(SEDAN.maxSpeed, 0);
    run(s, {}, 2);
    expect(s.speed).toBeCloseTo(SEDAN.maxSpeed - 7, 0);
    run(s, { reverse: true }, 4);
    expect(s.speed).toBeCloseTo(SEDAN.reverseMax, 0);
  });

  it('holds a grip turn with almost no slip', () => {
    const s = newCarSim(0);
    run(s, { throttle: true }, 3);
    run(s, { throttle: true, steer: 1 }, 1);
    expect(s.yaw).toBeGreaterThan(1);
    expect(Math.abs(slipAngle(s))).toBeLessThan(0.15);
  });

  it('drifts kart-style: the nose leads the travel direction, it charges nitro and ends with a boost-out', () => {
    const s = newCarSim(0);
    run(s, { throttle: true }, 3);
    s.nitro = 0;
    const evs = run(s, { throttle: true, steer: 1, handbrake: true }, 1.2);
    expect(evs.filter((e) => e.driftStart).length).toBe(1);
    expect(s.drifting).toBe(true);
    expect(s.driftDir).toBe(1);
    const slip = slipAngle(s);
    expect(slip).toBeGreaterThan(0.4);
    expect(slip).toBeLessThanOrEqual(MAX_SLIP + 1e-6);
    expect(s.nitro).toBeGreaterThan(0.4);
    expect(s.speed).toBeGreaterThan(DRIFT_MIN_SPEED);
    const before = s.speed;
    const end = run(s, { throttle: true, steer: 0 }, DT);
    expect(end[0].driftEnd).toBe(true);
    expect(end[0].boostOut).toBe(true);
    expect(s.drifting).toBe(false);
    expect(s.kick).toBeGreaterThan(0);
    expect(s.speed).toBeGreaterThan(before + 2);
    // the slide straightens out quickly once grip is back
    run(s, { throttle: true }, 1);
    expect(Math.abs(slipAngle(s))).toBeLessThan(0.05);
  });

  it('keeps sliding the way it started, and counter-steering straightens it', () => {
    const a = newCarSim(0);
    run(a, { throttle: true }, 3);
    run(a, { throttle: true, steer: 1, handbrake: true }, 0.3);
    const yawA = a.yaw;
    run(a, { throttle: true, steer: 0, handbrake: true }, 0.5);
    expect(a.yaw).toBeGreaterThan(yawA + 0.3); // still turning left with no steering input
    const b = newCarSim(0);
    run(b, { throttle: true }, 3);
    run(b, { throttle: true, steer: 1, handbrake: true }, 0.3);
    const yawB = b.yaw;
    run(b, { throttle: true, steer: -1, handbrake: true }, 0.5);
    expect(b.yaw).toBeLessThan(yawB + 0.1); // counter-steer holds the line
    expect(b.drifting).toBe(true);
  });

  it('does not drift when slow, in reverse, or without steering; the handbrake then just brakes', () => {
    const slow = newCarSim(0);
    slow.speed = 5;
    run(slow, { steer: 1, handbrake: true }, 0.5);
    expect(slow.drifting).toBe(false);
    expect(slow.speed).toBeLessThan(1);
    const straight = newCarSim(0);
    straight.speed = 25;
    run(straight, { handbrake: true }, 0.2);
    expect(straight.drifting).toBe(false);
    expect(straight.speed).toBeLessThan(20);
  });

  it('a short handbrake tap earns no boost-out', () => {
    const s = newCarSim(0);
    s.speed = 25;
    run(s, { throttle: true, steer: 1, handbrake: true }, 0.2);
    const end = run(s, { throttle: true }, DT);
    expect(end[0].driftEnd).toBe(true);
    expect(end[0].boostOut).toBe(false);
  });

  it('nitro kicks on the first frame, burns the bar, and the bar refills slowly when unused', () => {
    const s = newCarSim(0);
    run(s, { throttle: true }, 1);
    const v0 = s.speed;
    const evs = run(s, { throttle: true, nitro: true }, DT);
    expect(evs[0].nitroStart).toBe(true);
    expect(s.speed).toBeGreaterThan(v0 + 4.9);
    expect(s.speed).toBeLessThan(v0 + 6);
    run(s, { throttle: true, nitro: true }, 3);
    expect(s.nitro).toBeLessThan(0.05);
    expect(s.boosting).toBe(false);
    expect(s.speed).toBeLessThanOrEqual(SEDAN.maxSpeed * 1.35 + 0.01);
    // holding F on the last drop does not stutter: it stays off until a quarter bar is back
    run(s, { throttle: true, nitro: true }, 1);
    expect(s.boosting).toBe(false);
    run(s, { throttle: true }, 6);
    expect(s.nitro).toBeCloseTo(0.5, 1);
    run(s, { throttle: true, nitro: true }, DT);
    expect(s.boosting).toBe(true);
  });
});
