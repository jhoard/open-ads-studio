import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Brand, Product } from "@/lib/types";

// The demo brand kit and product. Swap the packshot by editing primaryPhoto in product.json.
const assetDir = (): string => path.join(process.cwd(), "assets", "tauvel");

async function readAsset<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(path.join(assetDir(), file), "utf8")) as T;
}

export const loadBrand = (): Promise<Brand> => readAsset<Brand>("brand.json");
export const loadProduct = (): Promise<Product> => readAsset<Product>("product.json");

export function productPhotoPath(product: Product, photo: string = product.primaryPhoto): string {
  if (!product.photos.includes(photo)) throw new Error(`Unknown product photo: ${photo}`);
  return path.join(assetDir(), path.basename(photo));
}
