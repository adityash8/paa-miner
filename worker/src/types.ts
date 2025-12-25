// Environment bindings
export interface Env {
  DB: D1Database;
  SERPAPI_KEY: string;
  ANTHROPIC_API_KEY: string;
  MEMBERSTACK_SECRET_KEY: string;
  RESEND_API_KEY: string;
  APP_URL: string;
  EMAIL_FROM: string;
}

// Database types
export interface Project {
  id: string;
  user_id: string;
  name: string;
  webflow_site_id: string | null;
  webflow_api_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrackedKeyword {
  id: string;
  project_id: string;
  keyword: string;
  region: string;
  check_interval_hours: number;
  last_checked_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PAASnapshot {
  id: string;
  keyword_id: string;
  captured_at: string;
  questions_json: string;
}

export interface PAAQuestion {
  id: string;
  keyword_id: string;
  question: string;
  question_hash: string;
  question_type: QuestionType | null;
  first_seen_at: string;
  last_seen_at: string;
  times_seen: number;
  avg_position: number | null;
  is_current: boolean;
  parent_question_hash: string | null;
}

export interface PAAChange {
  id: string;
  keyword_id: string;
  change_type: 'added' | 'removed' | 'position_change';
  question: string;
  question_hash: string;
  old_position: number | null;
  new_position: number | null;
  detected_at: string;
  notified: boolean;
}

export interface GeneratedContent {
  id: string;
  question_id: string;
  answer_text: string;
  answer_html: string | null;
  answer_format: AnswerFormat;
  schema_json: string | null;
  published_to: string | null;
  webflow_item_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  user_id: string;
  email: string | null;
  email_notifications: boolean;
  webhook_url: string | null;
  default_region: string;
  tier: 'free' | 'pro' | 'agency';
  api_calls_this_month: number;
  api_calls_reset_at: string | null;
  created_at: string;
}

// Question types for answer formatting
export type QuestionType =
  | 'definition'
  | 'steps'
  | 'list'
  | 'comparison'
  | 'explanation'
  | 'yesno'
  | 'paragraph';

export type AnswerFormat = 'paragraph' | 'list' | 'steps' | 'table';

// API types
export interface PAAFetchResult {
  question: string;
  type: QuestionType;
  snippet?: string;
  source_url?: string;
  position: number;
  children?: PAAFetchResult[];
}

export interface GenerateRequest {
  questions: Array<{
    question: string;
    type: QuestionType;
  }>;
  context?: {
    brand?: string;
    audience?: string;
    tone?: string;
    include_cta?: boolean;
    cta_text?: string;
  };
  save_to_project?: string;
}

export interface GeneratedAnswer {
  question: string;
  type: QuestionType;
  answer_text: string;
  answer_html: string;
  word_count: number;
  schema: FAQSchema;
}

export interface FAQSchema {
  '@type': 'Question';
  name: string;
  acceptedAnswer: {
    '@type': 'Answer';
    text: string;
  };
}

export interface PublishRequest {
  answers: GeneratedAnswer[];
  target: {
    type: 'webflow_cms' | 'webflow_embed' | 'export_csv' | 'export_json';
    collection_id?: string;
    field_mapping?: Record<string, string>;
  };
  project_id?: string;
}

// Tier limits
export const TIER_LIMITS = {
  free: { keywords: 3, api_calls: 50 },
  pro: { keywords: 25, api_calls: 3000 },
  agency: { keywords: 100, api_calls: 15000 },
} as const;

// Supported regions
export const SUPPORTED_REGIONS = [
  'us', 'gb', 'au', 'ca', 'de', 'in', 'fr', 'es', 'it', 'nl', 'br', 'mx', 'jp'
] as const;

export type Region = typeof SUPPORTED_REGIONS[number];
