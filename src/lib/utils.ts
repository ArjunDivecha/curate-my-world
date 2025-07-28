import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Decode HTML entities and strip HTML tags from text
 */
export function cleanHtmlText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Create a temporary div element to decode HTML entities
  const tempDiv = document.createElement('div');
  
  // First, strip HTML tags but keep the text content
  const strippedText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Then decode HTML entities
  tempDiv.innerHTML = strippedText;
  const decodedText = tempDiv.textContent || tempDiv.innerText || '';
  
  return decodedText.trim();
}
