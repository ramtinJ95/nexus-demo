import { toArena, type Viewport } from "./render/viewport";
import type { InputFrame, Vec } from "./sim/types";
import { drag, firing, knobOffset, noSticks, press, release, stickVector, type Sticks } from "./touch";

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

/** `read` takes the drone's position because a touch aim is a direction, and the sim wants an arena point. */
export type Input = { read(drone: Vec): InputFrame; dispose(): void };

export function createInput(root: HTMLElement, canvas: HTMLCanvasElement, viewport: () => Viewport): Input {
  const held = new Set<string>();
  let pointer = { x: 0, y: 0 };
  let pointerSeen = false;
  let mouseFiring = false;
  const sticks = noSticks();
  const stickEls = {
    move: root.querySelector<HTMLElement>('[data-testid="touch-stick-move"]')!,
    aim: root.querySelector<HTMLElement>('[data-testid="touch-stick-aim"]')!,
  };

  const showTouch = () => {
    if (root.dataset.touch !== "true") root.dataset.touch = "true";
  };
  if (matchMedia("(any-pointer: coarse)").matches) showTouch();

  const drawSticks = (state: Sticks) => {
    for (const side of ["move", "aim"] as const) {
      const el = stickEls[side];
      const stick = state[side];
      el.dataset.active = String(stick !== null);
      el.style.left = stick ? `${stick.origin.x}px` : "";
      el.style.top = stick ? `${stick.origin.y}px` : "";
      const knob = stick ? knobOffset(stick) : { x: 0, y: 0 };
      el.style.setProperty("--knob-x", `${knob.x}px`);
      el.style.setProperty("--knob-y", `${knob.y}px`);
    }
  };
  const local = (e: PointerEvent) => {
    const rect = root.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!(e.code in directions) || e.target instanceof HTMLInputElement) return;
    held.add(e.code);
    e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent) => held.delete(e.code);
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") {
      drag(sticks, e.pointerId, local(e));
      drawSticks(sticks);
      return;
    }
    pointer = { x: e.clientX, y: e.clientY };
    pointerSeen = true;
    sticks.aimDir = null;
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || e.pointerType === "touch") return;
    onPointerMove(e);
    mouseFiring = true;
  };
  const onTouchDown = (e: PointerEvent) => {
    if (e.pointerType !== "touch" || (e.target instanceof Element && e.target.closest(".game-over, .menu"))) return;
    showTouch();
    e.preventDefault();
    if (press(sticks, e.pointerId, local(e), root.clientWidth)) drawSticks(sticks);
  };
  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === "touch") {
      release(sticks, e.pointerId);
      drawSticks(sticks);
    } else if (e.button === 0) mouseFiring = false;
  };
  const onBlur = () => {
    held.clear();
    mouseFiring = false;
    sticks.move = null;
    sticks.aim = null;
    drawSticks(sticks);
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointerdown", onTouchDown);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("blur", onBlur);

  return {
    read(drone) {
      let x = 0;
      let y = 0;
      for (const code of held) {
        x += directions[code]!.x;
        y += directions[code]!.y;
      }
      const len = Math.hypot(x, y);
      const move = sticks.move ? stickVector(sticks.move) : len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      // Before the pointer moves, aim straight up from the arena center so the drone has a sane heading.
      const aim = sticks.aimDir
        ? { x: drone.x + sticks.aimDir.x * 100, y: drone.y + sticks.aimDir.y * 100 }
        : pointerSeen
          ? toArena(viewport(), pointer.x - rect.left, pointer.y - rect.top)
          : toArena(viewport(), rect.width / 2, 0);
      return { move, aim, fire: mouseFiring || firing(sticks) };
    },
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointerdown", onTouchDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("blur", onBlur);
    },
  };
}
