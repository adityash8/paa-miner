import { Context, Next } from 'hono';

const ALLOWED_ORIGINS = [
  'https://yourdomain.com',
  'https://your-webflow-site.webflow.io',
  'http://localhost:3000',
];

export async function corsMiddleware(c: Context, next: Next) {
  const origin = c.req.header('Origin') || '';

  // Check if origin is allowed or allow all in development
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  // Handle preflight
  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  await next();

  // Add CORS headers to response
  c.res.headers.set('Access-Control-Allow-Origin', allowedOrigin);
  c.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
