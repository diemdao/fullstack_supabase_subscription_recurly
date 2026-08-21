// Shared subscription vocabulary.
//
// These lived inside `components/CreateSubscriptionModal.tsx`. The agent needs
// the exact same lists to build valid drafts, so they move here and the modal
// imports them instead of declaring its own.

import type { IconKey } from '@/constants/icons';

export type Frequency = 'Monthly' | 'Yearly';

export const FREQUENCIES: Frequency[] = ['Monthly', 'Yearly'];

export type Category =
  | 'Entertainment'
  | 'AI Tools'
  | 'Developer Tools'
  | 'Design'
  | 'Productivity'
  | 'Cloud'
  | 'Music'
  | 'Other';

export const CATEGORIES: Category[] = [
  'Entertainment',
  'AI Tools',
  'Developer Tools',
  'Design',
  'Productivity',
  'Cloud',
  'Music',
  'Other',
];

export const CATEGORY_COLORS: Record<Category, string> = {
  'Entertainment': '#ff6b6b',
  'AI Tools': '#b8d4e3',
  'Developer Tools': '#e8def8',
  'Design': '#f5c542',
  'Productivity': '#95e1d3',
  'Cloud': '#a8d8ea',
  'Music': '#e2b6cf',
  'Other': '#d4d4d4',
};

/**
 * The modal renders labelled status chips, the agent only needs the values.
 * Both come from here so they cannot drift apart.
 */
export const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export type Status = (typeof STATUS_OPTIONS)[number]['value'];

export const STATUSES: Status[] = STATUS_OPTIONS.map((option) => option.value);

/** Brand glyphs only. The rest of `icons` is app chrome (tabs, arrows). */
export const ICON_CHOICES: IconKey[] = [
  'plus',
  'spotify',
  'notion',
  'figma',
  'github',
  'adobe',
  'claude',
  'openai',
  'canva',
  'dropbox',
  'medium',
];

/** Category colours plus a few extras, matching the modal's swatch row. */
export const SWATCHES: string[] = [
  ...new Set([...Object.values(CATEGORY_COLORS), '#b8e8d0', '#ffd6a5', '#c7ceea']),
];

export const DEFAULT_CURRENCY = 'USD';

/**
 * Best-effort icon for a service name, so the agent doesn't stamp every new
 * subscription with the generic plus glyph. Falls back to 'plus'.
 *
 * Note: `assets/icons/netflix.png` and `wallet.png` exist on disk but are not
 * all exported from `constants/icons.ts` — only add aliases for keys that are.
 */
const ICON_ALIASES: Record<string, IconKey> = {
  spotify: 'spotify',
  notion: 'notion',
  figma: 'figma',
  github: 'github',
  adobe: 'adobe',
  photoshop: 'adobe',
  lightroom: 'adobe',
  'creative cloud': 'adobe',
  claude: 'claude',
  anthropic: 'claude',
  openai: 'openai',
  chatgpt: 'openai',
  canva: 'canva',
  dropbox: 'dropbox',
  medium: 'medium',
};

export const iconKeyForName = (name: string): IconKey => {
  const haystack = name.trim().toLowerCase();
  for (const [needle, key] of Object.entries(ICON_ALIASES)) {
    if (haystack.includes(needle)) return key;
  }
  return 'plus';
};
