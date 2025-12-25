import { Hono } from 'hono';
import type { Env, Region, SUPPORTED_REGIONS, PAAFetchResult } from '../types';
import { fetchPAAFromSerp, calculateAPICalls } from '../services/serpapi';
import { generateAnswers, generateFullFAQSchema } from '../services/claude';
import { generateEmbedCode, generateCSV, slugify } from '../utils/html';
import { incrementApiCalls } from '../middleware/auth';

const paa = new Hono<{ Bindings: Env }>();

/**
 * GET /api/paa/fetch
 * Fetch PAA questions for a keyword
 */
paa.get('/fetch', async (c) => {
  const keyword = c.req.query('keyword');
  const region = (c.req.query('region') || 'us') as Region;
  const depth = parseInt(c.req.query('depth') || '1', 10);

  if (!keyword) {
    return c.json({ error: 'Missing keyword parameter' }, 400);
  }

  // Validate region
  const validRegions: Region[] = ['us', 'gb', 'au', 'ca', 'de', 'in', 'fr', 'es', 'it', 'nl', 'br', 'mx', 'jp'];
  if (!validRegions.includes(region)) {
    return c.json({ error: `Invalid region. Supported: ${validRegions.join(', ')}` }, 400);
  }

  // Validate depth
  if (depth < 0 || depth > 2) {
    return c.json({ error: 'Depth must be 0, 1, or 2' }, 400);
  }

  try {
    const auth = c.get('auth');

    // Increment API call counter
    await incrementApiCalls(c.env.DB, auth.userId);

    // Fetch PAA questions
    const questions = await fetchPAAFromSerp(keyword, region, c.env, depth);

    // Flatten for counting
    const totalQuestions = countQuestions(questions);
    const apiCallsUsed = calculateAPICalls(depth);

    return c.json({
      keyword,
      region,
      fetched_at: new Date().toISOString(),
      questions,
      total_questions: totalQuestions,
      api_calls_used: apiCallsUsed,
    });
  } catch (error) {
    console.error('PAA fetch error:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch PAA questions' },
      500
    );
  }
});

/**
 * POST /api/paa/generate
 * Generate PAA-optimized answers for questions
 */
paa.post('/generate', async (c) => {
  const body = await c.req.json();
  const { questions, context, save_to_project } = body;

  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    return c.json({ error: 'Missing or invalid questions array' }, 400);
  }

  if (questions.length > 20) {
    return c.json({ error: 'Maximum 20 questions per request' }, 400);
  }

  try {
    const auth = c.get('auth');

    // Increment API call counter
    await incrementApiCalls(c.env.DB, auth.userId);

    // Generate answers
    const { answers, tokens_used } = await generateAnswers(
      questions,
      context || {},
      c.env
    );

    // Generate full FAQ schema
    const full_schema = generateFullFAQSchema(answers);

    // Optionally save to project
    if (save_to_project) {
      await saveGeneratedContent(c.env.DB, save_to_project, answers);
    }

    return c.json({
      answers,
      full_schema,
      tokens_used,
    });
  } catch (error) {
    console.error('Generate error:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to generate answers' },
      500
    );
  }
});

/**
 * POST /api/paa/publish
 * Publish generated content to Webflow or export
 */
paa.post('/publish', async (c) => {
  const body = await c.req.json();
  const { answers, target, project_id } = body;

  if (!answers || !Array.isArray(answers) || answers.length === 0) {
    return c.json({ error: 'Missing or invalid answers array' }, 400);
  }

  if (!target || !target.type) {
    return c.json({ error: 'Missing target configuration' }, 400);
  }

  try {
    switch (target.type) {
      case 'webflow_cms':
        return await publishToWebflowCMS(c, answers, target, project_id);

      case 'webflow_embed':
        const embed = generateEmbedCode(answers);
        return c.json({
          type: 'embed',
          html: embed.html,
          schema: embed.schema,
          css: embed.css,
          combined: embed.combined,
        });

      case 'export_csv':
        const csv = generateCSV(
          answers.map((a) => ({
            question: a.question,
            type: a.type,
          }))
        );
        return new Response(csv, {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename="paa-questions.csv"',
          },
        });

      case 'export_json':
        return c.json({
          type: 'export',
          data: {
            questions: answers,
            schema: generateFullFAQSchema(answers),
            exported_at: new Date().toISOString(),
          },
        });

      default:
        return c.json({ error: 'Invalid target type' }, 400);
    }
  } catch (error) {
    console.error('Publish error:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to publish' },
      500
    );
  }
});

// Helper functions

function countQuestions(questions: PAAFetchResult[]): number {
  let count = questions.length;
  for (const q of questions) {
    if (q.children && q.children.length > 0) {
      count += countQuestions(q.children);
    }
  }
  return count;
}

async function saveGeneratedContent(
  db: D1Database,
  projectId: string,
  answers: Array<{
    question: string;
    type: string;
    answer_text: string;
    answer_html: string;
    schema: object;
  }>
): Promise<void> {
  // This would save to the generated_content table
  // For MVP, we skip this and just return the answers
  // TODO: Implement saving to DB with question linking
}

async function publishToWebflowCMS(
  c: any,
  answers: any[],
  target: { collection_id?: string; field_mapping?: Record<string, string> },
  projectId?: string
) {
  if (!projectId) {
    return c.json({ error: 'Project ID required for Webflow CMS publishing' }, 400);
  }

  // Get project with Webflow credentials
  const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?')
    .bind(projectId)
    .first();

  if (!project || !project.webflow_api_token) {
    return c.json({ error: 'Webflow not connected for this project' }, 400);
  }

  if (!target.collection_id) {
    return c.json({ error: 'Collection ID required for CMS publishing' }, 400);
  }

  const fieldMapping = target.field_mapping || {
    question: 'name',
    answer_html: 'answer-rich-text',
    type: 'question-type',
  };

  const createdItems = [];

  for (const answer of answers) {
    try {
      const fieldData: Record<string, string> = {
        slug: slugify(answer.question),
      };

      // Map fields according to mapping
      for (const [answerField, webflowField] of Object.entries(fieldMapping)) {
        if (answerField in answer) {
          fieldData[webflowField] = (answer as any)[answerField];
        }
      }

      const response = await fetch(
        `https://api.webflow.com/v2/collections/${target.collection_id}/items`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${project.webflow_api_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fieldData }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.error('Webflow API error:', error);
        continue;
      }

      const item = (await response.json()) as { id: string };
      createdItems.push({
        question: answer.question,
        item_id: item.id,
        item_url: `https://webflow.com/dashboard/sites/${project.webflow_site_id}/cms/${target.collection_id}/${item.id}`,
      });
    } catch (error) {
      console.error('Failed to create Webflow item:', error);
    }
  }

  return c.json({
    published: true,
    items_created: createdItems.length,
    webflow_items: createdItems,
  });
}

export default paa;
