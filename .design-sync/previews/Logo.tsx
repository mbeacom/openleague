import { Logo } from 'openleague';

const row: React.CSSProperties = { display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' };

export const WithWordmark = () => <Logo size="large" showText href={null} />;

export const IconOnly = () => <Logo size="large" href={null} />;

export const Sizes = () => (
  <div style={row}>
    <Logo size="small" showText href={null} />
    <Logo size="medium" showText href={null} />
    <Logo size="large" showText href={null} />
  </div>
);
