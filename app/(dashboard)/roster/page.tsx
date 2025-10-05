import { Container, Typography, Box } from "@mui/material";

export default function RosterPage() {
  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Roster
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Roster management coming soon...
        </Typography>
      </Box>
    </Container>
  );
}
