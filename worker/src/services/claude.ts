import type { Env, GeneratedAnswer, QuestionType, FAQSchema } from '../types';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeResponse {
  content: Array<{ type: 'text'; text: string }>;
  usage: { input_tokens: number; output_tokens: number };
}

const SYSTEM_PROMPT = `You generate answers optimized to win Google's People Also Ask featured snippets.

FORMAT RULES BY TYPE:

[DEFINITION] - 40-60 words
- First sentence directly defines/answers
- Second sentence adds key context
- No fluff, no "In this article"

[STEPS] - 5-8 numbered steps
- Each step starts with action verb
- One line per step, 5-15 words
- No intro paragraph, jump straight to "1."

[LIST] - 4-8 bullet points
- Parallel grammatical structure
- No intro sentence
- Each bullet 5-20 words

[COMPARISON] - Markdown table
- 3-5 rows maximum
- Clear column headers
- Concise cell content (2-5 words)

[YESNO] - Direct answer
- Start with "Yes," or "No,"
- Follow with 1-2 sentence explanation
- Total under 50 words

[EXPLANATION] - 50-80 words
- First sentence answers "why"
- Remaining sentences provide evidence/reasoning
- Conversational but authoritative

[PARAGRAPH] - 40-60 words
- Direct answer in first sentence
- Supporting detail in second
- No questions, no CTAs

NEVER USE:
- "In this article" or "Let's explore"
- "It's important to note that"
- Questions in the answer
- Exclamation marks
- First person ("I", "we")
- More than 300 characters for paragraph types

OUTPUT FORMAT:
For each question, output your answer with the format:
---
[QUESTION_NUMBER]. [TYPE]
[Your answer here]
---`;

interface GenerateContext {
  brand?: string;
  audience?: string;
  tone?: string;
  include_cta?: boolean;
  cta_text?: string;
}

export async function generateAnswers(
  questions: Array<{ question: string; type: QuestionType }>,
  context: GenerateContext,
  env: Env
): Promise<{ answers: GeneratedAnswer[]; tokens_used: number }> {
  const userPrompt = buildUserPrompt(questions, context);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${error}`);
  }

  const data: ClaudeResponse = await response.json();
  const text = data.content[0]?.text || '';
  const tokens_used = data.usage.input_tokens + data.usage.output_tokens;

  const answers = parseAnswers(text, questions);

  return { answers, tokens_used };
}

function buildUserPrompt(
  questions: Array<{ question: string; type: QuestionType }>,
  context: GenerateContext
): string {
  const questionList = questions
    .map((q, i) => `${i + 1}. [${q.type.toUpperCase()}] ${q.question}`)
    .join('\n');

  let prompt = `Generate PAA-optimized answers for these questions:\n\n${questionList}`;

  if (context.brand || context.audience || context.tone) {
    prompt += '\n\nContext:';
    if (context.brand) prompt += `\n- Brand/Company: ${context.brand}`;
    if (context.audience) prompt += `\n- Target audience: ${context.audience}`;
    if (context.tone) prompt += `\n- Tone: ${context.tone}`;
  }

  if (context.include_cta && context.cta_text) {
    prompt += `\n\nIf appropriate, subtly incorporate this CTA: "${context.cta_text}"`;
  }

  return prompt;
}

function parseAnswers(
  text: string,
  questions: Array<{ question: string; type: QuestionType }>
): GeneratedAnswer[] {
  const answers: GeneratedAnswer[] = [];

  // Split by the --- delimiter pattern
  const sections = text.split(/---+/).filter((s) => s.trim());

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    let answerText = '';

    // Try to find the matching section
    for (const section of sections) {
      const trimmed = section.trim();
      // Match patterns like "1. [DEFINITION]" or "1. [definition]"
      const pattern = new RegExp(`^${i + 1}\\.\\s*\\[${q.type}\\]`, 'i');
      if (pattern.test(trimmed)) {
        // Extract the answer after the header
        answerText = trimmed.replace(pattern, '').trim();
        break;
      }
    }

    // Fallback: if we couldn't parse, use the section by index
    if (!answerText && sections[i]) {
      answerText = sections[i]
        .replace(/^\d+\.\s*\[[A-Z]+\]/i, '')
        .trim();
    }

    if (!answerText) {
      answerText = `[Answer generation failed for: ${q.question}]`;
    }

    const answer_html = formatAnswerAsHTML(answerText, q.type);
    const word_count = answerText.split(/\s+/).length;

    answers.push({
      question: q.question,
      type: q.type,
      answer_text: answerText,
      answer_html,
      word_count,
      schema: generateQuestionSchema(q.question, answerText),
    });
  }

  return answers;
}

function formatAnswerAsHTML(answer: string, type: QuestionType): string {
  switch (type) {
    case 'steps':
      return formatStepsAsHTML(answer);
    case 'list':
      return formatListAsHTML(answer);
    case 'comparison':
      return formatTableAsHTML(answer);
    default:
      return `<p>${escapeHTML(answer)}</p>`;
  }
}

function formatStepsAsHTML(answer: string): string {
  const lines = answer.split('\n').filter((line) => line.trim());
  const items = lines.map((line) => {
    const cleaned = line.replace(/^\d+[\.\)]\s*/, '').trim();
    return `<li>${escapeHTML(cleaned)}</li>`;
  });
  return `<ol>${items.join('')}</ol>`;
}

function formatListAsHTML(answer: string): string {
  const lines = answer.split('\n').filter((line) => line.trim());
  const items = lines.map((line) => {
    const cleaned = line.replace(/^[-*•]\s*/, '').trim();
    return `<li>${escapeHTML(cleaned)}</li>`;
  });
  return `<ul>${items.join('')}</ul>`;
}

function formatTableAsHTML(answer: string): string {
  const lines = answer.split('\n').filter((line) => line.includes('|'));
  if (lines.length < 2) {
    return `<p>${escapeHTML(answer)}</p>`;
  }

  let html = '<table>';

  lines.forEach((line, index) => {
    // Skip separator lines like |---|---|
    if (/^\|[\s-|]+\|$/.test(line)) return;

    const cells = line
      .split('|')
      .filter((cell) => cell.trim())
      .map((cell) => cell.trim());

    if (cells.length === 0) return;

    const tag = index === 0 ? 'th' : 'td';
    const row = cells.map((cell) => `<${tag}>${escapeHTML(cell)}</${tag}>`).join('');
    html += `<tr>${row}</tr>`;
  });

  html += '</table>';
  return html;
}

function generateQuestionSchema(question: string, answer: string): FAQSchema {
  // Clean answer for schema (remove markdown, normalize whitespace)
  const cleanAnswer = answer
    .replace(/\n/g, ' ')
    .replace(/\|/g, '')
    .replace(/[-*•]\s*/g, '')
    .replace(/\d+[\.\)]\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    '@type': 'Question',
    name: question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: cleanAnswer,
    },
  };
}

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function generateFullFAQSchema(answers: GeneratedAnswer[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: answers.map((a) => a.schema),
  };
}
