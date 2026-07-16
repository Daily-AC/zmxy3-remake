# Project Instructions

## Public Acceptance

- Browser acceptance and user-facing verification must use `https://zaixu-dev.qmledmq.cn:8443`.
- `localhost` is for development diagnostics only and never counts as completion evidence.
- Deploy test builds to the isolated `C:\www\zaixu-dev` home target. Do not overwrite the production `zaixu.qmledmq.cn` site unless the user explicitly requests a release.
- The matching test backend is `https://zm-dev.qmledmq.cn:8443`, with social APIs under `/social/*` and the NPC WebSocket at the host root.
