# Historical role alignment (2025)

You are working in the warehouse-dashboard repo on branch `historical-role-alignment-standards`.

Goal:
Build phase 1 only: a yearly 2025 historical operator role/area alignment pipeline based on imported UserLS data. Do not build standards yet.

Project grounding:
- Replenishment role assignment must be based on UserLS replenishment activity, not receiving and not pick.
- Use the same core concepts already present in the project:
  - `primaryReplenishmentRole`
  - `primaryReplenishmentRoleShare`
  - `primaryReplenishmentAreaCode`
  - `primaryActivityAreaCode`
  - role buckets
  - area buckets
- Current relevant files already inspected:
  - `ingest/scripts/db_sqlite.py`
  - `ingest/scripts/build_userls_daily_summary.py`
  - `ingest/scripts/merge_userls_into_daily.py`
  - `frontend/lib/server/userls-history.ts`
  - `frontend/lib/server/userls-role-inference.ts`

Deliverables:
1. Add SQLite persistence for yearly historical role alignment.
2. Add a Python script to build 2025 historical operator alignment from imported/historical UserLS data.
3. Add a frontend server helper to read alignment rows.
4. Add an API route to list alignment rows for a selected year.
5. Add a read-only review page under options for historical role alignment.

Required output model:
Create one row per operator per year with fields close to:
- year
- userid
- name
- primaryRole
- primaryRoleShare
- primaryArea
- primaryAreaShare
- primaryActivityArea
- yearlyReplPlates
- yearlyReplPieces
- yearlyReceivingPlates
- yearlyReceivingPieces
- yearlyPickPlates
- yearlyPickPieces
- activeDays
- activeWeeks
- roleConfidence
- areaConfidence
- reviewFlag
- roleMixJson
- areaMixJson
- sourceSummaryJson
- updatedAt

Persistence:
- Add a new table in `ingest/scripts/db_sqlite.py`
- Primary key should be `(year, userid)`

Builder script:
- Create `ingest/scripts/build_historical_role_alignment.py`
- Support `--year 2025`
- Prefer reading from SQLite or the existing imported historical UserLS source already used by this repo
- Reuse existing role/area concepts where practical instead of inventing a parallel system
- Do not depend on daily dashboard UI files

Role/area assignment rules:
- Primary role should be based on yearly `replenishmentNoRecvPlates` share by role
- Primary area should be based on yearly `replenishmentNoRecvPlates` share by area
- Receiving must stay separate
- Pick must stay separate

Confidence rules:
- roleConfidence = high if share >= 0.70, medium if >= 0.55, else low
- areaConfidence = high if share >= 0.65, medium if >= 0.50, else low

Review flag:
Set `reviewFlag = true` when any of:
- primary role share < 0.55
- primary area share < 0.50
- yearly replenishment plates < 500
- active weeks < 8
- missing primary role
- missing primary area

Frontend/server work:
- Create `frontend/lib/server/historical-role-alignment.ts`
- Create `frontend/app/api/historical-role-alignment/route.ts`
- Create `frontend/app/options/historical-role-alignment/page.tsx`

Review page:
- Read-only first pass
- Show columns:
  - Operator
  - UserID
  - Primary Role
  - Role Share
  - Primary Area
  - Area Share
  - Repl Plates
  - Repl Pieces
  - Receiving Plates
  - Pick Plates
  - Active Weeks
  - Role Confidence
  - Area Confidence
  - Review Flag
- Default sort:
  1. reviewFlag desc
  2. role share asc
  3. replenishment plates desc

Constraints:
- Do not build standards in this task
- Do not add overrides yet
- Do not refactor unrelated pages
- Keep changes minimal and aligned to existing project style
- Reuse existing helper patterns where possible

What to do before editing:
1. Inspect the existing DB and UserLS helper files again.
2. Find the best historical UserLS source in the current repo.
3. Explain briefly which source you chose and why.
4. Then implement the feature.

What to return:
- Summary of files changed
- Any assumptions made
- Exact commands to run:
  - Python builder
  - frontend dev check
  - any smoke-test curl or API checks
