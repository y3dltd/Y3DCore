import { Buffer } from 'buffer';

import JSZip from 'jszip';
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';

import { fetchAndProcessAmazonCustomization } from '../customization';

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.resetAllMocks();
});

describe('fetchAndProcessAmazonCustomization', () => {
  it('parses a simple JSON zip with text and color', async () => {
    const zip = new JSZip();
    const payload = {
      customizationInfo: {
        'version3.0': {
          surfaces: [
            {
              areas: [
                { customizationType: 'TextPrinting', text: 'HELLO' },
                { customizationType: 'Options', label: 'Color 1', optionValue: 'RED' },
                { customizationType: 'Options', label: 'Color 2', optionValue: 'BLUE' },
              ],
            },
          ],
        },
      },
      foo: 'bar',
    };
    zip.file('data.json', JSON.stringify(payload));
    const buf = await zip.generateAsync({ type: 'arraybuffer' });

    (
      global.fetch as unknown as { mockResolvedValueOnce: (value: Record<string, unknown>) => void }
    ).mockResolvedValueOnce({
      body: Buffer.from(buf),
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: async () => buf,
    });

    const result = await fetchAndProcessAmazonCustomization('https://fake.url/zip');
    expect(result).not.toBeNull();
    expect(result?.customText).toBe('HELLO');
    expect(result?.color1).toBe('RED');
    expect(result?.color2).toBe('BLUE');
    expect(result?.allFields.foo).toBe('bar');
  });

  it('returns null if no JSON file is present', async () => {
    const zip = new JSZip();
    zip.file('notjson.txt', 'hello world');
    const buf = await zip.generateAsync({ type: 'arraybuffer' });

    (
      global.fetch as unknown as { mockResolvedValueOnce: (value: Record<string, unknown>) => void }
    ).mockResolvedValueOnce({
      body: Buffer.from(buf),
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: async () => buf,
    });

    const result = await fetchAndProcessAmazonCustomization('https://fake.url/bad');
    expect(result).toBeNull();
  });
});
