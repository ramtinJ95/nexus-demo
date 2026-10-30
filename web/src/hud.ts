import type { Settings } from "./sim/settings";
import { score } from "./sim/step";
import type { GameState } from "./sim/types";

export type Hud = { update(state: GameState): void };

export function createHud(root: HTMLElement, settings: Settings): Hud {
  const el = (id: string) => root.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
  const parts = {
    score: el("hud-score"),
    wave: el("hud-wave"),
    countdown: el("hud-countdown"),
    integrity: el("hud-integrity"),
    integrityBar: el("hud-integrity-bar"),
    seed: el("hud-seed"),
    gameOver: el("game-over"),
    finalScore: el("final-score"),
    finalWave: el("final-wave"),
  };

  const set = (node: HTMLElement, text: string) => {
    if (node.textContent !== text) node.textContent = text;
  };

  return {
    update(state) {
      const integrity = Math.ceil(state.integrity);
      set(parts.score, String(score(state)));
      set(parts.wave, String(state.wave.number));
      set(parts.countdown, state.wave.phase === "resting" ? `incoming in ${Math.ceil(state.wave.nextWaveIn)}` : "");
      set(parts.integrity, String(integrity));
      set(parts.seed, String(state.seed));
      parts.integrityBar.style.width = `${(100 * state.integrity) / settings.pylon.maxIntegrity}%`;
      root.dataset["low"] = String(state.integrity / settings.pylon.maxIntegrity <= 0.25);
      if (root.dataset["phase"] !== state.phase) root.dataset["phase"] = state.phase;
      parts.gameOver.hidden = state.phase !== "gameOver";
      set(parts.finalScore, String(score(state)));
      set(parts.finalWave, String(state.wave.number));
    },
  };
}
