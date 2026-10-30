import type { Prefs } from "./prefs";
import type { Screen, ScreenAction } from "./screen";

export type Menus = {
  show(screen: Screen): void;
  /** `motionForced` is the URL forcing reduced motion on, which the stored pref cannot undo. */
  showPrefs(prefs: Prefs, motionForced: boolean): void;
};

export type MenuHandlers = { act(action: ScreenAction): void; change(patch: Partial<Prefs>): void };

export function createMenus(root: HTMLElement, { act, change }: MenuHandlers): Menus {
  const el = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`)!;
  const title = el("title-screen");
  const pause = el("pause-overlay");
  const settings = el("settings");
  const volume = el<HTMLInputElement>("setting-volume");
  const volumeValue = el("setting-volume-value");
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
  volume.addEventListener("input", () => change({ volume: Number(volume.value) / 100 }));
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
      const percent = String(Math.round(prefs.volume * 100));
      volume.value = percent;
      volumeValue.textContent = `${percent}%`;
      reducedMotion.checked = motionForced || prefs.reducedMotion;
      reducedMotion.disabled = motionForced;
      colorblind.checked = prefs.palette === "colorblind";
      root.dataset["volume"] = percent;
      root.dataset["reducedMotion"] = String(reducedMotion.checked);
      root.dataset["palette"] = prefs.palette;
    },
  };
}
