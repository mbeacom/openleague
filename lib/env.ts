import { z } from 'zod'

const normalizeBooleanString = (value: unknown) => {
    if (typeof value !== 'string') {
        return value
    }

    switch (value.trim().toLowerCase()) {
        case 'true':
        case '1':
        case 'yes':
        case 'on':
            return 'true'
        case 'false':
        case '0':
        case 'no':
        case 'off':
        case '':
            return 'false'
        default:
            return value
    }
}

const normalizeOptionalBooleanString = (value: string | undefined): 'true' | 'false' | undefined => {
    const normalized = normalizeBooleanString(value)
    return normalized === 'true' || normalized === 'false' ? normalized : undefined
}

// Environment variable schema
const envSchema = z.object({
    // Database
    DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection string'),

    // Authentication
    NEXTAUTH_URL: z.string().url('NEXTAUTH_URL must be a valid URL'),
    NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 characters long'),

    // Email Service
    MAILCHIMP_API_KEY: z.string().min(1, 'MAILCHIMP_API_KEY is required'),
    EMAIL_FROM: z.string().email('EMAIL_FROM must be a valid email address'),

    // Node Environment
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    // Cron job authentication
    CRON_SECRET: z.string().min(32, 'CRON_SECRET must be at least 32 characters long').optional(),

    // Protected uptime/readiness checks
    UPTIME_CHECK_TOKEN: z.string().min(32, 'UPTIME_CHECK_TOKEN must be at least 32 characters long').optional(),

    // Analytics and Tracking (optional)
    NEXT_PUBLIC_UMAMI_WEBSITE_ID: z.string().optional(),
    NEXT_PUBLIC_GA_MEASUREMENT_ID: z.string().optional(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
    SENTRY_ORG: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
    SENTRY_AUTH_TOKEN: z.string().optional(),
    NEXT_PUBLIC_VERCEL_ANALYTICS_ID: z.string().optional(),
    NEXT_PUBLIC_HOTJAR_ID: z.string().optional(),
    NEXT_PUBLIC_MIXPANEL_TOKEN: z.string().optional(),

    // Optional advertising controls (disabled unless explicitly enabled)
    NEXT_PUBLIC_ADS_ENABLED: z.preprocess(normalizeBooleanString, z.enum(['true', 'false']).optional()),
    NEXT_PUBLIC_GOOGLE_ADSENSE_CLIENT: z.string().optional(),
    NEXT_PUBLIC_GOOGLE_ADSENSE_MARKETING_SLOT: z.string().optional(),
    NEXT_PUBLIC_GOOGLE_ADSENSE_DASHBOARD_SLOT: z.string().optional(),

    // Optional AWS variables (for future migration)
    AWS_REGION: z.string().optional(),

    // Payments — Stripe Connect (optional; payments disabled when unset)
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_CONNECT_WEBHOOK_SECRET: z.string().optional(),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
    // Default platform application fee in basis points (e.g. 250 = 2.5%). Overridable per organization.
    STRIPE_PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(10000).optional(),

    // Media storage — Vercel Blob (optional; event media galleries hidden when unset)
    BLOB_READ_WRITE_TOKEN: z.string().optional(),
    // Signup-event waitlist offer claim window in hours (clamped to event start at runtime)
    EVENT_WAITLIST_CLAIM_HOURS: z.coerce.number().int().min(1).max(168).optional(),
    // Minimum age classification allowing game scores/statistics (USA Hockey ADM: no stats at 8U and below)
    STATS_MIN_AGE_LEVEL: z
        .enum(['U6', 'U8', 'SQUIRT_U10', 'PEEWEE_U12', 'BANTAM_U14', 'U16', 'U18', 'JUNIOR', 'ADULT', 'OPEN'])
        .optional(),
})

// Validate environment variables
function validateEnv() {
    // Skip validation during build time and test time
    if (process.env.NEXT_PHASE === 'phase-production-build' || process.env.NODE_ENV === 'test') {
        return {
            DATABASE_URL: process.env.DATABASE_URL || '',
            NEXTAUTH_URL: process.env.NEXTAUTH_URL || '',
            NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || '',
            MAILCHIMP_API_KEY: process.env.MAILCHIMP_API_KEY || '',
            EMAIL_FROM: process.env.EMAIL_FROM || '',
            NODE_ENV: (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test',
            CRON_SECRET: process.env.CRON_SECRET,
            UPTIME_CHECK_TOKEN: process.env.UPTIME_CHECK_TOKEN,
            NEXT_PUBLIC_UMAMI_WEBSITE_ID: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
            NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
            NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
            SENTRY_ORG: process.env.SENTRY_ORG,
            SENTRY_PROJECT: process.env.SENTRY_PROJECT,
            SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
            NEXT_PUBLIC_VERCEL_ANALYTICS_ID: process.env.NEXT_PUBLIC_VERCEL_ANALYTICS_ID,
            NEXT_PUBLIC_HOTJAR_ID: process.env.NEXT_PUBLIC_HOTJAR_ID,
            NEXT_PUBLIC_MIXPANEL_TOKEN: process.env.NEXT_PUBLIC_MIXPANEL_TOKEN,
            NEXT_PUBLIC_ADS_ENABLED: normalizeOptionalBooleanString(process.env.NEXT_PUBLIC_ADS_ENABLED),
            NEXT_PUBLIC_GOOGLE_ADSENSE_CLIENT: process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_CLIENT,
            NEXT_PUBLIC_GOOGLE_ADSENSE_MARKETING_SLOT: process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_MARKETING_SLOT,
            NEXT_PUBLIC_GOOGLE_ADSENSE_DASHBOARD_SLOT: process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_DASHBOARD_SLOT,
            AWS_REGION: process.env.AWS_REGION,
            STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
            STRIPE_CONNECT_WEBHOOK_SECRET: process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
            NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
            STRIPE_PLATFORM_FEE_BPS: process.env.STRIPE_PLATFORM_FEE_BPS
                ? Number(process.env.STRIPE_PLATFORM_FEE_BPS)
                : undefined,
            BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
            EVENT_WAITLIST_CLAIM_HOURS: process.env.EVENT_WAITLIST_CLAIM_HOURS
                ? Number(process.env.EVENT_WAITLIST_CLAIM_HOURS)
                : undefined,
            STATS_MIN_AGE_LEVEL: process.env.STATS_MIN_AGE_LEVEL as Env['STATS_MIN_AGE_LEVEL'],
        }
    }

    try {
        const env = envSchema.parse(process.env)
        return env
    } catch (error) {
        if (error instanceof z.ZodError) {
            const missingVars = error.issues.map((err: z.ZodIssue) => {
                const path = err.path.join('.')
                return `❌ ${path}: ${err.message}`
            }).join('\n')

            console.error('🚨 Environment variable validation failed:\n')
            console.error(missingVars)
            console.error('\n📋 Required environment variables:')
            console.error('   DATABASE_URL - PostgreSQL connection string')
            console.error('   NEXTAUTH_URL - Application URL (e.g., http://localhost:3000)')
            console.error('   NEXTAUTH_SECRET - Random secret (generate with: openssl rand -base64 32)')
            console.error('   MAILCHIMP_API_KEY - Mailchimp Transactional API key')
            console.error('   EMAIL_FROM - Sender email address')
            console.error('\n💡 Copy .env.example to .env.local and fill in the values')

            process.exit(1)
        }
        throw error
    }
}

// Export validated environment variables
export const env = validateEnv()

// Type-safe environment variables
export type Env = z.infer<typeof envSchema>

// Helper function to check if we're in production
export const isProduction = env.NODE_ENV === 'production'
export const isDevelopment = env.NODE_ENV === 'development'
export const isTest = env.NODE_ENV === 'test'

// Helper to get the base URL
export const getBaseUrl = () => {
    if (typeof window !== 'undefined') {
        // Browser should use relative URL
        return ''
    }

    // On the server, NEXTAUTH_URL is guaranteed to be set by env validation.
    return env.NEXTAUTH_URL
}

// Payments helpers
export const isStripeConfigured = Boolean(env.STRIPE_SECRET_KEY)
export const DEFAULT_PLATFORM_FEE_BPS = env.STRIPE_PLATFORM_FEE_BPS ?? 0

// Media storage helpers
export const isBlobConfigured = Boolean(env.BLOB_READ_WRITE_TOKEN)

// Signup-event helpers
export const EVENT_WAITLIST_CLAIM_HOURS = env.EVENT_WAITLIST_CLAIM_HOURS ?? 24
export const STATS_MIN_AGE_LEVEL = env.STATS_MIN_AGE_LEVEL ?? 'SQUIRT_U10'
