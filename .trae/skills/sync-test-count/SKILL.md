---
name: sync-test-count
description: Run unit tests and sync the Vitest passed-count badge and test counts in README. Use when tests finish or the user asks to update the count badge. Do not use for writing tests.
---

# Sync Test Count

## Steps

1. From the repo root run `node .trae/skills/sync-test-count/scripts/sync-test-count.mjs`. The script runs the unit tests itself; do not run `pnpm test` first.
2. Exit code 0 — report the printed test file count, passed count, and whether README changed.
3. Exit code 1 — report the failure. README is untouched; do not hand-edit counts.

## What it updates (README.md only)

- Badge `https://img.shields.io/badge/Vitest-<n>%20passed-6E9F18`
- `<n> 个测试文件`
- `共 <n> 个用例`

## Constraints

- Never edit counts manually; always let the script compute them from the test run.
- Do not touch AGENTS.md — it is user-maintained.
- Coverage percentages in README are not recalculated; update them only via `pnpm test:coverage` and a separate user request.
