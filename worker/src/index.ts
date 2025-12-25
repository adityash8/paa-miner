import { Hono } from 'hono';
import type { Env } from './types';
import { corsMiddleware } from './middleware/cors';
import { authMiddleware } from './middleware/auth';
import paaRoutes from './routes/paa';
import trackerRoutes from './routes/tracker';
import projectsRoutes from './routes/projects';
import userRoutes from './routes/user';
import { runTrackingCycle } from './tracker/engine';
import { sendChangeNotifications } from './tracker/notifications';

const app = new Hono<{ Bindings: Env }>();

// Global CORS middleware
app.use('*', corsMiddleware);

// Health check (no auth required)
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API info (no auth required)
app.get('/api', (c) => {
  return c.json({
    name: 'PAA Dominator API',
    version: '1.0.0',
    endpoints: {
      paa: '/api/paa/*',
      tracker: '/api/tracker/*',
      projects: '/api/projects/*',
      user: '/api/user/*',
    },
  });
});

// Protected routes - require authentication
const api = new Hono<{ Bindings: Env }>();
api.use('*', authMiddleware);

// Mount route groups
api.route('/paa', paaRoutes);
api.route('/tracker', trackerRoutes);
api.route('/projects', projectsRoutes);
api.route('/user', userRoutes);

// Mount API under /api
app.route('/api', api);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json(
    { error: 'Internal server error', message: err.message },
    500
  );
});

// Export for Cloudflare Workers
export default {
  fetch: app.fetch,

  // Scheduled handler for cron jobs
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    console.log(`Cron triggered: ${event.cron}`);

    ctx.waitUntil(
      (async () => {
        try {
          // Run tracking cycle
          const trackingResult = await runTrackingCycle(env);
          console.log(
            `Tracking cycle complete: checked ${trackingResult.checked} keywords, found ${trackingResult.changes} changes`
          );

          // Send notifications for any changes
          if (trackingResult.changes > 0) {
            const notificationsSent = await sendChangeNotifications(env);
            console.log(`Sent ${notificationsSent} notification(s)`);
          }
        } catch (error) {
          console.error('Scheduled task failed:', error);
        }
      })()
    );
  },
};
