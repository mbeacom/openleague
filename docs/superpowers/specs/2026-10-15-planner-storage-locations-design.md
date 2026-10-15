# Static planner: where saved files go

Date: 2026-10-15. Status: accepted by the owner; implemented on the `feat/planner-storage-locations` branch. Amends the
[storage connectors design](2026-10-07-static-storage-connectors-design.md),
which listed "folders and organisation inside the app" as out of scope.
Governed by ADR-0022 (still `proposed`); nothing here widens a permission.

## Problem

Every connector saves into a single flat folder:

- Google Drive: a tagged `OpenLeague` folder at the top of My Drive, with every
  practice and rankings file side by side.
- OneDrive: `Apps/OpenLeague/`, flat.
- Files on this computer: a save picker for every new file, with no memory of
  where the last one went, and no way to set the planner up from a folder on a
  new browser.

Coaches want to say where the files live, keep them organised, and get a fresh
browser back to where they were from those files.

## Decisions

1. **One layout everywhere: a subfolder per kind.** Inside whatever folder a
   connector saves to, practices go in `Practices/` and rankings in
   `Rankings/` (`storage/folders.ts`). A future drill document kind adds
   `Drills/`. Files already saved flat stay where they are and stay linked;
   only new files use the subfolders. Overwrites never move a file.
2. **Files on this computer: a planner folder.** "Choose folder…" opens the
   directory picker once; the directory handle is kept in IndexedDB (meta key
   `storageLocations`, no version bump). With a folder chosen:
   - "Save to…" writes straight into `<folder>/<Kind>/` with no picker. A name
     already taken gets ` (2)`, ` (3)`… before the document extension.
   - "Open from…" offers "From the planner folder…", a list of the folder's
     files. The connector lists only with a folder chosen, so its
     `capabilities.list` stays false; the screens ask `location()` instead.
   - Files in the folder get folder-scoped ids (`folder:<when chosen>:<Kind>/<name>`).
     Choosing another folder starts new ids, so an old link never resolves
     into a different folder; its stored handle still reaches the old file.
   - **Keep the folder up to date** (on by default): linked files in the planner
     folder that have edits are saved every 15 seconds and when the tab is
     hidden. Autosave runs only while the browser already
     grants access; it never prompts. A conflict is left for the coach (the
     storage bar shows it on the next check), never resolved automatically.
   - **Save everything to the folder** links every unlinked practice and the
     rankings into the folder, and saves linked ones that have edits.
   - **Restore from the folder** reads every document in the folder: one whose
     envelope id this browser already holds is linked to it if it is unlinked,
     and left alone otherwise; one it doesn't hold is added and linked.
     Unreadable files are counted and skipped, never fatal.
   - Without a folder, everything works as before (a save picker per file).
3. **Google Drive: choose the folder.** "Choose folder…" opens the Google
   Picker in folder mode. Under `drive.file`, picking a folder grants the app
   that folder, so it can create files in it; this is the documented pattern
   for choosing an upload destination and needs no broader scope. Without a
   choice the tagged `OpenLeague` folder is used, as before. The kind
   subfolders are created inside the chosen folder on first save and found by
   their own `olFolder` tag, so renaming them is harmless. If the chosen folder
   is trashed or no longer reachable, the save fails with "location-missing"
   and Saved files asks for another; it never falls back silently.
   Listing is unchanged: it finds files by their `olKind` tag wherever they are.
4. **OneDrive: subfolders inside the app folder only.**
   `Files.ReadWrite.AppFolder` reaches `Apps/OpenLeague/` and nothing else, so
   the location is fixed there; new files go to `Apps/OpenLeague/<Kind>/`.
   Listing reads the app folder and each kind's subfolder. Choosing another
   location would need `Files.ReadWrite` (phase 4b), which stays the owner's
   separate opt-in.

## Related

The [team directory design](2026-10-11-team-directory-import-design.md)
(proposed, not built) defines a "team folder" whose `*.directory.json`
manifest sits beside the rankings and plan files. With this layout the
manifest would go at the top of the chosen folder, with `Practices/` and
`Rankings/` under it, and that design's listing must read the subfolders.

## Not in scope

- A coach-defined path template (`{season}/{team}/…`).
- Moving existing files into the subfolders.
- Autosave for cloud connectors (each save is a network write and, on Drive,
  a check-then-write; the explicit Save stays).

## Checks

- Unit tests for each connector's placement, listing and name collisions; the
  restore and save-all routines; and the autosave runner's gating.
- Manual, once deployed (CI makes no provider calls):
  - Google: choose a folder with the Picker under `drive.file`, then save a
    practice; it should land in `<folder>/Practices/`.
  - OneDrive: save a practice and confirm `Practices/` is created in the app
    folder (Graph may create the parent on the path upload itself; the
    connector creates it after a 404 either way).
  - Chromium: choose a planner folder, reload, and confirm Save asks for the
    folder's permission once, autosave stays quiet until it is granted, and
    autosave then writes. Autosave checks the folder's permission, then saves
    through the file's handle rehydrated from IndexedDB; Chromium extends a
    folder grant to handles inside it, but the fakes can't prove that.
