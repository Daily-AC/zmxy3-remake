# Combat Core Slice Performance Report

## Status

Local verification: **PASS**. Windows reference: **PASS**. The committed machine-readable evidence is bound to the reviewed source digest and independently verified on macOS after collection.

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

## Windows Reference

Machine-readable evidence target: [`combat-core-slice-windows-performance.json`](evidence/combat-core-slice-windows-performance.json). Collector: [`collect-windows-performance-evidence.mjs`](../../game/tools/collect-windows-performance-evidence.mjs). Cross-platform verifier: [`verify-windows-performance-evidence.mjs`](../../game/tools/verify-windows-performance-evidence.mjs).

The evidence was produced from clean checkpoint `a1fbdb49f769c1dd22ed9e66d926446755f6b9f3` with source digest `379a6a0b13049c2cfec16dbf1c1f447c2e51fd84f715cfe18fccbe395dce9637` using:

```bash
npm ci
npm --prefix game exec -- playwright install chromium
npm --prefix game run build
npm run collect:windows-performance
npm run verify:windows-performance-evidence
```

Environment: Windows x64, Node `v24.18.0`, Chrome/Chromium `150.0.7871.101`, 1920 by 1080 viewport, DPR 1, 960 by 540 Phaser backing canvas fitted to a 1920 by 1080 client box, and `ANGLE (NVIDIA GeForce RTX 5090 Laptop GPU, Direct3D11)`.

| Distribution | Count | P50 | P95 | Max |
| --- | ---: | ---: | ---: | ---: |
| Simulation run 1 | 600 | 0.0041 ms | 0.0101 ms | 0.3437 ms |
| Simulation run 2 | 600 | 0.0041 ms | 0.0094 ms | 0.6158 ms |
| Simulation run 3 | 600 | 0.0041 ms | 0.0112 ms | 0.4136 ms |
| Browser CPU work | 600 | 0.2000 ms | 0.8000 ms | 4.2000 ms |
| Browser render interval | 600 | 5.9000 ms | 6.6000 ms | 9.6000 ms |

Dropped intervals above 25 ms: `0/600` (`0%`). All three simulation P95 values are below `5 ms`; browser work and interval P95 are below `16.7 ms`; dropped intervals are below `1%`. Windows reference conclusion: **PASS**.
