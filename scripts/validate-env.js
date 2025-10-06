#!/usr/bin/env node

/**
 * Environment Variable Validation Script
 *
 * This script validates that all required environment variables are set
 * and provides helpful error messages if any are missing.
 *
 * Usage:
 *   node scripts/validate-env.js
 *   bun run validate-env
 */

console.log('🔍 Validating environment variables...\n')

;(async () => {
  try {
    // Import the env validation (this will throw if validation fails)
    await import('../lib/env.js')

    console.log('✅ All environment variables are valid!')
    console.log('🚀 Your application is ready to run.')

  } catch {
    // Error details are already logged by the env.ts file
    console.log('\n💡 To fix this:')
    console.log('   1. Copy .env.example to .env.local')
    console.log('   2. Fill in all the required values')
    console.log('   3. Run this script again to verify')

    process.exit(1)
  }
})()