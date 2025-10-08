import { Metadata } from 'next';
import { Typography, Box } from '@mui/material';

export const metadata: Metadata = {
  title: 'Contributing - OpenLeague Documentation',
  description: 'Learn how to contribute to the OpenLeague project.',
};

export default function ContributingPage() {
  return (
    <Box>
      <Typography variant="h1" component="h1" gutterBottom>
        Contributing to OpenLeague
      </Typography>
      <Typography variant="body1">
        Contributing guide coming soon...
      </Typography>
    </Box>
  );
}