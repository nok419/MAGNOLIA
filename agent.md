# AGENTS.md

## Development rules

This repository prioritizes maintainability, small changes, and reviewability.

Follow these principles:

- KISS:
  - Prefer the simplest implementation that satisfies the current Issue.
  - Do not introduce frameworks, abstractions, registries, factories, or generic layers unless the Issue requires them.
  - Do not solve future requirements that are not described in the Issue.

- DRY:
  - Avoid copy-paste duplication when the duplicated code has the same meaning and same reason to change.
  - Do not extract code only because two snippets look similar.
  - Prefer duplication over a bad abstraction when the responsibilities are different.
  - If introducing a shared helper, explain why the shared meaning is stable.

- SOLID:
  - Single Responsibility: each module, component, function, and class should have one clear reason to change.
  - Open/Closed: prefer adding behavior through small composable units rather than editing unrelated existing logic.
  - Liskov Substitution: do not create interfaces or inheritance structures where implementations cannot be safely substituted.
  - Interface Segregation: avoid large option objects and broad interfaces that force callers to depend on unused fields.
  - Dependency Inversion: keep domain logic independent from UI, framework, storage, and network details where practical.

## Scope control

- Implement only the current Issue.
- Do not refactor unrelated files.
- Do not rename files, move directories, or change public APIs unless required by the Issue.
- If a broader refactor seems necessary, stop and propose a separate Issue.

## Before finishing

Run the relevant checks:

- npm run lint
- npm test
- npm run build

If a command is missing or fails because the project is not configured for it, report that explicitly.

## Review checklist

Before opening a PR, check:

- The diff matches the Issue.
- No unrelated formatting changes are included.
- No secrets, .env files, generated files, or large files are included.
  - Exception: `packages/persistence/src/generated/content-manifest.ts` is generated source that is committed because runtime loading imports it directly.
  - When content JSON changes, run `npm run content:manifest` and keep `npm run content:manifest:check` green.
- Source archives are created only with `npm run archive:source`.
  - `npm test` runs the archive content tests through `node --test tests/*.test.mjs`.
  - Do not create review zip files manually.
- The implementation is simpler than the alternative designs.
- Duplicated logic is intentional or extracted for a stable reason.
- Tests were added or updated when behavior changed.
- doccument #2 is latest version and accurate.
