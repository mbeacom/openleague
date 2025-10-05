import TextField, { TextFieldProps } from '@mui/material/TextField';

export interface InputProps extends Omit<TextFieldProps, 'variant'> {
  variant?: 'outlined' | 'filled' | 'standard';
}

export function Input({ variant = 'outlined', ...props }: InputProps) {
  return <TextField variant={variant} {...props} />;
}
