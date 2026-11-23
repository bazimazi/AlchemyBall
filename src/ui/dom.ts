type Child = Node | string | number | false | null | undefined;
type Attrs = Record<string, unknown> & { class?: string; style?: string; onclick?: (e: MouseEvent) => void };

/** Minimal hyperscript helper. Strings are inserted as text (never HTML) so content cannot inject markup. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs)
    for (const [k, val] of Object.entries(attrs)) {
      if (val === undefined || val === null || val === false) continue;
      if (k.startsWith('on') && typeof val === 'function') el.addEventListener(k.slice(2), val as EventListener);
      else if (k === 'class') el.className = String(val);
      else if (k === 'style') el.setAttribute('style', String(val));
      else if (k in el && typeof val !== 'string') (el as unknown as Record<string, unknown>)[k] = val;
      else el.setAttribute(k, val === true ? '' : String(val));
    }
  for (const c of children.flat()) {
    if (c === undefined || c === null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Stacked, non-interactive notifications. At most 3 are visible; older ones are dropped. */
export function toast(root: HTMLElement, text: string, color?: string, ms = 2800, icon?: string, variant?: 'feat'): void {
  let stack = root.querySelector<HTMLElement>('.toasts');
  if (!stack) root.append((stack = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' })));
  const t = h('div', { class: `toast${variant ? ' toast-' + variant : ''}`, style: `${color ? `--c:${color};` : ''}animation-duration:${ms}ms` },
    icon ? h('span', { class: 'toast-ic' }, icon) : null, h('span', null, text));
  stack.append(t);
  while (stack.children.length > 3) stack.firstElementChild!.remove();
  setTimeout(() => t.remove(), ms);
}

/** In-game confirmation dialog (replaces window.confirm, which breaks immersion and focus on mobile). */
export function confirmDialog(root: HTMLElement, title: string, text: string, ok = 'Confirm', danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    const previous = document.activeElement;
    let closing = false;
    const close = (v: boolean) => {
      if (closing) return;
      closing = true;
      el.classList.add('out');
      el.inert = true;
      setTimeout(() => el.remove(), 180);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
      resolve(v);
    };
    const cancel = h('button', { class: 'ghost', onclick: () => close(false) }, 'Cancel');
    const accept = h('button', { class: danger ? 'danger' : 'primary', onclick: () => close(true) }, ok);
    const el = h('div', { class: 'screen overlay modal-wrap', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal' },
        h('h2', null, title),
        h('p', { class: 'small dim' }, text),
        h('div', { class: 'row' }, cancel, h('div', { class: 'spacer' }), accept)));
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close(false);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        (document.activeElement === cancel ? accept : cancel).focus();
      }
    });
    root.append(el);
    cancel.focus();
  });
}

/** Animate a number counting up (Balatro-style payoff). Calls `onStep` for audio ticks. */
export function countUp(el: HTMLElement, to: number, ms = 700, prefix = '', onStep?: (i: number) => void): void {
  const start = performance.now();
  let lastStep = -1;
  const reduced = document.body.classList.contains('rm');
  if (reduced || to <= 0) {
    el.textContent = prefix + to;
    return;
  }
  const tick = (now: number) => {
    const k = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - k, 3);
    const v = Math.round(to * eased);
    el.textContent = prefix + v;
    const step = Math.floor(k * 8);
    if (step !== lastStep && step < 8) {
      lastStep = step;
      onStep?.(step);
    }
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
