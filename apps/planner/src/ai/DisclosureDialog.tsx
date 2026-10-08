/** The disclosure shown before the first request to a provider (ADR-0023, spec R9). Wording in disclosure.ts. */
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Link, Typography } from "@mui/material";
import { AI_DISCLOSURE_ACCEPT, AI_DISCLOSURE_TITLE, disclosureText } from "./disclosure";
import type { ProviderPreset } from "./presets";

export function DisclosureDialog({ open, preset, onAccept, onCancel }: { open: boolean; preset: ProviderPreset; onAccept: () => void; onCancel: () => void }) {
    return (
        <Dialog open={open} onClose={onCancel} aria-labelledby="ai-disclosure-title" maxWidth="sm" fullWidth>
            <DialogTitle id="ai-disclosure-title">{AI_DISCLOSURE_TITLE}</DialogTitle>
            <DialogContent>
                {disclosureText(preset.destination).map((paragraph) => (
                    <Typography key={paragraph} sx={{ mb: 1.5 }}>
                        {paragraph}
                    </Typography>
                ))}
                {preset.links.length > 0 && (
                    <Typography variant="body2" color="text.secondary">
                        {preset.links.map((link, index) => (
                            <span key={link.href}>
                                {index > 0 && " · "}
                                <Link href={link.href} target="_blank" rel="noopener noreferrer" underline="always">
                                    {link.label}
                                </Link>
                            </span>
                        ))}
                    </Typography>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onCancel} sx={{ minHeight: 44 }}>
                    Cancel
                </Button>
                <Button variant="contained" onClick={onAccept} sx={{ minHeight: 44 }}>
                    {AI_DISCLOSURE_ACCEPT}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
