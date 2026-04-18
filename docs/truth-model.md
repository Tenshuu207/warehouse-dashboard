# Truth Model

## Purpose

This document defines the core truth systems used by the warehouse dashboard.

The goal is to keep operational meaning consistent across views, charts, performance standards, and future editing tools. Different truths answer different questions. They must not be collapsed into one another.

---

## The Three Main Truth Layers

### 1. Raw Data Truth

Raw source data is the base truth.

It should be preserved as faithfully as possible because it can later be:
- transformed
- merged
- compared
- linked
- reinterpreted through better derived models

Raw data should not be casually overwritten just because a higher-level derived model is more convenient for a given screen.

---

### 2. Assigned Placement Truth

Assigned placement describes where an employee was expected to count for a given day or time period.

This is a management truth.

Examples:
- assigned area
- assigned role
- assigned section
- future date-ranged assignment rules
- daily manager overrides

Assigned placement is the truth used for:
- assigned area/role display
- assignment-oriented summaries
- future assignment editing
- standards and performance evaluation

Assigned placement should eventually support:
- daily overrides
- date-range presets
- manual manager correction

Assigned placement is not the same thing as observed work.

---

### 3. Observed Work Truth

Observed work describes what work was actually done.

Examples:
- where work happened
- what area handled the movement
- what role bucket the work belongs to
- what product destination receiving flowed into
- where extra help occurred
- where outside help occurred

Observed work is the truth used for:
- area totals
- grouped area drilldowns
- receiving by destination
- outside help / extra help
- handled work by role or area
- area contribution breakdowns

Observed work should not automatically redefine assigned placement.

---

## Receiving Is A First-Class Work Type

Receiving is not a minor sub-detail of replenishment.

Receiving is its own work type and should be treated as such throughout the project.

That means:
- receiving can be tracked independently
- receiving can be charted independently
- receiving can be grouped by destination area
- receiving can contribute to area-level workload visibility
- receiving may later gain deeper tracking than current replenishment logic

Any model that treats receiving as only a side-note of replenishment is incomplete.

---

## Performance Evaluation Truth

If employee hours are added to performance standards, performance must be based on assigned role.

This is a core rule.

Reason:
employees often split work across multiple areas or tasks during a day, but the system usually cannot reliably split their time across those observed work slices.

So:
- observed work can describe what they touched
- observed work can explain where help occurred
- observed work can enrich area totals

But:
- performance standards
- direct employee evaluation
- historical comparison against standards

must be based on assigned role.

This gives a more stable and fair comparison over time.

---

## Assigned Role vs Observed Work

These are different questions.

### Assigned role asks:
- What was this employee supposed to be doing?
- Which standard should they be judged against?
- What role should their performance count under?

### Observed work asks:
- What work actually happened?
- What area or role bucket handled the work?
- Who helped where?
- Where did receiving flow?

The dashboard must be able to show both truths without confusing one for the other.

---

## Extra Help / Outside Help

Extra help belongs inside the area where the help happened.

Example:
if someone whose home assignment is Dry helps in Freezer, that contribution should appear inside Freezer area totals as extra help.

Important rules:
- the employee still keeps their home assignment
- the freezer page should not reinterpret them as permanently freezer-assigned
- the dry page should not need to say “they also helped freezer” just to preserve freezer truth
- the freezer area should be able to show that extra help occurred
- extra help should be expandable to show which individuals contributed and how much

So area truth should include:
- assigned contributors where appropriate
- extra help contributors where appropriate
- contribution breakdowns by individual when expanded

This keeps area totals honest without rewriting assignment truth.

---

## Canonical Precedence For Assigned Placement

When resolving assigned display role/area or assignment-oriented context, use this precedence:

1. manual daily override
2. saved daily assignment / placement
3. observed inferred assignment
4. home/default assignment
5. unknown / other

This precedence is for assigned placement only.

It should not be used as the main truth source for observed work reporting.

---

## Canonical Use Cases

### Use Assigned Placement For
- assigned area labels
- assigned role labels
- performance standards
- employee ranking within role
- hours-based evaluation
- future Assignment Editor overrides

### Use Observed Work For
- area totals
- grouped area drilldowns
- receiving by destination
- extra help / outside help
- handled work by role
- contribution breakdowns

### Use Raw Data For
- reconciliation
- rebuilding better models later
- audits
- comparing derived logic
- root-cause investigation when models drift

---

## What Must Stay Consistent Across The Project

If two screens are answering the same operational question, they must use the same truth layer and precedence model.

Examples:
- assigned role on Sheet and assigned role on Operator page should not come from different logic
- area totals and area breakdowns should not mix assignment truth and work truth carelessly
- performance charts should not silently flip between assigned-role logic and observed-role logic

The same truth should use the same system everywhere.

---

## Long-Term Direction

The long-term direction is:

1. preserve raw data truth
2. stabilize canonical assigned placement resolution
3. stabilize canonical observed work classification
4. build role/area performance buckets from the correct truth layer
5. add Assignment Editor for manager-controlled daily assignment truth
6. expand the system into night shift and later delivery without collapsing all operational models into one

---

## Practical Summary

When building a feature, always ask:

- Is this raw data truth?
- Is this assigned placement truth?
- Is this observed work truth?
- Is this performance evaluation truth?

If the answer is unclear, the feature is not ready to implement cleanly yet.
