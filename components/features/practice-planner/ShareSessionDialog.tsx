"use client";

/**
 * Share confirmation for a practice session (Requirements: 3.1).
 * Extracted from PracticeSessionEditor.
 */

import {
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
} from "@mui/material";
import { Share as ShareIcon } from "@mui/icons-material";

export interface ShareSessionDialogProps {
    open: boolean;
    isShared: boolean;
    isSharing: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export function ShareSessionDialog({ open, isShared, isSharing, onClose, onConfirm }: ShareSessionDialogProps) {
    return (
        <Dialog
            open={open}
            onClose={onClose}
            aria-labelledby="share-dialog-title"
            aria-describedby="share-dialog-description"
        >
            <DialogTitle id="share-dialog-title">
                Share Practice Session?
            </DialogTitle>
            <DialogContent>
                <DialogContentText id="share-dialog-description">
                    This will share the practice session with all team members. They
                    will receive an email notification with a link to view the
                    session.
                    {isShared && (
                        <>
                            <br />
                            <br />
                            <strong>
                                Note: This session is already shared. Sharing again will
                                send update notifications to team members.
                            </strong>
                        </>
                    )}
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={isSharing}>
                    Cancel
                </Button>
                <Button
                    onClick={onConfirm}
                    color="primary"
                    variant="contained"
                    disabled={isSharing}
                    startIcon={
                        isSharing ? (
                            <CircularProgress size={20} color="inherit" />
                        ) : (
                            <ShareIcon />
                        )
                    }
                >
                    {isSharing ? "Sharing..." : "Share"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
