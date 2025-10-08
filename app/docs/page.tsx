import { Metadata } from 'next';
import { Typography, Box, Card, CardContent, CardActions, Button } from '@mui/material';
import Link from 'next/link';

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
        Everything you need to know about managing your sports team with OpenLeague.
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
        <Card>
          <CardContent>
            <Typography variant="h6" component="h2" gutterBottom>
              User Guide
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Comprehensive guides for team managers and players.
            </Typography>
          </CardContent>
          <CardActions>
            <Button size="small" component={Link} href="/docs/user-guide">
              Learn More
            </Button>
          </CardActions>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" component="h2" gutterBottom>
              Getting Started
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Quick start guides to get your team up and running.
            </Typography>
          </CardContent>
          <CardActions>
            <Button size="small" component={Link} href="/docs/guides">
              Get Started
            </Button>
          </CardActions>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" component="h2" gutterBottom>
              API Reference
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Technical documentation for developers and integrations.
            </Typography>
          </CardContent>
          <CardActions>
            <Button size="small" component={Link} href="/docs/api">
              View API
            </Button>
          </CardActions>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" component="h2" gutterBottom>
              Contributing
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Help improve OpenLeague by contributing to the project.
            </Typography>
          </CardContent>
          <CardActions>
            <Button size="small" component={Link} href="/docs/contributing">
              Contribute
            </Button>
          </CardActions>
        </Card>
      </Box>
    </Box>
  );
}