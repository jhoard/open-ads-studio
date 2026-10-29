import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BrandSafety, Objective } from "@/lib/studio";
import type { Brand, Product } from "@/lib/types";

// The demo brand kit and product. Swap the packshot by editing primaryPhoto in product.json.
const assetDir = (): string => path.join(process.cwd(), "assets", "tauvel");

async function readAsset<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(path.join(assetDir(), file), "utf8")) as T;
}

export const loadBrand = (): Promise<Brand> => readAsset<Brand>("brand.json");
export const loadProduct = (): Promise<Product> => readAsset<Product>("product.json");
export const loadBrandSafety = (): Promise<BrandSafety> => readAsset<BrandSafety>("brand-safety.json");
export const loadCopyLines = async (): Promise<Record<Objective, string[]>> => (await readAsset<{ lines: Record<Objective, string[]> }>("copy.json")).lines;

export function protectMaskPath(product: Product): string {
  if (!product.protectMask) throw new Error(`${product.id} has no protect mask; recipes need one so the label is never repainted.`);
  return path.join(assetDir(), path.basename(product.protectMask));
}

export function productPhotoPath(product: Product, photo: string = product.primaryPhoto): string {
  if (!product.photos.includes(photo)) throw new Error(`Unknown product photo: ${photo}`);
  return path.join(assetDir(), path.basename(photo));
}
