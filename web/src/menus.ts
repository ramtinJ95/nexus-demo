import type { Prefs } from "./prefs";
import type { Screen, ScreenAction } from "./screen";

export type Menus = {
  show(screen: Screen): void;
  /** `motionForced` is the URL forcing reduced motion on, which the stored pref cannot undo. */
  showPrefs(prefs: Prefs, motionForced: boolean): void;
};

export type MenuHandlers = { act(action: ScreenAction): void; change(patch: Partial<Prefs>): void; daily(): void };

export function createMenus(root: HTMLElement, { act, change, daily }: MenuHandlers): Menus {
  const el = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`)!;
  const title = el("title-screen");
  const pause = el("pause-overlay");
  const settings = el("settings");
  // Each key doubles as the root dataset key, so `musicVolume` shows as `data-music-volume`.
  const volumes = (["music", "sfx"] as const).map((id) => ({
    key: `${id}Volume` as const,
    input: el<HTMLInputElement>(`setting-${id}-volume`),
    value: el(`setting-${id}-volume-value`),
  }));
  const reducedMotion = el<HTMLInputElement>("setting-reduced-motion");
  const colorblind = el<HTMLInputElement>("setting-colorblind");

  const buttons: [string, ScreenAction][] = [
    ["start", "start"],
    ["title-settings", "openSettings"],
    ["resume", "resume"],
    ["pause-settings", "openSettings"],
    ["settings-back", "closeSettings"],
  ];
  for (const [id, action] of buttons) el(id).addEventListener("click", () => act(action));
  el("start-daily").addEventListener("click", daily);
  for (const { key, input } of volumes) input.addEventListener("input", () => change({ [key]: Number(input.value) / 100 }));
  reducedMotion.addEventListener("change", () => change({ reducedMotion: reducedMotion.checked }));
  colorblind.addEventListener("change", () => change({ palette: colorblind.checked ? "colorblind" : "neon" }));

  return {
    show(screen) {
      const menu = screen.kind === "menu" ? screen : undefined;
      title.hidden = menu?.menu !== "title" || menu.settings;
      pause.hidden = menu?.menu !== "pause" || menu.settings;
      settings.hidden = !menu?.settings;
      root.dataset["screen"] = menu ? (menu.menu === "title" ? "title" : "paused") : "playing";
      root.dataset["settings"] = String(menu?.settings ?? false);
    },
    showPrefs(prefs, motionForced) {
      for (const { key, input, value } of volumes) {
        const percent = String(Math.round(prefs[key] * 100));
        input.value = percent;
        value.textContent = `${percent}%`;
        root.dataset[key] = percent;
      }
      reducedMotion.checked = motionForced || prefs.reducedMotion;
      reducedMotion.disabled = motionForced;
      colorblind.checked = prefs.palette === "colorblind";
      root.dataset["reducedMotion"] = String(reducedMotion.checked);
      root.dataset["palette"] = prefs.palette;
    },
  };
}
