"use client";

/**
 * A drill's video links as cards (practice video links spec R4, R10), on both
 * deployables. Each card shows a local provider icon, the coach's title (or a
 * provider fallback), the destination host, the start time and an Open link
 * to a new tab. Rendering makes no network request: no thumbnail, no embed,
 * nothing from a provider until the viewer follows a link.
 */
import type { ReactNode } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import {
    CloudOutlined as CloudIcon,
    LinkOutlined as LinkIcon,
    OndemandVideoOutlined as VideoIcon,
    OpenInNew as OpenInNewIcon,
} from "@mui/icons-material";
import { formatVideoStart, videoDisplayTitle, videoHost, videoOpenUrl, type VideoLink, type VideoProvider } from "@/lib/utils/video-links";

const PROVIDER_ICONS: Record<VideoProvider, typeof VideoIcon> = {
    youtube: VideoIcon,
    vimeo: VideoIcon,
    drive: CloudIcon,
    onedrive: CloudIcon,
    link: LinkIcon,
};

/** The Open link's accessible name: the title, and that it opens a new tab. */
export const openVideoLabel = (link: VideoLink) => `Open ${videoDisplayTitle(link)} (opens in a new tab)`;

export interface VideoLinkCardProps {
    link: VideoLink;
    /** Extra controls after Open (the editor's move and remove buttons). */
    actions?: ReactNode;
}

export function VideoLinkCard({ link, actions }: VideoLinkCardProps) {
    const Icon = PROVIDER_ICONS[link.provider];
    return (
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 1, minWidth: 0 }} flexWrap="wrap" useFlexGap>
            <Box
                aria-hidden
                sx={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                    bgcolor: "action.hover",
                    color: "secondary.main",
                }}
            >
                <Icon fontSize="small" />
            </Box>
            <Box sx={{ minWidth: 0, flex: "1 1 160px" }}>
                <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>
                    {videoDisplayTitle(link)}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
                    {videoHost(link)}
                    {link.startSec ? ` · from ${formatVideoStart(link.startSec)}` : ""}
                </Typography>
            </Box>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
                <Button
                    component="a"
                    href={videoOpenUrl(link)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={openVideoLabel(link)}
                    size="small"
                    variant="outlined"
                    endIcon={<OpenInNewIcon fontSize="small" />}
                    sx={{ minHeight: 44, minWidth: 44 }}
                >
                    Open
                </Button>
                {actions}
            </Stack>
        </Stack>
    );
}

export interface VideoLinkListProps {
    videos: readonly VideoLink[];
    /** The list's accessible name, e.g. "Videos for Breakout 5-man". */
    label: string;
}

/** The read-only list every view renders; nothing when there are no videos. */
export function VideoLinkList({ videos, label }: VideoLinkListProps) {
    if (videos.length === 0) return null;
    return (
        <Box component="ul" aria-label={label} sx={{ listStyle: "none", m: 0, p: 0 }}>
            {videos.map((link, index) => (
                <Box component="li" key={`${index}-${link.url}`} sx={{ borderBottom: 1, borderColor: "divider", "&:last-of-type": { borderBottom: 0 } }}>
                    <VideoLinkCard link={link} />
                </Box>
            ))}
        </Box>
    );
}
