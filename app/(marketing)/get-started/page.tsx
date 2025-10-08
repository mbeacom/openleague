import { Metadata } from 'next';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  Stepper,
  Step,
  StepLabel,
  StepContent,
} from '@mui/material';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Get Started - OpenLeague',
  description: 'Start managing your sports team with OpenLeague. Quick setup guide and onboarding.',
};

const steps = [
  {
    label: 'Create Your Account',
    description:
      'Sign up with your email address. No credit card required, no commitment. Your account is free forever.',
    action: 'Sign Up Now',
    actionHref: '/signup',
  },
  {
    label: 'Set Up Your Team',
    description:
      'Create your first team by providing a name, sport type, and basic information. This takes less than a minute.',
    details: ['Choose a team name', 'Select your sport', 'Add team details', 'Set up your preferences'],
  },
  {
    label: 'Invite Your Players',
    description:
      'Add players to your roster by sending email invitations. Players can accept and create their own accounts.',
    details: [
      'Add player email addresses',
      'Send invitations automatically',
      'Track invitation status',
      'Players join via email link',
    ],
  },
  {
    label: 'Schedule Your First Event',
    description:
      'Create a game or practice event with details like date, time, location, and opponent. Your team will be notified automatically.',
    details: [
      'Choose event type (Game or Practice)',
      'Set date and time',
      'Add location information',
      'Notify team members',
    ],
  },
  {
    label: 'Track RSVPs',
    description:
      'Team members receive email notifications and can RSVP with Going, Not Going, or Maybe. See attendance at a glance.',
    details: [
      'Players RSVP to events',
      'View attendance status',
      'Send reminders',
      'Update event details as needed',
    ],
  },
];

export default function GetStartedPage() {
  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 8 }}>
        <Typography variant="h1" component="h1" gutterBottom textAlign="center">
          Get Started with OpenLeague
        </Typography>
        <Typography variant="h5" color="text.secondary" textAlign="center" sx={{ mb: 2 }}>
          Your team can be up and running in minutes.
        </Typography>
        <Typography variant="body1" color="text.secondary" textAlign="center" sx={{ mb: 6 }}>
          Follow these simple steps to replace your spreadsheets and group chats with OpenLeague.
        </Typography>

        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 8 }}>
          <Button component={Link} href="/signup" variant="contained" size="large">
            Sign Up Now
          </Button>
        </Box>

        <Stepper orientation="vertical" sx={{ mb: 8 }}>
          {steps.map((step) => (
            <Step key={step.label} active={true} expanded={true}>
              <StepLabel>
                <Typography variant="h6">{step.label}</Typography>
              </StepLabel>
              <StepContent>
                <Typography variant="body1" paragraph>
                  {step.description}
                </Typography>
                {step.details && (
                  <Box component="ul" sx={{ mt: 2, pl: 2 }}>
                    {step.details.map((detail) => (
                      <Typography component="li" key={detail} variant="body2" color="text.secondary">
                        {detail}
                      </Typography>
                    ))}
                  </Box>
                )}
                {step.action && step.actionHref && (
                  <Button
                    component={Link}
                    href={step.actionHref}
                    variant="contained"
                    sx={{ mt: 2 }}
                  >
                    {step.action}
                  </Button>
                )}
              </StepContent>
            </Step>
          ))}
        </Stepper>

        <Box sx={{ mb: 8 }}>
          <Typography variant="h4" component="h2" gutterBottom textAlign="center">
            Need Help?
          </Typography>
          <Typography variant="body1" color="text.secondary" textAlign="center" sx={{ mb: 4 }}>
            We&apos;re here to help you get started successfully.
          </Typography>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
              gap: 3,
            }}
          >
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Documentation
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Comprehensive guides and tutorials to help you make the most of OpenLeague.
                </Typography>
                <Button component={Link} href="/docs" size="small">
                  View Docs
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  User Guide
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Step-by-step instructions for common tasks and features.
                </Typography>
                <Button component={Link} href="/docs/user-guide" size="small">
                  Read Guide
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Contact Support
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Have questions? Our support team is ready to help.
                </Typography>
                <Button component={Link} href="/contact" size="small">
                  Get Help
                </Button>
              </CardContent>
            </Card>
          </Box>
        </Box>

        <Box sx={{ textAlign: 'center', p: 4, bgcolor: 'background.paper', borderRadius: 2 }}>
          <Typography variant="h5" gutterBottom>
            Ready to Get Started?
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Sign up and begin managing your team in minutes.
          </Typography>
          <Button component={Link} href="/signup" variant="contained" size="large">
            Sign Up Now
          </Button>
        </Box>
      </Box>
    </Container>
  );
}