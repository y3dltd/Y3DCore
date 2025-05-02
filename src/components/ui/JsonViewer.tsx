'use client';

import 'react18-json-view/src/style.css';
// Dynamically import react18-json-view to avoid SSR issues
import dynamic from 'next/dynamic';
import React from 'react';

// Import default styles for the component
// import 'react-json-view-lite/dist/index.css';

// Import react-json-view-lite with client-side only rendering
const JsonView = dynamic(() => import('react18-json-view').then(m => m.default ?? m), {
  ssr: false,
});

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
  return <JsonView src={safeData as any} collapsed={collapsed} style={style} />;
};

export default JsonViewer;
