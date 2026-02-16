import { useEffect, useState } from 'react';
import { apiCall } from '../../lib/supabase';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { User, Mail, Calendar, Shield, Search, Trash2, Plus, X, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter
} from '../../components/ui/dialog';

interface UserData {
  id: string;
  email: string;
  name: string;
  created_at: string;
  last_sign_in_at: string;
  email_confirmed_at: string | null;
  phone: string;
  user_metadata?: {
    role?: string;
  };
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  
  // Add User State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', name: '', role: 'user' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete User State
  const [userToDelete, setUserToDelete] = useState<UserData | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await apiCall('/admin/users');
      setUsers(data.users);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching users:', err);
      // More specific error for 401
      if (err.message && err.message.includes('Unauthorized')) {
        setError('Your session has expired or you do not have permission. Please log in again.');
      } else {
        setError(err.message || 'Failed to load users');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async () => {
    try {
      setIsSubmitting(true);
      await apiCall('/admin/users', {
        method: 'POST',
        body: JSON.stringify(newUser)
      });
      setIsAddOpen(false);
      setNewUser({ email: '', password: '', name: '', role: 'user' });
      fetchUsers();
    } catch (err: any) {
      alert('Failed to create user: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await apiCall(`/admin/users/${userToDelete.id}`, {
        method: 'DELETE'
      });
      setUserToDelete(null);
      fetchUsers();
    } catch (err: any) {
      alert('Failed to delete user: ' + err.message);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await apiCall(`/admin/users/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole })
      });
      fetchUsers();
    } catch (err: any) {
      alert('Failed to update role: ' + err.message);
    }
  };

  const filteredUsers = users.filter(user => 
    user.email?.toLowerCase().includes(search.toLowerCase()) ||
    user.name?.toLowerCase().includes(search.toLowerCase()) ||
    user.id.toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="p-8 max-w-6xl mx-auto space-y-6 animate-pulse">
        <div className="h-10 w-48 bg-zinc-800 rounded" />
        <div className="h-12 w-full bg-zinc-800 rounded" />
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-20 w-full bg-zinc-900 rounded border border-zinc-800" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">User Management</h1>
          <p className="text-zinc-400">View and manage registered users ({users.length} total)</p>
        </div>
        
        <div className="flex gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search users..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 w-full md:w-64"
            />
          </div>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="bg-red-600 hover:bg-red-700 text-white gap-2">
                <Plus size={18} />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
              <DialogHeader>
                <DialogTitle>Add New User</DialogTitle>
                <DialogDescription>Create a new user account manually.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Full Name</label>
                  <input
                    className="w-full bg-zinc-800 border-zinc-700 rounded-md px-3 py-2"
                    value={newUser.name}
                    onChange={e => setNewUser({...newUser, name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <input
                    className="w-full bg-zinc-800 border-zinc-700 rounded-md px-3 py-2"
                    type="email"
                    value={newUser.email}
                    onChange={e => setNewUser({...newUser, email: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Password</label>
                  <input
                    className="w-full bg-zinc-800 border-zinc-700 rounded-md px-3 py-2"
                    type="password"
                    value={newUser.password}
                    onChange={e => setNewUser({...newUser, password: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Role</label>
                  <select
                    className="w-full bg-zinc-800 border-zinc-700 rounded-md px-3 py-2"
                    value={newUser.role}
                    onChange={e => setNewUser({...newUser, role: e.target.value})}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                <Button onClick={handleAddUser} disabled={isSubmitting}>
                  {isSubmitting ? 'Creating...' : 'Create User'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error ? (
        <div className="p-8 text-center text-red-500 bg-red-500/10 rounded-lg border border-red-500/20">
          {error}
        </div>
      ) : (
        <Card className="bg-zinc-900 border-zinc-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-900/50 border-b border-zinc-800 text-zinc-400 text-xs uppercase tracking-wider">
                  <th className="py-4 px-6 font-medium">User</th>
                  <th className="py-4 px-6 font-medium">Status</th>
                  <th className="py-4 px-6 font-medium">Role</th>
                  <th className="py-4 px-6 font-medium">Joined</th>
                  <th className="py-4 px-6 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-zinc-800/30 transition-colors group">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:bg-red-500/10 group-hover:text-red-500 transition-colors">
                            <User size={20} />
                          </div>
                          <div>
                            <div className="font-medium text-white">{user.name}</div>
                            <div className="text-sm text-zinc-500 flex items-center gap-1">
                              <Mail size={12} />
                              {user.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        {user.email_confirmed_at ? (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/20">
                            Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <select 
                            className="bg-transparent text-sm text-zinc-300 border-none focus:ring-0 cursor-pointer hover:text-white"
                            value={user.user_metadata?.role || 'user'}
                            onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          >
                            <option value="user" className="bg-zinc-900">User</option>
                            <option value="admin" className="bg-zinc-900">Admin</option>
                          </select>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-zinc-400 text-sm">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-zinc-600" />
                          {formatDate(user.created_at)}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="text-zinc-500 hover:text-red-500 hover:bg-red-500/10"
                          onClick={() => setUserToDelete(user)}
                        >
                          <Trash2 size={18} />
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-zinc-500">
                      No users found matching "{search}"
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete user <strong>{userToDelete?.name || userToDelete?.email}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserToDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteUser}>
              Delete User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
