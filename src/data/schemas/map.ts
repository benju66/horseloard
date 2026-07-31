import { z } from 'zod';
import { HexColorSchema, IdSchema, Vec2Schema } from './common';

/**
 * Per-map framing. Render-layer data — the engine never reads it (CLAUDE.md #2).
 * Every field defaults, so a map that says nothing about its camera still
 * validates and gets sensible portrait framing.
 */
export const MapCameraSchema = z.object({
  frustumHeight: z
    .number()
    .positive()
    .optional()
    .describe(
      'world units visible top-to-bottom. OMIT to auto-fit the map\'s content ' +
        '(lanes, plots, gate, forge) to the device viewport — that adapts to any ' +
        'phone aspect and zooms in further than framing the empty world corners would. ' +
        'Set it only to override a specific map.',
    ),
  elevation: z.number().min(20).max(89).default(55).describe('degrees above the ground plane'),
  yaw: z
    .number()
    .default(8)
    .describe(
      'degrees of rotation for depth. Costs zoom on portrait maps — every degree ' +
        'swings the map diagonal further across the frame (20° needs ~48% more ' +
        'frustum than 0°), so "slight" is load-bearing, not stylistic.',
    ),
  target: Vec2Schema.optional().describe('world point centred in frame; defaults to map centre'),
});
export type MapCamera = z.infer<typeof MapCameraSchema>;

/**
 * The dusk lighting model (Part A.1): cool desaturated ambient over the terrain,
 * warm light pooled on the path corridor, so lighting *is* the readability
 * system. Per-map so biome 2 is a lighting preset before it is new models.
 */
export const MapLightingSchema = z.object({
  skyColor: HexColorSchema.default('#6f9fc4').describe('cool ambient from above'),
  groundColor: HexColorSchema.default('#243020').describe('cooler bounce from below'),
  ambientIntensity: z.number().nonnegative().default(0.75),
  sunColor: HexColorSchema.default('#ffd9a0').describe('warm key light'),
  sunIntensity: z.number().nonnegative().default(2.2),
  sunAzimuth: z.number().default(-38).describe('degrees around the vertical axis'),
  sunElevation: z.number().min(5).max(89).default(50).describe('degrees above the horizon'),
  background: HexColorSchema.default('#141d18').describe('beyond the play area'),
  groundTint: HexColorSchema.default('#3f6b32'),
  pathTint: HexColorSchema.default('#c9a86a').describe('the warm corridor — brightest region'),
});
export type MapLighting = z.infer<typeof MapLightingSchema>;

/** A lane is a waypoint polyline; enemies track distance-along-lane (multi-lane capable from day one). */
export const LaneSchema = z.object({
  id: IdSchema,
  waypoints: z.array(Vec2Schema).min(2).describe('spawn → gate; first point may sit off-screen'),
});
export type Lane = z.infer<typeof LaneSchema>;

/** Fixed tower plots. No free placement — load-bearing for authorable difficulty. */
export const PlotSchema = z.object({
  id: IdSchema,
  position: Vec2Schema,
});
export type Plot = z.infer<typeof PlotSchema>;

export const GateSchema = z.object({
  position: Vec2Schema,
  hp: z.number().int().positive(),
  attackSlots: z
    .number()
    .int()
    .positive()
    .describe('max simultaneous besiegers; overflow queues behind (~5, DESIGN §6)'),
});
export type Gate = z.infer<typeof GateSchema>;

export const MapSchema = z
  .object({
    id: IdSchema,
    name: z.string().min(1),
    description: z.string().min(1),
    order: z.number().int().positive().describe('campaign position; unlocks are linear'),
    world: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
    heroSpawn: Vec2Schema,
    lanes: z.array(LaneSchema).min(1),
    plots: z.array(PlotSchema).min(1),
    gate: GateSchema,
    forge: z.object({ position: Vec2Schema }),
    /** Render-layer blocks. Both fully defaulted — existing maps need no edits. */
    camera: MapCameraSchema.prefault({}),
    lighting: MapLightingSchema.prefault({}),
  })
  .superRefine((map, ctx) => {
    const laneIds = new Set<string>();
    map.lanes.forEach((lane, i) => {
      if (laneIds.has(lane.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['lanes', i, 'id'],
          message: `duplicate lane id "${lane.id}"`,
        });
      }
      laneIds.add(lane.id);
    });
    const plotIds = new Set<string>();
    map.plots.forEach((plot, i) => {
      if (plotIds.has(plot.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['plots', i, 'id'],
          message: `duplicate plot id "${plot.id}"`,
        });
      }
      plotIds.add(plot.id);
    });
  });
export type MapDef = z.infer<typeof MapSchema>;
