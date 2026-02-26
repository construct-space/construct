# Space Repos Workflow

Construct spaces are maintained in standalone repositories under `../construct-spaces/*`.

## Why

- Keep each space isolated and easier to maintain.
- Let multiple Construct apps (`construct-vue`, `construct-personal`) consume the same space code.

## Commands

- `bun run spaces:extract`
Creates/updates standalone repos from current local `src/spaces/*` (source-of-truth export).

- `bun run spaces:sync`
Copies space code from `../construct-spaces/*` into local `src/spaces/*`.

## Config

`space-repos.json` defines mappings:

- `repoPath`: standalone repo location
- `target`: local space directory to populate

## Default behavior

`dev`, `build`, and `tauri:*` scripts run `spaces:sync` first, so the app always uses repo-backed space code.
