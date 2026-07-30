/**
 * Barrel for all game-data schemas. Engines import types/schemas from here —
 * never the JSON content itself (substrate rule, CLAUDE.md #1).
 */
export * from './common';
export * from './tower';
export * from './enemy';
export * from './ability';
export * from './map';
export * from './wave';
export * from './metatree';
export * from './hero';
export * from './economy';
export * from './archetype';
