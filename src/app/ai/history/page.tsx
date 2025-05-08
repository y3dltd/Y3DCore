import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { prisma } from '@/lib/prisma';

import type { AiCallLog } from '@prisma/client';

async function getAiLogs(): Promise<AiCallLog[]> {
  // Fetch latest 100 logs, ordered by creation date descending
  return prisma.aiCallLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export default async function AIHistoryPage(): Promise<JSX.Element> {
  const logs = await getAiLogs();

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">AI Call History</h1>
      <Card>
        <CardHeader>
          <CardTitle>Recent AI Logs (Last 100)</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Script</TableHead>
                  <TableHead>Order #</TableHead>
                  <TableHead>Marketplace</TableHead>
                  <TableHead>AI Provider</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Tasks Gen</TableHead>
                  <TableHead>Needs Review</TableHead>
                  <TableHead>Success</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground">
                      No AI logs found.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{log.createdAt.toLocaleString()}</TableCell>
                      <TableCell>{log.scriptName}</TableCell>
                      <TableCell>{log.orderNumber ?? 'N/A'}</TableCell>
                      <TableCell>{log.marketplace ?? 'N/A'}</TableCell>
                      <TableCell>{log.aiProvider}</TableCell>
                      <TableCell>{log.modelUsed}</TableCell>
                      <TableCell>{log.tasksGenerated}</TableCell>
                      <TableCell>{log.needsReviewCount}</TableCell>
                      <TableCell>{log.success ? 'Yes' : 'No'}</TableCell>
                      <TableCell className="max-w-xs truncate" title={log.errorMessage ?? ''}>
                        {log.errorMessage ?? '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
