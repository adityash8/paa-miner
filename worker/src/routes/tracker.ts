import { Hono } from 'hono';
import type { Env, Region, TrackedKeyword, PAAQuestion, PAAChange } from '../types';
import { fetchPAAFromSerp } from '../services/serpapi';
import { hashQuestion, detectQuestionType, calculatePriorityScore } from '../utils/questions';
import { checkKeywordLimit, incrementApiCalls } from '../middleware/auth';

const tracker = new Hono<{ Bindings: Env }>();

/**
 * POST /api/tracker/keywords
 * Add a keyword to tracking
 */
tracker.post('/keywords', async (c) => {
  const body = await c.req.json();
  const { project_id, keyword, region = 'us', interval_hours = 24 } = body;

  if (!project_id || !keyword) {
    return c.json({ error: 'Missing project_id or keyword' }, 400);
  }

  const auth = c.get('auth');

  // Check keyword limit
  const limit = await checkKeywordLimit(c.env.DB, auth.userId, auth.tier);
  if (!limit.allowed) {
    return c.json(
      {
        error: 'Keyword limit reached',
        current: limit.current,
        limit: limit.limit,
        tier: auth.tier,
      },
      403
    );
  }

  // Verify project belongs to user
  const project = await c.env.DB.prepare(
    'SELECT id FROM projects WHERE id = ? AND user_id = ?'
  )
    .bind(project_id, auth.userId)
    .first();

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  try {
    const id = crypto.randomUUID();

    // Insert the tracked keyword
    await c.env.DB.prepare(
      `INSERT INTO tracked_keywords (id, project_id, keyword, region, check_interval_hours)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(id, project_id, keyword, region, interval_hours)
      .run();

    // Increment API calls and do initial fetch
    await incrementApiCalls(c.env.DB, auth.userId);

    // Perform initial PAA fetch
    const questions = await fetchPAAFromSerp(keyword, region as Region, c.env, 0);

    // Store initial questions
    const now = new Date().toISOString();
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const qHash = hashQuestion(q.question);

      await c.env.DB.prepare(
        `INSERT INTO paa_questions
         (id, keyword_id, question, question_hash, question_type, first_seen_at, last_seen_at, times_seen, avg_position, is_current)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 1)`
      )
        .bind(
          crypto.randomUUID(),
          id,
          q.question,
          qHash,
          q.type,
          now,
          now,
          i
        )
        .run();
    }

    // Store initial snapshot
    await c.env.DB.prepare(
      `INSERT INTO paa_snapshots (id, keyword_id, questions_json)
       VALUES (?, ?, ?)`
    )
      .bind(crypto.randomUUID(), id, JSON.stringify(questions))
      .run();

    // Update last_checked_at
    await c.env.DB.prepare(
      `UPDATE tracked_keywords SET last_checked_at = ? WHERE id = ?`
    )
      .bind(now, id)
      .run();

    return c.json({
      id,
      keyword,
      region,
      interval_hours,
      initial_questions: questions.length,
      first_check_at: now,
    });
  } catch (error) {
    console.error('Add keyword error:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to add keyword' },
      500
    );
  }
});

/**
 * GET /api/tracker/dashboard
 * Get dashboard overview for a project
 */
tracker.get('/dashboard', async (c) => {
  const projectId = c.req.query('project_id');

  if (!projectId) {
    return c.json({ error: 'Missing project_id' }, 400);
  }

  const auth = c.get('auth');

  // Verify project belongs to user
  const project = await c.env.DB.prepare(
    'SELECT id FROM projects WHERE id = ? AND user_id = ?'
  )
    .bind(projectId, auth.userId)
    .first();

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  try {
    // Get keywords with stats
    const keywords = await c.env.DB.prepare(
      `SELECT
        tk.*,
        (SELECT COUNT(*) FROM paa_questions WHERE keyword_id = tk.id AND is_current = 1) as current_questions,
        (SELECT COUNT(*) FROM paa_changes WHERE keyword_id = tk.id AND detected_at > datetime('now', '-7 days')) as changes_7d,
        (SELECT COUNT(*) FROM paa_changes WHERE keyword_id = tk.id AND detected_at > datetime('now', '-30 days')) as changes_30d
      FROM tracked_keywords tk
      WHERE tk.project_id = ?
      ORDER BY tk.created_at DESC`
    )
      .bind(projectId)
      .all();

    // Calculate summary
    const keywordResults = keywords.results || [];
    const totalQuestions = keywordResults.reduce(
      (sum: number, k: any) => sum + (k.current_questions || 0),
      0
    );
    const newQuestions7d = keywordResults.reduce(
      (sum: number, k: any) => sum + (k.changes_7d || 0),
      0
    );

    // Get opportunities count
    const opportunities = await c.env.DB.prepare(
      `SELECT COUNT(*) as count
       FROM paa_questions q
       JOIN tracked_keywords tk ON q.keyword_id = tk.id
       LEFT JOIN generated_content gc ON q.id = gc.question_id
       WHERE tk.project_id = ?
         AND q.is_current = 1
         AND gc.id IS NULL`
    )
      .bind(projectId)
      .first<{ count: number }>();

    return c.json({
      keywords: keywordResults.map((k: any) => ({
        id: k.id,
        keyword: k.keyword,
        region: k.region,
        current_questions: k.current_questions,
        changes_7d: k.changes_7d,
        changes_30d: k.changes_30d,
        last_checked_at: k.last_checked_at,
        next_check_at: calculateNextCheck(k.last_checked_at, k.check_interval_hours),
        is_active: Boolean(k.is_active),
      })),
      summary: {
        total_keywords: keywordResults.length,
        total_questions: totalQuestions,
        new_questions_7d: newQuestions7d,
        opportunities: opportunities?.count || 0,
      },
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return c.json({ error: 'Failed to load dashboard' }, 500);
  }
});

/**
 * GET /api/tracker/keyword
 * Get detailed view for a single keyword
 */
tracker.get('/keyword', async (c) => {
  const keywordId = c.req.query('id');

  if (!keywordId) {
    return c.json({ error: 'Missing keyword id' }, 400);
  }

  const auth = c.get('auth');

  try {
    // Get keyword with project verification
    const keyword = await c.env.DB.prepare(
      `SELECT tk.* FROM tracked_keywords tk
       JOIN projects p ON tk.project_id = p.id
       WHERE tk.id = ? AND p.user_id = ?`
    )
      .bind(keywordId, auth.userId)
      .first<TrackedKeyword>();

    if (!keyword) {
      return c.json({ error: 'Keyword not found' }, 404);
    }

    // Get current questions
    const questions = await c.env.DB.prepare(
      `SELECT q.*,
        (SELECT gc.id FROM generated_content gc WHERE gc.question_id = q.id LIMIT 1) as has_content
       FROM paa_questions q
       WHERE q.keyword_id = ? AND q.is_current = 1
       ORDER BY q.avg_position ASC`
    )
      .bind(keywordId)
      .all();

    // Get recent changes
    const changes = await c.env.DB.prepare(
      `SELECT * FROM paa_changes
       WHERE keyword_id = ?
       ORDER BY detected_at DESC
       LIMIT 50`
    )
      .bind(keywordId)
      .all();

    // Get history (question counts over time)
    const history = await c.env.DB.prepare(
      `SELECT
        date(captured_at) as date,
        MAX(json_array_length(questions_json)) as question_count
       FROM paa_snapshots
       WHERE keyword_id = ?
       GROUP BY date(captured_at)
       ORDER BY date DESC
       LIMIT 30`
    )
      .bind(keywordId)
      .all();

    return c.json({
      keyword: {
        id: keyword.id,
        keyword: keyword.keyword,
        region: keyword.region,
        created_at: keyword.created_at,
        last_checked_at: keyword.last_checked_at,
      },
      current_questions: (questions.results || []).map((q: any) => ({
        id: q.id,
        question: q.question,
        type: q.question_type,
        position: Math.round(q.avg_position || 0),
        first_seen_at: q.first_seen_at,
        times_seen: q.times_seen,
        avg_position: q.avg_position,
        has_content: Boolean(q.has_content),
      })),
      recent_changes: (changes.results || []).map((ch: any) => ({
        type: ch.change_type,
        question: ch.question,
        old_position: ch.old_position,
        new_position: ch.new_position,
        detected_at: ch.detected_at,
      })),
      history: {
        dates: (history.results || []).map((h: any) => h.date).reverse(),
        question_counts: (history.results || []).map((h: any) => h.question_count).reverse(),
      },
    });
  } catch (error) {
    console.error('Keyword detail error:', error);
    return c.json({ error: 'Failed to load keyword details' }, 500);
  }
});

/**
 * GET /api/tracker/changes
 * Get change feed across all keywords
 */
tracker.get('/changes', async (c) => {
  const projectId = c.req.query('project_id');
  const days = parseInt(c.req.query('days') || '7', 10);
  const type = c.req.query('type') || 'all';
  const limit = Math.min(parseInt(c.req.query('limit') || '100', 10), 500);

  if (!projectId) {
    return c.json({ error: 'Missing project_id' }, 400);
  }

  const auth = c.get('auth');

  try {
    let query = `
      SELECT
        c.*,
        tk.keyword,
        tk.region
      FROM paa_changes c
      JOIN tracked_keywords tk ON c.keyword_id = tk.id
      JOIN projects p ON tk.project_id = p.id
      WHERE p.id = ? AND p.user_id = ?
        AND c.detected_at > datetime('now', '-' || ? || ' days')
    `;

    if (type !== 'all') {
      query += ` AND c.change_type = ?`;
    }

    query += ` ORDER BY c.detected_at DESC LIMIT ?`;

    const params =
      type !== 'all'
        ? [projectId, auth.userId, days, type, limit]
        : [projectId, auth.userId, days, limit];

    const changes = await c.env.DB.prepare(query).bind(...params).all();

    // Calculate summary
    const results = changes.results || [];
    const summary = {
      added: results.filter((c: any) => c.change_type === 'added').length,
      removed: results.filter((c: any) => c.change_type === 'removed').length,
      position_changes: results.filter((c: any) => c.change_type === 'position_change')
        .length,
    };

    return c.json({
      changes: results.map((c: any) => ({
        id: c.id,
        keyword: c.keyword,
        keyword_id: c.keyword_id,
        change_type: c.change_type,
        question: c.question,
        old_position: c.old_position,
        new_position: c.new_position,
        detected_at: c.detected_at,
      })),
      summary,
    });
  } catch (error) {
    console.error('Changes feed error:', error);
    return c.json({ error: 'Failed to load changes' }, 500);
  }
});

/**
 * GET /api/tracker/opportunities
 * Get new questions without generated content
 */
tracker.get('/opportunities', async (c) => {
  const projectId = c.req.query('project_id');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);

  if (!projectId) {
    return c.json({ error: 'Missing project_id' }, 400);
  }

  const auth = c.get('auth');

  try {
    const opportunities = await c.env.DB.prepare(
      `SELECT
        q.*,
        tk.keyword as seed_keyword,
        tk.region
      FROM paa_questions q
      JOIN tracked_keywords tk ON q.keyword_id = tk.id
      JOIN projects p ON tk.project_id = p.id
      LEFT JOIN generated_content gc ON q.id = gc.question_id
      WHERE p.id = ? AND p.user_id = ?
        AND q.is_current = 1
        AND gc.id IS NULL
        AND q.first_seen_at > datetime('now', '-14 days')
      ORDER BY q.times_seen DESC, q.first_seen_at DESC
      LIMIT ?`
    )
      .bind(projectId, auth.userId, limit)
      .all();

    return c.json({
      opportunities: (opportunities.results || []).map((o: any) => ({
        id: o.id,
        question: o.question,
        type: o.question_type,
        seed_keyword: o.seed_keyword,
        region: o.region,
        first_seen_at: o.first_seen_at,
        times_seen: o.times_seen,
        priority_score: calculatePriorityScore(
          o.times_seen,
          new Date(o.first_seen_at),
          o.question_type
        ),
      })),
    });
  } catch (error) {
    console.error('Opportunities error:', error);
    return c.json({ error: 'Failed to load opportunities' }, 500);
  }
});

/**
 * DELETE /api/tracker/keywords/:id
 * Delete a tracked keyword
 */
tracker.delete('/keywords/:id', async (c) => {
  const keywordId = c.req.param('id');
  const auth = c.get('auth');

  try {
    // Verify ownership
    const keyword = await c.env.DB.prepare(
      `SELECT tk.id FROM tracked_keywords tk
       JOIN projects p ON tk.project_id = p.id
       WHERE tk.id = ? AND p.user_id = ?`
    )
      .bind(keywordId, auth.userId)
      .first();

    if (!keyword) {
      return c.json({ error: 'Keyword not found' }, 404);
    }

    // Delete (cascades to related tables)
    await c.env.DB.prepare('DELETE FROM tracked_keywords WHERE id = ?')
      .bind(keywordId)
      .run();

    return c.json({ deleted: true });
  } catch (error) {
    console.error('Delete keyword error:', error);
    return c.json({ error: 'Failed to delete keyword' }, 500);
  }
});

/**
 * PATCH /api/tracker/keywords/:id
 * Update a tracked keyword (pause/resume, change interval)
 */
tracker.patch('/keywords/:id', async (c) => {
  const keywordId = c.req.param('id');
  const body = await c.req.json();
  const auth = c.get('auth');

  try {
    // Verify ownership
    const keyword = await c.env.DB.prepare(
      `SELECT tk.id FROM tracked_keywords tk
       JOIN projects p ON tk.project_id = p.id
       WHERE tk.id = ? AND p.user_id = ?`
    )
      .bind(keywordId, auth.userId)
      .first();

    if (!keyword) {
      return c.json({ error: 'Keyword not found' }, 404);
    }

    const updates: string[] = [];
    const values: any[] = [];

    if ('is_active' in body) {
      updates.push('is_active = ?');
      values.push(body.is_active ? 1 : 0);
    }

    if ('check_interval_hours' in body) {
      updates.push('check_interval_hours = ?');
      values.push(body.check_interval_hours);
    }

    if (updates.length === 0) {
      return c.json({ error: 'No valid updates provided' }, 400);
    }

    values.push(keywordId);

    await c.env.DB.prepare(
      `UPDATE tracked_keywords SET ${updates.join(', ')} WHERE id = ?`
    )
      .bind(...values)
      .run();

    return c.json({ updated: true });
  } catch (error) {
    console.error('Update keyword error:', error);
    return c.json({ error: 'Failed to update keyword' }, 500);
  }
});

// Helper function
function calculateNextCheck(
  lastChecked: string | null,
  intervalHours: number
): string | null {
  if (!lastChecked) return null;
  const next = new Date(lastChecked);
  next.setHours(next.getHours() + intervalHours);
  return next.toISOString();
}

export default tracker;
