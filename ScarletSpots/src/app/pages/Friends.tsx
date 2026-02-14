import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { supabase, apiCall } from '../lib/supabase';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { ArrowLeft, UserPlus, MapPin } from 'lucide-react';
import { toast } from 'sonner';

interface Friend {
  id: string;
  name: string;
  email: string;
  activeSession?: {
    lotId: string;
    spotNumber: string;
    startTime: string;
  };
}

export default function Friends() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendEmail, setFriendEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
    fetchFriends();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/');
    }
  };

  const fetchFriends = async () => {
    try {
      const data = await apiCall('/friends');
      setFriends(data.friends || []);
    } catch (error) {
      console.error('Fetch friends error:', error);
    }
  };

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await apiCall('/friends/request', {
        method: 'POST',
        body: JSON.stringify({ friendEmail }),
      });

      toast.success('Friend request sent!');
      setFriendEmail('');
      fetchFriends();
    } catch (error: any) {
      console.error('Add friend error:', error);
      toast.error(error.message || 'Failed to send friend request');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-red-950">
      {/* Header */}
      <div className="bg-zinc-900/50 backdrop-blur-sm border-b border-zinc-800 p-4 flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/map')}
          className="text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-white font-bold text-lg">Friends</h1>
          <p className="text-zinc-400 text-sm">{friends.length} friends</p>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {/* Add Friend Form */}
        <Card className="bg-zinc-900/50 backdrop-blur-sm border-zinc-800 p-4">
          <form onSubmit={handleAddFriend} className="space-y-3">
            <h2 className="text-white font-semibold flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Add Friend
            </h2>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="friend@rutgers.edu"
                value={friendEmail}
                onChange={(e) => setFriendEmail(e.target.value)}
                required
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
              />
              <Button
                type="submit"
                disabled={loading}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {loading ? 'Sending...' : 'Add'}
              </Button>
            </div>
          </form>
        </Card>

        {/* Friends List */}
        <div className="space-y-3">
          {friends.length === 0 ? (
            <Card className="bg-zinc-900/50 backdrop-blur-sm border-zinc-800 p-8 text-center">
              <div className="text-zinc-500 space-y-2">
                <UserPlus className="w-12 h-12 mx-auto opacity-50" />
                <p>No friends yet</p>
                <p className="text-sm">Add friends to see where they park</p>
              </div>
            </Card>
          ) : (
            friends.map((friend) => (
              <Card
                key={friend.id}
                className="bg-zinc-900/50 backdrop-blur-sm border-zinc-800 p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-white font-semibold">{friend.name}</h3>
                    <p className="text-zinc-400 text-sm">{friend.email}</p>
                    
                    {friend.activeSession ? (
                      <div className="mt-2 flex items-center gap-2 text-green-500 text-sm">
                        <MapPin className="w-4 h-4" />
                        <span>Parked at Spot {friend.activeSession.spotNumber}</span>
                        <span className="text-zinc-500">
                          • {formatTime(friend.activeSession.startTime)}
                        </span>
                      </div>
                    ) : (
                      <div className="mt-2 text-zinc-500 text-sm">
                        Not currently parked
                      </div>
                    )}
                  </div>

                  {friend.activeSession && (
                    <Button
                      size="sm"
                      onClick={() => navigate('/map')}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      View on Map
                    </Button>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
