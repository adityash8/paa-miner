import type { Env, PAAFetchResult, QuestionType, Region } from '../types';
import { detectQuestionType } from '../utils/questions';

interface SerpAPIResponse {
  related_questions?: Array<{
    question: string;
    snippet?: string;
    link?: string;
    title?: string;
  }>;
  error?: string;
}

export async function fetchPAAFromSerp(
  keyword: string,
  region: Region,
  env: Env,
  depth: number = 1
): Promise<PAAFetchResult[]> {
  const questions = await fetchSingleLevel(keyword, region, env);

  if (depth <= 0 || questions.length === 0) {
    return questions;
  }

  // Recursive expansion for depth > 0
  // Only expand top 5 questions to manage API costs
  const toExpand = questions.slice(0, 5);

  const expanded = await Promise.all(
    toExpand.map(async (q, index) => {
      try {
        const children = depth > 1
          ? await fetchPAAFromSerp(q.question, region, env, depth - 1)
          : await fetchSingleLevel(q.question, region, env);

        return {
          ...q,
          position: index,
          children: children.slice(0, 3), // Limit children
        };
      } catch (error) {
        console.error(`Failed to expand question: ${q.question}`, error);
        return { ...q, position: index, children: [] };
      }
    })
  );

  // Add non-expanded questions
  const remaining = questions.slice(5).map((q, i) => ({
    ...q,
    position: i + 5,
    children: [],
  }));

  return [...expanded, ...remaining];
}

async function fetchSingleLevel(
  keyword: string,
  region: Region,
  env: Env
): Promise<PAAFetchResult[]> {
  const params = new URLSearchParams({
    q: keyword,
    api_key: env.SERPAPI_KEY,
    gl: region,
    hl: 'en',
    num: '10',
  });

  const response = await fetch(`https://serpapi.com/search.json?${params}`);

  if (!response.ok) {
    throw new Error(`SerpAPI error: ${response.status} ${response.statusText}`);
  }

  const data: SerpAPIResponse = await response.json();

  if (data.error) {
    throw new Error(`SerpAPI error: ${data.error}`);
  }

  const relatedQuestions = data.related_questions || [];

  return relatedQuestions.map((q, index) => ({
    question: q.question,
    type: detectQuestionType(q.question),
    snippet: q.snippet,
    source_url: q.link,
    position: index,
    children: [],
  }));
}

// Calculate API calls used for a given depth
export function calculateAPICalls(depth: number): number {
  if (depth === 0) return 1;
  if (depth === 1) return 6; // 1 + 5 child expansions
  if (depth === 2) return 21; // 1 + 5 + (5 * 3)
  return 1;
}
