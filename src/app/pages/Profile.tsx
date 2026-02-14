import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { supabase, apiCall } from '../lib/supabase';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { ArrowLeft, User, Mail, Calendar, LogOut } from 'lucide-react';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

export default function Profile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
    fetchProfile();
  }, []);

  const checkAuth = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      // navigate('/');
    }
  };

  const fetchProfile = async () => {
    try {
      const data = await apiCall('/user/profile');
      setProfile(data.profile);
    } catch (error) {
      console.error('Fetch profile error:', error);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className='min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-red-950'>
      {/* Header */}
      <div className='bg-zinc-900/50 backdrop-blur-sm border-b border-zinc-800 p-4 flex items-center gap-4'>
        <Button variant='ghost' size='icon' onClick={() => navigate('/map')} className='text-white'>
          <ArrowLeft className='w-5 h-5' />
        </Button>
        <h1 className='text-white font-bold text-lg'>Profile</h1>
      </div>

      <div className='p-4 space-y-4 max-w-2xl mx-auto'>
        {/* Profile Card */}
        <Card className='bg-zinc-900/50 backdrop-blur-sm border-zinc-800 p-6'>
          <div className='flex flex-col items-center text-center mb-6'>
            <div className='w-24 h-24 bg-red-600 rounded-full flex items-center justify-center mb-4'>
              <User className='w-12 h-12 text-white' />
            </div>
            {profile && (
              <>
                <h2 className='text-2xl font-bold text-white mb-1'>{profile.name}</h2>
                <p className='text-zinc-400'>{profile.email}</p>
              </>
            )}
          </div>

          <div className='space-y-4'>
            {profile && (
              <>
                <div className='flex items-center gap-3 text-zinc-300'>
                  <Mail className='w-5 h-5 text-zinc-500' />
                  <div>
                    <p className='text-sm text-zinc-500'>Email</p>
                    <p>{profile.email}</p>
                  </div>
                </div>

                <div className='flex items-center gap-3 text-zinc-300'>
                  <Calendar className='w-5 h-5 text-zinc-500' />
                  <div>
                    <p className='text-sm text-zinc-500'>Member since</p>
                    <p>{formatDate(profile.created_at)}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>

        {/* About Card */}
        <Card className='bg-zinc-900/50 backdrop-blur-sm border-zinc-800 p-6'>
          <h3 className='text-white font-semibold mb-3'>About ScarletSpots</h3>
          <div className='space-y-2 text-zinc-400 text-sm'>
            <p>
              ScarletSpots is a smart parking solution for the Rutgers community. Find available
              parking, share your location with friends, and never forget where you parked.
            </p>
            <p className='text-xs text-zinc-500 mt-4'>For Rutgers students, by Rutgers students</p>
          </div>
        </Card>

        {/* Actions */}
        <div className='space-y-2'>
          <Button
            onClick={handleSignOut}
            className='w-full bg-zinc-800 hover:bg-zinc-700 text-white justify-start'
          >
            <LogOut className='w-4 h-4 mr-2' />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
