# UI Components

This directory contains reusable base UI components built on top of MUI.

## Components

- `Button.tsx` - Styled MUI Button wrapper
- `Input.tsx` - Styled MUI TextField wrapper
- `Card.tsx` - Styled MUI Card wrapper
- `Dialog.tsx` - Styled MUI Dialog wrapper

## Pattern

All UI components:
1. Are thin wrappers around MUI components
2. Maintain consistent theming
3. Ensure minimum 44x44px touch targets
4. Support all MUI props via prop spreading

## Example

```typescript
// components/ui/Button.tsx
import { Button as MuiButton, ButtonProps } from '@mui/material';

export function Button(props: ButtonProps) {
  return (
    <MuiButton
      {...props}
      sx={{
        minHeight: 44,
        minWidth: 44,
        ...props.sx,
      }}
    />
  );
}
```

## Usage

```typescript
import { Button } from '@/components/ui/Button';

<Button variant="contained" color="primary" onClick={handleClick}>
  Submit
</Button>
```
