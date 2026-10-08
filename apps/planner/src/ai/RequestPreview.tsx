/**
 * The preview of one request (ADR-0023, spec R9): the system prompt and the
 * exact user text, after name replacement, with each replacement highlighted,
 * a character count and a rough size. Model text is never rendered as HTML.
 */
import { Alert, Box, Paper, Stack, Typography } from "@mui/material";
import type { AiRequest, Redaction } from "@/lib/ai";
import { requestSize } from "@/lib/ai";
import { REQUEST_WARNING_THRESHOLD } from "./key-holder";

const BOX_SX = {
    p: 1.5,
    maxHeight: 280,
    overflow: "auto",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: "0.8125rem",
    bgcolor: "action.hover",
} as const;

const number = (value: number) => value.toLocaleString("en-US");

export function RequestPreview({
    request,
    redaction,
    destination,
    model,
    requestsSoFar,
}: {
    request: AiRequest;
    redaction: Redaction;
    destination: string;
    model: string;
    requestsSoFar: number;
}) {
    const size = requestSize(request);
    const prefix = request.input.slice(0, request.input.length - redaction.text.length);
    return (
        <Stack spacing={1.5} data-testid="ai-request-preview">
            <Typography>
                This is the request that is sent to <strong>{destination}</strong> (model <strong>{model}</strong>) when you press Send. Nothing is sent before that.
            </Typography>
            <Typography variant="body2" color="text.secondary">
                About {number(size.wordsIn)} words in, up to {number(size.maxWordsOut)} out · {number(request.system.length + request.input.length)} characters
            </Typography>
            {requestsSoFar >= REQUEST_WARNING_THRESHOLD && (
                <Alert severity="warning">
                    This tab has sent {requestsSoFar} requests. Each one counts toward your provider account&apos;s usage.
                </Alert>
            )}
            <Box>
                <Typography variant="overline" component="h3">
                    Instructions to the model
                </Typography>
                <Paper variant="outlined" tabIndex={0} aria-label="Instructions to the model" sx={BOX_SX}>
                    {request.system}
                </Paper>
            </Box>
            <Box>
                <Typography variant="overline" component="h3">
                    Your notes, as sent
                </Typography>
                <Paper variant="outlined" tabIndex={0} aria-label="Your notes, as sent" data-testid="ai-preview-input" sx={BOX_SX}>
                    {prefix}
                    {redaction.segments.map((segment, index) =>
                        segment.placeholder ? (
                            <Box
                                component="mark"
                                key={index}
                                title={`Replaces a name you listed`}
                                sx={{ bgcolor: "secondary.main", color: "secondary.contrastText", px: 0.5, borderRadius: 0.5 }}
                            >
                                {segment.text}
                            </Box>
                        ) : (
                            <span key={index}>{segment.text}</span>
                        ),
                    )}
                </Paper>
            </Box>
            {redaction.replacements.length > 0 ? (
                <Typography variant="body2" color="text.secondary">
                    Replaced before sending, and put back in the draft:{" "}
                    {redaction.replacements.map((r) => `${r.original} → ${r.placeholder}`).join(", ")}. Only the names you listed are replaced.
                </Typography>
            ) : (
                <Typography variant="body2" color="text.secondary">
                    No names are replaced. Only names you list are replaced; nothing is found automatically.
                </Typography>
            )}
        </Stack>
    );
}
