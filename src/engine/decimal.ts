/**
 * Decimal foundation. Every quantity that can exceed 1e15 is a Decimal from the
 * very first line — currencies, totals, XP, kiln progress, yields.
 * Pure module: no React / Pixi / DOM.
 */
import Decimal from 'break_infinity.js';

export { Decimal };

export type DecimalSource = Decimal | number | string;

/** Coerce anything numeric into a Decimal. */
export function D(v: DecimalSource): Decimal {
  return v instanceof Decimal ? v : new Decimal(v);
}

export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);

/** log10 that stays finite for huge Decimals. Returns -Infinity for <= 0. */
export function log10D(d: Decimal): number {
  if (d.lte(0)) return Number.NEGATIVE_INFINITY;
  return d.exponent + Math.log10(Math.abs(d.mantissa));
}

const SUFFIXES = [
  '', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No',
  'Dc', 'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'ODc', 'NDc',
];

/**
 * NUMBER FORMAT (Phase 21) — a display preference, set once by the UI and read
 * by every `fmt` call, so switching applies everywhere at once (currencies, the
 * Compendium, breakdown popovers). It is NOT game state: the default is 'suffix'
 * so the headless sim and every test are unaffected unless the UI opts in.
 */
export type NumberFormat = 'suffix' | 'scientific' | 'engineering';
let FORMAT_MODE: NumberFormat = 'suffix';
export function setNumberFormat(m: NumberFormat): void { FORMAT_MODE = m; }
export function getNumberFormat(): NumberFormat { return FORMAT_MODE; }

/**
 * Format a Decimal for display: 0–999.99 plain, then K/M/B/T suffixes,
 * scientific past the suffix table. Scientific/engineering modes drop the
 * suffixes entirely. Used by both the UI and the sim CSV.
 */
export function fmt(v: DecimalSource, decimals = 2): string {
  const d = D(v);
  if (d.eq(0)) return '0';
  if (d.lt(0)) return '-' + fmt(d.neg(), decimals);
  if (d.lt(1000)) {
    const n = d.toNumber();
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(n < 10 ? decimals : n < 100 ? 1 : 0);
  }
  const exp = Math.floor(log10D(d));
  if (FORMAT_MODE === 'scientific') {
    const mant = d.div(Decimal.pow(10, exp)).toNumber();
    return `${mant.toFixed(2)}e${exp}`;
  }
  if (FORMAT_MODE === 'engineering') {
    // Exponent snapped to a multiple of 3; mantissa carries the rest (1..999).
    const e3 = Math.floor(exp / 3) * 3;
    const mant = d.div(Decimal.pow(10, e3)).toNumber();
    return `${mant.toFixed(mant >= 100 ? 0 : mant >= 10 ? 1 : 2)}e${e3}`;
  }
  const tier = Math.floor(exp / 3);
  if (tier < SUFFIXES.length) {
    const scaled = d.div(Decimal.pow(10, tier * 3)).toNumber();
    const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
    return scaled.toFixed(digits) + SUFFIXES[tier];
  }
  const mant = d.div(Decimal.pow(10, exp)).toNumber();
  return `${mant.toFixed(2)}e${exp}`;
}

/** Format a plain number for display (small quantities: charge, heat, %). */
export function fmtNum(n: number, decimals = 1): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(decimals);
}

/** Format seconds as "3h 12m", "4m 05s", "12s". */
export function fmtDuration(sec: number): string {
  sec = Math.max(0, Math.floor(sec));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}
