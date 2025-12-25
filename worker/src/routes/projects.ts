import { Hono } from 'hono';
import type { Env, Project } from '../types';

const projects = new Hono<{ Bindings: Env }>();

/**
 * GET /api/projects
 * List user's projects
 */
projects.get('/', async (c) => {
  const auth = c.get('auth');

  try {
    const result = await c.env.DB.prepare(
      `SELECT
        p.*,
        (SELECT COUNT(*) FROM tracked_keywords WHERE project_id = p.id) as keyword_count
       FROM projects p
       WHERE p.user_id = ?
       ORDER BY p.created_at DESC`
    )
      .bind(auth.userId)
      .all();

    return c.json({
      projects: (result.results || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        webflow_connected: Boolean(p.webflow_site_id),
        keyword_count: p.keyword_count,
        created_at: p.created_at,
        updated_at: p.updated_at,
      })),
    });
  } catch (error) {
    console.error('List projects error:', error);
    return c.json({ error: 'Failed to list projects' }, 500);
  }
});

/**
 * POST /api/projects
 * Create a new project
 */
projects.post('/', async (c) => {
  const body = await c.req.json();
  const { name, webflow_site_id, webflow_api_token } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return c.json({ error: 'Project name is required' }, 400);
  }

  const auth = c.get('auth');

  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      `INSERT INTO projects (id, user_id, name, webflow_site_id, webflow_api_token, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        auth.userId,
        name.trim(),
        webflow_site_id || null,
        webflow_api_token || null,
        now,
        now
      )
      .run();

    return c.json({
      id,
      name: name.trim(),
      webflow_connected: Boolean(webflow_site_id),
      created_at: now,
    });
  } catch (error) {
    console.error('Create project error:', error);
    return c.json({ error: 'Failed to create project' }, 500);
  }
});

/**
 * GET /api/projects/:id
 * Get a single project
 */
projects.get('/:id', async (c) => {
  const projectId = c.req.param('id');
  const auth = c.get('auth');

  try {
    const project = await c.env.DB.prepare(
      'SELECT * FROM projects WHERE id = ? AND user_id = ?'
    )
      .bind(projectId, auth.userId)
      .first<Project>();

    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    return c.json({
      id: project.id,
      name: project.name,
      webflow_site_id: project.webflow_site_id,
      webflow_connected: Boolean(project.webflow_site_id),
      created_at: project.created_at,
      updated_at: project.updated_at,
    });
  } catch (error) {
    console.error('Get project error:', error);
    return c.json({ error: 'Failed to get project' }, 500);
  }
});

/**
 * PATCH /api/projects/:id
 * Update a project
 */
projects.patch('/:id', async (c) => {
  const projectId = c.req.param('id');
  const body = await c.req.json();
  const auth = c.get('auth');

  try {
    // Verify ownership
    const project = await c.env.DB.prepare(
      'SELECT id FROM projects WHERE id = ? AND user_id = ?'
    )
      .bind(projectId, auth.userId)
      .first();

    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    const updates: string[] = [];
    const values: any[] = [];

    if ('name' in body && typeof body.name === 'string') {
      updates.push('name = ?');
      values.push(body.name.trim());
    }

    if ('webflow_site_id' in body) {
      updates.push('webflow_site_id = ?');
      values.push(body.webflow_site_id || null);
    }

    if ('webflow_api_token' in body) {
      updates.push('webflow_api_token = ?');
      values.push(body.webflow_api_token || null);
    }

    if (updates.length === 0) {
      return c.json({ error: 'No valid updates provided' }, 400);
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(projectId);

    await c.env.DB.prepare(
      `UPDATE projects SET ${updates.join(', ')} WHERE id = ?`
    )
      .bind(...values)
      .run();

    return c.json({ updated: true });
  } catch (error) {
    console.error('Update project error:', error);
    return c.json({ error: 'Failed to update project' }, 500);
  }
});

/**
 * DELETE /api/projects/:id
 * Delete a project and all associated data
 */
projects.delete('/:id', async (c) => {
  const projectId = c.req.param('id');
  const auth = c.get('auth');

  try {
    // Verify ownership
    const project = await c.env.DB.prepare(
      'SELECT id FROM projects WHERE id = ? AND user_id = ?'
    )
      .bind(projectId, auth.userId)
      .first();

    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // Delete project (cascades to tracked_keywords -> paa_questions, etc.)
    await c.env.DB.prepare('DELETE FROM projects WHERE id = ?')
      .bind(projectId)
      .run();

    return c.json({ deleted: true });
  } catch (error) {
    console.error('Delete project error:', error);
    return c.json({ error: 'Failed to delete project' }, 500);
  }
});

/**
 * POST /api/projects/:id/connect-webflow
 * Connect Webflow to a project
 */
projects.post('/:id/connect-webflow', async (c) => {
  const projectId = c.req.param('id');
  const body = await c.req.json();
  const { site_id, api_token } = body;

  if (!site_id || !api_token) {
    return c.json({ error: 'site_id and api_token are required' }, 400);
  }

  const auth = c.get('auth');

  try {
    // Verify ownership
    const project = await c.env.DB.prepare(
      'SELECT id FROM projects WHERE id = ? AND user_id = ?'
    )
      .bind(projectId, auth.userId)
      .first();

    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // Validate Webflow token by making a test API call
    const testResponse = await fetch(`https://api.webflow.com/v2/sites/${site_id}`, {
      headers: {
        Authorization: `Bearer ${api_token}`,
      },
    });

    if (!testResponse.ok) {
      return c.json({ error: 'Invalid Webflow credentials' }, 400);
    }

    const siteData = (await testResponse.json()) as { displayName?: string; name?: string };

    // Update project with Webflow credentials
    await c.env.DB.prepare(
      `UPDATE projects
       SET webflow_site_id = ?, webflow_api_token = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(site_id, api_token, new Date().toISOString(), projectId)
      .run();

    return c.json({
      connected: true,
      site_name: siteData.displayName || siteData.name,
      site_id,
    });
  } catch (error) {
    console.error('Connect Webflow error:', error);
    return c.json({ error: 'Failed to connect Webflow' }, 500);
  }
});

/**
 * DELETE /api/projects/:id/disconnect-webflow
 * Disconnect Webflow from a project
 */
projects.delete('/:id/disconnect-webflow', async (c) => {
  const projectId = c.req.param('id');
  const auth = c.get('auth');

  try {
    // Verify ownership
    const project = await c.env.DB.prepare(
      'SELECT id FROM projects WHERE id = ? AND user_id = ?'
    )
      .bind(projectId, auth.userId)
      .first();

    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    await c.env.DB.prepare(
      `UPDATE projects
       SET webflow_site_id = NULL, webflow_api_token = NULL, updated_at = ?
       WHERE id = ?`
    )
      .bind(new Date().toISOString(), projectId)
      .run();

    return c.json({ disconnected: true });
  } catch (error) {
    console.error('Disconnect Webflow error:', error);
    return c.json({ error: 'Failed to disconnect Webflow' }, 500);
  }
});

export default projects;
