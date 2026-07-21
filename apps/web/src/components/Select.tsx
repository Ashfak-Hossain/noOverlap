import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * A styled single-choice dropdown.
 *
 * The native `<select>` cannot be styled beyond its trigger — the option list is drawn by the
 * operating system — so matching the design means rebuilding it. That is a real cost: everything the
 * native control gives for free has to be re-implemented, which is why the keyboard and screen-reader
 * behaviour below is not optional garnish.
 *
 * Follows the ARIA listbox pattern: the trigger owns the expanded state, the list is a `listbox` of
 * `option`s, and the active option is pointed at with `aria-activedescendant` so focus can stay on
 * one element while the highlight moves.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select',
  ariaLabel,
  icon,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel: string;
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  // Dismiss when the interaction moves elsewhere. `pointerdown` rather than `click` so the list
  // closes on press instead of lingering until release.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Moving focus into the list is what makes arrow keys work without stealing the page's scroll.
  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  function openList() {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function commit(index: number) {
    const option = options[index];
    if (option) onChange(option.value);
    close();
  }

  function onListKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, options.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        commit(activeIndex);
        break;
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'Tab':
        // Let focus leave naturally, but do not drag it back to the trigger on the way out.
        close(false);
        break;
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openList();
          }
        }}
        className="flex w-full items-center gap-2 text-left"
      >
        {icon && <span className="shrink-0 text-ink-faint">{icon}</span>}
        <span
          className={[
            'flex-1 truncate text-[15px] font-semibold',
            selected ? 'text-ink' : 'text-ink-faint',
          ].join(' ')}
        >
          {selected?.label ?? placeholder}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={[
            'shrink-0 text-ink-faint transition-transform duration-200',
            open ? 'rotate-180' : '',
          ].join(' ')}
        >
          <path d="M6 9.5l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          aria-activedescendant={`${id}-${activeIndex}`}
          onKeyDown={onListKeyDown}
          className="animate-rise absolute top-[calc(100%+10px)] left-0 z-50 max-h-72 w-max min-w-full overflow-auto rounded-2xl border border-line bg-surface p-1.5 shadow-lg outline-none"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <li
                key={option.value}
                id={`${id}-${index}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => commit(index)}
                onMouseEnter={() => setActiveIndex(index)}
                className={[
                  'flex cursor-pointer items-center justify-between gap-6 rounded-xl px-3 py-2.5',
                  'text-sm font-semibold transition-colors',
                  isActive ? 'bg-surface-2 text-ink' : 'text-ink-muted',
                  isSelected ? 'text-ink' : '',
                ].join(' ')}
              >
                <span className="truncate">{option.label}</span>
                {isSelected && (
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="shrink-0 text-accent"
                  >
                    <path d="M4.5 12.5l4.6 4.6L19.5 7" />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
