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

declare module 'react18-json-view' {
  import * as React from 'react';
  interface JsonViewProps {
    src: any;
    collapsed?: boolean | number;
    style?: React.CSSProperties;
    dark?: boolean;
  }
  const JsonView: React.FC<JsonViewProps>;
  export default JsonView;
}
