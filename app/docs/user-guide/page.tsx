import { Metadata } from 'next';
import { Typography, Box } from '@mui/material';

export const metadata: Metadata = {
  title: 'User Guide - OpenLeague Documentation',
  description: 'Complete user guide for OpenLeague team management platform.',
};

export default function UserGuidePage() {
  return (
    <Box>
      <Typography variant="h1" component="h1" gutterBottom>
        User Guide
      </Typography>
      <Typography variant="body1">
        User guide content coming soon...
      </Typography>
    </Box>
  );
}