type VenueLike = { name?: string; address?: string } | string | null | undefined;

type SearchFieldKey = 'title' | 'venue' | 'description' | 'address' | 'categories' | 'source' | 'url';

export interface SearchableEventLike {
  title?: string;
  description?: string;
  venue?: VenueLike;
  categories?: string[];
  category?: string;
  source?: string;
  sources?: string[] | string;
  eventUrl?: string;
  ticketUrl?: string;
  externalUrl?: string;
  location?: string;
  address?: string;
}

interface TermGroup {
  normalized: string;
  variants: string[];
  isPhrase: boolean;
  field?: SearchFieldKey;
}

interface ParsedQuery {
  raw: string;
  includeGroups: TermGroup[];
  excludeGroups: TermGroup[];
  requiredPhraseGroups: TermGroup[];
  requiredFieldGroups: TermGroup[];
}

interface IndexedField {
  key: SearchFieldKey;
  text: string;
  compact: string;
  words: string[];
  weight: number;
}

const FIELD_WEIGHTS: Record<SearchFieldKey, number> = {
  title: 9,
  venue: 10,
  description: 4,
  address: 6,
  categories: 7,
  source: 3,
  url: 2,
};

const FIELD_ALIASES: Record<string, SearchFieldKey> = {
  t: 'title',
  title: 'title',
  venue: 'venue',
  v: 'venue',
  place: 'venue',
  location: 'venue',
  in: 'venue',
  cat: 'categories',
  category: 'categories',
  categories: 'categories',
  tag: 'categories',
  tags: 'categories',
  source: 'source',
  provider: 'source',
  site: 'source',
  url: 'url',
};

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'at', 'for', 'from', 'in', 'near', 'of', 'on', 'or', 'the', 'to', 'with',
  'event', 'events', 'thing', 'things', 'show', 'shows', 'happening', 'happenings', 'find', 'looking',
  'around', 'bay', 'area'
]);

const RAW_ALIAS_GROUPS: string[][] = [
  ['deyoung', 'de young', 'de-young', 'de young museum'],
  ['famsf', 'fine arts museums', 'fine arts museums of san francisco'],
  ['legion', 'legion of honor', 'legion museum'],
  ['fox theater', 'fox theatre', 'fox oakland', 'fox theater oakland', 'fox theatre oakland'],
  ['bampfa', 'berkeley art museum', 'pacific film archive', 'berkeley art museum and pacific film archive'],
  ['calperformances', 'cal performances', 'cal performance', 'zellerbach', 'zellerbach hall'],
  ['sf', 'san francisco'],
  ['sj', 'san jose'],
];

const ALIAS_GRAPH = buildAliasGraph(RAW_ALIAS_GROUPS);

function buildAliasGraph(groups: string[][]): Map<string, string[]> {
  const graph = new Map<string, Set<string>>();
  for (const group of groups) {
    const normalizedGroup = Array.from(new Set(group.map(normalizeText).filter(Boolean)));
    for (const key of normalizedGroup) {
      if (!graph.has(key)) graph.set(key, new Set<string>());
      for (const value of normalizedGroup) {
        if (value !== key) graph.get(key)!.add(value);
      }
    }
  }
  const finalized = new Map<string, string[]>();
  for (const [key, set] of graph.entries()) {
    finalized.set(key, Array.from(set));
  }
  return finalized;
}

function normalizeText(input: string): string {
  return String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactText(input: string): string {
  return normalizeText(input).replace(/[\s-]+/g, '');
}

function tokenizeWords(text: string): string[] {
  return normalizeText(text).split(' ').filter(Boolean);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isOneEditAway(a: string, b: string): boolean {
  if (a === b) return true;
  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > 1) return false;

  let i = 0;
  let j = 0;
  let edits = 0;

  while (i < lenA && j < lenB) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    edits++;
    if (edits > 1) return false;

    if (lenA > lenB) i++;
    else if (lenB > lenA) j++;
    else {
      i++;
      j++;
    }
  }

  if (i < lenA || j < lenB) edits++;
  return edits <= 1;
}

function stemWord(token: string): string {
  if (token.length > 5 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

function tokenizeQuery(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const ch of String(input || '')) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if (!inQuotes && /\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

function stripOuterQuotes(value: string): string {
  const trimmed = String(value || '').trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function dedupeGroups(groups: TermGroup[]): TermGroup[] {
  const byKey = new Map<string, TermGroup>();
  for (const group of groups) {
    const key = `${group.field || 'any'}|${group.isPhrase ? 'p' : 't'}|${group.normalized}`;
    if (!byKey.has(key)) byKey.set(key, group);
  }
  return Array.from(byKey.values());
}

function createGroup(rawValue: string, options?: { isPhrase?: boolean; field?: SearchFieldKey; keepStopWords?: boolean }): TermGroup | null {
  const normalized = normalizeText(rawValue);
  if (!normalized) return null;

  const words = normalized.split(' ').filter(Boolean);
  const isPhrase = !!options?.isPhrase || words.length > 1;
  if (!isPhrase && !options?.keepStopWords && STOP_WORDS.has(normalized)) return null;

  const variants = new Set<string>();
  variants.add(normalized);

  const aliasVariants = ALIAS_GRAPH.get(normalized) || [];
  for (const alias of aliasVariants) variants.add(alias);

  if (!isPhrase && words.length === 1) {
    const stemmed = stemWord(normalized);
    if (stemmed.length >= 2) variants.add(stemmed);
  }

  return {
    normalized,
    variants: Array.from(variants),
    isPhrase,
    field: options?.field,
  };
}

function buildGroupsFromWords(words: string[]): TermGroup[] {
  const groups: TermGroup[] = [];
  const normalizedWords = words
    .map(word => normalizeText(word))
    .flatMap(word => word.split(' '))
    .filter(Boolean);

  for (let i = 0; i < normalizedWords.length;) {
    let matchedAlias = false;

    for (const span of [3, 2]) {
      if (i + span > normalizedWords.length) continue;
      const phrase = normalizedWords.slice(i, i + span).join(' ');
      if (!ALIAS_GRAPH.has(phrase)) continue;

      const group = createGroup(phrase, { isPhrase: true, keepStopWords: true });
      if (group) groups.push(group);
      i += span;
      matchedAlias = true;
      break;
    }

    if (matchedAlias) continue;
    const group = createGroup(normalizedWords[i], { isPhrase: false });
    if (group) groups.push(group);
    i += 1;
  }

  return dedupeGroups(groups);
}

function parseQuery(query: string): ParsedQuery {
  const raw = String(query || '').trim();
  if (!raw) {
    return { raw, includeGroups: [], excludeGroups: [], requiredPhraseGroups: [], requiredFieldGroups: [] };
  }

  const includeWordTokens: string[] = [];
  const excludeWordTokens: string[] = [];
  const requiredPhraseGroups: TermGroup[] = [];
  const requiredFieldGroups: TermGroup[] = [];
  const excludeGroups: TermGroup[] = [];

  const tokens = tokenizeQuery(raw);
  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;

    const negated = trimmed.startsWith('-');
    const unsigned = negated ? trimmed.slice(1).trim() : trimmed;
    if (!unsigned) continue;

    const fieldMatch = unsigned.match(/^([a-z_]+):(.*)$/i);
    if (fieldMatch) {
      const field = FIELD_ALIASES[fieldMatch[1].toLowerCase()];
      if (field) {
        const group = createGroup(stripOuterQuotes(fieldMatch[2]), {
          isPhrase: stripOuterQuotes(fieldMatch[2]).includes(' '),
          field,
          keepStopWords: true,
        });
        if (group) {
          if (negated) excludeGroups.push(group);
          else requiredFieldGroups.push(group);
        }
        continue;
      }
    }

    if (unsigned.startsWith('"') && unsigned.endsWith('"')) {
      const phrase = stripOuterQuotes(unsigned);
      const group = createGroup(phrase, { isPhrase: true, keepStopWords: true });
      if (group) {
        if (negated) excludeGroups.push(group);
        else requiredPhraseGroups.push(group);
      }
      continue;
    }

    const normalized = normalizeText(unsigned);
    if (!normalized) continue;
    const parts = normalized.split(' ').filter(Boolean);
    if (negated) excludeWordTokens.push(...parts);
    else includeWordTokens.push(...parts);
  }

  const includeGroups = buildGroupsFromWords(includeWordTokens);
  const excludeWordGroups = buildGroupsFromWords(excludeWordTokens);

  return {
    raw,
    includeGroups: dedupeGroups(includeGroups),
    excludeGroups: dedupeGroups([...excludeGroups, ...excludeWordGroups]),
    requiredPhraseGroups: dedupeGroups(requiredPhraseGroups),
    requiredFieldGroups: dedupeGroups(requiredFieldGroups),
  };
}

function getIndexedFields(event: SearchableEventLike): IndexedField[] {
  const venueName = typeof event.venue === 'string'
    ? event.venue
    : (event.venue?.name || '');
  const venueAddress = typeof event.venue === 'string'
    ? ''
    : (event.venue?.address || '');

  const categories = [
    ...(Array.isArray(event.categories) ? event.categories : []),
    event.category || '',
  ].filter(Boolean).join(' ');

  const sourceText = [
    event.source || '',
    ...(Array.isArray(event.sources) ? event.sources : (typeof event.sources === 'string' ? [event.sources] : [])),
  ].filter(Boolean).join(' ');

  const urlText = [
    event.eventUrl || '',
    event.ticketUrl || '',
    event.externalUrl || '',
  ].filter(Boolean).join(' ');

  const addressText = [
    venueAddress,
    event.location || '',
    event.address || '',
  ].filter(Boolean).join(' ');

  const rawByField: Record<SearchFieldKey, string> = {
    title: event.title || '',
    venue: venueName,
    description: event.description || '',
    address: addressText,
    categories,
    source: sourceText,
    url: urlText,
  };

  return (Object.keys(rawByField) as SearchFieldKey[]).map((key) => {
    const text = normalizeText(rawByField[key]);
    return {
      key,
      text,
      compact: compactText(rawByField[key]),
      words: tokenizeWords(rawByField[key]),
      weight: FIELD_WEIGHTS[key],
    };
  });
}

function candidateFieldsForGroup(field?: SearchFieldKey): SearchFieldKey[] {
  if (!field) return ['title', 'venue', 'description', 'address', 'categories', 'source', 'url'];
  if (field === 'venue') return ['venue', 'address'];
  if (field === 'source') return ['source', 'url'];
  if (field === 'categories') return ['categories', 'title', 'description'];
  return [field];
}

function scoreVariantInField(field: IndexedField, variant: string, isPhrase: boolean, allowFuzzy: boolean): number {
  if (!variant || !field.text) return 0;

  if (isPhrase || variant.includes(' ')) {
    if (field.text.includes(variant)) return field.weight * 1.3;
    const compactVariant = compactText(variant);
    if (compactVariant.length >= 4 && field.compact.includes(compactVariant)) return field.weight * 0.9;
    return 0;
  }

  const exactRegex = new RegExp(`(^|\\s)${escapeRegex(variant)}(\\s|$)`);
  if (exactRegex.test(field.text)) return field.weight * 1.0;
  if (field.text.includes(variant)) return field.weight * 0.72;

  const compactVariant = compactText(variant);
  if (compactVariant.length >= 4 && field.compact.includes(compactVariant)) return field.weight * 0.58;

  if (
    allowFuzzy &&
    variant.length >= 5 &&
    field.words.some(word => word.length >= 4 && isOneEditAway(word, variant))
  ) {
    return field.weight * 0.38;
  }

  return 0;
}

function scoreGroupAgainstEvent(group: TermGroup, fields: IndexedField[], allowFuzzy = true): number {
  const allowed = new Set(candidateFieldsForGroup(group.field));
  let best = 0;

  for (const field of fields) {
    if (!allowed.has(field.key)) continue;
    for (const variant of group.variants) {
      const variantScore = scoreVariantInField(field, variant, group.isPhrase, allowFuzzy);
      if (variantScore > best) best = variantScore;
    }
  }

  return best;
}

function hasStrictMatch(group: TermGroup, fields: IndexedField[]): boolean {
  return scoreGroupAgainstEvent(group, fields, false) > 0;
}

export function buildEventSearchMatcher(query: string) {
  const parsed = parseQuery(query);
  const hasQuery = parsed.raw.length > 0;
  const hasConstraints =
    parsed.includeGroups.length > 0 ||
    parsed.excludeGroups.length > 0 ||
    parsed.requiredPhraseGroups.length > 0 ||
    parsed.requiredFieldGroups.length > 0;

  if (!hasQuery || !hasConstraints) {
    return {
      hasQuery: false,
      score: (_event: SearchableEventLike) => 0,
      matches: (_event: SearchableEventLike) => true,
    };
  }

  const requiredCoverage = parsed.includeGroups.length <= 2
    ? parsed.includeGroups.length
    : Math.max(2, Math.ceil(parsed.includeGroups.length * 0.67));

  const score = (event: SearchableEventLike): number => {
    const fields = getIndexedFields(event);
    let total = 0;
    let includeMatches = 0;

    for (const group of parsed.excludeGroups) {
      if (hasStrictMatch(group, fields)) return 0;
    }

    for (const group of parsed.requiredFieldGroups) {
      const groupScore = scoreGroupAgainstEvent(group, fields, true);
      if (groupScore <= 0) return 0;
      total += groupScore * 1.4;
    }

    for (const group of parsed.requiredPhraseGroups) {
      const groupScore = scoreGroupAgainstEvent(group, fields, false);
      if (groupScore <= 0) return 0;
      total += groupScore * 1.3;
    }

    for (const group of parsed.includeGroups) {
      const groupScore = scoreGroupAgainstEvent(group, fields, true);
      if (groupScore > 0) {
        includeMatches += 1;
        total += groupScore;
      }
    }

    if (parsed.includeGroups.length > 0 && includeMatches < requiredCoverage) return 0;
    if (parsed.includeGroups.length > 0 && includeMatches === parsed.includeGroups.length) total += 6;
    if (parsed.requiredPhraseGroups.length > 0) total += parsed.requiredPhraseGroups.length * 4;
    if (parsed.requiredFieldGroups.length > 0) total += parsed.requiredFieldGroups.length * 3;

    return total;
  };

  return {
    hasQuery: true,
    score,
    matches: (event: SearchableEventLike) => score(event) > 0,
  };
}
