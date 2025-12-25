import { Context, Next } from 'hono';
import type { Env, UserSettings, TIER_LIMITS } from '../types';

interface MemberstackMember {
  id: string;
  auth: { email: string };
  planConnections: Array<{ planId: string; planName: string }>;
  customFields: Record<string, string>;
}

interface AuthContext {
  userId: string;
  email: string;
  tier: 'free' | 'pro' | 'agency';
  settings: UserSettings;
}

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

/**
 * Validate Memberstack token and extract user info
 */
export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid authorization header' }, 401);
  }

  const token = authHeader.slice(7);

  try {
    // Validate with Memberstack
    const member = await validateMemberstackToken(token, c.env.MEMBERSTACK_SECRET_KEY);

    if (!member) {
      return c.json({ error: 'Invalid token' }, 401);
    }

    // Get or create user settings
    const settings = await getOrCreateUserSettings(c.env.DB, member);

    // Check API call limits
    const limits = getTierLimits(settings.tier);
    if (settings.api_calls_this_month >= limits.api_calls) {
      return c.json(
        {
          error: 'API call limit exceeded',
          limit: limits.api_calls,
          used: settings.api_calls_this_month,
          resets_at: settings.api_calls_reset_at,
        },
        429
      );
    }

    // Set auth context
    c.set('auth', {
      userId: member.id,
      email: member.auth.email,
      tier: settings.tier,
      settings,
    });

    await next();
  } catch (error) {
    console.error('Auth error:', error);
    return c.json({ error: 'Authentication failed' }, 401);
  }
}

async function validateMemberstackToken(
  token: string,
  secretKey: string
): Promise<MemberstackMember | null> {
  try {
    const response = await fetch('https://admin.memberstack.com/members/current', {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-API-KEY': secretKey,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { data: MemberstackMember };
    return data.data;
  } catch {
    return null;
  }
}

async function getOrCreateUserSettings(
  db: D1Database,
  member: MemberstackMember
): Promise<UserSettings> {
  // Check for existing settings
  const existing = await db
    .prepare('SELECT * FROM user_settings WHERE user_id = ?')
    .bind(member.id)
    .first<UserSettings>();

  if (existing) {
    // Check if we need to reset monthly API calls
    if (shouldResetApiCalls(existing.api_calls_reset_at)) {
      await db
        .prepare(
          `UPDATE user_settings
           SET api_calls_this_month = 0,
               api_calls_reset_at = datetime('now', 'start of month', '+1 month')
           WHERE user_id = ?`
        )
        .bind(member.id)
        .run();

      return {
        ...existing,
        api_calls_this_month: 0,
      };
    }
    return existing;
  }

  // Determine tier from Memberstack plan
  const tier = determineTierFromPlan(member.planConnections);

  // Create new user settings
  const newSettings: UserSettings = {
    user_id: member.id,
    email: member.auth.email,
    email_notifications: true,
    webhook_url: null,
    default_region: 'us',
    tier,
    api_calls_this_month: 0,
    api_calls_reset_at: getNextMonthStart(),
    created_at: new Date().toISOString(),
  };

  await db
    .prepare(
      `INSERT INTO user_settings
       (user_id, email, email_notifications, webhook_url, default_region, tier, api_calls_this_month, api_calls_reset_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      newSettings.user_id,
      newSettings.email,
      newSettings.email_notifications ? 1 : 0,
      newSettings.webhook_url,
      newSettings.default_region,
      newSettings.tier,
      newSettings.api_calls_this_month,
      newSettings.api_calls_reset_at
    )
    .run();

  return newSettings;
}

function determineTierFromPlan(
  planConnections: Array<{ planId: string; planName: string }>
): 'free' | 'pro' | 'agency' {
  const planNames = planConnections.map((p) => p.planName.toLowerCase());

  if (planNames.some((name) => name.includes('agency'))) {
    return 'agency';
  }
  if (planNames.some((name) => name.includes('pro'))) {
    return 'pro';
  }
  return 'free';
}

function shouldResetApiCalls(resetAt: string | null): boolean {
  if (!resetAt) return true;
  return new Date(resetAt) <= new Date();
}

function getNextMonthStart(): string {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toISOString();
}

function getTierLimits(tier: 'free' | 'pro' | 'agency') {
  const limits = {
    free: { keywords: 3, api_calls: 50 },
    pro: { keywords: 25, api_calls: 3000 },
    agency: { keywords: 100, api_calls: 15000 },
  };
  return limits[tier];
}

/**
 * Increment API call counter
 */
export async function incrementApiCalls(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare(
      'UPDATE user_settings SET api_calls_this_month = api_calls_this_month + 1 WHERE user_id = ?'
    )
    .bind(userId)
    .run();
}

/**
 * Check keyword limit for user
 */
export async function checkKeywordLimit(
  db: D1Database,
  userId: string,
  tier: 'free' | 'pro' | 'agency'
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const limits = getTierLimits(tier);

  const result = await db
    .prepare(
      `SELECT COUNT(*) as count FROM tracked_keywords tk
       JOIN projects p ON tk.project_id = p.id
       WHERE p.user_id = ? AND tk.is_active = 1`
    )
    .bind(userId)
    .first<{ count: number }>();

  const current = result?.count || 0;

  return {
    allowed: current < limits.keywords,
    current,
    limit: limits.keywords,
  };
}
