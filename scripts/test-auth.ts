#!/usr/bin/env bun
/**
 * Test Authentication Locally
 *
 * This script tests the authentication system by attempting to login
 * with test credentials and verifying the response.
 */

async function testLogin() {
  console.log('🧪 Testing Authentication System\n')
  console.log('This script is intended to be run from the browser console.')
  console.log('Copy and paste this into your browser console while on the login page:\n')

  console.log(`
// Test login with admin account
async function testAdminLogin() {
  console.log('🔐 Testing admin login...');

  const result = await fetch('/api/auth/callback/credentials', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'admin@test.com',
      password: 'admin123',
      redirect: false,
    }),
  });

  const data = await result.json();
  console.log('Response:', data);

  if (data.error) {
    console.error('❌ Login failed:', data.error);
  } else {
    console.log('✅ Login successful!');
    // Check session
    const session = await fetch('/api/auth/session').then(r => r.json());
    console.log('Session:', session);
  }
}

testAdminLogin();
  `)

  console.log('\n📝 Or use these credentials manually in the login form:')
  console.log('   Email: admin@test.com')
  console.log('   Password: admin123')
  console.log('')
}

testLogin()
