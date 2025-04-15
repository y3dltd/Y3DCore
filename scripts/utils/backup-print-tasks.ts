#!/usr/bin/env ts-node
/**
 * Backup Print Tasks Script
 * 
 * This script creates a backup of all print tasks in the database
 * 
 * Usage:
 *   npx tsx scripts/backup-print-tasks.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Prisma client
const prisma = new PrismaClient();

async function backupPrintTasks() {
  try {
    console.log('Creating backup of print tasks...');
    
    // Get all print tasks
    const printTasks = await prisma.printOrderTask.findMany({
      include: {
        order: {
          select: {
            shipstation_order_number: true,
            marketplace: true,
            order_status: true
          }
        },
        orderItem: {
          include: {
            product: {
              select: {
                name: true
              }
            }
          }
        }
      }
    });
    
    console.log(`Found ${printTasks.length} print tasks to backup.`);
    
    // Create backup directory if it doesn't exist
    const backupDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir);
    }
    
    // Create backup file with timestamp
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const backupFile = path.join(backupDir, `print-tasks-backup-${timestamp}.json`);
    
    // Write backup to file
    fs.writeFileSync(backupFile, JSON.stringify(printTasks, null, 2));
    
    console.log(`Backup created: ${backupFile}`);
    console.log(`Total tasks backed up: ${printTasks.length}`);
    
    // Print summary of backed up tasks
    const tasksByStatus = printTasks.reduce((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('\nTasks by status:');
    Object.entries(tasksByStatus).forEach(([status, count]) => {
      console.log(`${status}: ${count}`);
    });
    
    const needsReviewCount = printTasks.filter(task => task.needs_review).length;
    console.log(`\nTasks that need review: ${needsReviewCount}`);
    
  } catch (error) {
    console.error('Error backing up print tasks:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
backupPrintTasks()
  .then(() => {
    console.log('\nBackup completed successfully.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
