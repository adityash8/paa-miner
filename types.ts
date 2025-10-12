export type Device = 'mobile' | 'desktop';

export interface PAAParams {
  keyword: string;
  gl: string;        // country code (US, IN, GB, etc.)
  hl: string;        // language (en, en-IN, etc.)
  device: Device;
  depth: number;     // 1..3
  k: number;         // consensus runs (1..3)
  uule?: string;     // optional city bias
  strict?: boolean;  // keep only questions that appear in >=2 runs (or >=k if k>2)
}

export interface PAAItem {
  raw: string;
  norm: string;
  depth: number;
  parent?: string;
  domPath: string;
  orderIdx: number;
}

export interface Evidence {
  fullScreenshotB64?: string;
  paaHtml?: string;
  paaCropsB64?: string[];
}

export interface PAARunResult {
  items: PAAItem[];
  evidence: Evidence;
  serpHash: string;
  ipCountry?: string;
  asn?: string;
}

export interface ConsensusPAAResult {
  question: string;
  norm: string;
  depth: number;
  parent?: string;
  appearances: number;
  confidence: number;
}
