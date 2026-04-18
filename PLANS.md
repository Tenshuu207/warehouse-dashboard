# PLANS.md

## Purpose

This document tracks the current working direction of the warehouse dashboard project.

It is not the full truth-model spec.
It is not the permanent architecture document.
It is the practical roadmap for what is stable, what is in progress, and what should happen next.

This file should help keep implementation work narrow, intentional, and aligned with the project’s actual priorities.

---

## Current Product Direction

The warehouse dashboard is becoming a warehouse operations performance and visibility suite.

The current implementation focus is:
1. stabilize day-shift replenishment operations
2. make dashboard and drilldown views trustworthy
3. improve assignment truth
4. improve performance tracking
5. expand later into night shift selecting and possibly delivery

The system should support:
- management visibility
- employee peer visibility
- operational drilldowns
- role and area performance understanding
- future daily assignment correction workflows

---

## Current Strategic Priorities

### Priority 1: Truth before polish
Operational correctness wins over UI polish unless a task is explicitly scoped as visual-only.

### Priority 2: Stable truth layers
The project must keep separate:
- raw data truth
- assigned placement truth
- observed work truth
- performance evaluation truth

### Priority 3: Canonical reuse
The same concept should use the same system everywhere.
Do not let pages invent separate logic for the same question.

### Priority 4: Controlled expansion
Do not prematurely force day shift, night shift, and delivery into one logic model.
They may share patterns, but they are different operational models.

---

## What Is Stable Enough Right Now

These areas are moving toward a good state and should be treated carefully:

### Grouped area model
Top-level grouped areas are:

- Dry
- Cooler
- Freezer

Leaf areas still exist underneath, but grouped operational views should stay centered on these.

### Area detail direction
Grouped area drilldowns should show:
- area totals
- assigned employees
- receiving by destination
- observed roles / outside help where appropriate

### Sheet view direction
Sheet view should remain:
- operational
- table-first
- exact-number focused
- assignment-aware
- drilldown friendly

### Summary view direction
Summary view should remain:
- visual
- chart-first
- comparison-focused
- clearly different from Sheet view

---

## What Is Not Fully Solved Yet

These are active design/implementation problems:

### 1. Role truth across the project
The project still has multiple role systems in play:
- assigned display role
- observed role labels
- grouped role buckets
- summary role systems
- fallback unclassified behavior

This is the main remaining conceptual risk.

### 2. Canonical observed-work role buckets
Summary and some other views still need a cleaner canonical observed-work role-bucket source.
This is a deeper project issue than a single-chart bug.

### 3. Assignment override workflow
The Assignment Editor does not exist yet.
The project has a direction for it, but not the built tool.

### 4. Review / unclassified handling
Unclassified role/area truth needs clearer review loops so the dashboard can improve over time instead of silently normalizing uncertainty.

---

## Immediate Next Focus

### Current near-term focus
The immediate next focus should be:

1. finish stabilizing the role/area truth model
2. avoid new wide frontend/backend drift
3. keep Summary and Sheet aligned with the same trusted concepts
4. prepare for Assignment Editor v1

### Do not jump ahead yet
Avoid prematurely expanding into:
- night shift selecting logic
- delivery logic
- advanced staffing optimization
- split-day assignment logic
- heavy new persistence models

until the current truth layers are stable.

---

## Assignment Editor Track

Assignment Editor v1 is a planned next major feature.

Its purpose:
- fast manager-controlled daily placement truth
- one daily placement per employee
- slots by area and role
- unassigned/available pool
- flexible Extra placement
- top precedence for assigned placement truth

This feature should be built after the role/area truth model is stable enough that the editor feeds the right system.

---

## Performance Standards Track

A major project rule is already settled:

If employee hours are added to performance calculations, performance standards must be based on assigned role/area, not observed work slices.

Observed work still matters for:
- handled work visibility
- area totals
- extra help
- receiving destination
- role/area contribution views

But standards and direct performance evaluation must follow assigned placement.

This rule should be preserved in future feature work.

---

## Expansion Roadmap

### Phase 1: Day-shift replenishment
- stabilize grouped area views
- stabilize sheet and summary views
- stabilize assignment truth
- stabilize role and area classification

### Phase 2: Assignment management
- build Assignment Editor v1
- support daily override workflow
- improve review of unclassified assignment/role cases

### Phase 3: Night shift model
- introduce order-selecting-specific performance and visibility
- keep cross-visible stats where useful
- clearly label different operational models

### Phase 4: Delivery / broader suite
- only after the existing truth systems are reliable
- avoid copying day-shift assumptions directly into delivery

---

## Working Rules For Ongoing Tasks

When choosing the next implementation step, prefer work that:

- reduces truth drift
- reduces duplicate logic
- makes assignment and observed work clearer
- improves user trust in totals and labels
- helps future Assignment Editor integration

Avoid work that:

- adds polish on top of untrusted logic
- widens scope without explicit need
- creates a new source of truth casually
- hides unresolved logic behind “Mixed” or “Other” when review is more appropriate

---

## Current Desired Output Style

The product should move toward:

- operationally trustworthy
- visibly clear
- management-usable
- employee-readable
- peer-visible
- drilldown-friendly
- honest about uncertainty

The dashboard should increasingly feel like:
- a real operations command center
not:
- a pile of unrelated reports

---

## Practical Next-Step Reminder

Before starting a new pass, ask:

- Is this a truth-model task, a UI task, or a workflow task?
- Is this solving a root issue or polishing a symptom?
- Is this the right time to build the Assignment Editor?
- Am I keeping assigned placement and observed work separate?

If the answer is unclear, the pass needs to be narrowed before implementation.
