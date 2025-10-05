import { Container, Typography, Box } from "@mui/material";

export default function CalendarPage() {
  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Calendar
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Calendar view coming soon...
        </Typography>
      </Box>
    </Container>
  );
}
