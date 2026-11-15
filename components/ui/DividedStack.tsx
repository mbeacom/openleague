"use client";

import { Divider, Stack, type StackProps } from "@mui/material";

/**
 * A Stack with a full-height Divider between each child, for Server Components.
 *
 * Passing `divider={<Divider flexItem />}` to Stack from a Server Component
 * breaks server rendering as soon as the Stack has two or more children. The
 * element reaches Stack as a client reference, and Stack's cloneElement of it
 * renders an undefined type ("Element type is invalid ... got: undefined").
 * React then falls back to client rendering, so the page still works but loses
 * its server render. Creating the Divider here, inside the client graph, avoids
 * that. Client components may keep passing `divider` directly.
 */
export function DividedStack(props: Omit<StackProps, "divider">) {
  return <Stack divider={<Divider flexItem />} {...props} />;
}
