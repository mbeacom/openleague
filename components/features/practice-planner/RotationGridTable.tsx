"use client";

/**
 * Who is where in a rotating station block (spec R4, R9, R10): a Start column
 * plus one column per station, each cell a group (A, B, C…) or "all" for a
 * stays station. The screen variant is a compact MUI table; the print variant
 * is a plain table for the bench sheet (app/(print)/print.css, .bench-rotation).
 * Rows are keyed by round, never by their start text, which can repeat (the
 * clock shows "—" for every round until it mounts).
 */
import { Box, Table, TableBody, TableCell, TableHead, TableRow } from "@mui/material";
import { ROTATION_ALL, type RotationTable } from "@/lib/utils/session-timeline";

export function RotationGridTable({ table, caption, variant = "screen" }: { table: RotationTable; caption: string; variant?: "screen" | "print" }) {
    if (variant === "print") {
        return (
            <div className="bench-rotation">
                <table aria-label={caption}>
                    <thead>
                        <tr>
                            <th scope="col">Start</th>
                            {table.columns.map((column, index) => (
                                <th scope="col" key={index}>{column}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {table.rows.map((row, round) => (
                            <tr key={round}>
                                <td>{row.start}</td>
                                {row.cells.map((cell, index) => (
                                    <td key={index}>{cell}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }
    return (
        // Long station names hyphenate (or, failing that, wrap anywhere) so the grid fits a phone; the box scrolls only as a last resort.
        <Box sx={{ mt: 1, overflowX: "auto" }}>
            <Table size="small" aria-label={caption} sx={{ "& td, & th": { textAlign: "center", px: { xs: 0.5, sm: 1 } }, "& th": { hyphens: "auto", overflowWrap: "anywhere" } }}>
                <TableHead>
                    <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Start</TableCell>
                        {table.columns.map((column, index) => (
                            <TableCell key={index} sx={{ fontWeight: 700 }}>
                                {column}
                            </TableCell>
                        ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {table.rows.map((row, round) => (
                        <TableRow key={round}>
                            <TableCell sx={{ whiteSpace: "nowrap", fontFamily: "var(--font-mono), monospace" }}>{row.start}</TableCell>
                            {row.cells.map((cell, index) => (
                                <TableCell key={index} sx={cell === ROTATION_ALL ? { color: "text.secondary" } : { fontWeight: 800, color: "secondary.main" }}>
                                    {cell}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </Box>
    );
}
