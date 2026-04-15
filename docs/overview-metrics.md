# Overview Metrics

## Purpose

Overview is a command-center summary, not an audit/debug page. It should answer what happened, where work landed, and how the current week compares to the previous week.

## Metrics

- Total Plates: total plate count included in the Overview window.
- Total Pieces: total piece count included in the Overview window.
- Receiving Share: share of included work counted as receiving.
- Replenishment Share: share of included work counted as replenishment.
- Area Distribution: included work grouped by mapped area.
- Trend vs Previous Week: current included totals compared with the previous week.

## Inclusion Rules

Receiving-only and replenishment-only users remain included.

Included Operators is unique by `userid` because `buildUserlsOverviewWeek` aggregates through `operatorsByUser`.

## Exclusions

Pick-only users are excluded from the day-shift Overview.

Sheet Detail should not imply role truth unless role is explicitly wired from a trustworthy source.

## Area Distribution

Area Distribution groups included plates and pieces by defined area mapping. It is for directional command-center context, not operator-level audit proof.

## Trend vs Previous Week

Trend vs Previous Week compares the current Overview week against the previous week using the same inclusion rules.

## Included Operators

Included Operators counts unique included `userid` values after Overview filtering.

## Extra fallback

Extra is the fallback for low-confidence or outside-defined work.
