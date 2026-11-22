import type { Character } from '../model';

type Money = Character['money'];
const r = (rate: number) => Math.max(1, Math.floor(rate) || 1);

/** 1 major -> `rate` minor; unchanged if there is no major. */
export const breakMajor = (m: Money, rate: number): Money =>
  m.major > 0 ? { ...m, major: m.major - 1, minor: m.minor + r(rate) } : m;

/** `rate` minor -> 1 major; unchanged if there is not enough minor. */
export const joinMinor = (m: Money, rate: number): Money =>
  m.minor >= r(rate) ? { ...m, major: m.major + 1, minor: m.minor - r(rate) } : m;

export const totalMinor = (m: Money, rate: number): number => m.major * r(rate) + m.minor;

/** Calculator: major -> minor and back (the result may be fractional). */
export const toMinor = (major: number, rate: number): number => major * r(rate);
export const toMajor = (minor: number, rate: number): number => minor / r(rate);
