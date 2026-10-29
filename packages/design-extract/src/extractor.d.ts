// Types for the parts of the extractor's output Open Ads Studio reads. The rest stays untyped.
import type { Browser, BrowserContext } from "playwright-core";

export interface ExtractedColors {
  primary: string[];
  neutrals: string[];
  backgrounds: { color: string; count: number }[];
  texts: { color: string; count: number }[];
}

export interface ExtractedTypography {
  fontFamilies: { family: string; fullStack: string; count: number }[];
  headings: { tag: string; fontFamily: string; fontSize: string; fontWeight: string; letterSpacing: string }[];
  bodyFont: { fontFamily: string; fontSize: string; fontWeight: string } | null;
}

export interface ExtractedAssets {
  favicon: string | null;
  logos: string[];
  heroImages: { src: string; alt: string; width: number; height: number }[];
}

export interface ExtractedDesign {
  url: string;
  title: string;
  date: string;
  colors: ExtractedColors;
  typography: ExtractedTypography;
  assets: ExtractedAssets;
  [section: string]: unknown;
}

export function extractDesign(
  url: string,
  options: { launch: () => Promise<Browser>; prepareContext?: (context: BrowserContext) => Promise<void>; beforeExtract?: () => Promise<void>; onProgress?: (message: string) => void },
): Promise<{ markdown: string; data: ExtractedDesign }>;
