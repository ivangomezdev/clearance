// Keep provider identity out of product copy. Required server URLs and original
// affiliate destinations remain unchanged in the integration itself.
export function publicCopy(value?: string | null): string {
  return (value || '')
    .replace(/https?:\/\/(?:[\w-]+\.)?hiddenclearances\.com[^\s<>]*/gi, '')
    .replace(/(?:www\.|api\.)?hiddenclearances\.com/gi, '')
    .replace(/\bhidden\s*clearances\b/gi, 'el catálogo')
    .trim();
}
