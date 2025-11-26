/**
 * Utility helpers for constructing event-focused prompts and queries.
 */

const DEFAULT_TARGET = 100;
const MIN_TARGET = 80;
const MAX_TARGET = 140;

function describeDateRange(dateRange) {
  if (!dateRange) {
    return 'in the coming weeks';
  }

  const normalized = dateRange.toLowerCase();
  switch (normalized) {
    case 'today':
      return 'today';
    case 'tomorrow':
      return 'tomorrow';
    case 'this weekend':
      return 'this weekend';
    case 'next week':
      return 'next week';
    case 'next month':
      return 'next month';
    case 'next 30 days':
      return 'within the next 30 days';
    default:
      return `during ${dateRange}`;
  }
}

/**
 * Build a structured prompt that forces LLM responses to be event-focused.
 */
export function buildCustomEventPrompt({
  userPrompt,
  location,
  dateRange,
  limit
}) {
  try {
    // Ensure userPrompt is a string
    const userPromptStr = typeof userPrompt === 'string' ? userPrompt : String(userPrompt || '');
    const trimmed = userPromptStr.trim();
    if (!trimmed) {
      return '';
    }

    const scope = describeDateRange(dateRange);
    const safeLocation = location ? String(location) : 'the target region';
    const numericLimit = typeof limit === 'number' && Number.isFinite(limit) ? limit : undefined;
    const inferred = numericLimit
      ? Math.round(Math.min(Math.max(numericLimit, MIN_TARGET), MAX_TARGET))
      : DEFAULT_TARGET;
    const target = Math.min(Math.max(inferred, MIN_TARGET), MAX_TARGET);

    return [
    'You are Curate, an event intelligence research agent building a personalized feed.',
    `Mission: surface at least ${target} high-quality upcoming events for "${trimmed}" in ${safeLocation}, covering the period ${scope}.`,
    '',
    'Working cadence (internal reasoning can be concise but follow the steps):',
    '1. Expand the directive into 6-10 search angles (synonyms, related cuisines/topics, partner communities, neighborhoods, seasonal/holiday hooks).',
    '2. For each angle, hit multiple trusted sources: official city + county calendars, tourism bureaus, ticketing platforms (Eventbrite, Ticketmaster, Dice, Luma, Resident Advisor, Fever), community hubs (Meetup, Facebook Events, university calendars, cultural centers), venue schedules, food & festival blogs, and pop-up directories.',
    '3. Keep rotating through fresh angles and keyword variants, including Bay Area suburbs when relevant, until you reach >= target unique qualifying events or you have truly exhausted credible sources.',
    '4. Validate every entry with a concrete date, venue, and URL so the event can be verified.',
    '',
    'Inclusion rules:',
    '- Public, scheduled happenings such as festivals, markets, food pop-ups, classes, workshops, culinary tours, tastings, cultural nights, conferences, meetups, performances, networking events, and community gatherings.',
    `- Dates must fall ${scope} and be relevant to ${safeLocation}. Recurring series should be collapsed to their next upcoming instance.`,
    '- Virtual events are acceptable only if they specifically target this region or community.',
    '',
    'Exclusion rules:',
    '- Static business ads, menu items, generic restaurant listings, reviews, evergreen attractions, or articles without a dated occurrence.',
    '- Duplicate listings of the same event; merge multi-day runs when appropriate.',
    '',
    'Output instructions:',
    '- Respond with a JSON array (no wrapper object).',
    '- Each event object must include: "title", "description" (1-2 sentences), "start_date" (YYYY-MM-DD), "start_time" if available, "end_date" if multi-day, "venue", "address" (city + state), "category", "ticket_url" (or best source URL), "price" (use "Free" or null if not stated), and "source".',
    '- Ensure the list spans different venues and subthemes so the feed feels comprehensive.',
    '',
    `If after exhausting the workflow you still have fewer than ${target} events, output every unique event you found and append a short plain-text note after the JSON summarizing why the total is lower.`,
    '',
    'Return the JSON array first, followed by the optional note.'
  ].join('\n');
  } catch (error) {
    // If there's any error building the prompt, return a simple fallback
    console.error('Error building custom event prompt:', error);
    const trimmed = typeof userPrompt === 'string' ? userPrompt.trim() : String(userPrompt || '').trim();
    if (!trimmed) {
      return '';
    }
    return `Find upcoming events related to "${trimmed}" in ${location || 'the target region'}. Return a JSON array of events with title, description, start_date, venue, address, category, ticket_url, and price.`;
  }
}

/**
 * Build a provider-friendly keyword query that emphasizes events.
 */
export function buildProviderSearchQuery({
  userPrompt,
  category,
  location
}) {
  const trimmed = (userPrompt || '').trim();
  if (!trimmed) {
    return '';
  }

  const topic = trimmed.replace(/[.]+$/g, '').trim();
  const safeLocation = location ? location : '';
  const categoryPrefix = category ? `${category} ` : '';
  const locationClause = safeLocation ? ` "${safeLocation}"` : '';
  const eventContext = [
    '"event"',
    '"festival"',
    '"market"',
    '"pop-up"',
    '"tasting"',
    '"class"',
    '"workshop"',
    '"meetup"',
    '"networking"',
    '"conference"',
    '"concert"',
    '"community gathering"'
  ].join(' OR ');

  return `"${topic}" ${categoryPrefix}(${eventContext})${locationClause} upcoming`;
}
