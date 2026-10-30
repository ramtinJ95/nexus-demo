import { panelAfter, submitScore, type Panel, type Run } from "./leaderboard";

export type LeaderboardPanel = { show(run: Run): void; reset(): void };

const NAME_KEY = "pylon-panic:name";

function rememberedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function rememberName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {}
}

const notices: Record<Panel["kind"], string> = {
  hidden: "",
  naming: "",
  submitting: "Submitting…",
  offline: "Leaderboard offline. Retry to save your score, or press Restart to play on.",
  board: "",
};

export function createLeaderboardPanel(root: HTMLElement): LeaderboardPanel {
  const el = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`)!;
  const form = el<HTMLFormElement>("leaderboard-form");
  const input = el<HTMLInputElement>("leaderboard-name");
  const submit = el<HTMLButtonElement>("leaderboard-submit");
  const notice = el("leaderboard-notice");
  const board = el<HTMLOListElement>("leaderboard-board");
  let panel: Panel = { kind: "hidden" };

  function render(): void {
    root.dataset["state"] = panel.kind;
    form.hidden = panel.kind === "hidden" || panel.kind === "board";
    input.disabled = submit.disabled = panel.kind === "submitting";
    board.hidden = panel.kind !== "board";
    notice.textContent = panel.kind === "naming" ? (panel.error ?? "") : notices[panel.kind];
    board.replaceChildren(
      ...(panel.kind === "board" ? panel.rows : []).map((row) => {
        const li = document.createElement("li");
        li.dataset["testid"] = "leaderboard-row";
        li.dataset["mine"] = String(row.mine);
        for (const text of [`#${row.rank}`, row.name, String(row.score), `W${row.wave}`]) {
          const cell = document.createElement("span");
          cell.textContent = text;
          li.append(cell);
        }
        return li;
      }),
    );
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (panel.kind !== "naming" && panel.kind !== "offline") return;
    const name = input.value.trim();
    if (name === "") return;
    const run = panel.run;
    rememberName(name);
    panel = { kind: "submitting", run };
    render();
    void submitScore(fetch, name, run).then((result) => {
      if (panel.kind !== "submitting" || panel.run !== run) return;
      panel = panelAfter(run, result);
      render();
      if (panel.kind !== "board") input.focus();
    });
  });

  render();
  return {
    show(run) {
      input.value = rememberedName();
      panel = { kind: "naming", run, error: null };
      render();
    },
    reset() {
      panel = { kind: "hidden" };
      render();
    },
  };
}
