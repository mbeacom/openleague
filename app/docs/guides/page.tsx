import { Metadata } from 'next';
import { Typography, Box } from '@mui/material';

export const metadata: Metadata = {
  title: 'Getting Started Guides - OpenLeague Documentation',
  description: 'Quick start guides for OpenLeague team management.',
};

export default function GuidesPage() {
  return (
    <Box>
      <Typography variant="h1" component="h1" gutterBottom>
        Getting Started Guides
      </Typography>
      <Typography variant="body1">
        Getting started guides coming soon...
      </Typography>
    </Box>
  );
}