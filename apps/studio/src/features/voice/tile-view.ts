// Who keeps a tile in the room past a few people (docs/plans/room-tiles-overflow.md): a fixed number of tiles, the
// rest as «+N». The floor, the one showing a screen, whoever speaks now and you keep one; then whoever spoke most
// recently; then the order people came in. The tiles kept stay in that order, so they move only when someone speaks,
// takes the floor or starts showing.

/** Tiles for people beside a shown screen or report (Sophia's is her own). */
export const STRIP_TILES = 4
/** Tiles for people in the gallery. */
export const GALLERY_TILES = 8

interface Person {
  identity: string
  speaking: boolean
  local: boolean
}

export interface TileOrder {
  /** Who holds the floor, by identity. */
  floor: string | null
  /** Who shows their screen, by identity. */
  showing: string | null
  /** When each spoke last (any clock, as long as it is the same one). */
  spokeAt: ReadonlyMap<string, number>
}

/** What keeps a tile first: lower goes first. */
function standing(p: Person, order: TileOrder): number {
  if (p.identity === order.floor) return 0
  if (p.identity === order.showing) return 1
  if (p.speaking) return 2
  return p.local ? 3 : 4
}

/** The people with a tile (in the order they came) and the rest, «+N»; past `cap`, one tile goes to «+N». */
export function tilesFor<P extends Person>(people: readonly P[], order: TileOrder, cap: number) {
  if (people.length <= cap) return { shown: [...people], more: [] as P[] }
  const ranked = people
    .map((p, i) => ({ p, i, standing: standing(p, order), spoke: order.spokeAt.get(p.identity) ?? -1 }))
    .toSorted((a, b) => a.standing - b.standing || b.spoke - a.spoke || a.i - b.i)
  const kept = new Set(ranked.slice(0, cap - 1).map((r) => r.p.identity))
  return {
    shown: people.filter((p) => kept.has(p.identity)),
    more: people.filter((p) => !kept.has(p.identity)),
  }
}
