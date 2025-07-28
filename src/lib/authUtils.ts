/**
 * Authorization utilities for role-based access control
 */

import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'admin' | 'moderator' | 'user';

/**
 * Check if the current user has a specific role
 * Note: Placeholder implementation until user_roles table is available
 */
export async function hasRole(role: AppRole): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return false;
    }

    // Temporary: Return false for all roles until migration is applied
    // This will be updated once the user_roles table exists
    console.warn('hasRole: user_roles table not yet available, returning false');
    return false;
  } catch (error) {
    console.error('Error in hasRole:', error);
    return false;
  }
}

/**
 * Get all roles for the current user
 * Note: Placeholder implementation until user_roles table is available
 */
export async function getUserRoles(): Promise<AppRole[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return [];
    }

    // Temporary: Return empty array until migration is applied
    console.warn('getUserRoles: user_roles table not yet available, returning empty array');
    return [];
  } catch (error) {
    console.error('Error in getUserRoles:', error);
    return [];
  }
}

/**
 * Check if the current user is an admin
 */
export async function isAdmin(): Promise<boolean> {
  return await hasRole('admin');
}

/**
 * Check if the current user is a moderator or admin
 */
export async function isModerator(): Promise<boolean> {
  const roles = await getUserRoles();
  return roles.includes('admin') || roles.includes('moderator');
}

/**
 * Require admin role or throw error
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) {
    throw new Error('Admin access required');
  }
}

/**
 * Require moderator role or throw error
 */
export async function requireModerator(): Promise<void> {
  if (!(await isModerator())) {
    throw new Error('Moderator access required');
  }
}