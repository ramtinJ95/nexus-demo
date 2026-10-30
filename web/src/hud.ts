import { bossPhase, debutKind, enemyTypes } from "./sim/enemies";
import type { Settings } from "./sim/settings";
import { score } from "./sim/step";
import type { GameState } from "./sim/types";
import type { Palette } from "./render/palette";

export type Hud = { update(state: GameState, palette: Palette): void };

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
    boss: el("hud-boss"),
    bossPhase: el("hud-boss-phase"),
    bossBar: el("hud-boss-bar"),
  };
  const newEnemyName = parts.newEnemy.querySelector<HTMLElement>(".new-enemy-name")!;
  const newEnemyHint = parts.newEnemy.querySelector<HTMLElement>(".new-enemy-hint")!;

  const set = (node: HTMLElement, text: string) => {
    if (node.textContent !== text) node.textContent = text;
  };
  const setData = (node: HTMLElement, key: string, value: string) => {
    if (node.dataset[key] !== value) node.dataset[key] = value;
  };

  return {
    update(state, palette) {
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
      if (debut) parts.newEnemy.style.setProperty("--enemy-color", palette.enemies[debut]);
      if (debut && intro && parts.newEnemy.dataset["kind"] !== debut) {
        parts.newEnemy.dataset["kind"] = debut;
        set(newEnemyName, `NEW: ${debut.toUpperCase()}`);
        set(newEnemyHint, intro);
      }
      if (!intro) delete parts.newEnemy.dataset["kind"];

      const boss = state.bugs.find((bug) => bug.kind === "boss");
      if (parts.boss.hidden !== !boss) parts.boss.hidden = !boss;
      if (boss) {
        const phase = bossPhase(boss);
        parts.boss.style.setProperty("--boss", palette.enemies.boss);
        setData(parts.boss, "phase", String(phase));
        setData(parts.boss, "move", boss.dash.phase);
        setData(parts.boss, "hp", String(Math.ceil(boss.hp)));
        setData(parts.boss, "x", String(Math.round(boss.pos.x)));
        setData(parts.boss, "y", String(Math.round(boss.pos.y)));
        set(parts.bossPhase, phase === 2 ? "PHASE 2 · ENRAGED" : "PHASE 1");
        const width = `${(100 * boss.hp) / enemyTypes.boss.hp}%`;
        if (parts.bossBar.style.width !== width) parts.bossBar.style.width = width;
      }

      const kinds = [...new Set(state.bugs.map((bug) => bug.kind))].sort().join(" ");
      if (root.dataset["enemyKinds"] !== kinds) root.dataset["enemyKinds"] = kinds;
    },
  };
}
