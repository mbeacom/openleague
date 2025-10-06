# Deployment Guide

## Vercel Deployment

This application is optimized for deployment on Vercel with the following configuration:

### Prerequisites

1. **Neon Database**: Set up a PostgreSQL database on [Neon](https://console.neon.tech)
2. **Mailchimp Transactional**: Set up an account and get API key from [Mandrill](https://mandrillapp.com/settings)
3. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)

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

1. **Connect Repository**: Link your GitHub repository to Vercel
2. **Configure Build Settings**:
   - Framework Preset: Next.js
   - Build Command: `bun run build` (configured in vercel.json)
   - Install Command: `bun install` (configured in vercel.json)
3. **Set Environment Variables**: Add all required variables
4. **Validate Configuration**: Run `bun run validate-env` locally to test
5. **Deploy**: Push to main branch or deploy manually

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

### Monitoring

- **Vercel Analytics**: Automatically enabled for performance monitoring
- **Function Logs**: Available in Vercel dashboard under Functions tab
- **Database Monitoring**: Available in Neon dashboard

### Troubleshooting

#### Common Issues

1. **Database Connection Errors**:
   - Verify `DATABASE_URL` includes `?sslmode=require`
   - Check Neon database is active and accessible

2. **Email Sending Failures**:
   - Verify `MAILCHIMP_API_KEY` is correct
   - Check sender email is verified in Mailchimp

3. **Authentication Issues**:
   - Ensure `NEXTAUTH_SECRET` is set and secure
   - Verify `NEXTAUTH_URL` matches your domain

4. **Build Failures**:
   - Run `bun run validate-env` to check environment variables
   - Check all environment variables are set in Vercel dashboard
   - Verify database is accessible during build

#### Getting Help

- Check Vercel function logs for runtime errors
- Review Neon database logs for connection issues
- Verify environment variables in Vercel dashboard
