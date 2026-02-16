import { useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router';
import { LayoutDashboard, Map, Users, Settings, LogOut } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { supabase } from '../../lib/supabase';

export default function AdminLayout() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/map');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user?.user_metadata?.role !== 'admin') {
      // If not admin, redirect to map
      navigate('/map');
    }
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-white">
      {/* Sidebar */}
      <aside className="w-64 border-r border-zinc-800 bg-zinc-900 flex flex-col">
        <div className="p-6 border-b border-zinc-800">
          <h1 className="text-xl font-bold bg-gradient-to-r from-red-600 to-red-400 bg-clip-text text-transparent">
            ScarletSpots
          </h1>
          <span className="text-xs text-zinc-500 font-mono">ADMIN CONSOLE</span>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <NavLink
            to="/admin/dashboard"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                isActive ? 'bg-red-600/10 text-red-500' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
              }`
            }
          >
            <LayoutDashboard size={18} />
            Dashboard
          </NavLink>
          <NavLink
            to="/admin/geofences"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                isActive ? 'bg-red-600/10 text-red-500' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
              }`
            }
          >
            <Map size={18} />
            Geofences
          </NavLink>
          <NavLink
            to="/admin/users"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                isActive ? 'bg-red-600/10 text-red-500' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
              }`
            }
          >
            <Users size={18} />
            Users
          </NavLink>
          <NavLink
            to="/admin/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                isActive ? 'bg-red-600/10 text-red-500' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
              }`
            }
          >
            <Settings size={18} />
            Settings
          </NavLink>
        </nav>

        <div className="p-4 border-t border-zinc-800">
          <Button variant="ghost" className="w-full justify-start text-zinc-400 hover:text-white" onClick={handleLogout}>
            <LogOut size={18} className="mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-zinc-950">
        <Outlet />
      </main>
    </div>
  );
}
