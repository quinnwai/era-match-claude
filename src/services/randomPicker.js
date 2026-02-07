/**
 * Pick `count` unique random items from `items`.
 * If items.length < count, returns all items (shuffled).
 */
export function pickRandom(items, count) {
  if (!items || items.length === 0) return []
  const shuffled = [...items].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}

/**
 * Pick `count` unique random items, excluding any whose `id` is in `excludeIds`.
 */
export function pickRandomExcluding(items, count, excludeIds = new Set()) {
  if (!items || items.length === 0) return []
  const filtered = items.filter((item) => !excludeIds.has(item.id))
  return pickRandom(filtered, count)
}
