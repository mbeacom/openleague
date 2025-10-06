import { z } from 'zod'

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

    // Optional AWS variables (for future migration)
    AWS_REGION: z.string().optional(),
})

// Validate environment variables
function validateEnv() {
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

    if (env.NEXTAUTH_URL) {
        // Use configured URL
        return env.NEXTAUTH_URL
    }

    // Fallback for development
    return 'http://localhost:3000'
}