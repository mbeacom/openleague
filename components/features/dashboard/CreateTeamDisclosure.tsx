"use client";

import { useState } from "react";
import { Box, Button, Collapse } from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";
import CreateTeamForm from "@/components/features/team/CreateTeamForm";

type CreateTeamDisclosureProps = {
  label: string;
};

/**
 * Collapses CreateTeamForm behind an outlined toggle button so the
 * dashboard doesn't render a permanently expanded form.
 */
export default function CreateTeamDisclosure({ label }: CreateTeamDisclosureProps) {
  const [open, setOpen] = useState(false);

  return (
    <Box>
      <Button
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        {label}
      </Button>
      <Collapse in={open}>
        <Box sx={{ mt: 2 }}>
          <CreateTeamForm title={null} />
        </Box>
      </Collapse>
    </Box>
  );
}
