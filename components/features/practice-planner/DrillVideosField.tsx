"use client";

/**
 * The drill editor's Videos field (practice video links spec R1, R8, R10):
 * paste a link, give it an optional title and start time, and keep up to 5,
 * in order. The link is parsed on blur and on Add with the same parser every
 * write path runs, so what the field accepts is what saves. The preview is
 * the shared card, so editing makes no request to a provider either.
 */
import { useId, useState } from "react";
import { Box, Button, Chip, IconButton, Stack, TextField, Typography } from "@mui/material";
import {
    ArrowDownward as MoveDownIcon,
    ArrowUpward as MoveUpIcon,
    DeleteOutline as RemoveIcon,
    EditOutlined as EditIcon,
} from "@mui/icons-material";
import {
    MAX_DRILL_VIDEOS,
    VIDEO_GUIDANCE_TEXT,
    VIDEO_PROVIDER_NAMES,
    VIDEO_TITLE_LENGTH_MESSAGE,
    VIDEO_TITLE_MAX,
    cleanVideoTitle,
    drillVideoLimitMessage,
    formatVideoStart,
    parseVideoStartInput,
    parseVideoUrl,
    videoDisplayTitle,
    type VideoLink,
} from "@/lib/utils/video-links";
import { VideoLinkCard } from "./VideoLinkList";

export const DRILL_VIDEOS_HEADING = "Videos";

export interface DrillVideosFieldProps {
    videos: readonly VideoLink[];
    onChange: (videos: VideoLink[]) => void;
    disabled?: boolean;
}

type Errors = { url?: string; title?: string; start?: string };

export function DrillVideosField({ videos, onChange, disabled = false }: DrillVideosFieldProps) {
    const headingId = useId();
    const [url, setUrl] = useState("");
    const [title, setTitle] = useState("");
    const [start, setStart] = useState("");
    const [errors, setErrors] = useState<Errors>({});
    const [preview, setPreview] = useState<VideoLink | null>(null);
    const [editing, setEditing] = useState<number | null>(null);

    const atLimit = editing === null && videos.length >= MAX_DRILL_VIDEOS;

    const reset = () => {
        setUrl("");
        setTitle("");
        setStart("");
        setErrors({});
        setPreview(null);
        setEditing(null);
    };

    const checkUrl = () => {
        if (!url.trim()) {
            setPreview(null);
            setErrors((e) => ({ ...e, url: undefined }));
            return;
        }
        const parsed = parseVideoUrl(url);
        setPreview(parsed.ok ? parsed.link : null);
        setErrors((e) => ({ ...e, url: parsed.ok ? undefined : parsed.message }));
    };

    const submit = () => {
        const parsed = parseVideoUrl(url);
        const startResult = parseVideoStartInput(start);
        const cleanTitle = cleanVideoTitle(title);
        const next: Errors = {
            url: parsed.ok ? undefined : parsed.message,
            start: startResult.ok ? undefined : startResult.message,
            title: cleanTitle.length > VIDEO_TITLE_MAX ? VIDEO_TITLE_LENGTH_MESSAGE : undefined,
        };
        setErrors(next);
        setPreview(parsed.ok ? parsed.link : null);
        if (!parsed.ok || !startResult.ok || next.title) return;

        const link: VideoLink = { url: parsed.link.url, provider: parsed.link.provider };
        // A typed start wins over the link's own t=; only YouTube and Vimeo can start part way.
        const startSec = start.trim() ? startResult.value : parsed.link.startSec;
        if (startSec && (link.provider === "youtube" || link.provider === "vimeo")) link.startSec = startSec;
        if (cleanTitle) link.title = cleanTitle;

        if (editing !== null) {
            onChange(videos.map((v, i) => (i === editing ? link : v)));
        } else {
            onChange([...videos, link]);
        }
        reset();
    };

    const move = (index: number, by: -1 | 1) => {
        const next = [...videos];
        [next[index], next[index + by]] = [next[index + by], next[index]];
        onChange(next);
    };

    const startEditing = (index: number) => {
        const link = videos[index];
        setEditing(index);
        setUrl(link.url);
        setTitle(link.title ?? "");
        setStart(link.startSec ? formatVideoStart(link.startSec) : "");
        setErrors({});
        setPreview(link);
    };

    return (
        <Box component="section" aria-labelledby={headingId}>
            <Stack spacing={1.5}>
                <Typography id={headingId} variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
                    {DRILL_VIDEOS_HEADING}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    {VIDEO_GUIDANCE_TEXT}
                </Typography>

                {videos.length > 0 && (
                    <Box component="ul" aria-label="Drill videos" sx={{ listStyle: "none", m: 0, p: 0 }}>
                        {videos.map((link, index) => {
                            const name = videoDisplayTitle(link);
                            return (
                                <Box
                                    component="li"
                                    key={`${index}-${link.url}`}
                                    sx={{ borderBottom: 1, borderColor: "divider", "&:last-of-type": { borderBottom: 0 } }}
                                >
                                    <VideoLinkCard
                                        link={link}
                                        actions={
                                            <>
                                                <IconButton
                                                    aria-label={`Edit ${name}`}
                                                    onClick={() => startEditing(index)}
                                                    disabled={disabled}
                                                    sx={{ width: 44, height: 44 }}
                                                >
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                                <IconButton
                                                    aria-label={`Move ${name} up`}
                                                    onClick={() => move(index, -1)}
                                                    disabled={disabled || index === 0}
                                                    sx={{ width: 44, height: 44 }}
                                                >
                                                    <MoveUpIcon fontSize="small" />
                                                </IconButton>
                                                <IconButton
                                                    aria-label={`Move ${name} down`}
                                                    onClick={() => move(index, 1)}
                                                    disabled={disabled || index === videos.length - 1}
                                                    sx={{ width: 44, height: 44 }}
                                                >
                                                    <MoveDownIcon fontSize="small" />
                                                </IconButton>
                                                <IconButton
                                                    aria-label={`Remove ${name}`}
                                                    onClick={() => {
                                                        if (editing !== null) reset();
                                                        onChange(videos.filter((_, i) => i !== index));
                                                    }}
                                                    disabled={disabled}
                                                    sx={{ width: 44, height: 44 }}
                                                >
                                                    <RemoveIcon fontSize="small" />
                                                </IconButton>
                                            </>
                                        }
                                    />
                                </Box>
                            );
                        })}
                    </Box>
                )}

                <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "flex-start" }}>
                    <TextField
                        label="Video link"
                        value={url}
                        onChange={(e) => {
                            setUrl(e.target.value);
                            if (errors.url) setErrors((x) => ({ ...x, url: undefined }));
                        }}
                        onBlur={checkUrl}
                        type="url"
                        inputMode="url"
                        placeholder="https://"
                        error={Boolean(errors.url)}
                        helperText={errors.url ?? " "}
                        disabled={disabled || atLimit}
                        sx={{ flex: 2, minWidth: 0 }}
                        slotProps={{ htmlInput: { maxLength: 2000 } }}
                    />
                    <TextField
                        label="Title (optional)"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        error={Boolean(errors.title)}
                        helperText={errors.title ?? " "}
                        disabled={disabled || atLimit}
                        sx={{ flex: 1.5, minWidth: 0 }}
                        slotProps={{ htmlInput: { maxLength: VIDEO_TITLE_MAX } }}
                    />
                    <TextField
                        label="Start (m:ss, optional)"
                        value={start}
                        onChange={(e) => setStart(e.target.value)}
                        error={Boolean(errors.start)}
                        helperText={errors.start ?? " "}
                        disabled={disabled || atLimit}
                        sx={{ flex: 1, minWidth: 0 }}
                        slotProps={{ htmlInput: { inputMode: "numeric" } }}
                    />
                </Stack>

                {/* The recognized provider and stored address, announced politely as the link is checked. */}
                <Box aria-live="polite" role="status">
                    {preview && !errors.url && (
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                            <Chip size="small" color="secondary" variant="outlined" label={VIDEO_PROVIDER_NAMES[preview.provider]} />
                            <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
                                {preview.url}
                            </Typography>
                        </Stack>
                    )}
                </Box>

                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Button variant="outlined" onClick={submit} disabled={disabled || atLimit || !url.trim()} sx={{ minHeight: 44 }}>
                        {editing !== null ? "Save video" : "Add video"}
                    </Button>
                    {editing !== null && (
                        <Button variant="text" onClick={reset} disabled={disabled} sx={{ minHeight: 44 }}>
                            Cancel editing
                        </Button>
                    )}
                    {atLimit && (
                        <Typography variant="body2" color="text.secondary">
                            {drillVideoLimitMessage()}
                        </Typography>
                    )}
                </Stack>
            </Stack>
        </Box>
    );
}
