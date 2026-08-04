import { z } from 'zod';
import { HexColorSchema, IdSchema, Vec2Schema } from './common';
import { TerrainRuleSchema } from './terrain';

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
 * One lighting condition. The game holds two — day and night — and crossfades
 * between them on the build/wave boundary.
 *
 * Terrain albedo lives in the preset alongside the light, which is not
 * physically honest — grass does not change colour after dark. It is here
 * because a single Lambert term cannot reproduce what moonlight actually does
 * to colour: multiplying a blue key into green grass yields *dark green*, never
 * blue, so a night built only from lights lands on "dusk" and stops there.
 * Shifting the albedo too is the stylisation that buys the missing hue.
 *
 * Spelled as a factory rather than one schema with overrides so each preset
 * carries its *own* defaults. A map that sets a single night field would
 * otherwise inherit day values for every field it left alone, and silently get
 * a bright night.
 */
function lightPreset(d: {
  skyColor: string;
  groundColor: string;
  ambientIntensity: number;
  sunColor: string;
  sunIntensity: number;
  sunElevation: number;
  background: string;
  fogColor: string;
  fogDensity: number;
  groundTint: string;
  pathTint: string;
}) {
  return z.object({
    groundTint: HexColorSchema.default(d.groundTint),
    pathTint: HexColorSchema.default(d.pathTint).describe('the worn corridor'),
    skyColor: HexColorSchema.default(d.skyColor).describe('ambient from above'),
    groundColor: HexColorSchema.default(d.groundColor).describe('bounce from below'),
    ambientIntensity: z.number().nonnegative().default(d.ambientIntensity),
    sunColor: HexColorSchema.default(d.sunColor).describe('key light'),
    sunIntensity: z.number().nonnegative().default(d.sunIntensity),
    sunElevation: z
      .number()
      .min(5)
      .max(89)
      .default(d.sunElevation)
      .describe(
        'degrees above the horizon. Low is the whole look: shadow length is ' +
          'height/tan(elevation), so a raking sun is what turns flat-shaded ' +
          'geometry into a readable diorama. Raising it flattens the scene.',
      ),
    background: HexColorSchema.default(d.background).describe('beyond the play area'),
    fogColor: HexColorSchema.default(d.fogColor),
    fogDensity: z
      .number()
      .min(0)
      .max(1)
      .default(d.fogDensity)
      .describe(
        'depth haze, as a fraction of the map reach. 0 disables it. Under a ' +
          'fixed high camera the far edge of the map is genuinely further away ' +
          'than the near edge, so this reads as aerial perspective rather than ' +
          'as murk.',
      ),
  });
}

/** Warm, low, long-shadowed. The build phase. */
export const DayLightSchema = lightPreset({
  skyColor: '#c6dff2',
  groundColor: '#5f7042',
  ambientIntensity: 1.2,
  sunColor: '#ffe9c2',
  sunIntensity: 2.3,
  sunElevation: 26,
  background: '#9fc4d8',
  fogColor: '#bcd6e0',
  fogDensity: 0.35,
  groundTint: '#4a7c3a',
  pathTint: '#c9a86a',
});

/**
 * Cold, blue, low-contrast. The wave.
 *
 * Dark enough to be a different time of day, bright enough to fight in — the
 * failure mode is a night nobody can read, and a phone at half brightness in
 * daylight is the real viewing condition, not a monitor in a dim room.
 *
 * **Lifted 2026-08-03 on the first real phone playtest**, which reported
 * exactly the failure this comment predicted: the wave phase was too dark to
 * read. Ambient and key both up (~28% and ~23%), fog density down, and every
 * colour moved toward white — the ground and the road most, because they are
 * what you actually have to see, and the sky least, because lifting that too
 * far stops it being night at all. Hues are untouched, so it still reads cold
 * and blue against the warm day.
 */
export const NightLightSchema = lightPreset({
  skyColor: '#4a6aa0',
  groundColor: '#26303f',
  ambientIntensity: 1.25,
  sunColor: '#b6cbec',
  sunIntensity: 1.72,
  sunElevation: 46,
  background: '#2a3752',
  fogColor: '#2e3a56',
  fogDensity: 0.38,
  groundTint: '#587771',
  pathTint: '#a49d91',
});

/**
 * Per-map mood. Biome 2 should be a lighting preset before it is new models —
 * that is the cheapest lever in the whole renderer, and the one that most
 * changes how a map feels.
 */
export const MapLightingSchema = z.object({
  sunAzimuth: z
    .number()
    .default(-38)
    .describe(
      'degrees around the vertical axis. Shared by both presets on purpose: ' +
        'shadows sweeping sideways on the build→wave transition reads as the ' +
        'map rotating, not as night falling.',
    ),
  day: DayLightSchema.prefault({}),
  night: NightLightSchema.prefault({}),
});
export type MapLighting = z.infer<typeof MapLightingSchema>;
export type LightPreset = z.infer<typeof DayLightSchema>;

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
    /** The world this level belongs to (biomes.json). Required — a map outside every biome is unreachable content. */
    biomeId: IdSchema,
    /**
     * INJECTED BY THE LOADER from the map's biome — never authored here. A map
     * file that sets it is a boot failure: the rule belongs to the *place*, and
     * a per-map rule is exactly the "parameterised modifier" BIOMES.md C.4 bans.
     */
    terrainRule: TerrainRuleSchema.optional(),
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
