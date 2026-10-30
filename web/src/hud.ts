import { debutKind, enemyTypes } from "./sim/enemies";
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
    newEnemy: el("hud-new-enemy"),
  };
  const newEnemyName = parts.newEnemy.querySelector<HTMLElement>(".new-enemy-name")!;
  const newEnemyHint = parts.newEnemy.querySelector<HTMLElement>(".new-enemy-hint")!;

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

      const debut = state.phase === "playing" ? debutKind(state.wave.number) : undefined;
      const intro = debut && enemyTypes[debut].intro;
      parts.newEnemy.hidden = !intro;
      if (debut && intro && parts.newEnemy.dataset["kind"] !== debut) {
        parts.newEnemy.dataset["kind"] = debut;
        parts.newEnemy.style.setProperty("--enemy-color", enemyTypes[debut].color);
        set(newEnemyName, `NEW: ${debut.toUpperCase()}`);
        set(newEnemyHint, intro);
      }
      if (!intro) delete parts.newEnemy.dataset["kind"];

      const kinds = [...new Set(state.bugs.map((bug) => bug.kind))].sort().join(" ");
      if (root.dataset["enemyKinds"] !== kinds) root.dataset["enemyKinds"] = kinds;
    },
  };
}
