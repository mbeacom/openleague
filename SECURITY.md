# Security Implementation

This document outlines the security measures implemented in the openleague application.

## Authentication & Authorization

### Session Management
- **JWT Strategy**: Uses Auth.js with JWT tokens for stateless authentication
- **Session Duration**: 7 days maximum
- **Secure Cookies**: HTTP-only cookies with secure flag in production
- **CSRF Protection**: Built-in CSRF protection via Auth.js

### Password Security
- **Hashing**: bcrypt with cost factor 12
- **Length Requirements**: 8-128 characters
- **No Password Storage**: Only hashed passwords stored in database

### Authorization Levels
- **Team Admin**: Can create/edit/delete events, manage roster, send invitations
- **Team Member**: Can view team data, RSVP to events
- **Authorization Checks**: All Server Actions verify user permissions before execution

## Input Validation & Sanitization

### Zod Validation Schemas
- **Type Safety**: All inputs validated with TypeScript + Zod
- **Length Limits**: Maximum lengths enforced on all string fields
- **Format Validation**: Email, CUID, and enum validation
- **Sanitization**: Automatic trimming and dangerous character removal

### SQL Injection Prevention
- **Prisma ORM**: All database queries use parameterized queries
- **No Raw SQL**: Direct SQL queries are not used
- **Input Sanitization**: Additional sanitization for SQL-like patterns

### XSS Prevention
- **HTML Sanitization**: Dangerous HTML/script content removed
- **Content Security Policy**: Strict CSP headers implemented
- **Output Encoding**: React's built-in XSS protection

## Network Security

### HTTPS Enforcement
- **Production HTTPS**: Automatic redirect to HTTPS in production
- **HSTS Headers**: Strict Transport Security with preload
- **Secure Cookies**: Cookies only sent over HTTPS in production

### Security Headers
```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: [strict policy]
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### Rate Limiting
- **API Protection**: 100 requests per 15 minutes for general endpoints
- **Auth Protection**: 5 requests per 15 minutes for authentication
- **IP-based**: Rate limiting by IP address and user agent
- **Graceful Degradation**: Proper error responses with retry headers

## Data Protection

### Database Security
- **Connection Security**: Encrypted connections to Neon PostgreSQL
- **Row-Level Security**: Users can only access their team data
- **Audit Trail**: Created/updated timestamps on all records
- **Soft Deletes**: Important data uses soft deletion where appropriate

### Sensitive Data Handling
- **Emergency Contacts**: Only visible to team admins
- **Email Addresses**: Normalized and validated
- **Phone Numbers**: Sanitized format
- **No PII Logging**: Sensitive data excluded from error logs

## Email Security

### Invitation System
- **Cryptographic Tokens**: 32-byte random tokens for invitations
- **Token Expiration**: 7-day expiration on invitation links
- **Single Use**: Tokens invalidated after use
- **Email Validation**: Strict email format validation

### Email Content
- **Template-based**: All emails use predefined templates
- **No User Content**: User-generated content sanitized before email inclusion
- **Unsubscribe**: Future implementation planned

## Error Handling

### Information Disclosure Prevention
- **Generic Errors**: Production errors don't expose internal details
- **Safe Error Messages**: Only whitelisted error messages shown to users
- **Logging Sanitization**: Sensitive data removed from logs
- **Stack Traces**: Only shown in development environment

### Error Monitoring
- **Structured Logging**: Consistent error format
- **Error Boundaries**: React error boundaries prevent crashes
- **Graceful Degradation**: Fallback UI for error states

## API Security

### Server Actions
- **Authentication Required**: All mutations require valid session
- **Authorization Checks**: Team membership verified for all operations
- **Input Validation**: Zod schemas validate all inputs
- **Error Handling**: Consistent error response format

### API Routes
- **Rate Limited**: All API routes protected by rate limiting
- **CORS**: Strict CORS policy (same-origin only)
- **Content Type**: JSON content type enforced
- **Request Size**: Implicit limits via Next.js

## Deployment Security

### Environment Variables
- **Secret Management**: All secrets in environment variables
- **No Hardcoded Secrets**: No secrets in source code
- **Environment Separation**: Different secrets for dev/staging/production

### Production Configuration
- **HTTPS Only**: All traffic over HTTPS
- **Security Headers**: Comprehensive security headers
- **Error Pages**: Custom error pages don't expose internals
- **Monitoring**: Error tracking and performance monitoring

## Security Checklist

### Authentication ✅
- [x] Secure password hashing (bcrypt)
- [x] JWT session management
- [x] HTTP-only secure cookies
- [x] CSRF protection
- [x] Session expiration

### Authorization ✅
- [x] Role-based access control
- [x] Server-side permission checks
- [x] Team-level data isolation
- [x] Admin-only operations protected

### Input Validation ✅
- [x] Zod schema validation
- [x] Input sanitization
- [x] SQL injection prevention
- [x] XSS prevention
- [x] CUID format validation

### Network Security ✅
- [x] HTTPS enforcement
- [x] Security headers
- [x] Rate limiting
- [x] Content Security Policy

### Data Protection ✅
- [x] Encrypted database connections
- [x] Row-level security
- [x] Sensitive data access control
- [x] Audit trails

## Future Security Enhancements

### Planned Improvements
- [ ] Two-factor authentication (2FA)
- [ ] Account lockout after failed attempts
- [ ] Email verification for new accounts
- [ ] Advanced rate limiting with Redis
- [ ] Security audit logging
- [ ] Penetration testing
- [ ] OWASP compliance audit

### Monitoring & Alerting
- [ ] Security event monitoring
- [ ] Failed login attempt alerts
- [ ] Unusual activity detection
- [ ] Automated security scanning

## Security Contact

For security issues or questions, please contact the development team through the appropriate channels. Do not post security issues in public repositories.

## Compliance

This application implements security measures aligned with:
- OWASP Top 10 protection
- NIST Cybersecurity Framework
- General data protection best practices
- Industry standard authentication practices