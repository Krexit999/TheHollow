/**
 * The material art generator. 90 materials cannot be 90 sprites: a material
 * IS palette + facet count + shimmer profile, rendered as procedural SVG.
 * Rarity reads from the frame treatment; gems are a different silhouette
 * language entirely (cut stones, not ore chunks).
 */
import { memo, useMemo } from 'react';
import {
  gemDef,
  materialDef,
  type MaterialDef,
  type MaterialRarity,
} from '../../engine/materials';

function hashString(s: string): number {
  let h = 7;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  return h;
}

function seededRng(seed: number): () => number {
  let a = seed + 0x6d2b79f5;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RARITY_FRAME: Record<MaterialRarity, { stroke: string; glow: string | null; width: number }> = {
  common: { stroke: '#00000066', glow: null, width: 1 },
  rich: { stroke: '#a8763e99', glow: null, width: 1.2 },
  pure: { stroke: '#b9c4cf88', glow: 'drop-shadow(0 0 3px rgba(170,190,210,0.45))', width: 1.2 },
  flawless: { stroke: '#e2c76acc', glow: 'drop-shadow(0 0 4px rgba(226,199,106,0.55))', width: 1.4 },
  starred: { stroke: '#9fb8ffcc', glow: 'drop-shadow(0 0 5px rgba(159,184,255,0.65))', width: 1.4 },
  aberrant: { stroke: '#c69fd8cc', glow: 'drop-shadow(0 0 5px rgba(198,159,216,0.6))', width: 1.4 },
};

/** Irregular ore-chunk outline from the def's facet count, seeded by id. */
function orePoints(def: MaterialDef): [number, number][] {
  const rng = seededRng(hashString(def.id));
  const pts: [number, number][] = [];
  const n = Math.max(4, def.facets);
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2 + (rng() - 0.5) * 0.35;
    const radius = 11.5 * (0.78 + rng() * 0.3);
    pts.push([16 + Math.cos(angle) * radius, 16.5 + Math.sin(angle) * radius]);
  }
  return pts;
}

export const MaterialIcon = memo(function MaterialIcon({ id, size = 28, className = '' }: { id: string; size?: number; className?: string }) {
  const def = materialDef(id);
  const frame = RARITY_FRAME[def.rarity];
  const { pts, facetLines, sparkles } = useMemo(() => {
    const p = orePoints(def);
    const rng = seededRng(hashString(def.id) * 3 + 1);
    const lines: [number, number, number, number][] = [];
    const lineCount = Math.min(3, Math.floor(def.facets / 3));
    for (let i = 0; i < lineCount; i++) {
      const a = p[Math.floor(rng() * p.length)]!;
      const b = p[Math.floor(rng() * p.length)]!;
      lines.push([a[0], a[1], (a[0] + b[0]) / 2 + (rng() - 0.5) * 4, (a[1] + b[1]) / 2 + (rng() - 0.5) * 4]);
    }
    const sp: [number, number][] = [];
    if (def.shimmer === 'crystalline') {
      for (let i = 0; i < 3; i++) sp.push([10 + rng() * 12, 10 + rng() * 12]);
    }
    return { pts: p, facetLines: lines, sparkles: sp };
  }, [def]);

  const gid = `mg-${def.id}`;
  const poly = pts.map((p) => p.join(',')).join(' ');

  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={`${className} ${def.shimmer === 'aberrant' ? 'aberrant-shift' : ''}`}
      style={frame.glow ? { filter: frame.glow } : undefined}
      aria-label={def.name}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor={def.palette[2]} />
          <stop offset="45%" stopColor={def.palette[1]} />
          <stop offset="100%" stopColor={def.palette[0]} />
        </linearGradient>
      </defs>
      {/* Ground shadow so chunks sit, not float. */}
      <ellipse cx="16" cy="28.4" rx="8.5" ry="2" fill="#000" opacity="0.35" />
      <polygon points={poly} fill={`url(#${gid})`} stroke={frame.stroke} strokeWidth={frame.width} strokeLinejoin="round" />
      {facetLines.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ffffff" strokeWidth="0.7" opacity="0.18" />
      ))}
      {def.shimmer !== 'none' && (
        <polygon
          points={poly}
          fill="none"
          stroke={def.palette[2]}
          strokeWidth="2.2"
          opacity="0.14"
          strokeLinejoin="round"
          transform="translate(-1.2,-1.4) scale(0.94)"
          style={{ transformOrigin: '16px 16px' }}
        />
      )}
      {sparkles.map(([x, y], i) => (
        <path
          key={i}
          d={`M ${x} ${y - 1.6} L ${x + 0.55} ${y - 0.55} L ${x + 1.6} ${y} L ${x + 0.55} ${y + 0.55} L ${x} ${y + 1.6} L ${x - 0.55} ${y + 0.55} L ${x - 1.6} ${y} L ${x - 0.55} ${y - 0.55} Z`}
          fill="#fff"
          opacity="0.8"
        />
      ))}
      {def.rarity === 'starred' && (
        <path d="M 26 5 L 26.9 7.1 L 29 8 L 26.9 8.9 L 26 11 L 25.1 8.9 L 23 8 L 25.1 7.1 Z" fill="#cdd9ff" />
      )}
    </svg>
  );
});

/** Gems read as a different kind of thing: cut stones with a bright table. */
export const GemIcon = memo(function GemIcon({ id, size = 28, className = '' }: { id: string; size?: number; className?: string }) {
  const def = gemDef(id);
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      style={{ filter: `drop-shadow(0 0 4px ${def.color}aa)` }}
      aria-label={def.name}
    >
      <ellipse cx="16" cy="28.4" rx="7" ry="1.8" fill="#000" opacity="0.35" />
      {/* Crown + pavilion: the classic kite cut. */}
      <polygon points="8,12 24,12 16,27" fill={def.color} stroke="#00000055" strokeWidth="1" strokeLinejoin="round" />
      <polygon points="11,5 21,5 24,12 8,12" fill={def.color} stroke="#00000055" strokeWidth="1" strokeLinejoin="round" />
      {/* Table highlight + internal facets. */}
      <polygon points="13,6.2 19,6.2 21,11 11,11" fill="#ffffff" opacity="0.38" />
      <line x1="8" y1="12" x2="16" y2="27" stroke="#fff" strokeWidth="0.6" opacity="0.25" />
      <line x1="24" y1="12" x2="16" y2="27" stroke="#000" strokeWidth="0.8" opacity="0.2" />
      <line x1="16" y1="12" x2="16" y2="27" stroke="#fff" strokeWidth="0.5" opacity="0.2" />
    </svg>
  );
});

/** A geode: an unpromising lump with a bright secret along the crack. */
export const GeodeIcon = memo(function GeodeIcon({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-label="Geode">
      <ellipse cx="16" cy="28.4" rx="8" ry="2" fill="#000" opacity="0.35" />
      <path
        d="M 16 4.5 C 22.5 4.5 27 9.5 27 16 C 27 22.8 22 27.5 16 27.5 C 10 27.5 5 22.8 5 16 C 5 9.5 9.5 4.5 16 4.5 Z"
        fill="#3d3833"
        stroke="#00000088"
        strokeWidth="1.2"
      />
      <path d="M 12 6 C 10 10 10.5 14 12.5 18 C 14 21 14 24 13 27" fill="none" stroke="#2a2622" strokeWidth="1.4" />
      <path d="M 12.2 9 L 13.4 12.4 L 12.4 15.8" fill="none" stroke="#9fd8c0" strokeWidth="0.9" opacity="0.75" />
      <circle cx="13" cy="13.4" r="0.9" fill="#c9f2df" opacity="0.9" />
    </svg>
  );
});
