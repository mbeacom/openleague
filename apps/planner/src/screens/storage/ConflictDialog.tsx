/**
 * The conflict dialog (storage connectors spec, Sync and conflicts): from a
 * failed save, or a check that found the file moved. "Conflict" when this
 * device has unsaved edits; "Overwritten" when its own last save was replaced.
 * Both sides' "last saved" time, and who saved theirs where the storage says.
 */
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import type { RemoteFile } from "../../storage/connector";
import type { Resolution } from "../../storage/sync";
import { savedAtText } from "./messages";

export const KEEP_MINE_LABEL = "Keep mine";
export const USE_THEIRS_LABEL = "Use theirs";
export const KEEP_BOTH_LABEL = "Keep both";
export const CONFLICT_TITLE = "This file changed while you were editing";
export const OVERWRITTEN_TITLE = "Your save was replaced";

export interface ConflictDialogProps {
    open: boolean;
    kind: "conflict" | "overwritten";
    /** The linked file as just seen. */
    remote: RemoteFile;
    /** When this device last saved or read the file (the link's lastSyncedAt). */
    mineAt: string | null;
    busy: boolean;
    onChoose: (resolution: Resolution) => void;
    onClose: () => void;
}

function who(remote: RemoteFile): string {
    return remote.modifiedBy ? remote.modifiedBy : "another app or device";
}

export function ConflictDialog({ open, kind, remote, mineAt, busy, onChoose, onClose }: ConflictDialogProps) {
    const theirsAt = savedAtText(remote.modifiedAt);
    return (
        <Dialog open={open} onClose={busy ? undefined : onClose} aria-labelledby="conflict-title" fullWidth maxWidth="sm">
            <DialogTitle id="conflict-title">{kind === "conflict" ? CONFLICT_TITLE : OVERWRITTEN_TITLE}</DialogTitle>
            <DialogContent>
                <Stack spacing={1.5}>
                    <Typography>
                        {kind === "conflict"
                            ? `You have changes that aren't in ${remote.name}, and ${who(remote)} saved a newer version at ${theirsAt}.`
                            : `Your save from ${savedAtText(mineAt)} was replaced by ${who(remote)} at ${theirsAt}.`}
                    </Typography>
                    <Typography component="dl" variant="body2" color="text.secondary" sx={{ m: 0, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 2, rowGap: 0.5, "& dd": { m: 0 } }}>
                        <dt>Yours, last saved</dt>
                        <dd>{savedAtText(mineAt)}</dd>
                        <dt>Theirs, last saved</dt>
                        <dd>{remote.modifiedBy ? `${theirsAt} by ${remote.modifiedBy}` : theirsAt}</dd>
                    </Typography>
                    <Typography variant="body2" color="text.secondary" component="ul" sx={{ m: 0, pl: 2.5 }}>
                        <li>{`${KEEP_MINE_LABEL}: your version replaces theirs in ${remote.name}. Theirs stays in the storage's history where it keeps one.`}</li>
                        <li>{`${USE_THEIRS_LABEL}: their version replaces yours here. Yours is kept in Recovered copies for 30 days.`}</li>
                        <li>{`${KEEP_BOTH_LABEL}: yours is saved as a new file, "(my copy)"; theirs stays as it is.`}</li>
                    </Typography>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ flexWrap: "wrap", gap: 1, px: 3, pb: 2, "& > *": { minHeight: 44 } }}>
                <Button onClick={onClose} disabled={busy}>
                    Not now
                </Button>
                <Button variant="outlined" onClick={() => onChoose("keep-both")} disabled={busy}>
                    {KEEP_BOTH_LABEL}
                </Button>
                <Button variant="outlined" onClick={() => onChoose("use-theirs")} disabled={busy}>
                    {USE_THEIRS_LABEL}
                </Button>
                <Button variant="contained" onClick={() => onChoose("keep-mine")} disabled={busy}>
                    {KEEP_MINE_LABEL}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
