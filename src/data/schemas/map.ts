import { z } from 'zod';
import { IdSchema, Vec2Schema } from './common';

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
