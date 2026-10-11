/**
 * An opened file that is the same document as one already here (its envelope
 * id matches; storage connectors spec R7): "Replace my copy" or "Keep both",
 * never a silent duplicate.
 */
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "@mui/material";

export const REPLACE_MY_COPY_LABEL = "Replace my copy";
export const KEEP_BOTH_COPIES_LABEL = "Keep both";
export const SAME_DOCUMENT_TITLE = "You already have this document";

export interface ReplaceOrKeepDialogProps {
    open: boolean;
    /** The copy already here. */
    existingTitle: string;
    /** "practice plan" or "rankings". */
    noun: string;
    busy?: boolean;
    onReplace: () => void;
    onKeepBoth: () => void;
    onCancel: () => void;
}

export function ReplaceOrKeepDialog({ open, existingTitle, noun, busy = false, onReplace, onKeepBoth, onCancel }: ReplaceOrKeepDialogProps) {
    return (
        <Dialog open={open} onClose={busy ? undefined : onCancel} aria-labelledby="same-document-title" fullWidth maxWidth="sm">
            <DialogTitle id="same-document-title">{SAME_DOCUMENT_TITLE}</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    {`This file is the same ${noun} as "${existingTitle}" in this browser. Replace your copy with the file (yours is kept in Recovered copies for 30 days), or keep both as separate ${noun === "rankings" ? "rankings" : `${noun}s`}.`}
                </DialogContentText>
            </DialogContent>
            <DialogActions sx={{ flexWrap: "wrap", gap: 1, px: 3, pb: 2, "& > *": { minHeight: 44 } }}>
                <Button onClick={onCancel} disabled={busy}>
                    Cancel
                </Button>
                <Button variant="outlined" onClick={onKeepBoth} disabled={busy}>
                    {KEEP_BOTH_COPIES_LABEL}
                </Button>
                <Button variant="contained" onClick={onReplace} disabled={busy}>
                    {REPLACE_MY_COPY_LABEL}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
