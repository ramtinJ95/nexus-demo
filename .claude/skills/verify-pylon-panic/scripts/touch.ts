import type { Page } from "playwright";

type Point = { x: number; y: number };

/** Drives several fingers at once through Chromium's touch input, so the page gets real `pointerType: "touch"` events. */
export async function touchscreen(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const fingers = new Map<number, Point>();
  const points = () => [...fingers].map(([id, p]) => ({ id, x: p.x, y: p.y }));
  const send = (type: "touchStart" | "touchMove" | "touchEnd", touchPoints = points()) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints });

  return {
    async down(id: number, at: Point) {
      fingers.set(id, at);
      await send("touchStart");
    },
    async move(id: number, to: Point) {
      fingers.set(id, to);
      await send("touchMove");
    },
    async up(id: number) {
      const at = fingers.get(id);
      fingers.delete(id);
      // Chromium lifts exactly the fingers a touchEnd lists, so the others stay down.
      if (at) await send("touchEnd", [{ id, ...at }]);
    },
  };
}
