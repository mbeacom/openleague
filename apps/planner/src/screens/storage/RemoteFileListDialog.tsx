/**
 * "Open from…" for a connector with no picker of its own (OneDrive's app
 * folder, spec R6): the files it lists, newest first, to choose one.
 */
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItemButton, ListItemText, Typography } from "@mui/material";
import type { RemoteFile } from "../../storage/connector";
import { savedAtText } from "./messages";

export interface RemoteFileListDialogProps {
    open: boolean;
    /** "OneDrive". */
    where: string;
    files: RemoteFile[];
    onChoose: (file: RemoteFile) => void;
    onCancel: () => void;
}

export function RemoteFileListDialog({ open, where, files, onChoose, onCancel }: RemoteFileListDialogProps) {
    const sorted = [...files].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt) || a.name.localeCompare(b.name));
    return (
        <Dialog open={open} onClose={onCancel} fullWidth maxWidth="sm" aria-labelledby="remote-file-list-title">
            <DialogTitle id="remote-file-list-title">{`Open from ${where}`}</DialogTitle>
            <DialogContent dividers>
                {sorted.length === 0 ? (
                    <Typography color="text.secondary">{`Nothing to open yet. Files you save to ${where} from the planner appear here.`}</Typography>
                ) : (
                    <List disablePadding>
                        {sorted.map((file) => (
                            <ListItemButton key={file.fileId} onClick={() => onChoose(file)} sx={{ minHeight: 44 }}>
                                <ListItemText
                                    primary={file.name}
                                    secondary={`Last saved ${savedAtText(file.modifiedAt)}${file.modifiedBy ? ` by ${file.modifiedBy}` : ""}`}
                                    slotProps={{ primary: { sx: { wordBreak: "break-word" } } }}
                                />
                            </ListItemButton>
                        ))}
                    </List>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onCancel} sx={{ minHeight: 44 }}>
                    Cancel
                </Button>
            </DialogActions>
        </Dialog>
    );
}
