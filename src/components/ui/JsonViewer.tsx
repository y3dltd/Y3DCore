'use client';

import dynamic from 'next/dynamic';
import React from 'react';

// Import default styles for the component
import 'react-json-view-lite/dist/index.css';

// Import react-json-view-lite with client-side only rendering
const DynamicJsonView = dynamic(
  () => import('react-json-view-lite').then(mod => ({ default: mod.JsonView })),
  {
    ssr: false,
    loading: () => <div className="p-4 bg-gray-100 rounded">Loading JSON viewer...</div>
  }
);

export interface JsonViewerProps {
  src: Record<string, unknown> | unknown[] | unknown;
  collapsed?: boolean;
  style?: React.CSSProperties;
}

/**
 * A wrapper component for react-json-view-lite that works well with Next.js
 */
export const JsonViewer: React.FC<JsonViewerProps> = ({ src, collapsed = false, style }) => {
  // Convert any value to a proper object for the viewer
  const safeData = src === null || src === undefined ? {} : src;
  
  // Handle the API structure following the docs exactly
  return (
    <DynamicJsonView 
      data={safeData} 
      shouldExpandNode={() => !collapsed}
      style={style || undefined}
    />
  );
};

export default JsonViewer;
