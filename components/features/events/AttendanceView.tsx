import {
  Box,
  Card,
  CardContent,
  Typography,
  Stack,
  Chip,
  Divider,
  Grid,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import HelpIcon from "@mui/icons-material/Help";
import QuestionMarkIcon from "@mui/icons-material/QuestionMark";

type RSVPStatus = "GOING" | "NOT_GOING" | "MAYBE" | "NO_RESPONSE";

interface AttendanceMember {
  id: string;
  name: string | null;
  email: string;
  status: RSVPStatus;
}

interface AttendanceViewProps {
  rsvps: Array<{
    id: string;
    status: RSVPStatus;
    user: {
      id: string;
      name: string | null;
      email: string;
    };
  }>;
}

export function AttendanceView({ rsvps }: AttendanceViewProps) {
  // Group RSVPs by status
  const groupedRSVPs = rsvps.reduce(
    (acc, rsvp) => {
      const member: AttendanceMember = {
        id: rsvp.user.id,
        name: rsvp.user.name,
        email: rsvp.user.email,
        status: rsvp.status,
      };
      acc[rsvp.status].push(member);
      return acc;
    },
    {
      GOING: [] as AttendanceMember[],
      NOT_GOING: [] as AttendanceMember[],
      MAYBE: [] as AttendanceMember[],
      NO_RESPONSE: [] as AttendanceMember[],
    }
  );

  // Calculate counts
  const counts = {
    going: groupedRSVPs.GOING.length,
    notGoing: groupedRSVPs.NOT_GOING.length,
    maybe: groupedRSVPs.MAYBE.length,
    noResponse: groupedRSVPs.NO_RESPONSE.length,
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Attendance Summary
        </Typography>

        {/* Summary Counts */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Box
              sx={{
                textAlign: "center",
                p: 2,
                bgcolor: "success.light",
                borderRadius: 1,
              }}
            >
              <CheckCircleIcon sx={{ fontSize: 32, color: "success.dark" }} />
              <Typography variant="h4" sx={{ fontWeight: 600, mt: 1 }}>
                {counts.going}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Going
              </Typography>
            </Box>
          </Grid>

          <Grid size={{ xs: 6, sm: 3 }}>
            <Box
              sx={{
                textAlign: "center",
                p: 2,
                bgcolor: "warning.light",
                borderRadius: 1,
              }}
            >
              <HelpIcon sx={{ fontSize: 32, color: "warning.dark" }} />
              <Typography variant="h4" sx={{ fontWeight: 600, mt: 1 }}>
                {counts.maybe}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Maybe
              </Typography>
            </Box>
          </Grid>

          <Grid size={{ xs: 6, sm: 3 }}>
            <Box
              sx={{
                textAlign: "center",
                p: 2,
                bgcolor: "error.light",
                borderRadius: 1,
              }}
            >
              <CancelIcon sx={{ fontSize: 32, color: "error.dark" }} />
              <Typography variant="h4" sx={{ fontWeight: 600, mt: 1 }}>
                {counts.notGoing}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Not Going
              </Typography>
            </Box>
          </Grid>

          <Grid size={{ xs: 6, sm: 3 }}>
            <Box
              sx={{
                textAlign: "center",
                p: 2,
                bgcolor: "grey.200",
                borderRadius: 1,
              }}
            >
              <QuestionMarkIcon sx={{ fontSize: 32, color: "grey.600" }} />
              <Typography variant="h4" sx={{ fontWeight: 600, mt: 1 }}>
                {counts.noResponse}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                No Response
              </Typography>
            </Box>
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />

        {/* Detailed Lists */}
        <Stack spacing={3}>
          {/* Going */}
          {groupedRSVPs.GOING.length > 0 && (
            <Box>
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 600, mb: 1, display: "flex", alignItems: "center", gap: 1 }}
              >
                <CheckCircleIcon color="success" fontSize="small" />
                Going ({counts.going})
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {groupedRSVPs.GOING.map((member) => (
                  <Chip
                    key={member.id}
                    label={member.name || member.email}
                    color="success"
                    variant="outlined"
                    size="small"
                  />
                ))}
              </Stack>
            </Box>
          )}

          {/* Maybe */}
          {groupedRSVPs.MAYBE.length > 0 && (
            <Box>
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 600, mb: 1, display: "flex", alignItems: "center", gap: 1 }}
              >
                <HelpIcon color="warning" fontSize="small" />
                Maybe ({counts.maybe})
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {groupedRSVPs.MAYBE.map((member) => (
                  <Chip
                    key={member.id}
                    label={member.name || member.email}
                    color="warning"
                    variant="outlined"
                    size="small"
                  />
                ))}
              </Stack>
            </Box>
          )}

          {/* Not Going */}
          {groupedRSVPs.NOT_GOING.length > 0 && (
            <Box>
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 600, mb: 1, display: "flex", alignItems: "center", gap: 1 }}
              >
                <CancelIcon color="error" fontSize="small" />
                Not Going ({counts.notGoing})
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {groupedRSVPs.NOT_GOING.map((member) => (
                  <Chip
                    key={member.id}
                    label={member.name || member.email}
                    color="error"
                    variant="outlined"
                    size="small"
                  />
                ))}
              </Stack>
            </Box>
          )}

          {/* No Response */}
          {groupedRSVPs.NO_RESPONSE.length > 0 && (
            <Box>
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 600, mb: 1, display: "flex", alignItems: "center", gap: 1 }}
              >
                <QuestionMarkIcon color="disabled" fontSize="small" />
                No Response ({counts.noResponse})
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {groupedRSVPs.NO_RESPONSE.map((member) => (
                  <Chip
                    key={member.id}
                    label={member.name || member.email}
                    variant="outlined"
                    size="small"
                  />
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
