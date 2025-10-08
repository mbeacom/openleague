import { ReactNode } from 'react';
import { Container, Box } from '@mui/material';

interface DocsLayoutProps {
  children: ReactNode;
}

export default function DocsLayout({ children }: DocsLayoutProps) {
  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        {/* Documentation layout wrapper */}
        <main>
          {children}
        </main>
      </Box>
    </Container>
  );
}