import * as React from 'react';

export interface ReactJsonViewProps {
  src: unknown;
  name?: string | null;
  collapsed?: boolean | number;
  enableClipboard?: boolean;
}

declare const ReactJsonView: React.ComponentType<ReactJsonViewProps>;
export default ReactJsonView;
export type { ReactJsonViewProps };
