import type { FractalType, ColorParams } from '../types';

export type SavedLocation = {
  id: string; // crypto.randomUUID()
  name: string | null; // null => display falls back to coordinate string
  centerRe: number;
  centerIm: number;
  zoom: number;
  fractalType: FractalType;
  colorParams: ColorParams | null; // null => don't restore colors on visit
  createdAt: string; // ISO timestamp
};

const STORAGE_KEY = 'mandelbrot-saved-locations';

// In-memory mirror of persisted locations, synced to localStorage on every
// mutation. Mirrors the pattern in logger.ts (renderContext.renderLogs): one
// source of truth in memory, serialized to storage on change. Other modules
// read through loadSavedLocations() so they always see the live array (e.g.
// trip playback uses it to detect a dangling location id).
let locations: SavedLocation[] = [];
let loaded = false;

export const locationsCallbacks = {
  onLocationsUpdate: (_locations: SavedLocation[]) => {},
};

function persist(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(locations));
  } catch {
    // Storage full / unavailable (private mode, quota). Leave in-memory state
    // intact and fail soft rather than throw on every mutation.
  }
}

export function loadSavedLocations(): SavedLocation[] {
  if (!loaded) {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as SavedLocation[];
        locations = Array.isArray(parsed) ? parsed : [];
      } catch {
        // Corrupt payload — drop it rather than propagate a parse error.
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    loaded = true;
  }
  return locations;
}

export function saveLocations(next: SavedLocation[]): void {
  locations = next;
  persist();
  locationsCallbacks.onLocationsUpdate(locations);
}

export function addLocation(
  loc: Omit<SavedLocation, 'id' | 'createdAt'>,
): SavedLocation {
  const entry: SavedLocation = {
    ...loc,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  locations.push(entry);
  persist();
  locationsCallbacks.onLocationsUpdate(locations);
  return entry;
}

export function removeLocation(id: string): void {
  const idx = locations.findIndex((l) => l.id === id);
  if (idx === -1) return;
  locations.splice(idx, 1);
  persist();
  locationsCallbacks.onLocationsUpdate(locations);
}

export function updateLocation(id: string, patch: Partial<SavedLocation>): void {
  const loc = locations.find((l) => l.id === id);
  if (!loc) return;
  // id/createdAt are managed by persistence, not by callers.
  const { id: _id, createdAt: _createdAt, ...safePatch } = patch;
  Object.assign(loc, safePatch);
  persist();
  locationsCallbacks.onLocationsUpdate(locations);
}
