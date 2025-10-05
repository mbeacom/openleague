import { Container, Typography, Box } from "@mui/material";

export default function EventsPage() {
  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Events
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Events management coming soon...
        </Typography>
      </Box>
    </Container>
  );
}
