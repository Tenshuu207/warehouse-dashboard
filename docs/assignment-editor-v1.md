# Assignment Editor v1

## Purpose

Assignment Editor v1 is the fast manual daily assignment truth layer for the warehouse dashboard.

Its job is to let management quickly place employees into the correct role and area for a selected day, so the system stops guessing when the manager already knows the intended placement.

This is an assignment tool, not an observed-work rewrite tool.

Once a person is placed into a slot for a day, that placement becomes their assigned area and assigned role for that day.

Observed work remains separate.

---

## Why This Exists

The dashboard needs a clear distinction between:

- assigned placement truth
- observed work truth

The Assignment Editor exists to define assigned placement truth quickly and clearly.

This matters because:
- employees may help outside their home area
- observed work may not cleanly define where a person was supposed to count
- performance standards must follow assigned role, not observed slices
- management needs a quick correction layer for daily truth

---

## Where It Should Appear

Assignment Editor should be available from both selected-date operational views:

- Overview
- Sheet View

It should open in a side drawer / slide-over so it feels fast and operational, not like a separate admin page.

---

## Core Behavior

For a selected date, the Assignment Editor shows a board of role slots grouped by operational area.

Managers can:
- move people into the correct slot
- leave slots empty if staffing is short
- place multiple people into a slot if needed
- place extra help into flexible Extra slots
- move unresolved people out of Unassigned/Available into a proper placement
- save the day’s assignment truth

Once saved, that placement becomes the assigned role and assigned area for that day.

---

## Slot Layout

## Freezer
- FrzPut
- FrzLet
- FrzMix
- FrzPIR
- Extra

## Dry
- DryFlr
- DryMix
- DryPIR
- Extra

## Cooler
- Produce
- ClrMeat
- ClrDairy
- Extra

## Receiving
- FrzRcv
- ClrRcv
- DryRcv
- MixRcv
- Extra

---

## Slot Rules

### Default expectation
Each slot is conceptually a one-person role by default.

However:
- multiple people may be placed into the same slot when needed
- a slot may also be left empty when staffing is short

The system should not assume every slot must be filled.

### Multiple people
Multiple people in the same slot should be allowed without breaking the model.

This supports:
- training
- overlap
- coverage
- temporary support
- real-world staffing irregularity

### Short staffing
Empty slots are valid.
The editor must support days where a role simply is not staffed.

---

## Extra

Extra is a flexible placement bucket.

It exists for people who:
- are helping an area
- do not normally own a formal slot there
- need to be counted in that area for the day

Important:
- Extra can hold multiple people
- some days an area may effectively have multiple “extras”
- Extra is intentionally flexible rather than tightly constrained

Long term, Extra may become a shared role concept across areas for stats and visibility, but in v1 it is primarily a practical assignment bucket inside each area.

---

## Unassigned / Available

The editor includes an Unassigned / Available pool.

This is where people appear when they are not confidently placed into a role/area.

Managers can move people from Unassigned / Available into the correct slot.

Over time, using the editor should reduce review-needed situations because managers can resolve the truth directly.

---

## Prefill Order

When the board loads for a selected date, it should prefill placements in this order:

1. saved daily assignments
2. home/default assignments
3. inferred placement

This creates the best available starting board while still letting management correct anything that is wrong.

---

## Daily Placement Rule

Each person gets one daily placement in v1.

This means:
- one assigned area
- one assigned role slot
- one daily truth record

v1 does not support split-day assignments.

That is intentional.

Reason:
- it keeps the model simple
- it matches current operational needs
- it avoids inventing time splits that the system cannot validate

If split-day support is ever needed later, it should be designed as a later version, not added casually to v1.

---

## Truth and Precedence

Assignment Editor placements should become the top precedence for assigned placement truth.

Assigned placement precedence becomes:

1. manual daily override from Assignment Editor
2. saved daily assignment / placement
3. observed inferred assignment
4. home/default assignment
5. unknown / other

This precedence applies to assigned role/area context.

It does not replace observed work truth.

---

## What It Should Affect

Once a daily assignment is saved, it should become the assigned placement truth used by assignment-oriented views.

At minimum, it should eventually affect:
- Sheet assigned area
- small assigned role/area tag under operators
- operator assignment summary
- future standards/performance context
- future manager review workflows

It should not rewrite:
- raw work history
- area buckets
- receiving destination history
- observed work slices

---

## Interaction Model

v1 should prioritize speed and reliability over fancy drag-and-drop.

Preferred interaction:
- click-to-move
- quick slot picker
- dropdown or lightweight move action
- save all at once

The editor does not need drag-and-drop in v1.

Drag-and-drop can be a future enhancement if the click-based version proves too slow.

---

## Storage Model

v1 should store one daily placement per person.

Minimum fields:

- date
- userid
- employeeName optional snapshot
- areaGroup
- roleSlot
- source = manual_ui
- updatedAt
- optional notes

Conceptually:
- one user
- one day
- one assigned placement truth

This is a manager-controlled assignment record, not a raw-work event.

---

## Save / Load Expectations

### Load
The editor should load:
- selected date
- current saved daily placements
- fallback default/home placement data
- inferred placement when needed
- unassigned pool

### Save
The editor should save the full current board for the selected date in one action.

Expected UX:
- clear Save button
- clear unsaved changes indicator
- visible success confirmation after saving

---

## Relationship To Observed Work

The Assignment Editor does not redefine what work happened.

It defines where the employee was assigned.

That means:
- a Dry-assigned person can still help Freezer
- Freezer can still show that extra help occurred
- performance can still evaluate the person against their assigned role
- observed work remains visible as observed work

This separation is a core design rule.

---

## Relationship To Performance Standards

If employee hours are used for standards, performance should be evaluated against assigned role.

That makes Assignment Editor especially important.

Because once a manager places someone into a role for the day, that role becomes the correct performance context for that date.

Observed work can still describe support or extra help, but performance standards should follow assignment.

---

## v1 Goals

Assignment Editor v1 should deliver:

- fast daily placement correction
- one daily assignment truth per person
- clear operational slot layout
- support for empty slots
- support for multiple people in one slot
- flexible Extra handling
- Unassigned / Available cleanup
- top-precedence assigned placement truth

---

## Explicit Non-Goals For v1

Do not build these into v1:

- split-day assignments
- drag-and-drop as the only interaction
- complex historical audit UI
- advanced staffing optimization logic
- automatic correction of observed work
- rewriting raw data
- forcing every slot to be filled

---

## Future Direction

Future versions may add:
- richer Assignment Editor interactions
- date-range assignment presets
- notes/reason fields
- better review integration
- assignment change history
- staffing gap highlighting
- tighter standards/performance integration

But v1 should stay focused on fast daily assignment truth.

---

## Practical Summary

Assignment Editor v1 is the manager-controlled daily truth layer for assigned placement.

It should:
- open from operational views
- let management place people quickly
- allow short staffing
- allow multiple people per slot
- support flexible Extra placement
- use one daily placement per person
- become the top assigned-placement truth for that date

It should not attempt to replace observed work truth.
