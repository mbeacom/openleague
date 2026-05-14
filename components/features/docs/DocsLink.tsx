"use client";

import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import Link from 'next/link';
import { Button, Link as MuiLink } from '@mui/material';

interface DocsLinkButtonProps {
  children: ReactNode;
  href: string;
}

type DocsMuiLinkProps = Omit<ComponentPropsWithoutRef<'a'>, 'href'> & {
  href: string;
};

export function DocsLinkButton({ children, href }: DocsLinkButtonProps) {
  return (
    <Button size="small" component={Link} href={href}>
      {children}
    </Button>
  );
}

export function DocsMuiLink({ children, href, ...props }: DocsMuiLinkProps) {
  return (
    <MuiLink component={Link} href={href} {...props}>
      {children}
    </MuiLink>
  );
}