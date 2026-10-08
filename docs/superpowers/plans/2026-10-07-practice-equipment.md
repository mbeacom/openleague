# Practice Equipment Implementation Plan

**Goal:** Each drill lists the equipment its diagram shows, with per-drill changes. The practice rolls the lists up (stations summed, blocks maxed) and adds its own items. The list shows in both planners' editors, the session page, the bench sheet, the HTML and Word exports, and the import preview.

**Spec:** `docs/superpowers/specs/2026-10-07-practice-equipment-design.md` (rulings R1–R9).

**Architecture:**
- Two pure modules hold the rules: `lib/utils/equipment-needs.ts` (the vocabulary, the override rules, the schemas, the labels and the save checks) and `lib/utils/practice-equipment.ts` (the rollup). They are split because `play-data.ts` imports the schema, and the rollup imports the session timeline, which would close an import cycle back to `play-data.ts`. The play-data schema, the plan document, the static store, the server actions and every view share them.
- Per-drill overrides live in `PlayData.equipmentNeeds`. That needs no migration and no new save field.
- Practice additions are a session-level `equipment` list: one hosted JSONB column (a hand-written migration), one optional static record field, one optional plan-document field.

## Global constraints

- `bun` only. Never run `prisma migrate dev`, `db:migrate` or `db:push`. The migration is hand-written, and `bun run db:generate` is the only Prisma command used.
- **Absent = unchanged, `[]` clears** for the session's `equipment` on hosted `updatePracticeSession` and static `updateSession`. A create without it stores `[]`.
- **Normalization.** An untouched drill saves byte-for-byte as before: `normalizeEquipmentNeeds` drops no-op entries and removes an empty `equipmentNeeds`.
- **Portability.** Portable code (`components/features/practice-planner/`, `lib/utils/`) imports no `next/*`, `lib/actions/*` or Prisma. On-screen components use palette tokens only. Every control is at least 44 px. `PracticeSessionEditor.tsx` stays at or under 900 lines.
- **Escaping.** HTML via the `html` template, Word via `textRuns`/`xmlSafe`.
- **Exact copy:**
  - drill editor: heading `Equipment`; empty text `No equipment yet. Place cones, nets or pucks on the diagram, or add an item.`; `Diagram shows N`; `Removed`; `Restore <label>`; `Remove <label>`; `Fewer <label>` / `More <label>`; `Add item`; field `Item`; field `Count`;
  - session editor: heading `Practice equipment`; switch `Show by drill`; sub-heading `Added for the practice`;
  - card line and bench sheet: `Equipment: Cones ×6 · Net ×1`;
  - bench sheet section: heading `Equipment`.
- Fictional data only in tests and docs.

## Tasks

1. **Pure modules (TDD).**
   - `__tests__/lib/utils/equipment-needs.test.ts`, then `lib/utils/equipment-needs.ts`:
     - `equipmentKindFor`, `derivedEquipmentCounts`, `drillEquipment`;
     - `normalizeEquipmentNeeds`, `readEquipmentNeeds`, `practiceEquipmentError`;
     - `equipmentLabel`, `equipmentLine`, `drillEquipmentText`;
     - the editor edits: `setEquipmentCount`, `removeEquipmentItem`, `restoreEquipmentKind`, `addEquipmentItem`.
   - `__tests__/lib/utils/practice-equipment.test.ts`, then `lib/utils/practice-equipment.ts`: `rollupEquipment`, `rollupLine`, the row adapters.

   Types go in `types/practice-planner.ts`: `EquipmentNeeds`, `PracticeEquipmentItem` and the limits.
2. **PlayData.** `playDataSchema` gains an optional `equipmentNeeds`. `upgradePlayData` drops a malformed one (as `dropInvalidArea` does). `sanitizePlayDataForWrite` normalizes it. Tests go in `play-data.test.ts`.
3. **Plan document and ADR.**
   - The session gets `equipment` (strict, "Equipment" issues). `serializePlan`, `PlanSessionInput`, `PlanEditorSession` and `planToEditorSession` carry it.
   - Tests: an old file, a round trip, issues, and older-reader stripping.
   - Add the ADR-0020 amendment.
4. **Static store.**
   - `StoredSession.equipment?` and `LocalSessionSave.equipment?`. `checkEquipment` runs on create, update, duplicate, import, the view and edit-load, and `assertExportable`.
   - `DB_VERSION` goes to 5.
   - Tests in `local-store.equipment.test.ts`.
5. **Hosted.**
   - `prisma/schema.prisma` and `prisma/migrations/20261007130000_practice_session_equipment/migration.sql`.
   - Zod: `practiceEquipmentSchema` on create and update.
   - `createPracticeSession`, `updatePracticeSession` (absent = unchanged), duplicate (`practice-session-drills.ts`), import, both queries, and both editor wrappers.
   - Tests extend the existing action suites.
6. **Bench sheet.**
   - `BenchSheetModel.equipment: string[]` and `BenchSheetDrillItem.equipment: string | null`.
   - The HTML and Word renderers.
   - The live `BenchSheet` and `BenchSheetDrill`.
   - `ExportSession.equipment?`, with the Export menu passing it to `serializePlan`.
7. **Components.**
   - `DrillEquipmentField` in `PlayEditor`: separate state, merged on save.
   - `useSessionEquipment` and `SessionEquipmentSection` in `PracticeSessionEditor`, with the payload carrying `equipment`.
   - The equipment line on `SessionDrillCard`.
   - `EquipmentRollupList` on `SessionDetailView` and in `PlanPreview`.
8. **Gates.** Run:
   - `bun run type-check`, `lint`, `test` and `build`;
   - `planner:build` and `planner:check`;
   - `check:raw-sql` and `adr:lint`.

   Then do the Playwright pass on `planner:dev` at 360 px and 1280 px, in light and dark.
