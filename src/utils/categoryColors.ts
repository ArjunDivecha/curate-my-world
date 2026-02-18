/**
 * Category Color System
 * 
 * Provides very subtle, low-saturation pastel colors for event categories
 * to help users visually distinguish different event types while maintaining
 * an elegant, professional appearance.
 */

export interface CategoryColor {
  name: string;
  background: string;
  border: string;
  text: string;
  accent: string;
  icon: string;
  hover: string;
}

// Research-backed trending pastel colors for 2024-2025 UI design
// Optimized for readability with solid backgrounds and subtle color distinction
export const categoryColors: Record<string, CategoryColor> = {
  // Tech - Powder Blue (trending 2024)
  tech: {
    name: 'Tech',
    background: 'bg-sky-50',
    border: 'border-sky-200',
    text: 'text-sky-900',
    accent: 'text-sky-700',
    icon: 'text-sky-600',
    hover: 'hover:bg-sky-100'
  },

  // Technology (alias for tech)
  technology: {
    name: 'Technology',
    background: 'bg-sky-50',
    border: 'border-sky-200',
    text: 'text-sky-900',
    accent: 'text-sky-700',
    icon: 'text-sky-600',
    hover: 'hover:bg-sky-100'
  },

  // Comedy - Warm Amber (fun and inviting)
  comedy: {
    name: 'Comedy',
    background: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-900',
    accent: 'text-amber-700',
    icon: 'text-amber-600',
    hover: 'hover:bg-amber-100'
  },

  // Lectures - Sage Green (intellectual and calm)
  lectures: {
    name: 'Lectures',
    background: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-900',
    accent: 'text-emerald-700',
    icon: 'text-emerald-600',
    hover: 'hover:bg-emerald-100'
  },

  // Kids/Family - Playful Pink (fun and family-friendly)
  kids: {
    name: 'Kids & Family',
    background: 'bg-pink-50',
    border: 'border-pink-200',
    text: 'text-pink-900',
    accent: 'text-pink-700',
    icon: 'text-pink-600',
    hover: 'hover:bg-pink-100'
  },

  // Desi - Saffron (South Asian cultural events)
  desi: {
    name: 'Desi',
    background: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-900',
    accent: 'text-amber-700',
    icon: 'text-amber-600',
    hover: 'hover:bg-amber-100'
  },

  // Finance - Teal (professional)
  finance: {
    name: 'Finance',
    background: 'bg-teal-50',
    border: 'border-teal-200',
    text: 'text-teal-900',
    accent: 'text-teal-700',
    icon: 'text-teal-600',
    hover: 'hover:bg-teal-100'
  },

  // Music - Lavender (most popular pastel purple)
  music: {
    name: 'Music',
    background: 'bg-violet-50',
    border: 'border-violet-200',
    text: 'text-violet-900',
    accent: 'text-violet-700',
    icon: 'text-violet-600',
    hover: 'hover:bg-violet-100'
  },

  // Theatre - Blush Pink (sophisticated feminine)
  theatre: {
    name: 'Theatre',
    background: 'bg-rose-50',
    border: 'border-rose-200',
    text: 'text-rose-900',
    accent: 'text-rose-700',
    icon: 'text-rose-600',
    hover: 'hover:bg-rose-100'
  },

  // Art - Champagne/Pale Gold (trending warm neutral)
  art: {
    name: 'Art',
    background: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-900',
    accent: 'text-yellow-800',
    icon: 'text-yellow-700',
    hover: 'hover:bg-yellow-100'
  },

  // Food - Peach (warm and inviting)
  food: {
    name: 'Food',
    background: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-900',
    accent: 'text-orange-700',
    icon: 'text-orange-600',
    hover: 'hover:bg-orange-100'
  },

  // Movies - Periwinkle (soft blue-purple)
  movies: {
    name: 'Movies',
    background: 'bg-indigo-50',
    border: 'border-indigo-200',
    text: 'text-indigo-900',
    accent: 'text-indigo-700',
    icon: 'text-indigo-600',
    hover: 'hover:bg-indigo-100'
  },

  // Sports - Mint Green (fresh and energetic)
  sports: {
    name: 'Sports',
    background: 'bg-teal-50',
    border: 'border-teal-200',
    text: 'text-teal-900',
    accent: 'text-teal-700',
    icon: 'text-teal-600',
    hover: 'hover:bg-teal-100'
  },

  // Education - Soft Aqua (calming and focused)
  education: {
    name: 'Education',
    background: 'bg-cyan-50',
    border: 'border-cyan-200',
    text: 'text-cyan-900',
    accent: 'text-cyan-700',
    icon: 'text-cyan-600',
    hover: 'hover:bg-cyan-100'
  },

  // Business - Dove Gray (professional and modern)
  business: {
    name: 'Business',
    background: 'bg-slate-50',
    border: 'border-slate-200',
    text: 'text-slate-900',
    accent: 'text-slate-700',
    icon: 'text-slate-600',
    hover: 'hover:bg-slate-100'
  },

  // Science - Lilac (inspiring and innovative)
  science: {
    name: 'Science',
    background: 'bg-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-900',
    accent: 'text-purple-700',
    icon: 'text-purple-600',
    hover: 'hover:bg-purple-100'
  },

  // Psychology - Mint/Sage (calming and human-centered)
  psychology: {
    name: 'Psychology',
    background: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-900',
    accent: 'text-emerald-700',
    icon: 'text-emerald-600',
    hover: 'hover:bg-emerald-100'
  },

  // Artificial Intelligence - Soft Indigo (innovative and modern)
  'artificial-intelligence': {
    name: 'Artificial Intelligence',
    background: 'bg-indigo-50',
    border: 'border-indigo-200',
    text: 'text-indigo-900',
    accent: 'text-indigo-700',
    icon: 'text-indigo-600',
    hover: 'hover:bg-indigo-100'
  },

  // Health & Wellness - Soft Lime (natural and refreshing)
  health: {
    name: 'Health & Wellness',
    background: 'bg-lime-50',
    border: 'border-lime-200',
    text: 'text-lime-900',
    accent: 'text-lime-800',
    icon: 'text-lime-700',
    hover: 'hover:bg-lime-100'
  },

  // Default/Fallback - Warm Gray (neutral and versatile)
  default: {
    name: 'General',
    background: 'bg-stone-50',
    border: 'border-stone-200',
    text: 'text-stone-900',
    accent: 'text-stone-700',
    icon: 'text-stone-600',
    hover: 'hover:bg-stone-100'
  }
};

/**
 * Get category color configuration by category name
 * Handles various naming conventions and provides fallback
 */
export const getCategoryColor = (category: string | string[]): CategoryColor => {
  // Handle array of categories - use first category
  if (Array.isArray(category)) {
    category = category[0] || 'default';
  }

  // Normalize category name
  const normalizedCategory = category
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // Direct match
  if (categoryColors[normalizedCategory]) {
    return categoryColors[normalizedCategory];
  }

  // Partial matches for common variations
  const partialMatches: Record<string, string> = {
    'tech': 'technology',
    'programming': 'technology',
    'coding': 'technology',
    'software': 'technology',
    'ai': 'artificial-intelligence',
    'ml': 'artificial-intelligence',
    'llm': 'artificial-intelligence',
    'genai': 'artificial-intelligence',
    'data': 'artificial-intelligence',
    'analytics': 'artificial-intelligence',
    'stats': 'artificial-intelligence',
    'money': 'finance',
    'investment': 'finance',
    'trading': 'finance',
    'stock': 'finance',
    'crypto': 'finance',
    'concert': 'music',
    'band': 'music',
    'musical': 'music',
    'show': 'theatre',
    'play': 'theatre',
    'drama': 'theatre',
    'standup': 'comedy',
    'improv': 'comedy',
    'comedian': 'comedy',
    'lecture': 'lectures',
    'talk': 'lectures',
    'speaker': 'lectures',
    'author': 'lectures',
    'presentation': 'lectures',
    'kids': 'kids',
    'children': 'kids',
    'family': 'kids',
    'youth': 'kids',
    'desi': 'desi',
    'indian': 'desi',
    'south-asian': 'desi',
    'south asian': 'desi',
    'bollywood': 'desi',
    'bhangra': 'desi',
    'garba': 'desi',
    'dandiya': 'desi',
    'holi': 'desi',
    'diwali': 'desi',
    'punjabi': 'desi',
    'gujarati': 'desi',
    'tamil': 'desi',
    'telugu': 'desi',
    'hindi': 'desi',
    'urdu': 'desi',
    'gallery': 'art',
    'museum': 'art',
    'painting': 'art',
    'sculpture': 'art',
    'restaurant': 'food',
    'dining': 'food',
    'cooking': 'food',
    'culinary': 'food',
    'film': 'movies',
    'cinema': 'movies',
    'screening': 'movies',
    'game': 'sports',
    'match': 'sports',
    'tournament': 'sports',
    'workshop': 'education',
    'seminar': 'education',
    'conference': 'education',
    'course': 'education',
    'networking': 'business',
    'startup': 'business',
    'entrepreneur': 'business',
    'corporate': 'business',
    'research': 'science',
    'lab': 'science',
    'experiment': 'science',
    'study': 'science',
    'car': 'technology',
    'auto': 'technology',
    'vehicle': 'technology',
    'tesla': 'technology',
    'psych': 'psychology',
    'neuro': 'psychology',
    'cognitive': 'psychology',
    'therapy': 'psychology',
    'mental': 'psychology',
    'wellness': 'health',
    'fitness': 'health',
    'yoga': 'health',
    'meditation': 'health'
  };

  // Check for partial matches
  for (const [key, value] of Object.entries(partialMatches)) {
    if (normalizedCategory.includes(key)) {
      return categoryColors[value];
    }
  }

  // Return default if no match found
  return categoryColors.default;
};

/**
 * Get category colors for multiple categories
 * Returns the primary category color or a mixed color for multiple categories
 */
export const getCategoryColors = (categories: string[]): CategoryColor => {
  if (!categories || categories.length === 0) {
    return categoryColors.default;
  }

  // Use the first category's color
  return getCategoryColor(categories[0]);
};

/**
 * Generate CSS classes for a category
 */
export const getCategoryClasses = (category: string | string[]): string => {
  const colors = getCategoryColor(category);
  return `${colors.background} ${colors.border} ${colors.text}`;
};

/**
 * Get category badge classes
 */
export const getCategoryBadgeClasses = (category: string | string[]): string => {
  const colors = getCategoryColor(category);
  return `${colors.background} ${colors.border} ${colors.accent} border`;
};

/**
 * Get category icon classes
 */
export const getCategoryIconClasses = (category: string | string[]): string => {
  const colors = getCategoryColor(category);
  return colors.icon;
};
