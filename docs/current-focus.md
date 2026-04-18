cd ~/homelab-stacks/warehouse-dashboard || exit 1

mkdir -p docs

cat > docs/current-focus.md <<'EOF'
# Current Focus

## Purpose

This document tracks what the project is actively focused on right now.

It should stay short, practical, and easy to update.
This is the best place to record:
- current implementation priority
- current stable assumptions
- immediate next steps
- active blockers

This is a working-state document, not a permanent architecture doc.

---

## Current Phase

The project is currently focused on stabilizing the **day-shift replenishment dashboard** as a trustworthy operational system.

The active goal is to make:
- Overview
- Sheet View
- Summary View
- grouped area drilldowns
- operator drilldowns

all use the correct truth layers and remain internally consistent.

---

## Current Priority Order

### 1. Truth-model stability
Before more UI polish or new features, the project must keep these clean:

- assigned placement truth
- observed work truth
- handled work / role performance truth
- performance evaluation truth

### 2. Shared resolution logic
Views should stop using ad hoc role/area logic.
The same concept should resolve the same way everywhere.

### 3. Trustworthy area and role reporting
Grouped areas, role buckets, receiving by destination, and extra help/outside help should remain operationally honest and internally consistent.

### 4. Assignment Editor readiness
The project should move toward Assignment Editor v1, but only after the current truth layers are stable enough that the editor feeds the right system.

---

## Current Stable Decisions

These should be treated as settled unless intentionally revisited:

- Raw data is paramount.
- Assigned placement and observed work are separate truths.
- Receiving is a first-class work type.
- Performance standards tied to employee hours must use assigned role/area, not observed slices.
- Grouped top-level operational areas are:
  - Dry
  - Cooler
  - Freezer
- Cooler work-role buckets remain:
  - ClrMeat
  - ClrDairy
  - Produce
- Unresolved role work should prefer **Unclassified**, not Mixed/Other as a casual default.

---

## Current Product Direction

### Sheet View
Should remain:
- operational
- table-first
- exact-number focused
- assignment-aware
- drilldown friendly

### Summary View
Should remain:
- chart-first
- comparison-focused
- visually different from Sheet View
- honest about the metric being shown

### Area Views
Should show:
- grouped area totals
- assigned employees
- receiving by destination
- observed role / outside-help context where appropriate

---

## Immediate Next Work

### Near-term likely priorities
1. stabilize role/area truth alignment across views
2. reduce remaining Unclassified/Mixed role drift
3. make Summary role/handled-work logic trustworthy
4. prepare Assignment Editor v1
5. continue careful Overview / Summary polish only when the underlying logic is trustworthy

---

## Active Guardrails

Do not casually:
- replace assigned placement truth with observed work truth
- evaluate standards using observed slices
- widen UI passes into backend/server changes without intent
- let totals drift from reconciliation rules
- rely on pre-collapsed summary labels as canonical truth

---

## Current Question To Ask Before Any New Pass

Before starting work, ask:

- Is this a truth-model task, a UI task, or a workflow task?
- Is this solving a root problem or a symptom?
- Is this assigned placement truth or observed work truth?
- Is now the right time to build the Assignment Editor, or does truth resolution need more cleanup first?
EOF
