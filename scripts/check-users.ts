import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  try {
    console.log('Checking users in database...\n')
    
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        approved: true,
        name: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
    
    if (users.length === 0) {
      console.log('❌ No users found in database!')
      console.log('Run: bun prisma db seed')
      return
    }
    
    console.log('=== Users in Database ===\n')
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email}`)
      console.log(`   Name: ${user.name || 'N/A'}`)
      console.log(`   Approved: ${user.approved ? '✅ YES' : '❌ NO'}`)
      console.log(`   ID: ${user.id}`)
      console.log(`   Created: ${user.createdAt.toISOString()}`)
      console.log('')
    })
    
    console.log(`Total users: ${users.length}`)
    
    const unapprovedCount = users.filter(u => !u.approved).length
    if (unapprovedCount > 0) {
      console.log(`\n⚠️  ${unapprovedCount} user(s) need approval`)
      console.log('Run: bun scripts/approve-existing-users.ts')
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
