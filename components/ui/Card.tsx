import MuiCard, { CardProps as MuiCardProps } from '@mui/material/Card';
import CardContent, { CardContentProps } from '@mui/material/CardContent';
import CardActions, { CardActionsProps } from '@mui/material/CardActions';

export type CardProps = MuiCardProps;

export function Card({ children, ...props }: CardProps) {
  return <MuiCard {...props}>{children}</MuiCard>;
}

Card.Content = function CardContentWrapper({ children, ...props }: CardContentProps) {
  return <CardContent {...props}>{children}</CardContent>;
};

Card.Actions = function CardActionsWrapper({ children, ...props }: CardActionsProps) {
  return <CardActions {...props}>{children}</CardActions>;
};
