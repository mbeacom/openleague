import { notFound } from "next/navigation";
import { Box, Card, CardContent, Typography } from "@mui/material";
import {
  People as PeopleIcon,
  Security as SecurityIcon,
} from "@mui/icons-material";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { LinkCardActionArea } from "@/components/ui/NextLinkComposites";
import { isPlatformAdmin, requireUserId } from "@/lib/auth/session";

const ADMIN_LINKS = [
  {
    href: "/admin/users",
    title: "User Management",
    description: "Approve, suspend, or reinstate user accounts across the platform.",
    icon: <PeopleIcon color="primary" />,
  },
  {
    href: "/admin/audit",
    title: "Audit Logs",
    description: "Review administrative actions and security events for your leagues.",
    icon: <SecurityIcon color="primary" />,
  },
];

/**
 * Platform admin hub. Gated on the real platform-admin role; everyone else
 * gets a 404 so the route's existence is not advertised.
 */
export default async function AdminPage() {
  const userId = await requireUserId();

  const isAdmin = await isPlatformAdmin(userId);
  if (!isAdmin) {
    notFound();
  }

  return (
    <PageContainer>
      <PageHeader
        title="Platform Admin"
        subtitle="System-wide moderation and oversight tools."
      />
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" },
          gap: 2,
        }}
      >
        {ADMIN_LINKS.map((link) => (
          <Card key={link.href} variant="outlined">
            <LinkCardActionArea href={link.href} sx={{ height: "100%" }}>
              <CardContent>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                  {link.icon}
                  <Typography variant="h6" component="h2">
                    {link.title}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {link.description}
                </Typography>
              </CardContent>
            </LinkCardActionArea>
          </Card>
        ))}
      </Box>
    </PageContainer>
  );
}
