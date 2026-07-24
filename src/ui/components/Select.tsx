/**
 * SELECT — one styled dropdown in the game's own language, replacing every
 * native <select>. Native selects rendered as bright OS chrome that broke the
 * cave's dark, hand-set look and ignored the theme; this is the cure.
 *
 * It is a real ARIA select-only combobox (ARIA 1.2 pattern), not a div that
 * looks like one:
 *   - focus STAYS on the trigger; the active option is tracked with
 *     aria-activedescendant, so Tab in/out just works and no focus is trapped
 *   - keyboard: ↑/↓ move, Enter/Space pick, Esc closes, Home/End jump, typeahead
 *   - screen readers: role=combobox + listbox/option, aria-expanded/-selected
 *   - touch: trigger and every option are ≥44px tall
 *   - 380px: the menu is portalled to <body> and FIXED-positioned from the
 *     trigger's rect, so no panel's overflow can clip it, and it flips above
 *     when there is no room below
 *   - reduced motion: the tiny open fade is dropped
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../store';

export interface SelectOption {
  value: string;
  /** Shown in the list (may be rich). */
  label: ReactNode;
  /** Plain text for the trigger + typeahead when `label` is not a string. */
  text?: string;
  disabled?: boolean;
}

let selectSeq = 0;

export function Select({
  value,
  onChange,
  options,
  className = '',
  buttonClassName = '',
  title,
  ariaLabel,
  placeholder = 'Select…',
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Wrapper classes — width lives here (e.g. "flex-1", "w-full"). */
  className?: string;
  /** Extra classes for the trigger button. */
  buttonClassName?: string;
  title?: string;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const reducedMotion = useGame((s) => s.reducedMotion);
  const ids = useMemo(() => {
    selectSeq += 1;
    return { list: `sel-list-${selectSeq}`, opt: (i: number) => `sel-opt-${selectSeq}-${i}` };
  }, []);
  const [open, setOpen] = useState(false);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const [active, setActive] = useState(selectedIndex >= 0 ? selectedIndex : 0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef<{ buf: string; at: number }>({ buf: '', at: 0 });
  const [rect, setRect] = useState<{ left: number; top: number; bottom: number; width: number } | null>(null);

  const selected = options[selectedIndex];
  const triggerText = selected
    ? (typeof selected.label === 'string' ? selected.label : (selected.text ?? selected.value))
    : placeholder;

  const measure = () => {
    const b = btnRef.current?.getBoundingClientRect();
    if (b) setRect({ left: b.left, top: b.top, bottom: b.bottom, width: b.width });
  };

  const openMenu = (startAt?: number) => {
    measure();
    setActive(startAt ?? (selectedIndex >= 0 ? selectedIndex : firstEnabled(options, 0, 1)));
    setOpen(true);
  };
  const pick = (i: number) => {
    const opt = options[i];
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
  };

  const runTypeahead = (key: string): number => {
    const now = Date.now();
    typeahead.current.buf = now - typeahead.current.at > 600 ? key : typeahead.current.buf + key;
    typeahead.current.at = now;
    const buf = typeahead.current.buf.toLowerCase();
    return options.findIndex((o) => !o.disabled && optText(o).toLowerCase().startsWith(buf));
  };

  // Reposition while open (scroll/resize), and close on outside pointer.
  useEffect(() => {
    if (!open) return;
    const onScrollResize = () => measure();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('scroll', onScrollResize, true);
      window.removeEventListener('resize', onScrollResize);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [open]);

  // Keep the active option scrolled into view.
  useLayoutEffect(() => {
    if (!open) return;
    document.getElementById(ids.opt(active))?.scrollIntoView({ block: 'nearest' });
  }, [open, active, ids]);

  // ONE handler on the button (focus never leaves it — activedescendant pattern).
  const onKey = (e: ReactKeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu();
      } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
        const hit = runTypeahead(e.key);
        openMenu(hit >= 0 ? hit : undefined);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActive((i) => firstEnabled(options, i + 1, 1, i)); break;
      case 'ArrowUp': e.preventDefault(); setActive((i) => firstEnabled(options, i - 1, -1, i)); break;
      case 'Home': e.preventDefault(); setActive(firstEnabled(options, 0, 1)); break;
      case 'End': e.preventDefault(); setActive(firstEnabled(options, options.length - 1, -1)); break;
      case 'Enter':
      case ' ': e.preventDefault(); pick(active); break;
      case 'Escape': e.preventDefault(); setOpen(false); break;
      case 'Tab': setOpen(false); break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
          const hit = runTypeahead(e.key);
          if (hit >= 0) setActive(hit);
        }
    }
  };

  // Flip above when the menu would overflow the bottom of the viewport.
  const MENU_MAX = 288; // 18rem
  const wantH = Math.min(MENU_MAX, options.length * 44 + 8);
  const flipUp = rect ? rect.bottom + wantH > window.innerHeight && rect.top > window.innerHeight - rect.bottom : false;
  const avail = rect ? (flipUp ? rect.top - 8 : window.innerHeight - rect.bottom - 8) : MENU_MAX;
  const maxH = Math.max(120, Math.min(MENU_MAX, avail));

  return (
    <div className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? ids.list : undefined}
        aria-activedescendant={open ? ids.opt(active) : undefined}
        aria-label={ariaLabel}
        title={title}
        className={`flex min-h-[44px] w-full items-center justify-between gap-1.5 rounded border border-cave-700 bg-cave-900 px-2 text-left text-[11px] text-cave-200 hover:border-cave-500 focus-visible:border-lamp-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lamp-500/60 ${buttonClassName}`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKey}
      >
        <span className={`min-w-0 flex-1 truncate ${selected ? '' : 'text-cave-500'}`}>{triggerText}</span>
        <span aria-hidden className={`shrink-0 text-[9px] text-cave-500 transition-transform ${open && !reducedMotion ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && rect && createPortal(
        <ul
          ref={menuRef}
          id={ids.list}
          role="listbox"
          aria-label={ariaLabel}
          className={`fixed z-[100] overflow-y-auto overflow-x-hidden rounded-md border border-cave-600 bg-cave-950 py-1 text-[11px] shadow-xl scroll-thin ${reducedMotion ? '' : 'toast-in'}`}
          style={{
            left: rect.left,
            width: rect.width,
            maxHeight: maxH,
            ...(flipUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
          }}
        >
          {options.map((o, i) => {
            const isSel = o.value === value;
            const isActive = i === active;
            return (
              <li
                key={o.value || `__${i}`}
                id={ids.opt(i)}
                role="option"
                aria-selected={isSel}
                aria-disabled={o.disabled || undefined}
                className={`flex min-h-[44px] cursor-pointer items-center gap-2 px-2.5 ${
                  o.disabled ? 'cursor-not-allowed text-cave-600'
                    : isActive ? 'bg-cave-800 text-cave-100'
                    : 'text-cave-300'
                } ${isSel ? 'font-semibold text-lamp-200' : ''}`}
                onMouseEnter={() => !o.disabled && setActive(i)}
                // pointerdown (capture on document) would close before a click lands,
                // so commit the pick on pointerup and stop it bubbling to that closer.
                onPointerUp={(e) => { e.stopPropagation(); pick(i); }}
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {isSel && <span aria-hidden className="shrink-0 text-lamp-300">✓</span>}
              </li>
            );
          })}
        </ul>,
        document.body,
      )}
    </div>
  );
}

function optText(o: SelectOption): string {
  return typeof o.label === 'string' ? o.label : (o.text ?? o.value);
}

/** Next enabled index scanning in `dir`, clamped (no wrap); falls back to `fallback` then `from`. */
function firstEnabled(options: SelectOption[], from: number, dir: 1 | -1, fallback = -1): number {
  for (let i = from; i >= 0 && i < options.length; i += dir) {
    if (!options[i]!.disabled) return i;
  }
  return fallback >= 0 ? fallback : Math.max(0, Math.min(options.length - 1, from));
}
