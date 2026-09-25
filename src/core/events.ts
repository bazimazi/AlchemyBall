/** Tiny typed event emitter used to decouple the headless simulation from presentation. */
export class Emitter<Events extends { type: string }> {
  private listeners = new Map<string, Set<(e: Events) => void>>();
  private any = new Set<(e: Events) => void>();

  on<K extends Events['type']>(type: K, fn: (e: Extract<Events, { type: K }>) => void): () => void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(fn as (e: Events) => void);
    return () => set!.delete(fn as (e: Events) => void);
  }

  onAny(fn: (e: Events) => void): () => void {
    this.any.add(fn);
    return () => this.any.delete(fn);
  }

  emit(e: Events): void {
    const set = this.listeners.get(e.type);
    if (set) for (const fn of set) fn(e);
    for (const fn of this.any) fn(e);
  }

  clear(): void {
    this.listeners.clear();
    this.any.clear();
  }
}
