'use client';

import React, { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { JsonViewer } from '@/components/ui/JsonViewer';
import { Textarea } from '@/components/ui/textarea';

interface ReportDef {
  id: string;
  slug: string;
  name: string;
  description: string;
}

export default function AIReportsPage() {
  const [definitions, setDefinitions] = useState<ReportDef[]>([]);
  const [selected, setSelected] = useState<ReportDef | null>(null);
  const [input, setInput] = useState<string>('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  interface AiReportRun {
    id: string;
    status: string;
    createdAt: string;
    resultJson?: string;
    rawResponse?: string;
  }
  
  const [runs, setRuns] = useState<AiReportRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/ai/reports')
      .then(r => r.json())
      .then(data => {
        setDefinitions(data.definitions || []);
        if (data.definitions?.length) {
          setSelected(data.definitions[0]);
        }
      });
  }, []);

  useEffect(() => {
    if (!selected) return;
    fetch(`/api/ai/reports/runs?reportId=${selected.id}`)
      .then(r => r.json())
      .then(d => {
        setRuns(d.runs || []);
      });
  }, [selected]);

  async function runReport() {
    if (!selected) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/ai/reports/${selected.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: input,
      });
      const data = await res.json();
      setResult(data.outputJson ?? data);

      // Refresh run list after run
      fetch(`/api/ai/reports/runs?reportId=${selected.id}`)
        .then(r => r.json())
        .then(d => setRuns(d.runs || []));
    } catch (err) {
      setResult({ error: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function autoFillInput() {
    if (!selected) return;
    try {
      const res = await fetch(`/api/ai/reports/default-input?reportId=${selected.id}`); // Use hyphenated path
      const data = await res.json();
      setInput(JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to auto-fill input:', error);
    }
  }

  function loadRun(runId: string) {
    setSelectedRunId(runId);
    fetch(`/api/ai/reports/run/${runId}`)
      .then(r => r.json())
      .then(d => {
        // Prefer parsed outputJson; otherwise attempt to parse rawResponse
        if (d.outputJson) {
          setResult(d.outputJson);
        } else if (d.rawResponse) {
          try {
            // Try to parse rawResponse into JSON if possible
            const parsed = JSON.parse(d.rawResponse);
            setResult(parsed);
          } catch {
            setResult({ message: d.rawResponse });
          }
        } else {
          setResult(d);
        }
      });
  }

  interface TaskSequence {
    metadata: {
      sequenceGeneratedAt: string;
      totalJobsProvided: number;
      totalItemsProvided: number;
      estimatedTotalTasks: number;
    };
    tasks: Task[];
    unassignedJobs?: Record<string, unknown>[];
    notes?: string[];
  }

  interface Task {
    taskNumber: number;
    colorsLoaded: string[];
    estimatedItemsOnPlate: number;
    assignedJobs?: AssignedJob[];
  }

  interface AssignedJob {
    quantity: number;
    requires: string[];
  }

  function ReportView({ data }: { data: Record<string, unknown> | string | null }) {
    if (!data) return null;

    // If raw message string
    if (typeof data === 'string') {
      return <p className="text-sm whitespace-pre-wrap">{data}</p>;
    }

    if (!data || typeof data === 'string') {
      return <p className="text-sm whitespace-pre-wrap">{data || 'No data'}</p>;
    }
    
    if (!('taskSequence' in data)) {
      return (
        <JsonViewer src={data} collapsed={true} />
      );
    }

    const {
      metadata,
      tasks,
      unassignedJobs,
      notes,
    } = data.taskSequence as TaskSequence;

    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Generated: {metadata.sequenceGeneratedAt}{' '}
          • Jobs: {metadata.totalJobsProvided} • Items: {metadata.totalItemsProvided} • Tasks:{' '}
          {metadata.estimatedTotalTasks}
        </div>
        <ol className="space-y-3 list-decimal pl-4">
          {tasks?.map((t: Task) => (
            <li key={t.taskNumber} className="rounded border p-3">
              <div className="font-semibold">Task {t.taskNumber}</div>
              <div className="text-sm">Colors: {t.colorsLoaded.join(', ')}</div>
              <div className="text-sm">
                Estimated items on plate: {t.estimatedItemsOnPlate}
              </div>
              {t.assignedJobs && t.assignedJobs.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer select-none text-sm">Assigned Jobs</summary>
                  <ul className="mt-1 list-disc pl-4 text-sm">
                    {t.assignedJobs!.map((j: AssignedJob, idx: number) => (
                      <li key={idx}>
                        {j.quantity}× [{j.requires.join(' + ')}] jobs
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          ))}
        </ol>
        {unassignedJobs && unassignedJobs.length > 0 && (
          <div>
            <h4 className="font-semibold mt-4">Unassigned Jobs</h4>
            <JsonViewer src={unassignedJobs} collapsed={true} />
          </div>
        )}
        {notes && (
          <div>
            <h4 className="font-semibold mt-4">Notes</h4>
            <ul className="list-disc pl-4 text-sm space-y-1">
              {notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <h1 className="text-3xl font-bold">AI Reports</h1>

      {/* Definitions list */}
      {definitions.length > 0 && (
        <div className="flex space-x-4 overflow-x-auto">
          {definitions.map(def => (
            <Button
              key={def.id}
              variant={def.id === selected?.id ? 'default' : 'outline'}
              onClick={() => setSelected(def)}
            >
              {def.name}
            </Button>
          ))}
        </div>
      )}

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle>{selected.name}</CardTitle>
            <p className="text-sm text-muted-foreground max-w-prose">
              {selected.description}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              className="font-mono text-xs h-24"
              value={input}
              onChange={e => setInput(e.target.value)}
            />
            <Button size="sm" variant="secondary" onClick={autoFillInput} className="mt-2">
              Auto-fill Input from Pending Tasks
            </Button>
            <Button onClick={runReport} disabled={loading}>
              {loading ? 'Running…' : 'Run Report'}
            </Button>

            {/* Runs history */}
            {runs.length > 0 && (
              <div className="mt-4">
                <label className="text-sm font-medium">Previous Runs</label>
                <select
                  className="block mt-1 w-full border rounded px-2 py-1 text-sm bg-background"
                  value={selectedRunId ?? ''}
                  onChange={e => loadRun(e.target.value)}
                >
                  <option value="" disabled>
                    Select a run
                  </option>
                  {runs.map(r => (
                    <option key={r.id} value={r.id}>
                      {new Date(r.createdAt).toLocaleString()} – {r.status}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {result !== null && (
              <div className="mt-4 bg-muted rounded p-2">
                <ReportView data={result} />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
