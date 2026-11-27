/**
 * Cloudflare Worker: the same /api/* router as the Netlify function (every handler takes a
 * Request and returns a Response). Static files and the app itself are served by Workers Assets
 * (see wrangler.jsonc); only /api/* reaches this code.
 */
import handler from '../netlify/functions/api.mjs';

export default {
  fetch: (request: Request): Promise<Response> | Response => handler(request),
};
