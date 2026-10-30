export type Menu = "title" | "pause";
export type Screen = { kind: "playing" } | { kind: "menu"; menu: Menu; settings: boolean };
export type ScreenAction = "start" | "escape" | "resume" | "openSettings" | "closeSettings";

export const initialScreen: Screen = { kind: "menu", menu: "title", settings: false };

const playing: Screen = { kind: "playing" };

/** Escape peels one layer: settings, then the pause menu. It never pauses a finished run. */
export function nextScreen(screen: Screen, action: ScreenAction, gameOver: boolean): Screen {
  if (screen.kind === "playing") return action === "escape" && !gameOver ? { kind: "menu", menu: "pause", settings: false } : screen;
  if (screen.settings) return action === "escape" || action === "closeSettings" ? { ...screen, settings: false } : screen;
  if (action === "openSettings") return { ...screen, settings: true };
  if (screen.menu === "title") return action === "start" ? playing : screen;
  return action === "escape" || action === "resume" ? playing : screen;
}
