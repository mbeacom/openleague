/**
 * Shared pricing configuration for marketing pages
 * Maintains consistency across pricing page and get-started flow
 */

export interface PricingPlan {
  name: string;
  price: string;
  pricePerMonth: number;
  features: string[];
  highlighted?: boolean;
  highlightLabel?: string;
}

export interface ComparisonPoint {
  feature: string;
  price: string;
  limit: string;
}

export const PRICING_PLANS: Record<'starter' | 'pro', PricingPlan> = {
  starter: {
    name: 'Starter',
    price: '$5',
    pricePerMonth: 5,
    features: [
      'Up to 25 team members',
      'Unlimited events and games',
      'RSVP tracking',
      'Email notifications',
      'Mobile app access',
      'Basic roster management',
      'Community support',
    ],
  },
  pro: {
    name: 'Pro',
    price: '$15',
    pricePerMonth: 15,
    features: [
      'Everything in Starter',
      'Unlimited team members',
      'League management',
      'Division organization',
      'Advanced communication tools',
      'Multiple teams',
      'Priority email support',
      'Custom branding (coming soon)',
    ],
    highlighted: true,
    highlightLabel: 'Most Popular',
  },
};

export const COMPARISON_POINTS: ComparisonPoint[] = [
  { feature: 'OpenLeague Starter', price: '$5/mo', limit: 'Up to 25 members' },
  { feature: 'OpenLeague Pro', price: '$15/mo', limit: 'Unlimited' },
  { feature: 'TeamSnap', price: '$13.99/mo', limit: 'Per team, limited' },
  { feature: 'SportsEngine', price: '$19.99/mo', limit: 'Per team' },
  { feature: 'Spreadsheets', price: 'Free', limit: 'Manual & error-prone' },
];
