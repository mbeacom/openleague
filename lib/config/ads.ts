export type AdsProvider = 'adsense';
export type AdPlacement = 'marketing' | 'dashboard';

const parseBooleanFlag = (value: string | undefined) => value === 'true';

export const ADS_CONFIG = {
  enabled: parseBooleanFlag(process.env.NEXT_PUBLIC_ADS_ENABLED),
  provider: 'adsense' as AdsProvider,
  adsenseClient: process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_CLIENT ?? '',
  slots: {
    marketing: process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_MARKETING_SLOT ?? '',
    dashboard: process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_DASHBOARD_SLOT ?? '',
  } satisfies Record<AdPlacement, string>,
} as const;

export function isAdsEnabled() {
  return ADS_CONFIG.enabled && Boolean(ADS_CONFIG.adsenseClient);
}

export function getConfiguredAdSlot(placement: AdPlacement) {
  return ADS_CONFIG.slots[placement];
}
