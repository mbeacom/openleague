import MuiDialog, { DialogProps as MuiDialogProps } from '@mui/material/Dialog';
import DialogTitle, { DialogTitleProps } from '@mui/material/DialogTitle';
import DialogContent, { DialogContentProps } from '@mui/material/DialogContent';
import DialogActions, { DialogActionsProps } from '@mui/material/DialogActions';

export type DialogProps = MuiDialogProps;

export function Dialog({ children, ...props }: DialogProps) {
  return <MuiDialog {...props}>{children}</MuiDialog>;
}

Dialog.Title = function DialogTitleWrapper({ children, ...props }: DialogTitleProps) {
  return <DialogTitle {...props}>{children}</DialogTitle>;
};

Dialog.Content = function DialogContentWrapper({ children, ...props }: DialogContentProps) {
  return <DialogContent {...props}>{children}</DialogContent>;
};

Dialog.Actions = function DialogActionsWrapper({ children, ...props }: DialogActionsProps) {
  return <DialogActions {...props}>{children}</DialogActions>;
};
