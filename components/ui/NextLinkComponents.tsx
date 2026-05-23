"use client";

import type { ElementType } from "react";
import Link from "next/link";
import { Button, Card, type ButtonProps, type CardProps } from "@mui/material";

type NextLinkButtonProps = Omit<ButtonProps, "component" | "href"> & {
  href: string;
};

type NextLinkCardProps = Omit<CardProps, "component" | "href"> & {
  href: string;
};

const NextLinkComponent = Link as ElementType;

export function NextLinkButton({ href, ...props }: NextLinkButtonProps) {
  return <Button component={NextLinkComponent} href={href} {...props} />;
}

export function NextLinkCard({ href, ...props }: NextLinkCardProps) {
  return <Card component={NextLinkComponent} href={href} {...props} />;
}