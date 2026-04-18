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
  - ClrPrdc
  - ClrMeat
  - ClrDairy
- Freezer floor source roles FrzLet and FrzPut remain raw/source distinctions.
- Summary handled-work display rolls FrzLet and FrzPut into FrzFlr.
- Area detail keeps freezer observed roles split as FrzPut, FrzLet, FrzMix, and FrzPIR.
- Produce displays as ClrPrdc in canonical handled-work views.
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
- week-first, using Sunday as the default week start
- able to show daily trend visibility inside the selected week
- shaped as Weekly Overview, with Daily Overview as a day-scoped sibling path

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

## Current Implementation Note

Summary handled-work by role now consumes canonical observed-work role buckets exposed by the UserLS team-groups path.

Those buckets are not assigned placement truth and should not be used for hours-based performance evaluation.
They include Receiving as a first-class bucket and support FrzFlr, FrzMix, FrzPIR, DryFlr, DryMix, DryPIR, ClrPrdc, ClrMeat, and ClrDairy.
FrzLet and FrzPut remain available as source diagnostics but roll into FrzFlr for display.
Unresolved handled work should remain Unclassified for review.

Grouped Area Share and Grouped Area Totals now share the same Summary basis, controlled by:
- work family: Replenishment, Receiving, or Total Handled
- value mode: Plates, Pieces, or Both

Overview/Summary now treats the selected date as a Sunday-based week context and shows daily trends for replenishment plates, replenishment pieces, receiving plates, and receiving pieces.
Trend day links open a day-scoped operational stats view that preserves the selected week context.
Both value mode keeps plates and pieces together inside each section instead of duplicating views.

Area detail remains more granular than Summary and should preserve useful source role distinctions for drilldown.

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
