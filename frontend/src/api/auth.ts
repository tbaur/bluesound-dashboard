/** Optional API token mirrored from Vite env (pair with backend BSD_API_TOKEN). */
export const apiToken = (import.meta.env.VITE_API_TOKEN as string | undefined)?.trim() || '';
