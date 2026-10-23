/**
 * Category suggestion from an item's name, brand, model and tags.
 *
 * This is a plain keyword lookup (English and Czech). It is NOT machine learning or an AI
 * service: it only helps pre-select a category, the person always decides. The same text always
 * gives the same answer and nothing is sent anywhere.
 */

export type SuggestableCategory = 'Electronics' | 'Tools' | 'Clothing' | 'Sports' | 'Books' | 'Accessories' | 'Household' | 'Collectibles';

const RULES: { category: SuggestableCategory; words: string[] }[] = [
  { category: 'Electronics', words: ['laptop', 'notebook', 'phone', 'telefon', 'mobil', 'iphone', 'tablet', 'ipad', 'tv', 'televize', 'monitor', 'camera', 'fotoaparat', 'kamera', 'headphone', 'sluchatka', 'sluchatko', 'charger', 'nabijecka', 'router', 'keyboard', 'klavesnice', 'mouse', 'mys', 'console', 'konzole', 'speaker', 'reproduktor', 'drone', 'dron', 'printer', 'tiskarna', 'kindle', 'powerbank', 'usb', 'hdmi'] },
  { category: 'Tools', words: ['drill', 'vrtacka', 'hammer', 'kladivo', 'screwdriver', 'sroubovak', 'wrench', 'klic', 'saw', 'pila', 'pliers', 'kleste', 'ladder', 'zebrik', 'toolbox', 'naradi', 'sander', 'bruska', 'level', 'vodovaha', 'tape measure', 'metr'] },
  { category: 'Clothing', words: ['jacket', 'bunda', 'coat', 'kabat', 'shirt', 'tricko', 'kosile', 'jeans', 'dziny', 'dress', 'saty', 'shoe', 'boty', 'sneakers', 'tenisky', 'boots', 'sweater', 'svetr', 'mikina', 'hoodie', 'hat', 'cepice', 'scarf', 'satek', 'ponozky', 'socks', 'kalhoty', 'trousers'] },
  { category: 'Sports', words: ['bike', 'bicycle', 'kolo', 'tent', 'stan', 'skis', 'lyze', 'snowboard', 'ball', 'mic', 'racket', 'raketa', 'helmet', 'prilba', 'yoga', 'dumbbell', 'cinka', 'kayak', 'backpack', 'batoh', 'sleeping bag', 'spacak', 'skateboard', 'climbing', 'lezecky'] },
  { category: 'Books', words: ['book', 'kniha', 'novel', 'roman', 'textbook', 'ucebnice', 'comic', 'komiks', 'magazine', 'casopis', 'cookbook', 'kucharka', 'dictionary', 'slovnik'] },
  { category: 'Accessories', words: ['watch', 'hodinky', 'wallet', 'penezenka', 'belt', 'opasek', 'sunglasses', 'bryle', 'ring', 'prsten', 'necklace', 'nahrdelnik', 'bracelet', 'naramek', 'umbrella', 'destnik', 'keychain', 'privesek', 'purse', 'kabelka'] },
  { category: 'Household', words: ['vacuum', 'vysavac', 'kettle', 'konvice', 'toaster', 'topinkovac', 'blender', 'mixer', 'pan', 'panev', 'pot', 'hrnec', 'lamp', 'lampa', 'chair', 'zidle', 'table', 'stul', 'blanket', 'deka', 'towel', 'rucnik', 'mug', 'hrnek', 'plate', 'talir', 'fan', 'ventilator', 'iron', 'zehlicka', 'coffee machine', 'kavovar'] },
  { category: 'Collectibles', words: ['vinyl', 'gramodeska', 'coin', 'mince', 'stamp', 'znamka', 'figurine', 'figurka', 'antique', 'starozitnost', 'trading card', 'sberatelsk', 'lego', 'poster', 'plakat', 'signed'] },
];

/** lower-case, no diacritics, only letters/digits/spaces */
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export interface CategorySuggestion { category: SuggestableCategory; matched: string }

export function suggestCategory(parts: { name?: string; brand?: string; model?: string; tags?: string[] }): CategorySuggestion | null {
  const text = ` ${normalizeText([parts.name, parts.brand, parts.model, ...(parts.tags ?? [])].filter(Boolean).join(' '))} `;
  if (text.trim() === '') return null;
  let best: { category: SuggestableCategory; matched: string; score: number } | null = null;
  for (const rule of RULES) {
    let score = 0; let matched = '';
    for (const w of rule.words) {
      // whole word (or the word as a prefix, for Czech endings and compounds like "sberatelsky"); short words must match exactly
      const hit = w.length <= 3 ? text.includes(` ${w} `) : text.includes(` ${w}`);
      if (hit) { score += w.length; if (w.length > matched.length) matched = w; }
    }
    if (score > 0 && (!best || score > best.score)) best = { category: rule.category, matched, score };
  }
  return best ? { category: best.category, matched: best.matched } : null;
}
