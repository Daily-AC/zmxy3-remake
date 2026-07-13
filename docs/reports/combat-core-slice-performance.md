# Combat Core Slice Performance Report

## Status

Local verification: **PASS**. Windows reference: **NOT-RUN**. The designated Windows machine evidence is deferred and no Windows result is inferred from macOS headless Chromium.

## Simulation

Three local 51-actor runs used 120 warm-up ticks and 600 measured ticks. P95 results were `0.012166 ms`, `0.008833 ms`, and `0.010583 ms`, all below the `5 ms` contract. These are local regression data, not the designated Windows samples.

## Local Browser Telemetry

Command: `npm --prefix game run verify:combat-core -- --perf-only --json`

Environment: macOS arm64, Node `v25.6.1`, headless Chromium `149.0.7827.55`, 1920 by 1080 viewport, DPR 1, 960 by 540 Phaser backing canvas fitted to a 1920 by 1080 CSS client box, ANGLE SwiftShader Vulkan renderer.

| Distribution | Count | P50 | P95 | Max |
| --- | ---: | ---: | ---: | ---: |
| CPU work | 600 | 0.200 ms | 0.800 ms | 2.800 ms |
| Render interval | 600 | 8.300 ms | 9.600 ms | 323.500 ms |

Dropped intervals above 25 ms: `1/600` (`0.1667%`). The immediately preceding full normal proof reported functional work P95 `0.900 ms`. The initial contract measures the current 960 by 540 backing canvas on a 1920 by 1080 reference display; it is not a 1080p backing-buffer claim.

Generated local details are in `game/tmp/combat-core-slice/performance.json` and `performance-environment.json`. They are intentionally ignored and cannot satisfy the hard gate.

## Windows Gate

Machine-readable evidence target: [`combat-core-slice-windows-performance.json`](evidence/combat-core-slice-windows-performance.json). Collector: [`collect-windows-performance-evidence.mjs`](../../game/tools/collect-windows-performance-evidence.mjs). Cross-platform verifier: [`verify-windows-performance-evidence.mjs`](../../game/tools/verify-windows-performance-evidence.mjs).

The Windows report must be produced from a clean worktree with:

```bash
npm ci
npm --prefix game exec -- playwright install chromium
npm --prefix game run build
npm run collect:windows-performance
npm run verify:windows-performance-evidence
```

Until that evidence reports three simulation passes, source-digest equality, Windows/Chromium/1920 by 1080/DPR 1, at least 600 browser samples, work and interval P95 at or below 16.7 ms, and dropped intervals at or below 1%, the Windows performance conclusion remains **NOT-RUN**.
