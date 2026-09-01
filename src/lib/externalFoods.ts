/** Open Food Facts由来の市販品検索。内部の文科省食品データとは混在させない。 */

const SEARCH_ENDPOINT = 'https://world.openfoodfacts.org/cgi/search.pl';
const SEARCH_FIELDS = 'code,product_name,brands,image_front_small_url,nutriments';

export interface ExternalFood {
  provider: 'open-food-facts';
  barcode: string | null;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
}

type OpenFoodFactsProduct = {
  code?: unknown;
  product_name?: unknown;
  brands?: unknown;
  image_front_small_url?: unknown;
  nutriments?: Record<string, unknown>;
};

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function nutrient(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** APIレスポンスを、画面に必要な最小項目だけへ切り出す。 */
export function toExternalFood(product: OpenFoodFactsProduct): ExternalFood | null {
  const name = text(product.product_name);
  if (name == null) return null;
  const nutrients = product.nutriments ?? {};
  return {
    provider: 'open-food-facts',
    barcode: text(product.code),
    name,
    brand: text(product.brands),
    imageUrl: text(product.image_front_small_url),
    kcal: nutrient(nutrients['energy-kcal_100g']),
    protein: nutrient(nutrients.proteins_100g),
    fat: nutrient(nutrients.fat_100g),
    carbs: nutrient(nutrients.carbohydrates_100g),
  };
}

/**
 * Open Food Factsの公式JSON検索API。
 * 2文字未満では呼ばず、FoodToolの明示ボタンからのみ使う。
 */
export async function searchExternalFoods(query: string, signal?: AbortSignal): Promise<ExternalFood[]> {
  const searchTerms = query.trim();
  if (Array.from(searchTerms).length < 2) return [];
  const url = new URL(SEARCH_ENDPOINT);
  url.search = new URLSearchParams({
    action: 'process',
    search_terms: searchTerms,
    json: '1',
    page_size: '12',
    fields: SEARCH_FIELDS,
  }).toString();
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Open Food Facts search failed: ${response.status}`);
  const payload = await response.json() as { products?: OpenFoodFactsProduct[] };
  return (payload.products ?? []).map(toExternalFood).filter((food): food is ExternalFood => food != null);
}

export const OPEN_FOOD_FACTS_SOURCE = {
  name: 'Open Food Facts',
  url: 'https://world.openfoodfacts.org/',
} as const;
