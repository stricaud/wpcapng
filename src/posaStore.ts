// Persist user-supplied posa dissectors in localStorage so they survive
// reloads, and re-load them into the engine on startup.
import type { LibpcapngModule } from "./engine";

const KEY = "wpcapng.posa.v1";

export interface StoredPosa {
  id: string;
  name: string; // user-facing label
  source: string; // .posa text
}

export function loadStored(): StoredPosa[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredPosa[]) : [];
  } catch {
    return [];
  }
}

export function saveStored(items: StoredPosa[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
}

// Apply all stored posa definitions to the engine. Returns any error messages.
export function applyStored(engine: LibpcapngModule, items: StoredPosa[]): string[] {
  const errors: string[] = [];
  for (const item of items) {
    const res = engine.loadPosaText(item.source);
    if (!res.ok) errors.push(`${item.name}: ${res.error}`);
  }
  return errors;
}
