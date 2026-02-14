import { createBrowserRouter, Navigate } from 'react-router';
import Root from './Root';
import Login from './pages/Login';
import Signup from './pages/Signup';
import MapView from './pages/MapView';
import CompassView from './pages/CompassView';
import Friends from './pages/Friends';
import Profile from './pages/Profile';
import GeofenceEditor from './pages/GeofenceEditor';
import Intro from './pages/Intro';
import AdminLayout from './pages/admin/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import GeofenceList from './pages/admin/GeofenceList';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Root,
    children: [
      { index: true, Component: Login },
      { path: 'intro', Component: Intro },
      { path: 'signup', Component: Signup },
      { path: 'map', Component: MapView },
      { path: 'compass', Component: CompassView },
      { path: 'friends', Component: Friends },
      { path: 'profile', Component: Profile },
      {
        path: 'admin',
        Component: AdminLayout,
        children: [
          { index: true, Component: () => <Navigate to="/admin/dashboard" replace /> },
          { path: 'dashboard', Component: Dashboard },
          { path: 'geofences', Component: GeofenceList },
          { path: 'geofences/new', Component: GeofenceEditor },
          { path: 'geofences/:id', Component: GeofenceEditor },
          { path: 'users', Component: () => <div className="p-8 text-white">User Management Coming Soon</div> },
          { path: 'settings', Component: () => <div className="p-8 text-white">Settings Coming Soon</div> },
        ],
      },
    ],
  },
]);
