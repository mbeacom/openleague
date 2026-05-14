import { ReactNode } from 'react';
import DocsShell from '@/components/features/docs/DocsShell';

interface DocsLayoutProps {
  children: ReactNode;
}

export default function DocsLayout({ children }: DocsLayoutProps) {
  return <DocsShell>{children}</DocsShell>;
}
