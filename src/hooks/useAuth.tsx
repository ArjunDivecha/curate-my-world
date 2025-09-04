import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

// Simple mock user type for local auth
interface MockUser {
  id: string;
  email: string;
  display_name?: string;
  username?: string;
}

interface MockSession {
  user: MockUser;
  access_token: string;
}

export const useAuth = () => {
  const [user, setUser] = useState<MockUser | null>(null);
  const [session, setSession] = useState<MockSession | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Check for existing session in localStorage
    const savedSession = localStorage.getItem('auth_session');
    if (savedSession) {
      try {
        const parsedSession = JSON.parse(savedSession);
        setSession(parsedSession);
        setUser(parsedSession.user);
      } catch (error) {
        localStorage.removeItem('auth_session');
      }
    }
    setLoading(false);
  }, []);

  const signUp = async (email: string, password: string, displayName?: string, username?: string) => {
    try {
      // Mock user creation - in real app this would call your backend
      const mockUser: MockUser = {
        id: `user_${Date.now()}`,
        email,
        display_name: displayName,
        username: username
      };

      const mockSession: MockSession = {
        user: mockUser,
        access_token: `token_${Date.now()}`
      };

      localStorage.setItem('auth_session', JSON.stringify(mockSession));
      setSession(mockSession);
      setUser(mockUser);

      toast({
        title: "Account created!",
        description: "Welcome to Event Finder!",
      });

      return { error: null };
    } catch (error: any) {
      toast({
        title: "Error creating account",
        description: error.message,
        variant: "destructive",
      });
      return { error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      // Mock sign in - in real app this would validate credentials
      const mockUser: MockUser = {
        id: `user_${Date.now()}`,
        email,
        display_name: email.split('@')[0]
      };

      const mockSession: MockSession = {
        user: mockUser,
        access_token: `token_${Date.now()}`
      };

      localStorage.setItem('auth_session', JSON.stringify(mockSession));
      setSession(mockSession);
      setUser(mockUser);

      toast({
        title: "Welcome back!",
        description: "Successfully signed in.",
      });

      return { error: null };
    } catch (error: any) {
      toast({
        title: "Error signing in",
        description: error.message,
        variant: "destructive",
      });
      return { error };
    }
  };

  const signOut = async () => {
    try {
      localStorage.removeItem('auth_session');
      setSession(null);
      setUser(null);

      toast({
        title: "Signed out",
        description: "Successfully signed out.",
      });
    } catch (error: any) {
      toast({
        title: "Error signing out",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const signInWithGoogle = async () => {
    // Mock Google sign in
    return signIn('user@gmail.com', 'password');
  };

  const signInWithGitHub = async () => {
    // Mock GitHub sign in
    return signIn('user@github.com', 'password');
  };

  return {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    signInWithGoogle,
    signInWithGitHub,
  };
};