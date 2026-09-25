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
export function toast(root: HTMLElement, text: string, color?: string, ms = 2800): void {
  let stack = root.querySelector<HTMLElement>('.toasts');
  if (!stack) root.append((stack = h('div', { class: 'toasts' })));
  const t = h('div', { class: 'toast', style: `${color ? `border-color:${color};` : ''}animation-duration:${ms}ms` }, text);
  stack.append(t);
  while (stack.children.length > 3) stack.firstElementChild!.remove();
  setTimeout(() => t.remove(), ms);
}
