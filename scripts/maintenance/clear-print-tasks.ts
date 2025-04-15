#!/usr/bin/env ts-node
/**
 * Clear Print Tasks Script
 * 
 * This script clears all print tasks from the database
 * 
 * Usage:
 *   npx tsx scripts/clear-print-tasks.ts
 */

import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

// Initialize Prisma client
const prisma = new PrismaClient();

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askForConfirmation(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function clearPrintTasks() {
  try {
    // Count print tasks
    const taskCount = await prisma.printOrderTask.count();
    console.log(`Found ${taskCount} print tasks in the database.`);
    
    // Ask for confirmation
    const confirmed = await askForConfirmation(
      `WARNING: This will delete ALL ${taskCount} print tasks from the database.\nThis action cannot be undone. Are you sure you want to proceed? (y/n): `
    );
    
    if (!confirmed) {
      console.log('Operation cancelled.');
      return;
    }
    
    // Delete all print tasks
    console.log('Deleting all print tasks...');
    const result = await prisma.printOrderTask.deleteMany({});
    
    console.log(`Successfully deleted ${result.count} print tasks.`);
    
  } catch (error) {
    console.error('Error clearing print tasks:', error);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

// Run the script
clearPrintTasks()
  .then(() => {
    console.log('\nOperation completed.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
