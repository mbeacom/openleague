"use client";

/**
 * "Export plan" (ADR-0020): downloads the session as a portable plan file and,
 * when NEXT_PUBLIC_STATIC_PLANNER_URL is set, copies an "Open in planner" link
 * carrying the plan in its #plan= fragment. Built from the page's own session
 * data: no new server read.
 */

import { useState } from "react";
import { Alert, Button, ListItemIcon, ListItemText, Menu, MenuItem, Snackbar, type ButtonProps } from "@mui/material";
import {
    FileDownloadOutlined as DownloadIcon,
    IosShareOutlined as ExportIcon,
    LinkOutlined as LinkIcon,
} from "@mui/icons-material";
import type { PlayData } from "@/types/practice-planner";
import { formatDateTimeLocalInput, resolveTimeZone, sessionStart } from "@/lib/utils/date";
import {
    LINK_TOO_LARGE_MESSAGE,
    PlanLinkTooLargeError,
    encodePlanLink,
    parsePlan,
    planFileName,
    serializePlan,
    type PlanDocument,
} from "@/lib/plan-document";

export interface ExportableSession {
    title: string;
    date: string;
    duration: number;
    startAt?: string | null;
    venueTimezone?: string | null;
    plays: Array<{
        sequence: number;
        duration: number;
        instructions: string | null;
        runsWithPrevious: boolean;
        play: { name: string; description: string | null; playData: PlayData | null };
    }>;
}

/** Local date and start come from sessionStart in the venue's zone when booked, else the viewer's. */
export function buildPlanDocument(session: ExportableSession, now: Date = new Date()): PlanDocument {
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
        "openleague-hosted",
        now,
    );
}

export function unreadableDiagramNotice(count: number): string | null {
    if (count === 0) return null;
    return count === 1
        ? "1 drill had an unreadable diagram and was exported blank."
        : `${count} drills had unreadable diagrams and were exported blank.`;
}

/**
 * A hosted session can exceed what a plan file may hold (more than
 * MAX_PLAN_DRILLS drills, say). The file still downloads; this says why it
 * won't import as-is, naming the first problem.
 */
export function importProblemNotice(doc: PlanDocument): string | null {
    const result = parsePlan(JSON.parse(JSON.stringify(doc)));
    if (result.ok) return null;
    return `This file can't be imported as-is: ${result.error.issues?.[0] ?? result.error.message}`;
}

type Notice = { severity: "success" | "info" | "warning" | "error"; text: string };

interface ExportPlanMenuProps {
    session: ExportableSession;
    size?: ButtonProps["size"];
}

export function ExportPlanMenu({ session, size = "medium" }: ExportPlanMenuProps) {
    const plannerUrl = process.env.NEXT_PUBLIC_STATIC_PLANNER_URL?.trim();
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [notice, setNotice] = useState<Notice | null>(null);
    const unreadable = unreadableDiagramNotice(session.plays.filter((sp) => sp.play.playData === null).length);

    const download = () => {
        setAnchor(null);
        const doc = buildPlanDocument(session);
        const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = planFileName(session.title);
        document.body.appendChild(link);
        link.click();
        link.remove();
        // Safari and Firefox can cut the download short if the URL is revoked right away.
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        const warnings = [unreadable, importProblemNotice(doc)].filter((text): text is string => text !== null);
        setNotice(warnings.length > 0 ? { severity: "warning", text: warnings.join(" ") } : null);
    };

    const copyLink = async () => {
        setAnchor(null);
        if (!plannerUrl) return;
        try {
            const encoded = await encodePlanLink(buildPlanDocument(session));
            await navigator.clipboard.writeText(`${plannerUrl.split("#")[0]}#plan=${encoded}`);
            setNotice(
                unreadable
                    ? { severity: "warning", text: unreadable }
                    : { severity: "success", text: "Link copied. Paste it to open this plan in the planner." },
            );
        } catch (error) {
            setNotice(
                error instanceof PlanLinkTooLargeError
                    ? { severity: "info", text: LINK_TOO_LARGE_MESSAGE }
                    : { severity: "error", text: "Couldn't copy the link. Download the file instead." },
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
                {plannerUrl && (
                    <MenuItem onClick={() => void copyLink()}>
                        <ListItemIcon>
                            <LinkIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText>Copy “Open in planner” link</ListItemText>
                    </MenuItem>
                )}
            </Menu>
            {notice && (
                <Snackbar
                    open
                    autoHideDuration={6000}
                    onClose={() => setNotice(null)}
                    anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                >
                    <Alert severity={notice.severity} variant="filled" onClose={() => setNotice(null)}>
                        {notice.text}
                    </Alert>
                </Snackbar>
            )}
        </>
    );
}
