import { prisma } from '../../src/lib/prisma';
import fs from 'fs';
import path from 'path';

async function checkLogging() {
  try {
    console.log('Checking logging configuration...');
    
    // Check if logs directory exists
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      console.log(`Logs directory does not exist. Creating ${logsDir}...`);
      fs.mkdirSync(logsDir, { recursive: true });
    } else {
      console.log(`Logs directory exists: ${logsDir}`);
    }
    
    // Check recent log files
    const logFiles = fs.readdirSync(logsDir).filter(file => file.endsWith('.log'));
    console.log(`Found ${logFiles.length} log files.`);
    
    if (logFiles.length > 0) {
      // Sort by modification time (newest first)
      const sortedLogFiles = logFiles
        .map(file => ({ file, mtime: fs.statSync(path.join(logsDir, file)).mtime }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
      
      console.log('\nMost recent log files:');
      sortedLogFiles.slice(0, 5).forEach(({ file, mtime }) => {
        console.log(`${file} (${mtime.toISOString()})`);
      });
      
      // Check content of most recent log file
      const mostRecentFile = sortedLogFiles[0].file;
      const logPath = path.join(logsDir, mostRecentFile);
      console.log(`\nChecking content of most recent log file: ${logPath}`);
      
      const logContent = fs.readFileSync(logPath, 'utf8');
      const logLines = logContent.split('\n').filter(line => line.trim() !== '');
      
      console.log(`Log file contains ${logLines.length} lines.`);
      console.log('First 5 lines:');
      logLines.slice(0, 5).forEach(line => console.log(`  ${line}`));
      
      console.log('\nLast 5 lines:');
      logLines.slice(-5).forEach(line => console.log(`  ${line}`));
      
      // Check for errors
      const errorLines = logLines.filter(line => line.includes('"level":50') || line.includes('"level":40'));
      if (errorLines.length > 0) {
        console.log(`\nFound ${errorLines.length} error/warning lines.`);
        console.log('First 5 errors/warnings:');
        errorLines.slice(0, 5).forEach(line => console.log(`  ${line}`));
      } else {
        console.log('\nNo errors or warnings found in the log file.');
      }
    }
    
    // Check AI call logs in database
    const aiCallLogs = await prisma.aiCallLog.count();
    console.log(`\nFound ${aiCallLogs} AI call logs in the database.`);
    
    // Check print tasks in database
    const printTasks = await prisma.printOrderTask.count();
    console.log(`Found ${printTasks} print tasks in the database.`);
    
    console.log('\nLogging check complete.');
  } catch (error) {
    console.error('Error checking logging:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkLogging();
