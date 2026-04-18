cd ~/homelab-stacks/warehouse-dashboard || exit 1

cat > docs/doc-update-workflow.md <<'EOF'
# Document Update Workflow

## Purpose

This document explains how project docs should be updated as work progresses.

Not all docs should be updated the same way.
Some are source-of-truth documents.
Some are working-state documents.

The update method should match the importance of the doc.

---

## Document Categories

## 1. Source-of-truth docs
These should only be updated intentionally and reviewed carefully.

Files:
- AGENTS.md
- docs/truth-model.md

Rules:
- do not auto-rewrite casually
- only update when project rules, truth layers, or precedence models actually change
- prefer proposed patches over silent edits

---

## 2. Controlled design docs
These can be updated by Codex with review.

Files:
- docs/role-area-resolution.md
- docs/assignment-editor-v1.md

Rules:
- okay to update when canonical mappings, precedence, or workflow design changes
- still review changes before treating them as settled
- do not let these drift from AGENTS.md or truth-model.md

---

## 3. Working-state docs
These are safe to update frequently.

Files:
- PLANS.md
- docs/current-focus.md
- docs/known-problems.md

Rules:
- can be updated at the end of meaningful passes
- should reflect:
  - what was completed
  - what changed in focus
  - what remains unstable
  - what the next likely pass is

These docs are ideal for Codex-assisted updates.

---

## End-of-Pass Update Rule

At the end of a meaningful implementation pass, ask:

1. Did precedence change?
2. Did a canonical mapping change?
3. Did a view change which truth source it uses?
4. Did roadmap priority change?
5. Did a known problem get resolved or newly discovered?
6. Did Assignment Editor direction change?

If yes:
- update or propose updates to the relevant docs

---

## Safe Automation Strategy

### Can be updated directly by Codex
- PLANS.md
- docs/current-focus.md
- docs/known-problems.md

### Should be proposed, then reviewed
- docs/role-area-resolution.md
- docs/assignment-editor-v1.md

### Should be changed only intentionally
- AGENTS.md
- docs/truth-model.md

---

## Recommended End-of-Pass Prompt

Use this at the end of major Codex passes:

"If this pass changed project rules, precedence, canonical mappings, or planned workflow, propose doc updates for:
- AGENTS.md
- docs/truth-model.md
- docs/role-area-resolution.md
- docs/assignment-editor-v1.md
- PLANS.md
- docs/current-focus.md
- docs/known-problems.md

Do not auto-edit AGENTS.md or docs/truth-model.md unless explicitly asked.
You may update PLANS.md, docs/current-focus.md, and docs/known-problems.md directly if the task clearly changed current project state.
Summarize which docs should change and why."

---

## Update Philosophy

The goal is:
- stable vision docs
- flexible working docs
- less drift
- less repeated explanation
- better Codex direction control

The system should help the docs stay current without letting automation rewrite the project’s core truths casually.
EOF
