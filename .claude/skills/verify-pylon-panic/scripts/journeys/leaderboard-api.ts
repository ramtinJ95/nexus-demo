import type { Journey } from "../journey.ts";

export const leaderboardApi: Journey = {
  feature: "leaderboard-api.md",
  description: "Read, write and validate scores through the web app's /api proxy, from an empty database.",
  async run({ page, webUrl, save, check, shot }) {
    const api = page.request;
    const health = await api.get(`${webUrl}/api/health`);
    check(health.ok(), "GET /api/health answers 200 through the web proxy");

    const empty = await (await api.get(`${webUrl}/api/scores`)).json();
    check(Array.isArray(empty.scores) && empty.scores.length === 0, "a clean stack starts with no scores");

    const posts = [
      { name: "  Ada  ", score: 42, wave: 5 },
      { name: "Grace", score: 99, wave: 7 },
      { name: "x".repeat(17), score: 1, wave: 1 },
      { name: "Linus", score: -3, wave: 1 },
    ];
    const results = [];
    for (const body of posts) {
      const res = await api.post(`${webUrl}/api/scores`, { data: body });
      results.push({ body, status: res.status(), reply: await res.json() });
    }
    save("posts", results);
    check(results[0]!.status === 201 && results[0]!.reply.score.name === "Ada", "a valid score is stored with its name trimmed");
    check(results[2]!.status === 400, "a 17 character name is rejected");
    check(results[3]!.status === 400, "a negative score is rejected");

    const list = await (await api.get(`${webUrl}/api/scores?limit=10`)).json();
    save("scores", list);
    check(list.scores.map((s: { name: string }) => s.name).join(",") === "Grace,Ada", "GET /api/scores lists stored scores, best first");
    check((await api.get(`${webUrl}/api/scores?limit=0`)).status() === 400, "limit=0 is rejected");

    await page.goto(`${webUrl}/api/scores?limit=10`);
    await shot("scores-json");
  },
};
