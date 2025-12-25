import { Hono } from 'hono';
import type { Env, UserSettings } from '../types';

const user = new Hono<{ Bindings: Env }>();

// Tier limits
const TIER_LIMITS = {
  free: { keywords: 3, api_calls: 50 },
  pro: { keywords: 25, api_calls: 3000 },
  agency: { keywords: 100, api_calls: 15000 },
};

/**
 * GET /api/user/settings
 * Get current user settings and usage
 */
user.get('/settings', async (c) => {
  const auth = c.get('auth');

  try {
    const settings = auth.settings;
    const limits = TIER_LIMITS[settings.tier];

    // Get current keyword count
    const keywordCount = await c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM tracked_keywords tk
       JOIN projects p ON tk.project_id = p.id
       WHERE p.user_id = ? AND tk.is_active = 1`
    )
      .bind(auth.userId)
      .first<{ count: number }>();

    return c.json({
      user_id: auth.userId,
      email: auth.email,
      tier: settings.tier,
      limits: {
        keywords: {
          used: keywordCount?.count || 0,
          max: limits.keywords,
        },
        api_calls: {
          used: settings.api_calls_this_month,
          max: limits.api_calls,
          resets_at: settings.api_calls_reset_at,
        },
      },
      preferences: {
        default_region: settings.default_region,
        email_notifications: Boolean(settings.email_notifications),
        webhook_url: settings.webhook_url,
      },
    });
  } catch (error) {
    console.error('Get settings error:', error);
    return c.json({ error: 'Failed to get settings' }, 500);
  }
});

/**
 * PATCH /api/user/settings
 * Update user settings
 */
user.patch('/settings', async (c) => {
  const body = await c.req.json();
  const auth = c.get('auth');

  try {
    const updates: string[] = [];
    const values: any[] = [];

    // Validate and collect updates
    if ('default_region' in body) {
      const validRegions = ['us', 'gb', 'au', 'ca', 'de', 'in', 'fr', 'es', 'it', 'nl', 'br', 'mx', 'jp'];
      if (!validRegions.includes(body.default_region)) {
        return c.json({ error: 'Invalid region' }, 400);
      }
      updates.push('default_region = ?');
      values.push(body.default_region);
    }

    if ('email_notifications' in body) {
      updates.push('email_notifications = ?');
      values.push(body.email_notifications ? 1 : 0);
    }

    if ('webhook_url' in body) {
      if (body.webhook_url && !isValidUrl(body.webhook_url)) {
        return c.json({ error: 'Invalid webhook URL' }, 400);
      }
      updates.push('webhook_url = ?');
      values.push(body.webhook_url || null);
    }

    if ('email' in body) {
      if (body.email && !isValidEmail(body.email)) {
        return c.json({ error: 'Invalid email' }, 400);
      }
      updates.push('email = ?');
      values.push(body.email || null);
    }

    if (updates.length === 0) {
      return c.json({ error: 'No valid updates provided' }, 400);
    }

    values.push(auth.userId);

    await c.env.DB.prepare(
      `UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = ?`
    )
      .bind(...values)
      .run();

    return c.json({ updated: true });
  } catch (error) {
    console.error('Update settings error:', error);
    return c.json({ error: 'Failed to update settings' }, 500);
  }
});

/**
 * GET /api/user/usage
 * Get detailed API usage history
 */
user.get('/usage', async (c) => {
  const auth = c.get('auth');
  const settings = auth.settings;
  const limits = TIER_LIMITS[settings.tier];

  try {
    // Get usage breakdown by day (last 30 days)
    // Note: In a full implementation, you'd track this in a separate table
    // For MVP, we just return current month usage

    return c.json({
      tier: settings.tier,
      current_period: {
        start: getMonthStart(),
        end: settings.api_calls_reset_at,
        api_calls: {
          used: settings.api_calls_this_month,
          limit: limits.api_calls,
          remaining: Math.max(0, limits.api_calls - settings.api_calls_this_month),
        },
      },
      upgrade_available: settings.tier !== 'agency',
    });
  } catch (error) {
    console.error('Get usage error:', error);
    return c.json({ error: 'Failed to get usage' }, 500);
  }
});

/**
 * POST /api/user/test-webhook
 * Send a test webhook to verify URL
 */
user.post('/test-webhook', async (c) => {
  const auth = c.get('auth');
  const settings = auth.settings;

  if (!settings.webhook_url) {
    return c.json({ error: 'No webhook URL configured' }, 400);
  }

  try {
    const testPayload = {
      type: 'test',
      message: 'PAA Dominator webhook test',
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(settings.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    });

    if (!response.ok) {
      return c.json({
        success: false,
        error: `Webhook returned ${response.status}`,
      });
    }

    return c.json({ success: true });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send webhook',
    });
  }
});

/**
 * DELETE /api/user/data
 * Delete all user data (GDPR compliance)
 */
user.delete('/data', async (c) => {
  const auth = c.get('auth');

  try {
    // Delete all projects (cascades to keywords, questions, etc.)
    await c.env.DB.prepare('DELETE FROM projects WHERE user_id = ?')
      .bind(auth.userId)
      .run();

    // Delete user settings
    await c.env.DB.prepare('DELETE FROM user_settings WHERE user_id = ?')
      .bind(auth.userId)
      .run();

    return c.json({ deleted: true });
  } catch (error) {
    console.error('Delete data error:', error);
    return c.json({ error: 'Failed to delete data' }, 500);
  }
});

// Helper functions
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getMonthStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export default user;
