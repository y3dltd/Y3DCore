// customisation.ts — revised April 2025
// ------------------------------------------------------------
// * default logger import fixed
// * safe fetch with timeout + Node<20 polyfill note
// * stricter zip filtering & streaming to save RAM
// * broader colour detection + corrected fallback condition
// * allFields now JSON‑stringifies non‑primitives
// ------------------------------------------------------------

import JSZip from 'jszip';

import { logger } from '../../shared/logging';
// Uncomment if your runtime might be Node < 20
// import fetch from "node-fetch";

const FETCH_TIMEOUT_MS = 10000;

// --------- Interfaces -----------------------------------------------------
interface AmazonCustomizationArea {
  customizationType?: string;
  label?: string;
  name?: string;
  text?: string;
  optionValue?: string;
}
interface AmazonCustomizationSurface {
  areas?: AmazonCustomizationArea[];
}
interface AmazonCustomizationVersionInfo {
  surfaces?: AmazonCustomizationSurface[];
}
interface AmazonCustomizationInfo {
  'version3.0'?: AmazonCustomizationVersionInfo;
}

interface AmazonNestedCustomization {
  type?: string;
  name?: string;
  label?: string;
  text?: string;
  inputValue?: string;
  displayValue?: string;
  optionValue?: string;
  optionSelection?: { name?: string };
  children?: AmazonNestedCustomization[];
}

export interface AmazonCustomizationData {
  customText: string | null;
  color1: string | null;
  color2: string | null;
  allFields: Record<string, string | null>;
  rawJsonData?: Record<string, unknown>;
}

// Helper to detect colour tags in labels or names
const isColourTag = (s: string) => /(colour|color).*?(1|accent|text|base|background)?/i.test(s);

// ---------- Main -----------------------------------------------------------
export async function fetchAndProcessAmazonCustomization(
  url: string
): Promise<AmazonCustomizationData | null> {
  logger.info(`[amazon] fetching zip → ${url}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

    // Stream into JSZip to avoid huge buffers
    const arrayBuffer = await res.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    // find JSON file entries, skip hidden macOS files
    const jsonFiles = zip.file(/\.json$/i).filter(file => !file.name.startsWith('._'));

    if (jsonFiles.length === 0) throw new Error('no .json in archive');
    if (jsonFiles.length > 1)
      logger.warn(`[amazon] multiple json files, using ${jsonFiles[0].name}`);

    const jsonContent = await zip.file(jsonFiles[0].name)!.async('string');
    const jsonData = JSON.parse(jsonContent) as Record<string, unknown>;

    let customText: string | null = null;
    let color1: string | null = null;
    let color2: string | null = null;

    // ----- v3.0 structure --------------------------------------------------
    const areas =
      (jsonData.customizationInfo as AmazonCustomizationInfo | undefined)?.['version3.0']
        ?.surfaces?.[0]?.areas ?? [];

    if (areas.length) {
      for (const a of areas) {
        const tag = `${a.label ?? ''} ${a.name ?? ''}`;
        if (!customText && (a.customizationType === 'TextPrinting' || /text/i.test(tag)))
          customText = a.text ?? null;
        if (a.customizationType === 'Options' && isColourTag(tag)) {
          const v = a.optionValue ?? null;
          if (!color1) color1 = v;
          else if (!color2 && v !== color1) color2 = v;
        }
      }
    }

    // ----- fallback nested structure --------------------------------------
    if (!customText || (!color1 && !color2)) {
      const dive = (nodes: AmazonNestedCustomization[] = []) => {
        for (const n of nodes) {
          const tag = `${n.label ?? ''} ${n.name ?? ''}`.toLowerCase();
          if (!customText && n.type === 'TextCustomization')
            customText = n.inputValue ?? n.text ?? null;
          if (isColourTag(tag)) {
            const v = n.displayValue ?? n.optionValue ?? n.optionSelection?.name ?? null;
            if (v) {
              if (!color1) color1 = v;
              else if (!color2 && v !== color1) color2 = v;
            }
          }
          if (n.children?.length) dive(n.children);
        }
      };
      const raw = (
        jsonData as unknown as { customizationData?: { children?: AmazonNestedCustomization[] } }
      ).customizationData;
      dive(raw?.children ?? []);
    }

    // ----- flatten all fields ---------------------------------------------
    const allFields: Record<string, string | null> = {};
    for (const k of Object.keys(jsonData)) {
      const v = (jsonData as Record<string, unknown>)[k];
      allFields[k] = typeof v === 'string' ? v : v == null ? null : JSON.stringify(v);
    }

    if (!customText && !color1) {
      logger.warn(`[amazon] extracted nothing useful from ${url}`);
    }

    const result: AmazonCustomizationData = {
      customText,
      color1,
      color2,
      allFields,
      rawJsonData: jsonData,
    };
    logger.info(`[amazon] extracted: ${JSON.stringify({ text: customText, color1, color2 })}`);
    return result;
  } catch (err) {
    clearTimeout(timer);
    logger.error(`[amazon] ${url} → ${(err as Error).message}`);
    return null;
  }
}
