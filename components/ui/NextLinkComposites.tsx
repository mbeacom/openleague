"use client";

import Link from "next/link";
import {
  Button,
  Card,
  CardActionArea,
  Chip,
  Link as MuiLink,
  ListItemButton,
  type ButtonProps,
  type CardActionAreaProps,
  type CardProps,
  type ChipProps,
  type LinkProps as MuiLinkProps,
  type ListItemButtonProps,
} from "@mui/material";

/**
 * "use client" composites that bind `component={Link}` inside the client graph.
 *
 * In Next.js 16 `next/link` renders natively in Server Components (it is no
 * longer a client reference), so passing it as `component={Link}` from a
 * Server Component into an MUI client component throws
 * "Functions cannot be passed directly to Client Components" at render time.
 * Server Components should use these wrappers instead; Client Components can
 * keep using `component={Link}` directly.
 */

export type LinkButtonProps = Omit<ButtonProps<typeof Link>, "component" | "href"> & {
  href: string;
};

export function LinkButton(props: LinkButtonProps) {
  return <Button component={Link} {...props} />;
}

export type LinkCardActionAreaProps = Omit<
  CardActionAreaProps<typeof Link>,
  "component" | "href"
> & {
  href: string;
};

export function LinkCardActionArea(props: LinkCardActionAreaProps) {
  return <CardActionArea component={Link} {...props} />;
}

export type LinkListItemButtonProps = Omit<
  ListItemButtonProps<typeof Link>,
  "component" | "href"
> & {
  href: string;
};

export function LinkListItemButton(props: LinkListItemButtonProps) {
  return <ListItemButton component={Link} {...props} />;
}

export type LinkMuiLinkProps = Omit<MuiLinkProps<typeof Link>, "component" | "href"> & {
  href: string;
};

export function LinkMuiLink(props: LinkMuiLinkProps) {
  return <MuiLink component={Link} {...props} />;
}

export type LinkCardProps = Omit<CardProps<typeof Link>, "component" | "href"> & {
  href: string;
};

export function LinkCard(props: LinkCardProps) {
  return <Card component={Link} {...props} />;
}

export type LinkChipProps = Omit<ChipProps<typeof Link>, "component" | "href"> & {
  href: string;
};

export function LinkChip(props: LinkChipProps) {
  return <Chip component={Link} {...props} />;
}
