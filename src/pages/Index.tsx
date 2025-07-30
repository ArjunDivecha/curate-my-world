import { Dashboard } from "@/components/Dashboard";
import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const Index = () => {
  const { user, loading } = useAuth();

  // Add debugging
  console.log('Index: loading =', loading, 'user =', user);

  if (loading) {
    console.log('Still loading auth state...');
    return <LoadingSpinner />;
  }

  console.log('Rendering Dashboard...');
  return <Dashboard />;
};

export default Index;
