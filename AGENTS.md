# AGENTS.md - Codex Operating Rules

## Role & Purpose

You are the primary coding agent for this project.

This project is an ARS Electronica 2026 art/research prototype, not a conventional software product. Implement with discipline, low hallucination, and strict alignment to the project documents.

`AGENTS.md` should remain short, stable, and high-frequency. Do not place long feature specs, backend schemas, UI details, or one-off implementation notes here. Those belong in `docs/`.

---

## Project Skill

Project-local skill:

1. `.codex/skills/karpathy-guidelines/SKILL.md`

Apply `karpathy-guidelines` whenever writing, reviewing, or refactoring code in this project:

- Surface assumptions instead of hiding uncertainty.
- Prefer the minimum code that solves the requested problem.
- Make surgical changes only to the files required by the task.
- Define verifiable success criteria and run the smallest relevant checks.

If the current runtime does not auto-load project-local skills, read the skill file manually before nontrivial code work and follow its rules.

---

## Session Start

At the start of each session, read:

1. `AGENTS.md`
2. Relevant project documents in `docs/`
3. Relevant source files before editing

Briefly identify the current goal, current step, known constraints, and any visible mismatch between docs and code.

---

## Source of Truth

Use documentation before assumptions.

Priority order:

1. `docs/PRD.md`
2. `docs/APP_FLOW.md`
3. `docs/TECH_STACK.md`
4. `docs/HARDWARE_BOM.md`
5. `docs/WIRING_PLAN.md`
6. `docs/FRONTEND_GUIDELINES.md`
7. `docs/BACKEND_STRUCTURE.md`
8. `docs/IMPLEMENTATION_PLAN.md`

Files under `docs/archive/` are historical references and never override current documentation.

If a document is empty, treat it as not yet authored. Do not invent missing requirements.

If documents conflict, follow the higher-priority document and flag the conflict clearly.

If docs and current code diverge, do not silently choose one side. Surface the mismatch and take the smallest safe next step.

---

## Coding Rules

- Implement only the requested or documented scope.
- Do not invent features, routes, tables, APIs, dependencies, UI patterns, or data structures without doc support.
- Prefer existing project patterns over new abstractions.
- Keep changes small, testable, and reversible.
- Do not bundle opportunistic refactors with task-specific work.
- Do not overwrite, revert, or clean up unrelated user changes.
- Do not add dependencies casually. Any new dependency must be justified and declared in the relevant project dependency file.
- Do not expose secrets or put sensitive values in client-facing code.
- Comments and docstrings should clarify non-obvious intent, not restate code.
- Do not commit unless the user explicitly asks.

---

## Documentation Rules

- Canonical documentation lives in `docs/`.
- Do not fill canonical documentation files without explicit user instruction or confirmed source material.
- When later filling documentation, use conversation history and project materials as source material. Do not invent details.
- Keep `AGENTS.md` compact. Only keep rules here that are useful in most sessions.

---

## Testing & Validation

After each meaningful change:

1. Check that the change matches the requested scope and relevant docs.
2. Run the smallest relevant verification available.
3. Test the main path and obvious edge cases when applicable.
4. Confirm no unrelated behavior changed.
5. Summarize what changed, what was validated, and what remains.

---

## Language Rules

- Code comments: English
- User-facing conversation: Chinese unless the user asks otherwise
- Project documentation: Chinese by default, with technical terms kept in English where clearer
