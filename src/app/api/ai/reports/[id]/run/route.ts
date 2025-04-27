import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = await req.json();

  const def = await prisma.aiReportDefinition.findUnique({ where: { id } });
  if (!def) {
    return NextResponse.json({ error: 'Report definition not found' }, { status: 404 });
  }

  // create run row first
  const run = await prisma.aiReportRun.create({ data: { reportId: id, inputJson: body } });

  const openai = new OpenAI();
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: def.systemPrompt },
        { role: 'user', content: JSON.stringify(body) },
      ],
    });

    const txt = completion.choices[0].message.content ?? '{}';
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(txt);
    } catch (_) {
      // ignore parse error
    }

    await prisma.aiReportRun.update({
      where: { id: run.id },
      data: {
        outputJson: parsed === null ? Prisma.JsonNull : (parsed as Prisma.InputJsonValue),
        rawResponse: txt,
        status: 'success',
        finishedAt: new Date(),
      },
    });

    return NextResponse.json({ runId: run.id, outputJson: parsed });
  } catch (err) {
    await prisma.aiReportRun.update({
      where: { id: run.id },
      data: { status: 'error', errorMsg: (err as Error).message, finishedAt: new Date() },
    });
    return NextResponse.json({ error: (err as Error).message, runId: run.id }, { status: 500 });
  }
}
