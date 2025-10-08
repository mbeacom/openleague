import { Metadata } from 'next';
import { Typography, Box } from '@mui/material';

export const metadata: Metadata = {
  title: 'API Reference - OpenLeague Documentation',
  description: 'Technical API documentation for OpenLeague platform.',
};

export default function ApiPage() {
  return (
    <Box>
      <Typography variant="h1" component="h1" gutterBottom>
        API Reference
      </Typography>
      <Typography variant="body1">
        API documentation coming soon...
      </Typography>
    </Box>
  );
}