import { Metadata } from 'next';
import { Typography, Box, Card, CardContent, CardActions, Button, Chip, Stack } from '@mui/material';
import { docsSections } from '@/lib/docs/config';

export const metadata: Metadata = {
  title: 'Documentation - OpenLeague',
  description: 'Comprehensive documentation for OpenLeague sports team management platform.',
};

export default function DocsHomePage() {
  return (
    <Box>
      <Typography variant="h1" component="h1" gutterBottom>
        OpenLeague Documentation
      </Typography>
      <Typography variant="h5" component="p" color="text.secondary" sx={{ mb: 4 }}>
        Guides and references for launching a team, managing a season, and contributing to OpenLeague.
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
        {docsSections.flatMap((section) =>
          section.items.map((item) => (
            <Card key={item.href}>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Chip label={section.title} size="small" variant="outlined" />
                  <Typography variant="h6" component="h2">
                    {item.title}
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {item.description}
                </Typography>
              </CardContent>
              <CardActions>
                <Button size="small" href={item.href}>
                  Read guide
                </Button>
              </CardActions>
            </Card>
          )),
        )}
      </Box>
    </Box>
  );
}
