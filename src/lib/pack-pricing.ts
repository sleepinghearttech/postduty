/**
 * "Any N for ₹X" pack pricing, shared by the cart preview and checkout. Dependency-free so the client can import it.
 * A product opts in with commerce.pack = { group, size, price } (price in paise). Units from the same group and rule
 * combine freely; each full group of `size` units costs `price`, and leftover units keep their own price.
 */
export type PackRule = { group: string; size: number; price: number };
export type PackUnitLine = { unitPrice: number; quantity: number; pack: PackRule | null | undefined };
export type PackResult = { saving: number; packs: number; groups: { group: string; size: number; price: number; packs: number; saving: number }[] };

export function validPackRule(value: unknown): PackRule | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rule = value as Record<string, unknown>;
  const group = typeof rule.group === "string" ? rule.group.trim() : "";
  if (!/^[a-z0-9-]{1,40}$/.test(group)) return null;
  if (!Number.isSafeInteger(rule.size) || (rule.size as number) < 2 || (rule.size as number) > 20) return null;
  if (!Number.isSafeInteger(rule.price) || (rule.price as number) < 100) return null;
  return { group, size: rule.size as number, price: rule.price as number };
}

/** Packs are built from the highest-priced units first; a pack never costs more than buying its units singly. */
export function packPricing(lines: PackUnitLine[]): PackResult {
  const buckets = new Map<string, { rule: PackRule; prices: number[] }>();
  for (const line of lines) {
    const rule = validPackRule(line.pack);
    if (!rule || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || !Number.isSafeInteger(line.unitPrice) || line.unitPrice < 1) continue;
    const key = `${rule.group}|${rule.size}|${rule.price}`;
    const bucket = buckets.get(key) ?? { rule, prices: [] };
    for (let i = 0; i < line.quantity; i++) bucket.prices.push(line.unitPrice);
    buckets.set(key, bucket);
  }
  let saving = 0, packs = 0;
  const groups: PackResult["groups"] = [];
  for (const { rule, prices } of buckets.values()) {
    const count = Math.floor(prices.length / rule.size);
    if (!count) continue;
    const packed = prices.sort((a, b) => b - a).slice(0, count * rule.size).reduce((sum, p) => sum + p, 0);
    const groupSaving = Math.max(0, packed - count * rule.price);
    if (!groupSaving) continue;
    saving += groupSaving;
    packs += count;
    groups.push({ group: rule.group, size: rule.size, price: rule.price, packs: count, saving: groupSaving });
  }
  return { saving, packs, groups };
}
