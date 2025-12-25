import type { Env, PAAChange, UserSettings } from '../types';

interface ChangeNotification {
  projectId: string;
  projectName: string;
  keyword: string;
  changes: Array<{
    type: 'added' | 'removed' | 'position_change';
    question: string;
    position?: number;
  }>;
}

/**
 * Send notifications for unnotified changes
 */
export async function sendChangeNotifications(env: Env): Promise<number> {
  const db = env.DB;

  // Get unnotified changes grouped by user
  const unnotifiedChanges = await db
    .prepare(
      `SELECT
        c.*,
        tk.keyword,
        p.id as project_id,
        p.name as project_name,
        p.user_id
       FROM paa_changes c
       JOIN tracked_keywords tk ON c.keyword_id = tk.id
       JOIN projects p ON tk.project_id = p.id
       WHERE c.notified = 0
         AND c.detected_at > datetime('now', '-24 hours')
       ORDER BY p.user_id, c.detected_at DESC`
    )
    .all();

  if (!unnotifiedChanges.results || unnotifiedChanges.results.length === 0) {
    return 0;
  }

  // Group changes by user
  const changesByUser = new Map<string, typeof unnotifiedChanges.results>();

  for (const change of unnotifiedChanges.results) {
    const userId = (change as any).user_id;
    if (!changesByUser.has(userId)) {
      changesByUser.set(userId, []);
    }
    changesByUser.get(userId)!.push(change);
  }

  let notificationsSent = 0;

  // Process each user's changes
  for (const [userId, changes] of changesByUser) {
    const userSettings = await db
      .prepare('SELECT * FROM user_settings WHERE user_id = ?')
      .bind(userId)
      .first<UserSettings>();

    if (!userSettings) continue;

    // Group changes by project/keyword for better organization
    const groupedChanges = groupChanges(changes as any[]);

    // Send email notification
    if (userSettings.email_notifications && userSettings.email) {
      try {
        await sendEmailNotification(
          userSettings.email,
          groupedChanges,
          env
        );
        notificationsSent++;
      } catch (error) {
        console.error(`Failed to send email to ${userSettings.email}:`, error);
      }
    }

    // Send webhook notification
    if (userSettings.webhook_url) {
      try {
        await sendWebhookNotification(
          userSettings.webhook_url,
          groupedChanges
        );
      } catch (error) {
        console.error(`Failed to send webhook to ${userSettings.webhook_url}:`, error);
      }
    }

    // Mark changes as notified
    const changeIds = changes.map((c: any) => c.id);
    if (changeIds.length > 0) {
      await db
        .prepare(
          `UPDATE paa_changes SET notified = 1 WHERE id IN (${changeIds.map(() => '?').join(',')})`
        )
        .bind(...changeIds)
        .run();
    }
  }

  return notificationsSent;
}

function groupChanges(
  changes: Array<{
    id: string;
    keyword: string;
    project_id: string;
    project_name: string;
    change_type: string;
    question: string;
    new_position: number | null;
  }>
): ChangeNotification[] {
  const grouped = new Map<string, ChangeNotification>();

  for (const change of changes) {
    const key = `${change.project_id}:${change.keyword}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        projectId: change.project_id,
        projectName: change.project_name,
        keyword: change.keyword,
        changes: [],
      });
    }

    grouped.get(key)!.changes.push({
      type: change.change_type as 'added' | 'removed' | 'position_change',
      question: change.question,
      position: change.new_position ?? undefined,
    });
  }

  return Array.from(grouped.values());
}

async function sendEmailNotification(
  email: string,
  notifications: ChangeNotification[],
  env: Env
): Promise<void> {
  const html = generateEmailHTML(notifications, env.APP_URL);
  const totalChanges = notifications.reduce(
    (sum, n) => sum + n.changes.length,
    0
  );

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: email,
      subject: `PAA Tracker: ${totalChanges} change${totalChanges > 1 ? 's' : ''} detected`,
      html,
    }),
  });
}

async function sendWebhookNotification(
  webhookUrl: string,
  notifications: ChangeNotification[]
): Promise<void> {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'paa_changes',
      timestamp: new Date().toISOString(),
      notifications,
    }),
  });
}

function generateEmailHTML(notifications: ChangeNotification[], appUrl: string): string {
  const addedChanges = notifications.flatMap((n) =>
    n.changes
      .filter((c) => c.type === 'added')
      .map((c) => ({ ...c, keyword: n.keyword }))
  );

  const removedChanges = notifications.flatMap((n) =>
    n.changes
      .filter((c) => c.type === 'removed')
      .map((c) => ({ ...c, keyword: n.keyword }))
  );

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #1f2937; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    h2 { color: #111827; margin-bottom: 16px; }
    h3 { color: #4b5563; margin: 24px 0 12px; font-size: 16px; }
    ul { margin: 0; padding-left: 20px; }
    li { margin: 8px 0; }
    .keyword { color: #6366f1; font-weight: 600; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .badge-new { background: #dcfce7; color: #166534; }
    .badge-removed { background: #fee2e2; color: #991b1b; }
    .cta { display: inline-block; margin-top: 24px; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 6px; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <h2>PAA Tracker Update</h2>
    <p>We detected changes in your tracked keywords.</p>

    ${addedChanges.length > 0 ? `
    <h3><span class="badge badge-new">NEW</span> Questions Detected</h3>
    <ul>
      ${addedChanges.map((c) => `
        <li>
          <span class="keyword">${escapeHtml(c.keyword)}:</span>
          ${escapeHtml(c.question)}
        </li>
      `).join('')}
    </ul>
    ` : ''}

    ${removedChanges.length > 0 ? `
    <h3><span class="badge badge-removed">REMOVED</span> Questions</h3>
    <ul>
      ${removedChanges.map((c) => `
        <li>
          <span class="keyword">${escapeHtml(c.keyword)}:</span>
          ${escapeHtml(c.question)}
        </li>
      `).join('')}
    </ul>
    ` : ''}

    <a href="${appUrl}/dashboard" class="cta">
      View Dashboard
    </a>

    <div class="footer">
      <p>You're receiving this because you enabled email notifications in PAA Dominator.</p>
      <p>Manage your notification preferences in Settings.</p>
    </div>
  </div>
</body>
</html>
  `;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
