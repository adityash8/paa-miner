import type { Env, Region, TrackedKeyword, PAAQuestion } from '../types';
import { fetchPAAFromSerp } from '../services/serpapi';
import { hashQuestion, detectQuestionType } from '../utils/questions';

interface DiffResult {
  added: Array<{ question: string; hash: string; position: number }>;
  removed: Array<{ question: string; hash: string }>;
  positionChanges: Array<{
    question: string;
    hash: string;
    oldPosition: number;
    newPosition: number;
  }>;
}

/**
 * Run the tracking cycle for all due keywords
 */
export async function runTrackingCycle(env: Env): Promise<{
  checked: number;
  changes: number;
}> {
  const db = env.DB;

  // Get keywords due for checking
  const dueKeywords = await db
    .prepare(
      `SELECT tk.*, p.user_id
       FROM tracked_keywords tk
       JOIN projects p ON tk.project_id = p.id
       WHERE tk.is_active = 1
         AND (tk.last_checked_at IS NULL
              OR datetime(tk.last_checked_at, '+' || tk.check_interval_hours || ' hours') < datetime('now'))`
    )
    .all<TrackedKeyword & { user_id: string }>();

  let totalChanges = 0;

  for (const keyword of dueKeywords.results || []) {
    try {
      const changes = await checkKeyword(keyword, env);
      totalChanges +=
        changes.added.length + changes.removed.length + changes.positionChanges.length;
    } catch (error) {
      console.error(`Failed to check keyword ${keyword.keyword}:`, error);
    }
  }

  return {
    checked: dueKeywords.results?.length || 0,
    changes: totalChanges,
  };
}

/**
 * Check a single keyword for PAA changes
 */
async function checkKeyword(
  keyword: TrackedKeyword & { user_id: string },
  env: Env
): Promise<DiffResult> {
  const db = env.DB;

  // 1. Fetch current PAA from SerpAPI
  const currentPAA = await fetchPAAFromSerp(
    keyword.keyword,
    keyword.region as Region,
    env,
    0
  );

  // 2. Get previous questions for this keyword
  const previousQuestions = await db
    .prepare(
      'SELECT * FROM paa_questions WHERE keyword_id = ? AND is_current = 1'
    )
    .bind(keyword.id)
    .all<PAAQuestion>();

  // 3. Compute diff
  const diff = diffPAALists(
    (previousQuestions.results || []).map((q) => ({
      question: q.question,
      hash: q.question_hash,
    })),
    currentPAA.map((q, i) => ({
      question: q.question,
      hash: hashQuestion(q.question),
      position: i,
      type: q.type,
    }))
  );

  const now = new Date().toISOString();

  // 4. Store snapshot
  const snapshotId = crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO paa_snapshots (id, keyword_id, captured_at, questions_json) VALUES (?, ?, ?, ?)'
    )
    .bind(snapshotId, keyword.id, now, JSON.stringify(currentPAA))
    .run();

  // 5. Process additions
  for (const added of diff.added) {
    const questionId = crypto.randomUUID();

    await db
      .prepare(
        `INSERT INTO paa_questions
         (id, keyword_id, question, question_hash, question_type, first_seen_at, last_seen_at, times_seen, avg_position, is_current)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 1)`
      )
      .bind(
        questionId,
        keyword.id,
        added.question,
        added.hash,
        detectQuestionType(added.question),
        now,
        now,
        added.position
      )
      .run();

    await db
      .prepare(
        `INSERT INTO paa_changes (id, keyword_id, change_type, question, question_hash, new_position, detected_at)
         VALUES (?, ?, 'added', ?, ?, ?, ?)`
      )
      .bind(crypto.randomUUID(), keyword.id, added.question, added.hash, added.position, now)
      .run();
  }

  // 6. Process removals
  for (const removed of diff.removed) {
    await db
      .prepare(
        'UPDATE paa_questions SET is_current = 0 WHERE keyword_id = ? AND question_hash = ?'
      )
      .bind(keyword.id, removed.hash)
      .run();

    await db
      .prepare(
        `INSERT INTO paa_changes (id, keyword_id, change_type, question, question_hash, detected_at)
         VALUES (?, ?, 'removed', ?, ?, ?)`
      )
      .bind(crypto.randomUUID(), keyword.id, removed.question, removed.hash, now)
      .run();
  }

  // 7. Process position changes and update existing questions
  for (const current of currentPAA) {
    const hash = hashQuestion(current.question);
    const position = currentPAA.indexOf(current);

    // Find in previous
    const prev = (previousQuestions.results || []).find(
      (p) => p.question_hash === hash
    );

    if (prev) {
      // Update existing question
      const newTimesSeen = prev.times_seen + 1;
      const newAvgPosition =
        (prev.avg_position! * prev.times_seen + position) / newTimesSeen;

      await db
        .prepare(
          `UPDATE paa_questions
           SET last_seen_at = ?, times_seen = ?, avg_position = ?
           WHERE id = ?`
        )
        .bind(now, newTimesSeen, newAvgPosition, prev.id)
        .run();
    }
  }

  // 8. Record significant position changes
  for (const moved of diff.positionChanges) {
    // Only record if position changed by 2 or more
    if (Math.abs(moved.oldPosition - moved.newPosition) >= 2) {
      await db
        .prepare(
          `INSERT INTO paa_changes
           (id, keyword_id, change_type, question, question_hash, old_position, new_position, detected_at)
           VALUES (?, ?, 'position_change', ?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          keyword.id,
          moved.question,
          moved.hash,
          moved.oldPosition,
          moved.newPosition,
          now
        )
        .run();
    }
  }

  // 9. Update keyword last_checked_at
  await db
    .prepare('UPDATE tracked_keywords SET last_checked_at = ? WHERE id = ?')
    .bind(now, keyword.id)
    .run();

  return diff;
}

/**
 * Compute diff between previous and current PAA lists
 */
function diffPAALists(
  previous: Array<{ question: string; hash: string }>,
  current: Array<{ question: string; hash: string; position: number; type?: string }>
): DiffResult {
  const prevMap = new Map(previous.map((q) => [q.hash, q]));
  const currMap = new Map(current.map((q) => [q.hash, q]));

  const added = current.filter((q) => !prevMap.has(q.hash));
  const removed = previous.filter((q) => !currMap.has(q.hash));

  const positionChanges: DiffResult['positionChanges'] = [];

  for (const curr of current) {
    if (prevMap.has(curr.hash)) {
      const prevIndex = previous.findIndex((p) => p.hash === curr.hash);
      if (prevIndex !== curr.position) {
        positionChanges.push({
          question: curr.question,
          hash: curr.hash,
          oldPosition: prevIndex,
          newPosition: curr.position,
        });
      }
    }
  }

  return { added, removed, positionChanges };
}

/**
 * Force refresh a single keyword
 */
export async function refreshKeyword(keywordId: string, env: Env): Promise<DiffResult> {
  const db = env.DB;

  const keyword = await db
    .prepare(
      `SELECT tk.*, p.user_id
       FROM tracked_keywords tk
       JOIN projects p ON tk.project_id = p.id
       WHERE tk.id = ?`
    )
    .bind(keywordId)
    .first<TrackedKeyword & { user_id: string }>();

  if (!keyword) {
    throw new Error('Keyword not found');
  }

  return checkKeyword(keyword, env);
}
