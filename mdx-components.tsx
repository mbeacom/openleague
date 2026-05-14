import type { ComponentPropsWithoutRef } from 'react';
import type { MDXComponents } from 'mdx/types';
import { Box, Divider, Link as MuiLink, Typography } from '@mui/material';

function MdxLink({ href, children, ...props }: ComponentPropsWithoutRef<'a'>) {
  if (href?.startsWith('/')) {
    return (
      <MuiLink href={href} {...props}>
        {children}
      </MuiLink>
    );
  }

  return (
    <MuiLink href={href} target="_blank" rel="noreferrer" {...props}>
      {children}
    </MuiLink>
  );
}

const components: MDXComponents = {
  h1: (props) => <Typography variant="h1" component="h1" gutterBottom {...props} />,
  h2: (props) => <Typography variant="h3" component="h2" gutterBottom sx={{ mt: 4 }} {...props} />,
  h3: (props) => <Typography variant="h5" component="h3" gutterBottom sx={{ mt: 3 }} {...props} />,
  p: (props) => <Typography variant="body1" sx={{ mb: 2 }} {...props} />,
  a: MdxLink,
  hr: () => <Divider sx={{ my: 4 }} />,
  ul: (props) => <Box component="ul" sx={{ pl: 3, mb: 2 }} {...props} />,
  ol: (props) => <Box component="ol" sx={{ pl: 3, mb: 2 }} {...props} />,
  li: (props) => <Typography component="li" variant="body1" sx={{ mb: 1 }} {...props} />,
  blockquote: (props) => (
    <Box
      component="blockquote"
      sx={{
        borderLeft: 4,
        borderColor: 'primary.main',
        color: 'text.secondary',
        m: 0,
        mb: 2,
        pl: 2,
      }}
      {...props}
    />
  ),
  pre: (props) => (
    <Box
      component="pre"
      data-testid="mdx-code-block"
      sx={{
        bgcolor: 'grey.900',
        borderRadius: 2,
        color: 'common.white',
        fontSize: '0.9rem',
        lineHeight: 1.7,
        mb: 3,
        overflowX: 'auto',
        p: 2,
      }}
      {...props}
    />
  ),
  code: ({ className, ...props }: ComponentPropsWithoutRef<'code'>) => {
    const language = className?.replace('language-', '');

    return (
      <Box
        component="code"
        data-language={language}
        sx={{
          bgcolor: className ? 'transparent' : 'action.hover',
          borderRadius: 0.75,
          color: className ? 'inherit' : 'primary.dark',
          fontFamily: 'var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace',
          px: className ? 0 : 0.5,
          py: className ? 0 : 0.25,
        }}
        {...props}
      />
    );
  },
};

export function useMDXComponents(): MDXComponents {
  return components;
}
