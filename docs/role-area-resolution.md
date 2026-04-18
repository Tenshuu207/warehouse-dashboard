# Role and Area Resolution

## Purpose

This document defines the different role and area systems used in the warehouse dashboard, what question each one answers, and where each one should be used.

The project must not use different systems interchangeably without being explicit. Role and area drift is one of the main causes of misleading charts, oversized mixed buckets, and inconsistent operator labeling.

---

## Core Principle

The project uses different systems for different truths:

- assigned placement truth
- observed work truth
- role performance / handled-work truth

These are related, but they are not the same.

---

## Assigned Placement Systems

Assigned placement answers:

- Where is this employee supposed to count today?
- What role should this employee be judged against for standards?
- What role/area badge should display under their name?
- What should future Assignment Editor overrides replace?

Assigned placement should use the canonical assigned precedence model:

1. manual daily override
2. saved daily assignment / placement
3. observed inferred assignment
4. home/default assignment
5. unknown / other

Assigned placement is the right source for:
- Sheet assigned role/area
- operator assignment summary
- performance standards
- future assignment editing

Assigned placement is not the right source for observed-work role charts.

---

## Observed Work Systems

Observed work answers:

- Where did the work happen?
- What area handled the movement?
- What role bucket did the work belong to?
- Where did receiving flow?
- Where did extra help occur?

Observed work is the right source for:
- grouped area totals
- area pages
- receiving by destination
- extra help / outside help
- handled work by role
- contribution breakdowns

Observed work must remain separate from assigned placement.

---

## Area Systems

### Leaf Area Codes

These are the canonical leaf/storage areas:

- 1 = Dry
- 2 = Chicken/Iced Product
- 3 = Cooler
- 4 = Produce
- 5 = Dry PIR
- 6 = Freezer
- 7 = Freezer PIR

These should remain valid internally even when the UI groups them.

### Grouped Operational Areas

These are the main grouped display areas:

- Dry = 1 + 5
- Cooler = 2 + 3 + 4
- Freezer = 6 + 7
- Receiving remains its own top-level family when assignment/review context requires it

Grouped operational areas are useful for:
- top-level dashboard drilldowns
- grouped area totals
- summary comparisons
- assignment display at a higher level

Leaf areas should still be preserved when finer detail is needed.

---

## Role Families

### Receiving Role Family

Receiving is a first-class role family.

Canonical receiving roles:

- FrzRcv
- ClrRcv
- DryRcv
- MixRcv
- Receiving

Receiving should not be treated as a small sub-detail of replenishment.
It should remain visible as its own work type and its own role family.

### Freezer Role Family

Canonical freezer work-role buckets:

- FrzPut
- FrzLet
- FrzMix
- FrzPIR

### Dry Role Family

Canonical dry work-role buckets:

- DryFlr
- DryMix
- DryPIR

### Cooler Role Family

Canonical cooler work-role buckets:

- ClrMeat
- ClrDairy
- Produce

Important:
Produce remains part of the Cooler area group, but still stays distinct as a canonical work-role bucket where role-level work classification is needed.

---

## Unclassified

The project should prefer the label:

**Unclassified**

This is better than using Mixed or Other as a default resting place.

Unclassified means:
- the system could not confidently map the work into a canonical role bucket
- the result should be reviewable
- the result should not be normalized into a “good enough” label if the truth is unclear

Unclassified should:
- be visible when necessary
- be review-flagged
- be minimized over time through better role classification and manager assignment truth

Unclassified is not a desired steady-state category.

---

## What Different Fields Usually Mean

The project currently contains multiple role/area-related fields and layers.

These should be interpreted like this:

### Assigned / assignment-oriented fields
Examples:
- effectiveAssignedRole
- assignedRole
- rawAssignedRole
- effectiveAssignedArea
- assignedArea
- rawAssignedArea
- saved daily placement fields
- future manual daily overrides

These are assignment-oriented sources.
Use them for assigned placement truth.

### Observed / work-oriented fields
Examples:
- observedRole
- currentRole
- primaryReplenishmentRole
- effectivePerformanceArea
- rawDominantArea
- areaBuckets
- receivingMix
- destinationMix
- observed area mix

These are observed-work-oriented sources.
Use them for work classification and work-location truth.

### Pre-collapsed summary/group fields
Examples:
- roleGroups
- grouped summary labels
- pre-aggregated mixed buckets

These can be useful summary layers, but they are dangerous as canonical truth if they have already collapsed detail into Mixed/Unclassified-like categories.

They should not be trusted blindly for precise role-performance classification.

---

## What Should Drive What

### Assigned Display Role / Area

Should come from:
- manual daily override
- saved daily assignment
- inferred assignment
- home/default assignment

Should not come primarily from:
- observed role buckets
- mixed summary groups

### Observed Work Area

Should come from:
- areaBuckets
- observed area mix
- effectivePerformanceArea
- rawDominantArea
- receiving destination mix

Should not come primarily from:
- home/default assignment
- manager assignment unless the feature is specifically about assignment

### Role Performance / Handled Work by Role

Should come from:
- observed work role classification
- activity-specific work buckets
- receiving work when the chart/view is about handled work, not only replenishment

Should not come primarily from:
- assigned display role
- operator headcount by role
- pre-collapsed roleGroups if they already lost detail

---

## Receiving and Role Performance

If a view is intended to show **handled work by role**, receiving should be included as its own role family.

If a view is intended to show **replenishment-only role performance**, receiving should be excluded intentionally and labeled clearly.

This distinction must be explicit in charts/tables.

Do not silently mix replenishment-only role performance with handled-work role performance.

---

## Cooler Work Classification

Cooler work should not stop at the label “Cooler” if the view is supposed to show role-level work.

When role-level work is intended, the preferred role buckets are:

- ClrMeat
- ClrDairy
- Produce

If the system only knows that work belonged to Cooler but cannot confidently split those three, it should prefer:

- grouped Cooler area truth for area reporting
- Unclassified for role-level reporting if a specific cooler role cannot be trusted

Do not pretend the system knows the exact cooler subrole when it does not.

---

## Extra Help and Area Truth

Extra help belongs in the area where the work occurred.

For example:
- a Dry-assigned employee helping Freezer should contribute to Freezer totals as extra help
- the employee should still remain Dry-assigned in assignment-oriented views
- the freezer page can expand extra help to show the individual contributors

This keeps:
- assignment truth stable
- work truth honest
- area totals useful

---

## Review Direction

The system should flag unresolved role/area classification for review rather than quietly normalizing it into Mixed or Other.

Good future review targets:
- Unclassified role work
- unmapped assigned area
- receiving without a clean destination mapping
- cooler/freezer/dry work without a confident role bucket

The future Assignment Editor will help with assigned placement truth.
Observed-work classification still needs its own canonical path.

---

## Practical Summary

When implementing or debugging a feature, ask:

- Is this field telling me assigned placement or observed work?
- Am I trying to classify area, role, or handled work?
- Am I accidentally using a pre-collapsed summary layer as if it were raw truth?
- If this ends in Unclassified, should it be review-flagged instead of forced into a misleading label?
