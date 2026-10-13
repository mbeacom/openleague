import type { ReactNode } from 'react';
import { Container, Box, Typography, Divider, Stack } from '@mui/material';
import { generatePageMetadata, getBreadcrumbSchema } from '@/lib/config/seo';
import StructuredData from '@/components/ui/StructuredData';
import { LegalSection, LegalToc } from '@/components/features/legal/LegalScaffold';

export const metadata = generatePageMetadata({
  title: 'Privacy Policy',
  description: 'How OpenLeague collects, uses, shares and protects personal data, including players\' data and the OpenLeague Planner.',
  path: '/privacy',
});

const PRIVACY_EFFECTIVE_DATE = 'October 13, 2026';
const PRIVACY_CONTACT_EMAIL = 'support@openl.app';
const PLANNER_PRIVACY_URL = 'https://openleague.dev/privacy/';

const SECTIONS = [
  { id: 'scope', title: 'Who We Are and What This Covers' },
  { id: 'information-we-collect', title: 'Information We Collect' },
  { id: 'how-we-use-information', title: 'How We Use Information' },
  { id: 'how-we-share-information', title: 'How Information Is Shared' },
  { id: 'cookies', title: 'Cookies, Analytics and Error Monitoring' },
  { id: 'childrens-privacy', title: "Children's Privacy" },
  { id: 'data-retention', title: 'Data Retention' },
  { id: 'your-rights', title: 'Your Rights & Choices' },
  { id: 'security', title: 'Data Security' },
  { id: 'planner', title: 'The OpenLeague Planner' },
  { id: 'changes', title: 'Changes to This Policy' },
  { id: 'contact', title: 'Contact Us' },
];

function P({ children }: { children: ReactNode }) {
  return (
    <Typography variant="body1" sx={{ mb: 1.5 }}>
      {children}
    </Typography>
  );
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <Box component="ul" sx={{ mt: 0, mb: 1.5, pl: 3, '& li': { mb: 0.75 } }}>
      {items.map((item, i) => (
        <Typography component="li" variant="body1" key={i}>
          {item}
        </Typography>
      ))}
    </Box>
  );
}

const contactLink = <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>{PRIVACY_CONTACT_EMAIL}</a>;

export default function PrivacyPolicyPage() {
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Privacy Policy', url: '/privacy' },
  ]);

  return (
    <>
      <StructuredData data={breadcrumbSchema} />
      <Container maxWidth="md">
        <Box sx={{ py: 8 }}>
          <Typography variant="h1" component="h1" gutterBottom>
            Privacy Policy
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            Effective {PRIVACY_EFFECTIVE_DATE}
          </Typography>

          <LegalToc items={SECTIONS} />

          <Stack spacing={5}>
            <LegalSection id="scope" title="Who We Are and What This Covers">
              <P>
                OpenLeague is a free, open-source team and league management service for youth and amateur sports,
                operated by Mark Beacom (&quot;OpenLeague&quot;, &quot;we&quot;, &quot;us&quot;). This policy explains
                what personal data the hosted OpenLeague app at openl.app collects, how it is used and shared, and the
                choices you have.
              </P>
              <P>
                The OpenLeague Planner at openleague.dev/planner runs in your browser without an account and has its own{' '}
                <a href={PLANNER_PRIVACY_URL}>privacy policy</a>, summarized in{' '}
                <a href="#planner">The OpenLeague Planner</a> below. If you run your own copy of the open-source code, you
                are responsible for the data your copy handles, and this policy does not apply to it.
              </P>
            </LegalSection>

            <LegalSection id="information-we-collect" title="Information We Collect">
              <P>We collect information you and other users enter, and a small amount of technical data:</P>
              <List
                items={[
                  <><strong>Account details:</strong> your name, email address and password. Passwords are stored only as a one-way hash.</>,
                  <><strong>Roster information</strong> entered by team administrators: players&apos; names, email addresses, phone numbers, jersey numbers and positions, and optionally emergency contacts, USA Hockey member IDs and dates of birth. Team officials&apos; names, roles and email addresses. Links between players and their parents or guardians.</>,
                  <><strong>Parental consent records:</strong> when a player under 13 is added, a record of the consent attestation, including the child&apos;s name and date of birth, the team, the version of the consent text and who confirmed it.</>,
                  <><strong>Team and league activity:</strong> events, RSVPs, invitations (including invitees&apos; email addresses), messages, notification preferences, schedules and scores.</>,
                  <><strong>Event signups and registrations:</strong> participants&apos; names, email addresses, phone numbers and notes, check-in status, and organizers&apos; contact details and payment handles (such as Venmo, Zelle or Cash App) that they choose to publish.</>,
                  <><strong>Payments:</strong> amounts, status and Stripe reference IDs. Card details are entered on Stripe&apos;s pages and never reach OpenLeague.</>,
                  <><strong>Photos, videos and logos</strong> that users upload to events, teams, leagues and venues, with any captions.</>,
                  <><strong>Rink and venue information:</strong> venue staff accounts and roles, venue addresses and contact details, ice time and lesson requests, and session registrations.</>,
                  <><strong>Gear program information:</strong> donors&apos; names and contact details when they pledge gear and agree to be contacted.</>,
                  <><strong>Technical data:</strong> IP addresses and email addresses used to limit repeated sign-in, sign-up and similar requests, server logs, and, where enabled, analytics and error reports (see <a href="#cookies">Cookies, Analytics and Error Monitoring</a>).</>,
                ]}
              />
              <P>
                Much of this information is about people other than the person entering it, such as players and their
                families. Team and league administrators who enter it are responsible for having the right to do so.
              </P>
            </LegalSection>

            <LegalSection id="how-we-use-information" title="How We Use Information">
              <P>We use personal data only to run OpenLeague:</P>
              <List
                items={[
                  'to provide team, league, scheduling, registration, rink and communication features;',
                  'to send emails you request or need, such as invitations, verification and password resets, event notifications, RSVP reminders and messages from your team or league;',
                  'to process registration payments through Stripe;',
                  'to keep the service secure, prevent abuse and enforce rate limits;',
                  'to understand how the service is used and fix errors, using the tools described below.',
                ]}
              />
              <P>
                We do not sell personal data, do not use it for advertising, and do not share it for cross-context
                behavioral advertising.
              </P>
            </LegalSection>

            <LegalSection id="how-we-share-information" title="How Information Is Shared">
              <P><strong>Within your team or league.</strong> What other users can see depends on their role:</P>
              <List
                items={[
                  'Team members can see the roster: players’ names, email addresses, phone numbers, jersey numbers and positions, and other members’ names and email addresses.',
                  'Only team and league administrators can see emergency contacts, USA Hockey member IDs, dates of birth, consent status and pending invitations, and only administrators can export rosters.',
                  'Messages are delivered to the people they are addressed to.',
                ]}
              />
              <P><strong>Publicly.</strong> Some information is shown on public pages by design:</P>
              <List
                items={[
                  'public league, association and team pages, with the league’s public contact details;',
                  'public signup pages, with the organizer’s contact details and any payment handles the organizer publishes (registrants’ details are not shown);',
                  'public schedules and standings, which show team names;',
                  'rink pages, with the venue’s address and public contact details;',
                  'event photo galleries, if the organizer makes a public event’s gallery visible to everyone.',
                ]}
              />
              <P><strong>Service providers.</strong> We use these providers to run OpenLeague. They process data on our behalf:</P>
              <List
                items={[
                  'Vercel (hosting and file storage for uploaded photos, videos and logos);',
                  'Neon (database);',
                  'Amazon Web Services (SES) or Mailchimp Transactional (email delivery);',
                  'Stripe (payments; organizers receive payments through their own Stripe accounts);',
                  'Umami and Google Analytics (usage analytics) and Sentry (error monitoring), where enabled;',
                  'Fontshare (web fonts; your browser requests font files from it).',
                ]}
              />
              <P>
                Uploaded photos, videos and logos are stored at hard-to-guess web addresses. Anyone who has an address can
                open the file.
              </P>
              <P>
                <strong>Legal reasons.</strong> We may disclose information if required by law, or to protect the safety
                of users or others.
              </P>
            </LegalSection>

            <LegalSection id="cookies" title="Cookies, Analytics and Error Monitoring">
              <List
                items={[
                  'Sign-in uses essential cookies: a session cookie that lasts up to 7 days, a CSRF protection cookie and a callback cookie. Changing your password or email signs out your other sessions.',
                  'Your browser’s local storage keeps preferences such as light or dark mode and practice planner display settings.',
                  'Where enabled, Umami records page views. Where enabled, Google Analytics records usage with IP anonymization and with Google signals and ad personalization turned off; it is not loaded when your browser sends Do Not Track or Global Privacy Control.',
                  'Where enabled, Sentry receives error reports and performance samples. It is configured not to send default personal data.',
                  'Pages reached through private links, such as invitation links, are excluded from analytics.',
                ]}
              />
              <P>
                See the <a href="/cookies">Cookie Policy</a> for more detail.
              </P>
            </LegalSection>

            <LegalSection id="childrens-privacy" title="Children's Privacy">
              <P>
                OpenLeague accounts are for adults: coaches, administrators, parents and guardians. Rosters can include
                players under 13, entered by a team administrator.
              </P>
              <P>
                When an administrator saves a player with a date of birth that makes the player under 13, OpenLeague
                requires the administrator to confirm that the player&apos;s parent or guardian has consented, and records
                that confirmation. Only administrators can see a player&apos;s date of birth, emergency contact and consent
                status.
              </P>
              <P>
                A parent or guardian can ask to review or delete their child&apos;s information, or withdraw consent, by
                contacting the child&apos;s team administrator or emailing {contactLink}. We will respond and, where we
                cannot verify the request ourselves, work with the team administrator.
              </P>
            </LegalSection>

            <LegalSection id="data-retention" title="Data Retention">
              <List
                items={[
                  'We keep information for as long as your account, team or league uses it, until it is deleted.',
                  'When you delete your account, your account, memberships, RSVPs, registrations, uploads, notification preferences and activity log entries are deleted. Roster entries that administrators created for you remain on the team’s roster until an administrator removes them. Parental consent records are kept as a record of consent.',
                  'When an administrator deletes a player, the player’s roster entry is deleted.',
                  'Records used to limit repeated requests expire within an hour and are cleared out after that. Used and expired sign-in tokens are deleted.',
                  'Email delivery records may keep the address an email was sent to.',
                  'Payment records are kept for the organizer’s and Stripe’s records.',
                ]}
              />
            </LegalSection>

            <LegalSection id="your-rights" title="Your Rights & Choices">
              <List
                items={[
                  <><strong>Access and export:</strong> you can download a copy of your account data from your account settings.</>,
                  <><strong>Correction:</strong> you can update your name and email in your account settings. Ask your team administrator to correct roster information.</>,
                  <><strong>Deletion:</strong> you can delete your account in your account settings. If deletion is blocked because you own a season, venue or similar record, contact us.</>,
                  <><strong>Email:</strong> you can turn notification emails off in your notification preferences, or with the unsubscribe link in league message emails.</>,
                ]}
              />
              <P>
                Depending on where you live, you may have further rights, such as to object to or restrict processing. To
                make any request, email {contactLink}.
              </P>
            </LegalSection>

            <LegalSection id="security" title="Data Security">
              <List
                items={[
                  'All traffic uses HTTPS.',
                  'Passwords are hashed with bcrypt.',
                  'Access to team and league data is checked against each user’s role on every request.',
                  'Sign-in, sign-up, password reset and other sensitive actions are rate-limited.',
                  'Security headers, including a Content Security Policy, protect pages in the browser.',
                ]}
              />
              <P>
                No system is perfectly secure. Report security issues to <a href="mailto:security@openl.app">security@openl.app</a>.
              </P>
            </LegalSection>

            <LegalSection id="planner" title="The OpenLeague Planner">
              <P>
                The OpenLeague Planner keeps your practices and rankings in your browser. It has no account and sends
                nothing to OpenLeague. If you choose to save to Google Drive or Microsoft OneDrive, files go directly
                between your browser and your own Drive or OneDrive. The Planner requests only access to the files it
                creates or you pick, and its use of information received from Google APIs adheres to the Google API
                Services User Data Policy, including the Limited Use requirements. Read the full{' '}
                <a href={PLANNER_PRIVACY_URL}>Planner privacy policy</a>.
              </P>
            </LegalSection>

            <LegalSection id="changes" title="Changes to This Policy">
              <P>
                When this policy changes, we publish the new version on this page with a new effective date. For
                significant changes, we may also notify account holders by email or in the app.
              </P>
            </LegalSection>

            <LegalSection id="contact" title="Contact Us">
              <P>Questions or requests about privacy: {contactLink}.</P>
            </LegalSection>
          </Stack>

          <Divider sx={{ my: 6 }} />

          <Typography variant="body2" color="text.secondary">
            OpenLeague is open-source software. You can review how it handles data in its{' '}
            <a href="https://github.com/mbeacom/openleague">source code</a>.
          </Typography>
        </Box>
      </Container>
    </>
  );
}
