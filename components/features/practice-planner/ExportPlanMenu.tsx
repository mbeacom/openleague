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
} from "@/lib/plan-document";
import { usePlannerPlatform, type PlannerPlanLink } from "@/lib/planner-store";
import { downloadBlob } from "./export/download";
import type { ExportSession } from "./export/bench-sheet-model";
import { ExportModuleLoadError, exportBenchSheet, type BenchSheetFormat } from "./export/export-bench-sheet";

/** What the session page passes (a PracticeSessionView fits). Team and venue names feed the bench sheet exports. */
export type ExportableSession = ExportSession;

/** Local date and start come from sessionStart in the venue's zone when booked, else the viewer's. */
export function buildPlanDocument(
    session: ExportableSession,
    now: Date = new Date(),
    generator: PlanGenerator = "openleague-hosted",
): PlanDocument {
    const local = formatDateTimeLocalInput(sessionStart(session), resolveTimeZone(session.venueTimezone));
    const [date, startTime] = local ? local.split("T") : [null, null];
    return serializePlan(
        {
            title: session.title,
            durationMinutes: session.duration,
            date: date ?? null,
            startTime: startTime ?? null,
            drills: session.plays.map((sp) => ({
                sequence: sp.sequence,
                duration: sp.duration,
                runsWithPrevious: sp.runsWithPrevious,
                instructions: sp.instructions,
                name: sp.play.name,
                description: sp.play.description,
                playData: sp.play.playData,
            })),
        },
        generator,
        now,
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
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [exporting, setExporting] = useState<BenchSheetFormat | null>(null);
    const unreadable = unreadableDiagramNotice(session.plays.filter((sp) => sp.play.playData === null).length);

    const download = () => {
        setAnchor(null);
        const doc = buildPlanDocument(session, new Date(), planGenerator);
        const text = JSON.stringify(doc, null, 2);
        downloadBlob(new Blob([text], { type: "application/json" }), planFileName(session.title));
        const warnings = [unreadable, importProblemNotice(doc, text)].filter((text): text is string => text !== null);
        setNotice(warnings.length > 0 ? { severity: "warning", text: warnings.join(" ") } : null);
    };

    const exportSheet = async (format: BenchSheetFormat) => {
        setAnchor(null);
        if (exporting) return;
        setExporting(format);
        const preparing: Notice = { severity: "info", text: format === "html" ? PREPARING_HTML_NOTICE : PREPARING_DOCX_NOTICE };
        setNotice(preparing);
        try {
            // The static planner's team is the placeholder "This device", not a name.
            await exportBenchSheet(session, format, { omitTeam: planGenerator === "openleague-static" });
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
                <MenuItem onClick={download}>
                    <ListItemIcon>
                        <DownloadIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Download plan file</ListItemText>
                </MenuItem>
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
