import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Button, Card, CardContent, Chip, Container, Divider, Stack, Typography } from "@mui/material";
import { auth } from "@/auth";
import { getSkillLevelReferences } from "@/lib/actions/venue-content";
import { getPublicVenueSchedule } from "@/lib/actions/venue-schedules";
import { listPublicSignupEvents } from "@/lib/actions/signup-events";
import { listPublicVenueEventGames } from "@/lib/actions/event-teams";
import {
  AvailableIceBrowser,
  IceTimeRequestForm,
  PublicRinkFilters,
  SessionRegisterButton,
  VenueScheduleCalendar,
} from "@/components/features/venue-admin";
import { formatCurrencyFromCents } from "@/lib/utils/currency";
import { formatDateTime, formatDateTimeInZone } from "@/lib/utils/date";

export const dynamic = "force-dynamic";

interface PublicRinkSchedulePageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ level?: string; registration?: string }>;
}

function humanizeActivity(activityType: string): string {
  return activityType
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function spotsRemaining(capacity: number | null, registrations: { quantity: number }[]): number | null {
  if (capacity == null) return null;
  const taken = registrations.reduce((total, reg) => total + reg.quantity, 0);
  return Math.max(0, capacity - taken);
}

export default async function PublicRinkSchedulePage({ params, searchParams }: PublicRinkSchedulePageProps) {
  const { slug } = await params;
  const { level, registration } = await searchParams;
  const [venue, skillLevels, session] = await Promise.all([
    getPublicVenueSchedule(slug, level ? { skillLevelIds: [level] } : {}),
    getSkillLevelReferences(),
    auth(),
  ]);

  if (!venue) {
    notFound();
  }

  const [signupEvents, signupEventGames] = await Promise.all([
    listPublicSignupEvents({ venueId: venue.id }),
    listPublicVenueEventGames(venue.id),
  ]);

  const isAuthenticated = Boolean(session?.user);
  const defaultName = session?.user?.name ?? undefined;
  const defaultEmail = session?.user?.email ?? undefined;
  const loginRedirect = `/rinks/${slug}/schedule`;

  const requestableBlocks = venue.scheduleBlocks.filter((block) => block.registrationMode === "REQUEST_REQUIRED");
  const registrableBlocks = venue.scheduleBlocks.filter((block) => block.registrationMode === "SELF_REGISTER");
  const registrableLessons = venue.lessonOfferings;

  return (
    <Container maxWidth="lg">
      <Stack spacing={4} sx={{ py: { xs: 8, md: 10 } }}>
        <Typography variant="h3" component="h1">
          {venue.name} Schedule
        </Typography>

        {registration === "success" ? (
          <Alert severity="success">
            Payment received — we&apos;re confirming your spot. It will appear under My
            Registrations once your payment finishes processing.
          </Alert>
        ) : null}
        {registration === "canceled" ? (
          <Alert severity="warning">Checkout was canceled — you have not been charged.</Alert>
        ) : null}

        <PublicRinkFilters skillLevels={skillLevels} basePath={`/rinks/${slug}/schedule`} />

        {registrableBlocks.length > 0 || registrableLessons.length > 0 ? (
          <Stack spacing={2} component="section" aria-labelledby="register-heading">
            <Typography id="register-heading" variant="h5" component="h2">
              Register &amp; buy
            </Typography>
            <Stack spacing={2}>
              {registrableBlocks.map((block) => {
                const remaining = spotsRemaining(block.capacity, block.registrations);
                return (
                  <Card key={block.id} variant="outlined">
                    <CardContent>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={2}
                        justifyContent="space-between"
                        alignItems={{ xs: "flex-start", sm: "center" }}
                      >
                        <Stack spacing={0.5}>
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                            <Typography fontWeight={700}>{block.title}</Typography>
                            <Chip size="small" label={humanizeActivity(block.activityType)} />
                            {block.priceAmount && block.priceAmount > 0 ? (
                              <Chip
                                size="small"
                                color="secondary"
                                label={formatCurrencyFromCents(block.priceAmount, block.priceCurrency)}
                              />
                            ) : (
                              <Chip size="small" color="success" label="Free" />
                            )}
                          </Stack>
                          <Typography variant="body2" color="text.secondary">
                            {formatDateTimeInZone(block.startsAt, venue.timezone)} –{" "}
                            {formatDateTimeInZone(block.endsAt, venue.timezone)}
                            {block.surface ? ` · ${block.surface.name}` : ""}
                          </Typography>
                          {remaining != null ? (
                            <Typography variant="caption" color="text.secondary">
                              {remaining} spot{remaining === 1 ? "" : "s"} remaining
                            </Typography>
                          ) : null}
                        </Stack>
                        <SessionRegisterButton
                          venueId={venue.id}
                          scheduleBlockId={block.id}
                          title={block.title}
                          priceAmount={block.priceAmount ?? null}
                          currency={block.priceCurrency}
                          spotsRemaining={remaining}
                          isAuthenticated={isAuthenticated}
                          defaultName={defaultName}
                          defaultEmail={defaultEmail}
                          loginRedirect={loginRedirect}
                        />
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })}

              {registrableLessons.length > 0 ? <Divider>Lessons &amp; programs</Divider> : null}

              {registrableLessons.map((lesson) => (
                <Card key={lesson.id} variant="outlined">
                  <CardContent>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={2}
                      justifyContent="space-between"
                      alignItems={{ xs: "flex-start", sm: "center" }}
                    >
                      <Stack spacing={0.5}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                          <Typography fontWeight={700}>{lesson.title}</Typography>
                          <Chip size="small" label={lesson.lessonType} />
                          {lesson.priceAmount && lesson.priceAmount > 0 ? (
                            <Chip
                              size="small"
                              color="secondary"
                              label={formatCurrencyFromCents(lesson.priceAmount, lesson.priceCurrency)}
                            />
                          ) : (
                            <Chip size="small" color="success" label="Free" />
                          )}
                        </Stack>
                        {lesson.availabilityDescription ? (
                          <Typography variant="body2" color="text.secondary">
                            {lesson.availabilityDescription}
                          </Typography>
                        ) : null}
                      </Stack>
                      <SessionRegisterButton
                        venueId={venue.id}
                        lessonOfferingId={lesson.id}
                        title={lesson.title}
                        priceAmount={lesson.priceAmount ?? null}
                        currency={lesson.priceCurrency}
                        isAuthenticated={isAuthenticated}
                        defaultName={defaultName}
                        defaultEmail={defaultEmail}
                        loginRedirect={loginRedirect}
                      />
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </Stack>
        ) : null}

        {signupEvents.length > 0 ? (
          <Stack spacing={2} component="section" aria-labelledby="signup-events-heading">
            <Typography id="signup-events-heading" variant="h5" component="h2">
              Signup events
            </Typography>
            <Stack spacing={2}>
              {signupEvents.map((event) => (
                <Card key={event.id}>
                  <CardContent>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      justifyContent="space-between"
                      alignItems={{ sm: "center" }}
                    >
                      <Stack spacing={0.5}>
                        <Typography variant="h6">{event.title}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {formatDateTime(event.startAt)} ·{" "}
                          {event.hostOrganization?.name ?? event.hostLeague?.name ?? event.hostTeam?.name ?? ""}
                        </Typography>
                        {signupEventGames
                          .filter((game) => game.eventId === event.id)
                          .map((game) => (
                            <Typography key={game.id} variant="caption" color="text.secondary">
                              {formatDateTime(game.startAt)} — {game.homeTeam.name} vs {game.awayTeam.name}
                              {game.zoneLabel ? ` (${game.zoneLabel})` : ""}
                              {game.surface ? ` · ${game.surface.name}` : ""}
                            </Typography>
                          ))}
                      </Stack>
                      <Button component={Link} href={`/events/${event.id}`} variant="outlined" size="small">
                        View & sign up
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </Stack>
        ) : null}

        <VenueScheduleCalendar blocks={venue.scheduleBlocks.map((block) => ({ ...block, status: "PUBLISHED" }))} />
        <AvailableIceBrowser blocks={requestableBlocks} />
        {requestableBlocks.map((block) => (
          <IceTimeRequestForm
            key={block.id}
            scheduleBlockId={block.id}
            venueId={venue.id}
            venueName={venue.name}
            startsAt={block.startsAt}
            endsAt={block.endsAt}
          />
        ))}
      </Stack>
    </Container>
  );
}
