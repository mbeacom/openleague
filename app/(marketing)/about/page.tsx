import { Metadata } from 'next';
import { Container, Typography, Box } from '@mui/material';

export const metadata: Metadata = {
  title: 'About - OpenLeague',
  description: 'Learn about OpenLeague\'s mission to simplify sports team management for everyone.',
};

export default function AboutPage() {
  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 8 }}>
        <Typography variant="h1" component="h1" gutterBottom>
          About OpenLeague
        </Typography>
        <Typography variant="h5" color="text.secondary" sx={{ mb: 6 }}>
          An open-source platform with affordable pricing, dedicated to simplifying sports team management.
        </Typography>

        <Box sx={{ mb: 6 }}>
          <Typography variant="h4" component="h2" gutterBottom>
            Our Mission
          </Typography>
          <Typography variant="body1" paragraph>
            OpenLeague exists to provide a single source of truth for sports team organization,
            replacing the chaos of spreadsheets, group chats, and email chains with a streamlined
            platform that keeps everyone on the same page.
          </Typography>
          <Typography variant="body1" paragraph>
            We believe that managing a sports team shouldn&apos;t require expensive software or complex
            tools. OpenLeague offers transparent, affordable pricing that&apos;s accessible to teams of all sizes,
            with no hidden fees or restrictive feature gates.
          </Typography>
        </Box>

        <Box sx={{ mb: 6 }}>
          <Typography variant="h4" component="h2" gutterBottom>
            Why We Built This
          </Typography>
          <Typography variant="body1" paragraph>
            Team managers and coaches spend countless hours coordinating schedules, tracking
            attendance, and keeping everyone informed. We&apos;ve experienced the frustration of
            juggling multiple tools and platforms firsthand.
          </Typography>
          <Typography variant="body1" paragraph>
            OpenLeague brings together the essential features teams need—roster management,
            event scheduling, RSVP tracking, and communication—in one intuitive platform
            designed with mobile-first accessibility in mind.
          </Typography>
        </Box>

        <Box sx={{ mb: 6 }}>
          <Typography variant="h4" component="h2" gutterBottom>
            Open Source & Community
          </Typography>
          <Typography variant="body1" paragraph>
            OpenLeague is open-source software under the Business Source License (BSL 1.1),
            built by the community, for the community. The source code is publicly available,
            and we welcome contributions, feedback, and ideas from users and developers alike.
          </Typography>
          <Typography variant="body1" paragraph>
            Visit our{' '}
            <Typography
              component="a"
              href="https://github.com/mbeacom/openleague"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
            >
              GitHub repository
            </Typography>
            {' '}to contribute, report issues, or learn more about the project.
          </Typography>
        </Box>

        <Box>
          <Typography variant="h4" component="h2" gutterBottom>
            Our Values
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3, mt: 3 }}>
            <Box>
              <Typography variant="h6" gutterBottom>
                Affordable & Transparent
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Simple, honest pricing that scales with your needs. No hidden fees or surprise charges.
              </Typography>
            </Box>
            <Box>
              <Typography variant="h6" gutterBottom>
                User-Focused
              </Typography>
              <Typography variant="body2" color="text.secondary">
                We prioritize simplicity and usability, ensuring our platform works for everyone.
              </Typography>
            </Box>
            <Box>
              <Typography variant="h6" gutterBottom>
                Privacy-Respecting
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Your data is yours. We don&apos;t sell information or use it for anything beyond providing our service.
              </Typography>
            </Box>
            <Box>
              <Typography variant="h6" gutterBottom>
                Community-Driven
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Our roadmap is shaped by user feedback and community contributions.
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>
    </Container>
  );
}