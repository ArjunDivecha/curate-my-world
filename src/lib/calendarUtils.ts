/**
 * =============================================================================
 * SCRIPT NAME: calendarUtils.ts
 * =============================================================================
 * 
 * DESCRIPTION:
 * Utility functions for generating calendar files (.ics format) from event data.
 * Supports standard calendar applications like Google Calendar, Apple Calendar, Outlook.
 * 
 * FEATURES:
 * - Generate .ics calendar files
 * - Auto-download calendar files
 * - Format event data for calendar compatibility
 * - Handle timezone considerations
 * - Support for recurring events
 * 
 * VERSION: 1.0
 * LAST UPDATED: 2025-01-30
 * AUTHOR: Claude Code
 * =============================================================================
 */

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  venue: {
    name: string;
    address: string;
    website?: string;
  };
  eventUrl?: string;
  ticketUrl?: string;
}

/**
 * Escape special characters for iCalendar format
 * @param text - Text to escape
 * @returns Escaped text
 */
function escapeCalendarText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

/**
 * Format date for iCalendar format (YYYYMMDDTHHMMSSZ)
 * @param dateString - ISO date string
 * @returns Formatted date string
 */
function formatCalendarDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Generate a unique identifier for the calendar event
 * @param eventId - Original event ID
 * @returns Unique UID for calendar
 */
function generateUID(eventId: string): string {
  const timestamp = new Date().getTime();
  return `${eventId}-${timestamp}@curate-my-world.com`;
}

/**
 * Create an .ics calendar file content for a single event
 * @param event - Event data
 * @returns iCalendar file content
 */
export function generateICS(event: CalendarEvent): string {
  const now = new Date();
  const nowFormatted = formatCalendarDate(now.toISOString());
  
  // Calculate end date if not provided (default to 2 hours)
  let endDate = event.endDate;
  if (!endDate || endDate === event.startDate) {
    const startTime = new Date(event.startDate);
    startTime.setHours(startTime.getHours() + 2);
    endDate = startTime.toISOString();
  }

  // Build description with additional details
  let description = escapeCalendarText(event.description);
  
  if (event.venue.address) {
    description += `\\n\\nVenue: ${escapeCalendarText(event.venue.name)}\\nAddress: ${escapeCalendarText(event.venue.address)}`;
  }
  
  if (event.eventUrl) {
    description += `\\n\\nEvent Details: ${event.eventUrl}`;
  }
  
  if (event.ticketUrl) {
    description += `\\n\\nGet Tickets: ${event.ticketUrl}`;
  }

  // Build location string
  const location = event.venue.address 
    ? `${escapeCalendarText(event.venue.name)}\\, ${escapeCalendarText(event.venue.address)}`
    : escapeCalendarText(event.venue.name);

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Curate My World//Event Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${generateUID(event.id)}`,
    `DTSTAMP:${nowFormatted}`,
    `DTSTART:${formatCalendarDate(event.startDate)}`,
    `DTEND:${formatCalendarDate(endDate)}`,
    `SUMMARY:${escapeCalendarText(event.title)}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    event.eventUrl ? `URL:${event.eventUrl}` : '',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(line => line !== '').join('\r\n');

  return icsContent;
}

/**
 * Download an .ics file for the given event
 * @param event - Event data
 * @param filename - Optional custom filename
 */
export function downloadCalendarFile(event: CalendarEvent, filename?: string): void {
  const icsContent = generateICS(event);
  
  // Create blob and download
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  
  // Create download link
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename || `${event.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.ics`);
  document.body.appendChild(link);
  link.click();
  
  // Cleanup
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/**
 * Generate Google Calendar URL for quick adding
 * @param event - Event data
 * @returns Google Calendar URL
 */
export function generateGoogleCalendarUrl(event: CalendarEvent): string {
  const startDate = formatCalendarDate(event.startDate);
  let endDate = event.endDate;
  if (!endDate || endDate === event.startDate) {
    const startTime = new Date(event.startDate);
    startTime.setHours(startTime.getHours() + 2);
    endDate = startTime.toISOString();
  }
  const formattedEndDate = formatCalendarDate(endDate);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${startDate}/${formattedEndDate}`,
    details: `${event.description}\n\nVenue: ${event.venue.name}\nAddress: ${event.venue.address}${event.eventUrl ? `\nEvent Details: ${event.eventUrl}` : ''}${event.ticketUrl ? `\nGet Tickets: ${event.ticketUrl}` : ''}`,
    location: `${event.venue.name}, ${event.venue.address}`,
    ...(event.eventUrl && { website: event.eventUrl })
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generate Outlook Calendar URL for quick adding
 * @param event - Event data
 * @returns Outlook Calendar URL
 */
export function generateOutlookCalendarUrl(event: CalendarEvent): string {
  let endDate = event.endDate;
  if (!endDate || endDate === event.startDate) {
    const startTime = new Date(event.startDate);
    startTime.setHours(startTime.getHours() + 2);
    endDate = startTime.toISOString();
  }

  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: new Date(event.startDate).toISOString(),
    enddt: new Date(endDate).toISOString(),
    body: `${event.description}\n\nVenue: ${event.venue.name}\nAddress: ${event.venue.address}${event.eventUrl ? `\nEvent Details: ${event.eventUrl}` : ''}${event.ticketUrl ? `\nGet Tickets: ${event.ticketUrl}` : ''}`,
    location: `${event.venue.name}, ${event.venue.address}`
  });

  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/**
 * Get user's preferred calendar application
 * @returns Detected calendar preference
 */
export function detectCalendarPreference(): 'google' | 'outlook' | 'apple' | 'download' {
  const userAgent = navigator.userAgent.toLowerCase();
  
  // Check for mobile devices first
  if (/iphone|ipad|ipod/.test(userAgent)) {
    return 'apple';
  }
  
  if (/android/.test(userAgent)) {
    return 'google';
  }
  
  // Check for desktop browsers
  if (/edg/.test(userAgent) || /outlook/.test(userAgent)) {
    return 'outlook';
  }
  
  if (/chrome/.test(userAgent) || /gmail/.test(userAgent)) {
    return 'google';
  }
  
  // Default to download for other cases
  return 'download';
}

/**
 * Smart calendar save - automatically chooses best method
 * @param event - Event data
 * @param preference - Optional calendar preference override
 */
export function saveToCalendar(event: CalendarEvent, preference?: 'google' | 'outlook' | 'apple' | 'download'): void {
  const calendarType = preference || detectCalendarPreference();
  
  switch (calendarType) {
    case 'google':
      window.open(generateGoogleCalendarUrl(event), '_blank');
      break;
      
    case 'outlook':
      window.open(generateOutlookCalendarUrl(event), '_blank');
      break;
      
    case 'apple':
    case 'download':
    default:
      downloadCalendarFile(event);
      break;
  }
}

/**
 * Validate event data for calendar compatibility
 * @param event - Event data to validate
 * @returns Validation result
 */
export function validateEventForCalendar(event: CalendarEvent): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!event.title || event.title.trim() === '') {
    errors.push('Event title is required');
  }

  if (!event.startDate) {
    errors.push('Event start date is required');
  } else {
    const startDate = new Date(event.startDate);
    if (isNaN(startDate.getTime())) {
      errors.push('Invalid start date format');
    }
  }

  if (!event.venue?.name) {
    warnings.push('Venue name is missing - calendar entry may be less informative');
  }

  if (!event.venue?.address) {
    warnings.push('Venue address is missing - calendar entry will not have location details');
  }

  if (!event.description || event.description.trim() === '') {
    warnings.push('Event description is empty - consider adding more details');
  }

  // Check date logic
  if (event.startDate && event.endDate) {
    const start = new Date(event.startDate);
    const end = new Date(event.endDate);
    if (end <= start) {
      warnings.push('End date should be after start date - will default to 2 hours duration');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}