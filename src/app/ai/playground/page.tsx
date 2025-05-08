'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AIPlaygroundPage(): JSX.Element {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">AI Playground</h1>
      <Card>
        <CardHeader>
          <CardTitle>Prompt Playground</CardTitle>
        </CardHeader>
        <CardContent>
          <p>This is where the prompt playground components will go.</p>
          {/* TODO: Implement playground UI */}
        </CardContent>
      </Card>
    </div>
  );
}
