#!/usr/bin/env ts-node
import { prisma } from '../src/lib/prisma';

async function main() {
  const slug = 'sequential-task-planner';
  const existing = await prisma.aiReportDefinition.findUnique({ where: { slug } });
  if (existing) {
    console.log('Definition already exists:', existing.id);
    return;
  }

  const prompt = `V7 - 13-Printer Sequential Task Planner API (JSON In/Out) - Huddersfield Ops\n${`"`}...prompt text trimmed for brevity...`;

  const def = await prisma.aiReportDefinition.create({
    data: {
      slug,
      name: '13-Printer Sequential Task Planner',
      description: 'Generates an optimised task sequence for Huddersfield print farm.',
      systemPrompt: prompt,
    },
  });
  console.log('Created definition:', def.id);
}

main().then(() => prisma.$disconnect());
