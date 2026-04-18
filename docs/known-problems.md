# Known Problems

## Purpose

This document tracks active unresolved problems in the project.

It should be used for:
- recurring issues
- logic drift
- unresolved classification problems
- known weak spots that future passes should treat carefully

This is a working-state issue list, not a bug tracker replacement.

---

## Active Problem Areas

## 1. Role truth drift across views

The project still has multiple role systems in play, including:
- assigned display role
- observed role labels
- grouped role buckets
- summary role systems
- fallback unclassified behavior

This causes the same operator/date/work to appear differently depending on the page.

### Why it matters
- charts can become misleading
- Mixed/Unclassified can inflate
- assignment-focused views and work-focused views can drift apart

### Current direction
- keep assigned placement separate from observed work
- stop using one page-specific fallback chain for each screen
- move toward one shared canonical resolver for assignment display
- build role/handled-work charts from the correct observed-work bucket source

---

## 2. Canonical observed-work role bucket review is still active

Summary uses the canonical observed-work display taxonomy:
- Receiving
- FrzFlr
- FrzMix
- FrzPIR
- DryFlr
- DryMix
- DryPIR
- ClrPrdc
- ClrMeat
- ClrDairy
- Unclassified

FrzLet and FrzPut remain source/raw distinctions but roll into FrzFlr for handled-work display.
Produce displays as ClrPrdc.

Area detail remains more granular:
- Freezer keeps FrzPut, FrzLet, FrzMix, and FrzPIR split
- Dry keeps DryFlr, DryMix, and DryPIR split
- Cooler uses ClrPrdc, ClrMeat, and ClrDairy

### Remaining symptoms
- too much work can still land under Unclassified
- cooler work without a source-supported ClrPrdc, ClrMeat, or ClrDairy split must stay Unclassified
- receiving without a destination area bucket can still need review

### Current direction
- treat this as an upstream truth-model issue, not only a chart issue
- avoid pretending the client can fully reconstruct role truth from collapsed labels
- Summary handled-work by role has a dedicated UserLS observed-work bucket payload and source diagnostics, but remaining Unclassified rows still need review and better upstream classification over time

---

## 3. Assignment Editor does not exist yet

The project has a clear Assignment Editor v1 direction, but not the built feature yet.

### Why it matters
Without a fast daily assignment truth layer, the system still has to infer too much.

### Current direction
Build Assignment Editor after truth-layer stabilization, not before.

---

## 4. Unclassified still needs a better review loop

Unclassified is the preferred unresolved label, but the project still needs a stronger workflow for:
- surfacing it
- reviewing it
- reducing it over time
- linking it back to manager-controlled assignment truth when appropriate

### Desired direction
Unclassified should mean:
- unresolved
- review-needed
- not silently normalized

---

## 5. Summary view can still become misleading if charts use the wrong metric

Summary is useful only if the chart is answering the right question.

### Known risk examples
- role chart using headcount when the user wants handled work
- area chart showing replenishment while the user expects receiving
- receiving shown on an unreadable scale or collapsed away

### Current direction
- chart titles must clearly state the metric
- use pies/donuts for composition only
- use bars for exact comparisons
- remove weak charts rather than keep misleading ones
- role handled-work charts should consume canonical observed-work buckets directly, not assigned-role fields or pre-collapsed `roleGroups`
- Summary sections should use the same selected basis while keeping selectors orthogonal:
  - work family: Replenishment, Receiving, or Total Handled
  - value mode: Plates, Pieces, or Both
- Both value mode should not create duplicate chart sections; plates and pieces should appear together inside the same section.

---

## 6. Comparison support is still intentionally shallow

Weekly Summary now exposes daily trend and day drilldown context, but broader comparisons are still not fully built.

### Desired direction
- week vs previous week
- selected day vs same day last week

### Current direction
Do not build a broad comparison backend until the weekly and day-scoped data paths can support it cleanly without mixing truth layers or inventing missing history.

---

## 7. Shift models are still only partially separated

The project is still centered on day-shift replenishment logic.

### Why it matters
Night shift, selecting, and delivery will have different performance models.
Some stats may overlap, but performance logic should not be forced into one path too early.

### Current direction
- keep day-shift logic strong first
- allow visibility of cross-model stats
- keep evaluation tied to the assigned model/role

---

## 8. Client-side fixes can hide deeper backend issues

Some issues can be improved in the client, but not truly solved there.

### Common warning sign
If the client is trying to reconstruct truth from:
- Mixed
- Other
- collapsed roleGroups
- vague team labels

then the actual fix probably belongs upstream.

### Current direction
- audit before patching blindly
- prefer identifying the real source of collapse
- avoid repeatedly fixing symptoms in different views

---

## Current Watch List

These are the current things to watch closely during testing:

- Assigned Area showing Other when it should resolve cleanly
- Unclassified role buckets growing too large
- receiving disappearing from handled-work views where it should appear
- grouped area totals failing to reconcile to week totals
- Summary charts answering the wrong operational question
- page-specific logic reappearing for shared concepts

---

## Practical Rule

If a future pass runs into:
- Mixed
- Other
- Unclassified
- missing receiving allocation
- cooler/freezer role confusion

do not assume it is just a display problem.

First ask:
- is this assigned placement truth?
- is this observed work truth?
- is this a pre-collapsed summary layer?
- is the client trying to reconstruct something that should exist upstream?
