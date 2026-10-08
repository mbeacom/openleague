"use client";

/**
 * "Export plan" (ADR-0020). Downloads the session as a portable plan file and,
 * when the platform offers one (PlannerPlatform.planLink), hands the plan off
 * through a #plan= link: hosted copies an "Open in planner" link, the static
 * planner opens the hosted import page. Built from the page's own session data:
 * no new server read.
 */

import { useState } from "react";
import { Alert, Button, ListItemIcon, ListItemText, Menu, MenuItem, Snackbar, type ButtonProps } from "@mui/material";
import {
    ArticleOutlined as WordIcon,
    FileDownloadOutlined as DownloadIcon,
    IosShareOutlined as ExportIcon,
    LinkOutlined as LinkIcon,
    OpenInNew as OpenIcon,
    WebOutlined as HtmlIcon,
} from "@mui/icons-material";
import { formatDateTimeLocalInput, resolveTimeZone, sessionStart } from "@/lib/utils/date";
import {
    LINK_TOO_LARGE_MESSAGE,
    MAX_PLAN_FILE_BYTES,
    PlanLinkTooLargeError,
    encodePlanLink,
    parsePlan,
    planFileName,
    serializePlan,
    type PlanDocument,
    type PlanGenerator,
    type PlanSessionInput,
    type SerializePlanOptions,
} from "@/lib/plan-document";
import { rosterHasNames } from "@/lib/utils/practice-roster";
import { RosterNamesToggle } from "./RosterNamesToggle";
import { usePlannerPlatform, usePlannerStore, type PlannerPlanLink } from "@/lib/planner-store";
import { drillRows, isBlockRow } from "@/lib/utils/session-rows";
import { staffNames } from "@/lib/utils/session-staff";
import type { SessionStaffMember } from "@/types/practice-planner";
import { downloadBlob } from "./export/download";
import { downloadDocumentFile } from "./export/download-document";
import { ENVELOPE_OVERHEAD_BYTES } from "@/lib/document-envelope";
import { DOCUMENT_FORMAT_INFO, DocumentEncodeError, type DocumentFormat } from "@/lib/document-formats";
import type { ExportSession, ExportSessionRow } from "./export/bench-sheet-model";
import { ExportModuleLoadError, exportBenchSheet, type BenchSheetFormat } from "./export/export-bench-sheet";
import { resolveExportLogo } from "./export/export-logo";

/** A session's rows as plan rows: each row's staff ids become names from the session's list (spec R6). */
export function toPlanRows(rows: readonly ExportSessionRow[], staff?: readonly SessionStaffMember[]): PlanSessionInput["drills"] {
    return rows.map((row) =>
        isBlockRow(row)
            ? {
                  kind: row.kind,
                  sequence: row.sequence,
                  duration: row.duration,
                  runsWithPrevious: false,
                  instructions: row.instructions,
                  label: row.label,
                  staff: staffNames(row.staff, staff),
              }
            : {
                  sequence: row.sequence,
                  duration: row.duration,
                  runsWithPrevious: row.runsWithPrevious,
                  instructions: row.instructions,
                  name: row.play.name,
                  description: row.play.description,
                  focus: row.play.focus,
                  goalies: row.play.goalies,
                  ageGroups: row.play.ageGroups,
                  stays: row.stays,
                  rotateEveryMinutes: row.rotateEveryMinutes,
                  playData: row.play.playData,
                  staff: staffNames(row.staff, staff),
              },
    );
}

/** What the session page passes (a PracticeSessionView fits). Team and venue names feed the bench sheet exports. */
export type ExportableSession = ExportSession;

/** Local date and start come from sessionStart in the venue's zone when booked, else the viewer's. */
export function buildPlanDocument(
    session: ExportableSession,
    now: Date = new Date(),
    generator: PlanGenerator = "openleague-hosted",
    /** Names and numbers in the roster (roster spec R10): only a downloaded file, only when the coach asked. */
    options: SerializePlanOptions = {},
): PlanDocument {
    const local = formatDateTimeLocalInput(sessionStart(session), resolveTimeZone(session.venueTimezone));
    const [date, startTime] = local ? local.split("T") : [null, null];
    return serializePlan(
        {
            title: session.title,
            durationMinutes: session.duration,
            date: date ?? null,
            startTime: startTime ?? null,
            goaliesAttending: session.goaliesAttending ?? null,
            transitionMinutes: session.transitionMinutes ?? 0,
            staff: session.staff?.map((member) => member.name),
            equipment: session.equipment,
            roster: session.roster ?? null,
            drills: toPlanRows(session.plays, session.staff),
        },
        generator,
        now,
        options,
    );
}

export function unreadableDiagramNotice(count: number): string | null {
    if (count === 0) return null;
    return count === 1
        ? "1 drill had an unreadable diagram and was exported blank."
        : `${count} drills had unreadable diagrams and were exported blank.`;
}

export const FILE_TOO_LARGE_TO_IMPORT_NOTICE = `This file is too large to import (over ${MAX_PLAN_FILE_BYTES / 1000} KB).`;

/**
 * A hosted session can exceed what a plan file may hold (more than
 * MAX_PLAN_DRILLS drills, or more than MAX_PLAN_FILE_BYTES). This says why it
 * won't import as-is, naming the first problem. `text` is the exact JSON being
 * handed over, measured as the importer measures it: by size first, then schema.
 */
export function importProblemNotice(doc: PlanDocument, text: string = JSON.stringify(doc)): string | null {
    if (new TextEncoder().encode(text).byteLength > MAX_PLAN_FILE_BYTES) return FILE_TOO_LARGE_TO_IMPORT_NOTICE;
    const result = parsePlan(JSON.parse(text));
    if (result.ok) return null;
    return `This file can't be imported as-is: ${result.error.issues?.[0] ?? result.error.message}`;
}

/**
 * The text the importer measures against MAX_PLAN_FILE_BYTES for a file in
 * `format`: a JSON file as written (pretty-printed), any other format once
 * decoded, as compact JSON.
 */
export function importMeasuredText(doc: PlanDocument, format: DocumentFormat, prettyJson: string = JSON.stringify(doc, null, 2)): string {
    return format === "json" ? prettyJson : JSON.stringify(doc);
}

/** The "Download plan file as …" formats; JSON is the plain "Download plan file". */
export const ALTERNATE_FILE_FORMATS = ["yaml", "toml", "jsonc"] as const satisfies readonly DocumentFormat[];
export const FORMAT_EXPORT_FAILED_NOTICE = "Couldn't create the file. Check your connection and try again, or download the plan file (JSON).";

/** A file in `format` the importers would refuse unread (they hold every format to the JSON size limit). */
export function formatTooLargeNotice(text: string, format: DocumentFormat): string[] {
    return new TextEncoder().encode(text).byteLength > MAX_PLAN_FILE_BYTES + ENVELOPE_OVERHEAD_BYTES
        ? [`This ${DOCUMENT_FORMAT_INFO[format].label} file is too large to open again. Download the plan file (JSON) instead.`]
        : [];
}

type Notice = { severity: "success" | "info" | "warning" | "error"; text: string };

interface ExportPlanMenuProps {
    session: ExportableSession;
    size?: ButtonProps["size"];
}

export const LINK_COPIED_NOTICE = "Link copied. Paste it to open this plan in the planner.";
export const OPENED_IN_HOSTED_NOTICE = "Opened OpenLeague in a new tab. Sign in there to save this plan to a team.";
export const PREPARING_HTML_NOTICE = "Preparing the bench sheet…";
export const PREPARING_DOCX_NOTICE = "Preparing the Word document…";
export const DOCX_LOAD_FAILED_NOTICE =
    "Couldn't load the Word export. Check your connection and try again, or download the bench sheet (HTML).";
export const EXPORT_FAILED_NOTICE = "Couldn't create the file. Try again, or use Print bench sheet.";

export function ExportPlanMenu({ session, size = "medium" }: ExportPlanMenuProps) {
    const { planGenerator, planLink, navigate } = usePlannerPlatform();
    const store = usePlannerStore();
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [exporting, setExporting] = useState<BenchSheetFormat | null>(null);
    // Roster names leave only in downloaded files, only when checked (roster spec R10).
    const [includeNames, setIncludeNames] = useState(false);
    const offerNames = rosterHasNames(session.roster);
    const namesOption = { includeRosterNames: offerNames && includeNames };
    const unreadable = unreadableDiagramNotice(drillRows(session.plays).filter((sp) => sp.play.playData === null).length);

    const download = (format: DocumentFormat = "json") => {
        setAnchor(null);
        const doc = buildPlanDocument(session, new Date(), planGenerator, namesOption);
        const text = JSON.stringify(doc, null, 2);
        const warnings = [unreadable, importProblemNotice(doc, importMeasuredText(doc, format, text))].filter((text): text is string => text !== null);
        const warn = (extra: string[] = []) => {
            const all = [...warnings, ...extra];
            setNotice(all.length > 0 ? { severity: "warning", text: all.join(" ") } : null);
        };
        if (format === "json") {
            downloadBlob(new Blob([text], { type: "application/json" }), planFileName(session.title));
            warn();
            return;
        }
        // YAML, TOML and JSONC carry the same document; their library loads on click.
        downloadDocumentFile(doc, planFileName(session.title), format).then(
            (written) => warn(formatTooLargeNotice(written, format)),
            (error: unknown) => {
                console.error("Plan file export failed:", error);
                setNotice({ severity: "error", text: error instanceof DocumentEncodeError ? error.message : FORMAT_EXPORT_FAILED_NOTICE });
            },
        );
    };

    const exportSheet = async (format: BenchSheetFormat) => {
        setAnchor(null);
        if (exporting) return;
        setExporting(format);
        const preparing: Notice = { severity: "info", text: format === "html" ? PREPARING_HTML_NOTICE : PREPARING_DOCX_NOTICE };
        setNotice(preparing);
        try {
            // The team's logo, else its Crest (practice logo spec R5); never fails the export.
            const logo = await resolveExportLogo(session, store.getPracticeLogoImage);
            await exportBenchSheet(session, format, { logo, ...namesOption });
            // Clear only our own notice: another action may have replaced it meanwhile.
            setNotice((current) => (current === preparing ? null : current));
        } catch (error) {
            console.error("Bench sheet export failed:", error);
            setNotice({ severity: "error", text: error instanceof ExportModuleLoadError ? DOCX_LOAD_FAILED_NOTICE : EXPORT_FAILED_NOTICE });
        } finally {
            setExporting(null);
        }
    };

    const handOff = async (link: PlannerPlanLink) => {
        setAnchor(null);
        // Never names: a link is the most forwardable form (roster spec R10).
        const doc = buildPlanDocument(session, new Date(), planGenerator);
        // A link the import page would refuse is worse than none: warn instead.
        const problem = importProblemNotice(doc);
        if (problem) {
            setNotice({ severity: "warning", text: problem });
            return;
        }
        // "open" must open its tab inside the click, before any await, or popup blockers refuse it.
        const tab = link.mode === "open" ? window.open("", "_blank") : null;
        if (tab) tab.opener = null;
        try {
            const url = `${link.baseUrl.split("#")[0]}#plan=${await encodePlanLink(doc)}`;
            if (link.mode === "copy") {
                await navigator.clipboard.writeText(url);
            } else if (tab) {
                tab.location.replace(url);
            } else {
                // The browser blocked the new tab: go in this one.
                navigate(url);
                return;
            }
            const done = link.mode === "copy" ? LINK_COPIED_NOTICE : OPENED_IN_HOSTED_NOTICE;
            setNotice(unreadable ? { severity: "warning", text: unreadable } : { severity: "success", text: done });
        } catch (error) {
            tab?.close();
            setNotice(
                error instanceof PlanLinkTooLargeError
                    ? { severity: "info", text: LINK_TOO_LARGE_MESSAGE }
                    : {
                          severity: "error",
                          text:
                              link.mode === "copy"
                                  ? "Couldn't copy the link. Download the file instead."
                                  : "Couldn't open OpenLeague. Download the file instead.",
                      },
            );
        }
    };

    return (
        <>
            <Button
                variant="outlined"
                startIcon={<ExportIcon />}
                size={size}
                aria-haspopup="menu"
                aria-controls={anchor ? "export-plan-menu" : undefined}
                aria-expanded={anchor ? "true" : undefined}
                onClick={(event) => setAnchor(event.currentTarget)}
            >
                Export plan
            </Button>
            <Menu id="export-plan-menu" anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
                {offerNames && <RosterNamesToggle checked={includeNames} onChange={setIncludeNames} />}
                <MenuItem onClick={() => download()}>
                    <ListItemIcon>
                        <DownloadIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Download plan file</ListItemText>
                </MenuItem>
                {ALTERNATE_FILE_FORMATS.map((format) => (
                    <MenuItem key={format} onClick={() => download(format)}>
                        <ListItemIcon>
                            <DownloadIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText>{`Download plan file as ${DOCUMENT_FORMAT_INFO[format].label}`}</ListItemText>
                    </MenuItem>
                ))}
                <MenuItem onClick={() => void exportSheet("html")} disabled={exporting !== null}>
                    <ListItemIcon>
                        <HtmlIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Download bench sheet (HTML)</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => void exportSheet("docx")} disabled={exporting !== null}>
                    <ListItemIcon>
                        <WordIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Download Word document (.docx)</ListItemText>
                </MenuItem>
                {planLink && (
                    <MenuItem onClick={() => void handOff(planLink)}>
                        <ListItemIcon>
                            {planLink.mode === "open" ? <OpenIcon fontSize="small" /> : <LinkIcon fontSize="small" />}
                        </ListItemIcon>
                        <ListItemText>{planLink.label}</ListItemText>
                    </MenuItem>
                )}
            </Menu>
            {notice && (
                <Snackbar
                    open
                    // While an export runs its "Preparing…" notice stays up: no timer, and no
                    // close path (click-away, Escape, or the close button) until it finishes.
                    autoHideDuration={exporting ? null : 6000}
                    onClose={() => {
                        if (exporting) return;
                        setNotice(null);
                    }}
                    anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                >
                    <Alert
                        severity={notice.severity}
                        variant="filled"
                        onClose={exporting ? undefined : () => setNotice(null)}
                    >
                        {notice.text}
                    </Alert>
                </Snackbar>
            )}
        </>
    );
}
