# Deployment Guide

## Overview

OpenLeague is designed for easy deployment on Vercel with automatic database migrations, environment validation, and production-ready security configurations. This guide covers the complete deployment process from setup to monitoring.

## Vercel Deployment (Recommended)

This application is optimized for deployment on Vercel with the following configuration:

### Prerequisites

1. **Neon Database**: Set up a PostgreSQL database on [Neon](https://console.neon.tech)
2. **Mailchimp Transactional**: Set up an account and get API key from [Mandrill](https://mandrillapp.com/settings)
3. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
4. **Domain** (Optional): Custom domain for production use
5. **GitHub Repository**: Code repository connected to Vercel

### Environment Variables

The application includes automatic environment variable validation on startup. Configure the following environment variables in your Vercel project dashboard:

#### Required Variables

```bash
# Database Connection
DATABASE_URL="postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require"

# Authentication
NEXTAUTH_URL="https://your-domain.vercel.app"
NEXTAUTH_SECRET="your-generated-secret-here"

# Email Service
MAILCHIMP_API_KEY="your-mailchimp-transactional-api-key"
EMAIL_FROM="noreply@yourdomain.com"
```

#### How to Set Environment Variables in Vercel

1. Go to your project dashboard on Vercel
2. Navigate to **Settings** → **Environment Variables**
3. Add each variable with appropriate values for each environment:
   - **Production**: Live database and email credentials
   - **Preview**: Staging/preview database (optional)
   - **Development**: Local development values (optional)

#### Environment Variable Security

- **Never commit** `.env.local` or `.env.production` files
- **Use strong secrets**: Generate `NEXTAUTH_SECRET` with `openssl rand -base64 32`
- **Verify domains**: Ensure `EMAIL_FROM` domain is verified in Mailchimp
- **Test locally**: Run `bun run validate-env` before deployment

### Database Setup

#### Neon Database Configuration

1. Create a new project on [Neon Console](https://console.neon.tech)
2. Copy the connection string from the dashboard
3. Add `?sslmode=require` to the end of the connection string
4. Set as `DATABASE_URL` environment variable in Vercel

#### Database Migrations

Migrations run automatically on deployment via the build process. The `postinstall` script in `package.json` handles this:

```json
{
  "scripts": {
    "postinstall": "prisma generate && prisma migrate deploy"
  }
}
```

### Email Service Setup

#### Mailchimp Transactional (Mandrill)

1. Sign up for Mailchimp Transactional at [mandrillapp.com](https://mandrillapp.com)
2. Generate an API key in Settings → SMTP & API Info
3. Set the API key as `MAILCHIMP_API_KEY` in Vercel
4. Configure `EMAIL_FROM` with your verified sender email

### Security Configuration

The `vercel.json` file includes security headers:

- **HTTPS Enforcement**: Strict Transport Security
- **XSS Protection**: Content type and frame options
- **CSRF Protection**: Via Auth.js configuration

### Deployment Process

#### Step 1: Prepare Repository

```bash
# Ensure all changes are committed
git add .
git commit -m "feat: ready for production deployment"
git push origin main
```

#### Step 2: Connect to Vercel

##### Option A: Vercel CLI (Recommended)

```bash
# Install Vercel CLI globally
bun add -g vercel

# Deploy from project directory
vercel

# Follow prompts to link repository and configure
```

##### Option B: Vercel Dashboard

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"New Project"**
3. Import your GitHub repository
4. Configure settings (see below)

#### Step 3: Configure Build Settings

Vercel automatically detects Next.js projects, but verify these settings:

- **Framework Preset**: Next.js
- **Build Command**: `bun run build` (configured in `vercel.json`)
- **Install Command**: `bun install` (configured in `vercel.json`)
- **Output Directory**: `.next` (automatic)
- **Node.js Version**: 22.x (latest LTS)

#### Step 4: Set Environment Variables

Add all required variables in Vercel dashboard:

1. Go to **Settings** → **Environment Variables**
2. Add each variable for Production environment
3. Optionally add Preview environment variables for staging

#### Step 5: Deploy

- **Automatic**: Push to `main` branch triggers deployment
- **Manual**: Click "Deploy" in Vercel dashboard
- **CLI**: Run `vercel --prod` for production deployment

#### Step 6: Verify Deployment

1. **Check Build Logs**: Ensure no errors during build
2. **Test Database**: Verify database connection and migrations
3. **Test Email**: Send a test invitation to verify email service
4. **Test Authentication**: Create account and login
5. **Test Core Features**: Create team, add players, create events

### Cron Jobs

The application includes a cron job for RSVP reminders:

```json
{
  "crons": [
    {
      "path": "/api/cron/rsvp-reminders",
      "schedule": "0 * * * *"
    }
  ]
}
```

This runs every hour to check for events needing RSVP reminders.

## Alternative Deployment Options

### Docker Deployment

For self-hosting or other cloud providers:

```dockerfile
# Dockerfile
FROM oven/bun:1-alpine

WORKDIR /app

# Copy package files and install dependencies to leverage Docker cache
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma client and build
RUN bunx prisma generate
RUN bun run build

EXPOSE 3000

# Start application
CMD ["bun", "run", "start"]
```

```bash
# Build and run
docker build -t openleague .
docker run -p 3000:3000 --env-file .env.production openleague
```

### AWS/DigitalOcean/Railway Deployment

1. **Prepare Environment**:

   ```bash
   # Set all environment variables on your platform
   export DATABASE_URL="your-neon-connection-string"
   export NEXTAUTH_SECRET="your-secret"
   # ... other variables
   ```

2. **Build and Deploy**:

   ```bash
   bun install
   bunx prisma generate
   bunx prisma migrate deploy
   bun run build
   bun run start
   ```

3. **Process Management** (for VPS):

   ```bash
   # Using PM2
   bun add -g pm2
   pm2 start "bun run start" --name openleague
   pm2 startup
   pm2 save
   ```

## Post-Deployment Configuration

### Custom Domain Setup

1. **Add Domain in Vercel**:

   - Go to project **Settings** → **Domains**
   - Add your custom domain
   - Follow DNS configuration instructions

2. **Update Environment Variables**:

   ```bash
   NEXTAUTH_URL="https://yourdomain.com"
   EMAIL_FROM="noreply@yourdomain.com"
   ```

3. **Verify SSL Certificate**:
   - Vercel automatically provisions SSL certificates
   - Verify HTTPS is working correctly

### Email Domain Verification

1. **Add Domain to Mailchimp**:

   - Go to Mailchimp → Settings → Sending Domains
   - Add your domain and verify DNS records

2. **Test Email Delivery**:
   - Send test invitations
   - Check spam folders and delivery rates
   - Monitor Mailchimp delivery reports

### Database Optimization

1. **Connection Pooling**: Neon handles this automatically
2. **Backup Strategy**: Neon provides automatic backups
3. **Monitoring**: Set up alerts in Neon dashboard
4. **Scaling**: Neon auto-scales based on usage

## Monitoring and Maintenance

### Built-in Monitoring

- **Vercel Analytics**: Performance and usage metrics
- **Vercel Function Logs**: Runtime logs and errors
- **Neon Dashboard**: Database performance and connections
- **Mailchimp Reports**: Email delivery and engagement

### Recommended Additional Monitoring

```bash
# Add to your monitoring stack
- Error Tracking: Sentry
- Uptime Monitoring: UptimeRobot or Pingdom
- Performance: Vercel Speed Insights
- User Analytics: Vercel Analytics or Google Analytics
```

### Maintenance Tasks

**Weekly:**

- Review Vercel function logs for errors
- Check Neon database performance metrics
- Monitor email delivery rates in Mailchimp

**Monthly:**

- Review and rotate API keys if needed
- Check for Next.js and dependency updates
- Review user feedback and feature requests

**Quarterly:**

- Database performance optimization
- Security audit and dependency updates
- Backup and disaster recovery testing

## Troubleshooting

### Pre-Deployment Issues

#### Environment Variable Validation Fails

```bash
# Run validation locally
bun run validate-env

# Common fixes:
# - Ensure all required variables are set
# - Generate new NEXTAUTH_SECRET: openssl rand -base64 32
# - Verify DATABASE_URL includes ?sslmode=require
# - Check MAILCHIMP_API_KEY format (starts with 'md-')
```

#### Database Connection Issues

```bash
# Test database connection
bunx prisma db pull

# Common fixes:
# - Verify Neon database is running
# - Check connection string format
# - Ensure IP allowlist includes Vercel (if configured)
# - Test connection from local environment first
```

### Deployment Issues

#### Build Failures

##### Error: "Environment variable validation failed"

```bash
# Solution: Set all required environment variables in Vercel dashboard
# Go to Settings → Environment Variables
# Ensure Production environment has all required variables
```

##### Error: "Database connection failed during build"

```bash
# Solution: Database must be accessible during build for Prisma generation
# Verify DATABASE_URL is correct in Vercel environment variables
# Check Neon database status and connection limits
```

##### Error: "Prisma migration failed"

```bash
# Solution: Ensure database schema is up to date
# Run locally: bunx prisma migrate deploy
# Check migration history: bunx prisma migrate status
# If needed, reset and re-migrate (development only)
```

#### Runtime Issues

##### Error: "NEXTAUTH_URL is not defined"

```bash
# Solution: Set NEXTAUTH_URL in Vercel environment variables
# Production: https://your-domain.vercel.app
# Custom domain: https://yourdomain.com
```

##### Error: "Email sending failed"

```bash
# Check Mailchimp API key is valid
# Verify sender domain is verified in Mailchimp
# Check Mailchimp account status and limits
# Review Mailchimp delivery reports for bounces/spam
```

##### Error: "Database connection pool exhausted"

```bash
# Neon automatically manages connection pooling
# Check Neon dashboard for connection limits
# Consider upgrading Neon plan if needed
# Review database query performance
```

### Post-Deployment Issues

#### Performance Problems

**Slow page loads:**

- Check Vercel Analytics for performance bottlenecks
- Review database query performance in Neon dashboard
- Optimize images and static assets
- Consider implementing caching strategies

**High database usage:**

- Review query patterns in Neon dashboard
- Add database indexes for frequently queried fields
- Optimize Prisma queries for efficiency
- Consider database connection pooling optimization

#### Email Delivery Issues

**Emails not being delivered:**

- Check Mailchimp delivery reports
- Verify sender domain reputation
- Review spam folder and email client filtering
- Test with different email providers

**High bounce rates:**

- Verify email addresses are valid
- Check sender domain authentication (SPF, DKIM)
- Review email content for spam triggers
- Monitor Mailchimp reputation metrics

### Getting Help

#### Self-Diagnosis

1. **Check Logs**:

   ```bash
   # Vercel function logs
   vercel logs --follow

   # Local development logs
   bun run dev
   ```

2. **Test Components**:

   ```bash
   # Database connection
   bunx prisma studio

   # Environment variables
   bun run validate-env

   # Email service (create test invitation)
   ```

3. **Monitor Dashboards**:
   - Vercel: Function logs, analytics, deployment status
   - Neon: Database performance, connections, queries
   - Mailchimp: Delivery reports, account status

#### Community Support

- **GitHub Issues**: [Create an issue](https://github.com/mbeacom/openleague/issues) with:

  - Error messages and stack traces
  - Steps to reproduce the problem
  - Environment details (Node version, deployment platform)
  - Screenshots or logs if applicable

- **Documentation**: Check [README.md](./README.md) for setup instructions

- **External Resources**:
  - [Vercel Documentation](https://vercel.com/docs)
  - [Neon Documentation](https://neon.tech/docs)
  - [Next.js Documentation](https://nextjs.org/docs)
  - [Prisma Documentation](https://www.prisma.io/docs)

## Security Checklist

### Pre-Production Security Review

- [ ] All environment variables are secure and not committed to repository
- [ ] `NEXTAUTH_SECRET` is cryptographically secure (32+ characters)
- [ ] Database connection uses SSL (`?sslmode=require`)
- [ ] Email sender domain is verified and has proper DNS records
- [ ] HTTPS is enforced (automatic with Vercel)
- [ ] Security headers are configured (see `vercel.json`)
- [ ] Input validation is implemented (Zod schemas)
- [ ] SQL injection prevention (Prisma parameterized queries)
- [ ] XSS protection (React built-in + CSP headers)
- [ ] CSRF protection (Auth.js built-in)

### Post-Deployment Security

- [ ] Monitor for unusual database activity
- [ ] Review email delivery patterns for abuse
- [ ] Keep dependencies updated
- [ ] Monitor Vercel security advisories
- [ ] Regular security audits of user data access
- [ ] Backup and disaster recovery procedures tested

This comprehensive deployment guide ensures a secure, performant, and maintainable production deployment of OpenLeague.
