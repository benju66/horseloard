import type { MapDef } from '../data/schemas';

export interface MutableVec2 {
  x: number;
  y: number;
}

interface Segment {
  ax: number;
  ay: number;
  dx: number;
  dy: number;
  len: number;
  start: number;
}

/**
 * Distance-along-lane path math over a waypoint polyline. Precomputes
 * segments once; positionAt writes into a caller-owned vector so the hot
 * loop never allocates.
 */
export class LanePath {
  readonly totalLength: number;
  private readonly segments: Segment[];
  private readonly endX: number;
  private readonly endY: number;

  constructor(waypoints: ReadonlyArray<{ x: number; y: number }>) {
    if (waypoints.length < 2) throw new Error('LanePath needs at least 2 waypoints');
    this.segments = [];
    let start = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const a = waypoints[i]!;
      const b = waypoints[i + 1]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) continue; // duplicate waypoint — skip, don't divide by zero
      this.segments.push({ ax: a.x, ay: a.y, dx, dy, len, start });
      start += len;
    }
    if (this.segments.length === 0) throw new Error('LanePath has zero total length');
    this.totalLength = start;
    const last = waypoints[waypoints.length - 1]!;
    this.endX = last.x;
    this.endY = last.y;
  }

  /** Position at distance d along the lane, clamped to [0, totalLength]. Writes into `out`. */
  positionAt(d: number, out: MutableVec2): MutableVec2 {
    if (d <= 0) {
      const s = this.segments[0]!;
      out.x = s.ax;
      out.y = s.ay;
      return out;
    }
    for (const s of this.segments) {
      if (d <= s.start + s.len) {
        const t = (d - s.start) / s.len;
        out.x = s.ax + s.dx * t;
        out.y = s.ay + s.dy * t;
        return out;
      }
    }
    out.x = this.endX;
    out.y = this.endY;
    return out;
  }

  /** Normalized travel direction at distance d. Writes into `out`. */
  directionAt(d: number, out: MutableVec2): MutableVec2 {
    const clamped = Math.max(0, Math.min(d, this.totalLength));
    for (const s of this.segments) {
      if (clamped <= s.start + s.len) {
        out.x = s.dx / s.len;
        out.y = s.dy / s.len;
        return out;
      }
    }
    const last = this.segments[this.segments.length - 1]!;
    out.x = last.dx / last.len;
    out.y = last.dy / last.len;
    return out;
  }
}

/** Build every lane on a map, keyed by lane id. */
export function buildLanePaths(map: MapDef): Map<string, LanePath> {
  const lanes = new Map<string, LanePath>();
  for (const lane of map.lanes) lanes.set(lane.id, new LanePath(lane.waypoints));
  return lanes;
}
