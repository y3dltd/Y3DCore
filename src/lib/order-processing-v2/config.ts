// src/lib/order-processing-v2/config.ts

import type { ProcessingOptionsV2 } from './types';

// Re-export the options type for easy import by other modules
export type { ProcessingOptionsV2 };

// Placeholder for any future configuration loading logic (e.g., from env)
export function loadConfig(): Partial<ProcessingOptionsV2> {
    // TODO: Implement environment variable loading if needed
    return {};
}
