#!/usr/bin/env bun
/**
 * Authentication Diagnostic Tool
 *
 * This script helps diagnose authentication issues by checking:
 * - Environment variables
 * - Database connectivity
 * - User approval status
 * - Auth configuration
 */

import { PrismaClient } from '@prisma/client'
import { env, isProduction, isDevelopment } from '@/lib/env'

const prisma = new PrismaClient()

async function runDiagnostics() {
  console.log('🔍 OpenLeague Authentication Diagnostics\n')
  console.log('='.repeat(60))

  // Check environment
  console.log('\n📋 Environment Configuration:')
  console.log(`   Node Environment: ${env.NODE_ENV}`)
  console.log(`   Production Mode: ${isProduction ? '✅' : '❌'}`)
  console.log(`   Development Mode: ${isDevelopment ? '✅' : '❌'}`)

  // Check Auth.js environment variables
  console.log('\n🔐 Auth.js Configuration:')
  console.log(`   NEXTAUTH_URL: ${env.NEXTAUTH_URL}`)
  console.log(`   NEXTAUTH_SECRET: ${env.NEXTAUTH_SECRET ? '✅ Set (' + env.NEXTAUTH_SECRET.length + ' chars)' : '❌ Missing'}`)

  if (env.NEXTAUTH_SECRET && env.NEXTAUTH_SECRET.length < 32) {
    console.log('   ⚠️  WARNING: NEXTAUTH_SECRET should be at least 32 characters!')
  }

  // Check if AUTH_TRUST_HOST is set (optional but recommended for production)
  const authTrustHost = process.env.AUTH_TRUST_HOST
  console.log(`   AUTH_TRUST_HOST: ${authTrustHost || '❌ Not set (recommended for production)'}`)

  // Check database connectivity
  console.log('\n💾 Database Connection:')
  try {
    await prisma.$connect()
    console.log('   Status: ✅ Connected')

    const userCount = await prisma.user.count()
    console.log(`   Total Users: ${userCount}`)

    if (userCount === 0) {
      console.log('   ⚠️  WARNING: No users found. Run: bun prisma db seed')
    }
  } catch (error) {
    console.log('   Status: ❌ Failed to connect')
    console.log('   Error:', error instanceof Error ? error.message : error)
  }

  // Check user approval status
  console.log('\n👤 User Approval Status:')
  try {
    const users = await prisma.user.findMany({
      select: {
        email: true,
        approved: true,
        name: true,
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10, // Show last 10 users
    })

    if (users.length === 0) {
      console.log('   ❌ No users found')
    } else {
      const approvedCount = users.filter(u => u.approved).length
      const unapprovedCount = users.filter(u => !u.approved).length

      console.log(`   Approved: ${approvedCount}`)
      console.log(`   Unapproved: ${unapprovedCount}`)

      if (unapprovedCount > 0) {
        console.log('\n   Unapproved Users:')
        users.filter(u => !u.approved).forEach(user => {
          console.log(`   - ${user.email} (${user.name || 'No name'})`)
        })
        console.log('\n   Run: bun run scripts/approve-existing-users.ts')
      } else {
        console.log('   ✅ All users are approved')
      }
    }
  } catch (error) {
    console.log('   ❌ Error checking users:', error instanceof Error ? error.message : error)
  }

  // Check email configuration
  console.log('\n📧 Email Configuration:')
  console.log(`   EMAIL_PROVIDER: ${env.EMAIL_PROVIDER ?? '(unset — inferred from credentials)'}`)
  console.log(`   MAILCHIMP_API_KEY: ${env.MAILCHIMP_API_KEY ? '✅ Set' : '— not set'}`)
  console.log(`   AWS_REGION (SES): ${env.AWS_REGION ?? '— not set'}`)
  console.log(`   EMAIL_FROM: ${env.EMAIL_FROM}`)

  // Check optional analytics
  console.log('\n📊 Analytics Configuration (Optional):')
  console.log(`   Umami: ${process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ? '✅ Enabled' : '❌ Disabled'}`)
  console.log(`   Google Analytics: ${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ? '✅ Enabled' : '❌ Disabled'}`)
  console.log(`   Sentry: ${process.env.NEXT_PUBLIC_SENTRY_DSN ? '✅ Enabled' : '❌ Disabled'}`)

  console.log('\n' + '='.repeat(60))
  console.log('\n✅ Diagnostics Complete\n')

  // Summary and recommendations
  console.log('📝 Recommendations:')
  const recommendations: string[] = []

  if (!authTrustHost && isProduction) {
    recommendations.push('Set AUTH_TRUST_HOST=true in production environment')
  }

  if (env.NEXTAUTH_SECRET && env.NEXTAUTH_SECRET.length < 32) {
    recommendations.push('Generate a longer NEXTAUTH_SECRET (at least 32 chars)')
  }

  try {
    const unapprovedCount = await prisma.user.count({ where: { approved: false } })
    if (unapprovedCount > 0) {
      recommendations.push(`Approve ${unapprovedCount} pending user(s)`)
    }
  } catch (error) {
    // Ignore error in recommendations
  }

  if (recommendations.length === 0) {
    console.log('   ✅ No issues found!')
  } else {
    recommendations.forEach((rec, index) => {
      console.log(`   ${index + 1}. ${rec}`)
    })
  }

  console.log('')

  await prisma.$disconnect()
}

// Run diagnostics
runDiagnostics()
  .catch(error => {
    console.error('\n❌ Diagnostics failed:', error)
    process.exit(1)
  })
