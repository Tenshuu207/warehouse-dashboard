# AGENTS.md

## Project Purpose

This repository builds a warehouse operations performance and visibility suite.

The system starts with day-shift warehouse operations, especially replenishment, then expands to night-shift operations such as order selecting, and later may expand into delivery. The goal is to provide operational visibility, performance tracking, management insight, and eventually open peer visibility so employees can see their own performance and the performance of others with full drilldown context.

This project is operational software first. It must prioritize trustworthy operational meaning over cosmetic polish unless a task is explicitly scoped as UI-first work.

---

## Primary Users

Right now the primary user is management.

However, the product should be designed with early peer visibility in mind:
- employees will be able to see each other’s data
- employees will be able to access full drilldowns
- the system should not rely on manager-only mental context to make sense

That means labels, totals, charts, and drilldowns must be understandable and internally consistent.

---

## Core Truth Model

This project must keep these truths separate:

### 1. Raw data truth
Raw source data is paramount.
It should be preserved and treated as the base layer because it can later be transformed, merged, compared, and linked into better derived models.

### 2. Assigned placement truth
Assigned role/area/section is a management truth.
It represents where an employee was expected to count for a given day or time period.

This should eventually support:
- day-level manager overrides
- date-range assignment rules
- pre-set employee roles/areas for defined periods

### 3. Observed work truth
Observed work describes what work was actually done:
- what area the work happened in
- what role bucket the work belongs to
- where product was received or moved
- where outside help occurred

Observed work must remain separate from assigned placement.

### 4. Performance evaluation truth
If hours are used for performance standards, performance must be judged by assigned role/area, not observed slices.

Reason:
employees often split work during the day, and the system cannot reliably split hours across multiple observed roles or areas. Observed work can describe what happened, but standards/performance evaluation must follow assigned placement.

---

## Canonical Rules

### Assigned placement precedence
When the system needs assigned display role/area or assigned performance context, use this order:

1. manual daily override
2. saved daily assignment / placement
3. observed inferred assignment
4. home/default assignment
5. unknown / other

### Observed work usage
When the system needs to describe where work happened, use observed-work systems and activity buckets, not assigned placement.

### Performance standards
Performance comparisons should be made against assigned role/area, not against every observed work slice.

### Same truth, same system
If two views are answering the same operational question, they must use the same truth source and precedence model.
Do not create page-specific logic for the same concept unless explicitly documented.

---

## Shift / Model Boundaries

Day shift, night shift, and delivery are different operational models and should not be forced into one shared logic path prematurely.

However:
- day shift may still show picking stats
- night shift may still show replenishment stats
- cross-model activity may be visible

When that happens:
- it must be clearly labeled
- it must be visually separated where needed
- performance comparisons must still follow assigned area/role, not mixed observed work

---

## What Codex Must Not Do Without Explicit Approval

Do not do any of the following unless explicitly requested:

1. change truth-model assumptions or precedence rules
2. conflate assigned placement with observed work
3. use observed work slices as the basis for hours-based performance evaluation
4. widen a UI/presentation task into backend/server/data-model changes
5. introduce a new source of truth when a canonical one already exists
6. change reconciliation math for totals without preserving visible consistency
7. force different operational models into one logic path prematurely
8. add broad abstractions when a narrow local patch is sufficient

---

## Implementation Bias

Prefer:
- narrow patches in existing files
- reuse of existing shared helpers when they are truly canonical
- explicit naming of truth layers
- visible reconciliation of totals
- clear separation between assignment context and work context

Avoid:
- wide speculative refactors
- reconstructing truth from noisy mixed labels when a better source should exist upstream
- solving the same concept differently in different views
- making the UI prettier at the cost of operational correctness

---

## Current Strategic Direction

The current strategic direction is:

1. stabilize truth models
2. align views onto canonical resolution paths
3. improve dashboard clarity and drilldowns
4. add a fast daily Assignment Editor for manager-controlled overrides
5. expand beyond day replenishment into night shift and other operational models

---

## Assignment Editor Direction

A future Assignment Editor should act as the fast manual assignment truth layer.

It should:
- open from selected-date operational views
- support daily manager overrides
- support role/area slots and extra/helper slots
- keep observed work separate from assigned placement
- feed the assigned placement precedence model

This editor is meant to improve assignment truth, not rewrite raw observed work.

---

## Testing / Validation Expectations

After frontend changes:
- run lint
- verify drilldowns still preserve date context
- verify totals still reconcile where totals are shown
- verify assigned placement and observed work remain clearly separated

If a change touches a truth layer:
- explain what truth is being changed
- explain what precedence is being used
- explain which views are affected

---

## Practical Summary

When making changes, always ask:

- Is this assigned placement truth, observed work truth, or performance truth?
- Am I using the same system already used elsewhere for this same concept?
- Am I preserving raw data integrity?
- Am I making the dashboard more trustworthy, not just more polished?
