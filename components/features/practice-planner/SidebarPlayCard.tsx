"use client";

import { Box, Card, CardActionArea, CardContent, Stack, Typography } from "@mui/material";
import { SportsHockey as HockeyIcon } from "@mui/icons-material";
import type { PlayData, PracticeSessionViewPlay } from "@/types/practice-planner";
import { usePlannerPlatform } from "@/lib/planner-store";
import { PlayDiagram } from "./PlayDiagram";

interface SidebarPlayCardProps {
  sp: PracticeSessionViewPlay;
  /** The diagram as drawn for this session (goalie hidden when none attend) */
  drawn: PlayData | null;
  /** The line under the name: its minutes, or in a rotating block how it rotates (stationTimingLabel) */
  timing: string;
  index: number;
  active: boolean;
  onSelect: () => void;
  /** "Run by Coach Lee, Sam" (practice staff, spec R9), or null when nobody runs this drill */
  runBy?: string | null;
}

/** One drill in the sidebar's play sequence; standalone or inside a station block (2b). */
export function SidebarPlayCard({ sp, drawn, timing, index, active, onSelect, runBy = null }: SidebarPlayCardProps) {
  const { Image } = usePlannerPlatform();
  // The drawn diagram is live (sharp, and drops a hidden goalie, spec R7); the stored PNG is the fallback.
  const thumbnail = sp.play.thumbnail;
  return (
    <Card
      sx={{
        border: "2px solid",
        borderColor: active ? "primary.main" : "transparent",
        bgcolor: active ? "action.hover" : "background.paper",
        boxShadow: active ? 2 : 0,
        transition: "all 0.15s ease",
        "&:hover": {
          borderColor: active ? "primary.main" : "primary.light",
          bgcolor: "action.hover",
        },
      }}
    >
      <CardActionArea
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        sx={{ "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 } }}
      >
      <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          {/* Play number */}
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              bgcolor: active ? "primary.main" : "action.selected",
              color: active ? "primary.contrastText" : "text.secondary",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              fontSize: "0.75rem",
              fontWeight: 700,
            }}
          >
            {index + 1}
          </Box>

          {/* Thumbnail */}
          <Box
            sx={{
              width: 48,
              height: 32,
              borderRadius: 1,
              bgcolor: "action.hover",
              overflow: "hidden",
              position: "relative",
              flexShrink: 0,
            }}
          >
            {drawn ? (
              <PlayDiagram playData={drawn} label={sp.play.name} decorative sx={{ width: 48, height: 32 }} />
            ) : thumbnail ? (
              <Image src={thumbnail} alt="" fit="cover" />
            ) : (
              <Box
                sx={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <HockeyIcon sx={{ fontSize: 14, color: "text.disabled" }} />
              </Box>
            )}
          </Box>

          {/* Name & timing */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              fontWeight={600}
              noWrap
              sx={{ fontSize: "0.8rem" }}
            >
              {sp.play.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {timing}
            </Typography>
            {runBy && (
              // Wraps rather than truncates: every name stays readable on a phone.
              <Typography variant="caption" color="text.secondary" component="div" sx={{ overflowWrap: "anywhere" }}>
                {runBy}
              </Typography>
            )}
          </Box>
        </Stack>
      </CardContent>
      </CardActionArea>
    </Card>
  );
}
