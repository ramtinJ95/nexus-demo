# nexus-demo

Pylon Panic, a neon arena survival game built on Bobble Nexus by Claude agent threads, with Astra reviewing every pull request.

Defend the pylon at the center of the arena. Move with WASD, aim with the mouse, and hold the mouse button to shoot. Bugs that reach the pylon drain its integrity, and the run ends at zero. Your score is kills plus waves survived. Add `?seed=<n>` to the URL to replay a run.

```sh
npm ci
npm start -w api        # http://127.0.0.1:8787
npm run dev -w web      # http://127.0.0.1:5173, with /api proxied to the API
.nexus/check            # typecheck, tests, production build
```

[AGENTS.md](AGENTS.md) has the layout, the rules, and the PR evidence convention.
