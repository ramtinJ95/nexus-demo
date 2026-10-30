import { toArena, type Viewport } from "./render/viewport";
import type { InputFrame } from "./sim/types";

const directions: Record<string, { x: number; y: number }> = {
  KeyW: { x: 0, y: -1 },
  KeyA: { x: -1, y: 0 },
  KeyS: { x: 0, y: 1 },
  KeyD: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowDown: { x: 0, y: 1 },
  ArrowRight: { x: 1, y: 0 },
};

export type Input = { read(): InputFrame; dispose(): void };

export function createInput(canvas: HTMLCanvasElement, viewport: () => Viewport): Input {
  const held = new Set<string>();
  let pointer = { x: 0, y: 0 };
  let pointerSeen = false;
  let firing = false;

  const onKeyDown = (e: KeyboardEvent) => {
    if (!(e.code in directions)) return;
    held.add(e.code);
    e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent) => held.delete(e.code);
  const onPointerMove = (e: PointerEvent) => {
    pointer = { x: e.clientX, y: e.clientY };
    pointerSeen = true;
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    onPointerMove(e);
    firing = true;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (e.button === 0) firing = false;
  };
  const onBlur = () => {
    held.clear();
    firing = false;
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("blur", onBlur);

  return {
    read() {
      let x = 0;
      let y = 0;
      for (const code of held) {
        x += directions[code]!.x;
        y += directions[code]!.y;
      }
      const len = Math.hypot(x, y);
      const move = len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      // Before the pointer moves, aim straight up from the arena center so the drone has a sane heading.
      const aim = pointerSeen
        ? toArena(viewport(), pointer.x - rect.left, pointer.y - rect.top)
        : toArena(viewport(), rect.width / 2, 0);
      return { move, aim, fire: firing };
    },
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("blur", onBlur);
    },
  };
}
