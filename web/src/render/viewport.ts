import type { Vec } from "../sim/types";

/** Maps the fixed logical arena onto the canvas, letterboxed. Units are CSS pixels. */
export type Viewport = { scale: number; offsetX: number; offsetY: number };

export function fitViewport(cssWidth: number, cssHeight: number, arena: { width: number; height: number }): Viewport {
  const scale = Math.min(cssWidth / arena.width, cssHeight / arena.height);
  return { scale, offsetX: (cssWidth - arena.width * scale) / 2, offsetY: (cssHeight - arena.height * scale) / 2 };
}

export function toArena(view: Viewport, cssX: number, cssY: number): Vec {
  return { x: (cssX - view.offsetX) / view.scale, y: (cssY - view.offsetY) / view.scale };
}
