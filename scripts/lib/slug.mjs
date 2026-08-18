/** Slugify pt-BR (acentos fora, não-alfanumérico → hífen) — portado de teqo/src/lib/slug.ts. */
export const slugify = (value) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumeric -> hyphen
    .replace(/-+/g, '-') // collapse hyphens
    .replace(/^-|-$/g, '') // trim leading/trailing hyphens
