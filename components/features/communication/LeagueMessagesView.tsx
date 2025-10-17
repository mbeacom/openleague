"use client";

import React, { useState } from "react";
import { Box, Button, Tabs, Tab, Menu, MenuItem } from "@mui/material";
import {
  History as HistoryIcon,
  Send as SendIcon,
  Campaign as CampaignIcon,
  KeyboardArrowDown as ArrowDownIcon
} from "@mui/icons-material";
import { MessageComposer } from "./MessageComposer";
import { MessageHistory } from "./MessageHistory";
import { AnnouncementComposer } from "./AnnouncementComposer";
import { AnnouncementArchive } from "./AnnouncementArchive";

interface LeagueMessagesViewProps {
  leagueData: {
    id: string;
    name: string;
    divisions: Array<{
      id: string;
      name: string;
      teamCount: number;
    }>;
    teams: Array<{
      id: string;
      name: string;
      divisionName?: string;
      memberCount: number;
    }>;
  };
  canSendMessages: boolean;
}

export const LeagueMessagesView: React.FC<LeagueMessagesViewProps> = ({
  leagueData,
  canSendMessages,
}) => {
  const [messageComposerOpen, setMessageComposerOpen] = useState(false);
  const [announcementComposerOpen, setAnnouncementComposerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [sendMenuAnchor, setSendMenuAnchor] = useState<null | HTMLElement>(null);

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const handleSendMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setSendMenuAnchor(event.currentTarget);
  };

  const handleSendMenuClose = () => {
    setSendMenuAnchor(null);
  };

  const totalMembers = leagueData.teams.reduce((sum, team) => sum + team.memberCount, 0);

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      {/* Action Bar */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={{ xs: 2, sm: 3 }}
        flexWrap="wrap"
        gap={2}
      >
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            '& .MuiTab-root': {
              minHeight: { xs: 48, sm: 64 },
              fontSize: { xs: '0.8rem', sm: '0.875rem' },
              px: { xs: 1, sm: 2 }
            }
          }}
        >
          <Tab
            icon={<HistoryIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />}
            label="All Messages"
            iconPosition="start"
          />
          <Tab
            icon={<CampaignIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />}
            label="Announcements"
            iconPosition="start"
          />
        </Tabs>

        {canSendMessages && (
          <Box>
            <Button
              variant="contained"
              startIcon={<SendIcon sx={{ display: { xs: 'none', sm: 'inline-flex' } }} />}
              endIcon={<ArrowDownIcon />}
              onClick={handleSendMenuOpen}
              size="small"
              sx={{
                minHeight: 44,
                fontSize: { xs: '0.8rem', sm: '0.875rem' }
              }}
            >
              Send
            </Button>
            <Menu
              anchorEl={sendMenuAnchor}
              open={Boolean(sendMenuAnchor)}
              onClose={handleSendMenuClose}
              sx={{
                '& .MuiMenuItem-root': {
                  minHeight: 56,
                  px: 2,
                  fontSize: { xs: '0.875rem', sm: '1rem' }
                }
              }}
            >
              <MenuItem
                onClick={() => {
                  setMessageComposerOpen(true);
                  handleSendMenuClose();
                }}
              >
                <SendIcon sx={{ mr: 1, fontSize: { xs: 18, sm: 20 } }} />
                Send Targeted Message
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setAnnouncementComposerOpen(true);
                  handleSendMenuClose();
                }}
              >
                <CampaignIcon sx={{ mr: 1, fontSize: { xs: 18, sm: 20 } }} />
                Send League Announcement
              </MenuItem>
            </Menu>
          </Box>
        )}
      </Box>

      {/* Content */}
      <Box>
        {activeTab === 0 && (
          <MessageHistory leagueId={leagueData.id} />
        )}
        {activeTab === 1 && (
          <AnnouncementArchive leagueId={leagueData.id} />
        )}
      </Box>

      {/* Message Composer Dialog */}
      {canSendMessages && (
        <>
          <MessageComposer
            open={messageComposerOpen}
            onClose={() => setMessageComposerOpen(false)}
            leagueId={leagueData.id}
            leagueName={leagueData.name}
            divisions={leagueData.divisions}
            teams={leagueData.teams}
          />

          <AnnouncementComposer
            open={announcementComposerOpen}
            onClose={() => setAnnouncementComposerOpen(false)}
            leagueId={leagueData.id}
            leagueName={leagueData.name}
            totalMembers={totalMembers}
          />
        </>
      )}
    </Box>
  );
};