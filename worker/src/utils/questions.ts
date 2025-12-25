import type { QuestionType } from '../types';

/**
 * Detect the type of question for optimal answer formatting
 */
export function detectQuestionType(question: string): QuestionType {
  const q = question.toLowerCase().trim();

  // Definition questions
  if (
    q.startsWith('what is') ||
    q.startsWith('what are') ||
    q.startsWith('what does') ||
    q.startsWith("what's")
  ) {
    return 'definition';
  }

  // Steps/How-to questions
  if (
    q.startsWith('how to') ||
    q.startsWith('how do') ||
    q.startsWith('how can') ||
    q.startsWith('how does')
  ) {
    return 'steps';
  }

  // Comparison questions
  if (
    q.includes(' vs ') ||
    q.includes(' vs. ') ||
    q.includes(' versus ') ||
    q.includes('difference between') ||
    q.includes('compared to') ||
    q.includes('comparison')
  ) {
    return 'comparison';
  }

  // List questions
  if (
    q.startsWith('best ') ||
    q.startsWith('top ') ||
    q.startsWith('most ') ||
    q.includes('best ') ||
    q.includes('examples of') ||
    q.includes('types of') ||
    q.includes('list of')
  ) {
    return 'list';
  }

  // Explanation questions
  if (q.startsWith('why ') || q.startsWith('why do') || q.startsWith('why does')) {
    return 'explanation';
  }

  // Yes/No questions
  if (
    q.startsWith('can ') ||
    q.startsWith('is ') ||
    q.startsWith('are ') ||
    q.startsWith('does ') ||
    q.startsWith('do ') ||
    q.startsWith('will ') ||
    q.startsWith('should ') ||
    q.startsWith('could ') ||
    q.startsWith('would ')
  ) {
    return 'yesno';
  }

  // Default to paragraph
  return 'paragraph';
}

/**
 * Generate a hash for a question (for comparison/deduplication)
 */
export function hashQuestion(question: string): string {
  const normalized = normalizeQuestion(question);
  // Simple hash using btoa - sufficient for comparison purposes
  return btoa(encodeURIComponent(normalized)).slice(0, 32);
}

/**
 * Normalize a question for comparison
 */
export function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .trim()
    // Remove punctuation except apostrophes in contractions
    .replace(/[^\w\s']/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Remove common filler words
    .replace(/\b(the|a|an)\b/g, '')
    .trim();
}

/**
 * Calculate priority score for a PAA opportunity
 * Higher score = better opportunity
 */
export function calculatePriorityScore(
  timesSeen: number,
  firstSeenAt: Date,
  questionType: QuestionType
): number {
  let score = 50; // Base score

  // +10 per time seen (max +30)
  score += Math.min(timesSeen * 10, 30);

  // +20 if seen in last 48 hours
  const hoursSinceFirstSeen = (Date.now() - firstSeenAt.getTime()) / (1000 * 60 * 60);
  if (hoursSinceFirstSeen <= 48) {
    score += 20;
  }

  // +10 for high snippet-win-rate question types
  if (questionType === 'steps' || questionType === 'list') {
    score += 10;
  }

  return Math.min(score, 100);
}
