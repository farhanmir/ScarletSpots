import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.ts";

const app = new Hono();
const api = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "apikey", "x-user-token"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Global 404 handler for debugging
app.notFound((c) => {
  const msg = `404 Not Found: ${c.req.method} ${c.req.url} (Path: ${new URL(c.req.url).pathname})`;
  console.log(msg);
  return c.text(msg, 404);
});

// Create Supabase client for admin operations
const getAdminClient = () => {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
};

// Create Supabase client for user operations
const getClient = () => {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  );
};

// Helper to get access token from headers (prefer custom header to bypass Gateway checks)
const getAccessToken = (c: any) => {
  const customToken = c.req.header('x-user-token');
  console.log('Custom Header:', customToken ? customToken.substring(0, 10) + '...' : 'NONE');
  if (customToken) return customToken.replace('Bearer ', '');
  const authHeader = c.req.header('Authorization');
  console.log('Auth Header:', authHeader ? authHeader.substring(0, 10) + '...' : 'NONE');
  return authHeader?.split(' ')[1];
};


// Health check endpoint
api.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// User signup - only allows @rutgers.edu or @scarletmail.rutgers.edu emails
api.post("/signup", async (c) => {
  try {
    const { email, password, name } = await c.req.json();

    // Validate Rutgers email
    if (!email.endsWith('@rutgers.edu') && !email.endsWith('@scarletmail.rutgers.edu')) {
      return c.json({ error: 'Only Rutgers email addresses are allowed (@rutgers.edu or @scarletmail.rutgers.edu)' }, 400);
    }

    const supabase = getAdminClient();

    // Create user with admin client
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name },
      // Automatically confirm the user's email since an email server hasn't been configured.
      email_confirm: true
    });

    if (error) {
      console.log('Signup error:', error);
      return c.json({ error: error.message }, 400);
    }

    // Store user profile in KV store
    await kv.set(`user:${data.user.id}`, {
      id: data.user.id,
      email,
      name,
      created_at: new Date().toISOString()
    });

    return c.json({ success: true, user: data.user });
  } catch (err) {
    console.log('Signup exception:', err);
    return c.json({ error: 'Signup failed' }, 500);
  }
});

// Get user profile
api.get("/user/profile", async (c) => {
  try {
    const accessToken = getAccessToken(c);
    const supabase = getClient();

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (!user || error) {
      console.log('Auth error:', error?.message);
      return c.json({ error: error?.message || 'Unauthorized' }, 401);
    }

    const profile = await kv.get(`user:${user.id}`);
    return c.json({ profile });
  } catch (err) {
    console.log('Profile fetch error:', err);
    return c.json({ error: 'Failed to fetch profile' }, 500);
  }
});

// Create parking session
api.post("/park/session", async (c) => {
  try {
    const accessToken = getAccessToken(c);
    const supabase = getClient();

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (!user || error) {
      console.log('Auth error:', error?.message);
      return c.json({ error: error?.message || 'Unauthorized' }, 401);
    }

    const { lotId, spotNumber, latitude, longitude, confirmed } = await c.req.json();

    const sessionId = `session:${user.id}:${Date.now()}`;
    const session = {
      id: sessionId,
      userId: user.id,
      lotId,
      spotNumber,
      latitude,
      longitude,
      confirmed: confirmed ?? false,
      startTime: new Date().toISOString(),
      endTime: null,
      active: true
    };

    await kv.set(sessionId, session);
    await kv.set(`user:${user.id}:active_session`, sessionId);

    // Update lot occupancy
    const lotKey = `lot:${lotId}:occupancy`;
    const occupancy = await kv.get(lotKey) || { spots: {} };
    occupancy.spots[spotNumber] = {
      userId: user.id,
      sessionId,
      timestamp: new Date().toISOString()
    };
    await kv.set(lotKey, occupancy);

    return c.json({ success: true, session });
  } catch (err) {
    console.log('Park session error:', err);
    return c.json({ error: 'Failed to create parking session' }, 500);
  }
});

// End parking session
api.post("/park/session/end", async (c) => {
  try {
    const accessToken = getAccessToken(c);
    const supabase = getClient();

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (!user || error) {
      console.log('Auth error:', error?.message);
      return c.json({ error: error?.message || 'Unauthorized' }, 401);
    }

    const activeSessionId = await kv.get(`user:${user.id}:active_session`);
    if (!activeSessionId) {
      return c.json({ error: 'No active session' }, 404);
    }

    const session = await kv.get(activeSessionId);
    if (session) {
      session.endTime = new Date().toISOString();
      session.active = false;
      await kv.set(activeSessionId, session);

      // Update lot occupancy
      const lotKey = `lot:${session.lotId}:occupancy`;
      const occupancy = await kv.get(lotKey) || { spots: {} };
      delete occupancy.spots[session.spotNumber];
      await kv.set(lotKey, occupancy);
    }

    await kv.del(`user:${user.id}:active_session`);

    return c.json({ success: true });
  } catch (err) {
    console.log('End session error:', err);
    return c.json({ error: 'Failed to end session' }, 500);
  }
});

// Get active parking session
api.get("/park/session/active", async (c) => {
  try {
    const accessToken = getAccessToken(c);
    const supabase = getClient();

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    console.log('getUser result:', { userStr: user ? 'FOUND' : 'NULL', error });

    if (!user || error) {
      console.log('Auth error:', error?.message);
      return c.json({ error: error?.message || 'Unauthorized', details: { user: !!user, hasError: !!error } }, 401);
    }

    const activeSessionId = await kv.get(`user:${user.id}:active_session`);
    if (!activeSessionId) {
      return c.json({ session: null });
    }

    const session = await kv.get(activeSessionId);
    return c.json({ session });
  } catch (err) {
    console.log('Get active session error:', err);
    return c.json({ error: 'Failed to get active session' }, 500);
  }
});

// Get lot information and current occupancy
api.get("/lot/:id", async (c) => {
  try {
    const lotId = c.req.param('id');

    // Check standard lot first, then custom lot
    let lotInfo = await kv.get(`lot:${lotId}:info`);
    if (!lotInfo) {
      lotInfo = await kv.get(`lot:custom:${lotId}:info`);
    }
    if (!lotInfo) {
      lotInfo = await kv.get(`lot:custom:${lotId}`);
    }

    const occupancy = await kv.get(`lot:${lotId}:occupancy`) || { spots: {} };

    const occupiedCount = Object.keys(occupancy.spots).length;
    const capacity = lotInfo?.capacity || 100;

    return c.json({
      lot: lotInfo,
      occupiedCount,
      capacity,
      availableCount: capacity - occupiedCount,
      occupancyRate: (occupiedCount / capacity) * 100
    });
  } catch (err) {
    console.log('Get lot error:', err);
    return c.json({ error: 'Failed to get lot information' }, 500);
  }
});

// Save custom geofence
api.post("/lots/custom", async (c) => {
  try {
    const accessToken = getAccessToken(c);
    const supabase = getClient();

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (!user || error) {
      console.log('Auth error:', error?.message);
      return c.json({ error: error?.message || 'Unauthorized' }, 401);
    }

    const { name, campus, coordinates, capacity } = await c.req.json();

    if (!name || !coordinates || coordinates.length < 3) {
      return c.json({ error: 'Invalid geofence data' }, 400);
    }

    // Calculate centroid for the marker position
    const latitude = coordinates.reduce((sum: number, p: number[]) => sum + p[0], 0) / coordinates.length;
    const longitude = coordinates.reduce((sum: number, p: number[]) => sum + p[1], 0) / coordinates.length;

    const id = `custom:${Date.now()}`;
    const lotData = {
      id,
      name,
      campus,
      coordinates,
      latitude,
      longitude,
      createdBy: user.id,
      createdAt: new Date().toISOString(),
      capacity: Number.parseInt(capacity, 10) || 50, // Default for custom lots
      isCustom: true
    };

    await kv.set(`lot:custom:${id}`, lotData);
    await kv.set(`lot:custom:${id}:info`, lotData); // For compatibility with standard lots

    await kv.set(`lot:custom:${id}:info`, lotData); // For compatibility with standard lots

    return c.json({ success: true, lot: lotData });
  } catch (err) {
    console.log('Save custom lot error:', err);
    return c.json({ error: 'Failed to save custom lot' }, 500);
  }
});

// Update custom geofence
api.put("/lots/custom/:id", async (c) => {
  try {
    const accessToken = getAccessToken(c);
    const supabase = getClient();

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (!user || error) {
      console.log('Auth error:', error?.message);
      return c.json({ error: error?.message || 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');
    const { name, campus, coordinates, capacity } = await c.req.json();

    if (!name || !coordinates || coordinates.length < 3) {
      return c.json({ error: 'Invalid geofence data' }, 400);
    }

    // Check if lot exists
    const existingLot = await kv.get(`lot:custom:${id}`);
    if (!existingLot) {
      return c.json({ error: 'Lot not found' }, 404);
    }

    // Check ownership (optional, but good practice)
    if (existingLot.createdBy !== user.id) {
      // Allow admins or owner? For now, let's assume all authenticated users are admins for this demo
      // return c.json({ error: 'Unauthorized' }, 403);
    }

    // Calculate centroid
    const latitude = coordinates.reduce((sum: number, p: number[]) => sum + p[0], 0) / coordinates.length;
    const longitude = coordinates.reduce((sum: number, p: number[]) => sum + p[1], 0) / coordinates.length;

    const lotData = {
      ...existingLot, // Keep createdBy, createdAt
      name,
      campus,
      coordinates,
      latitude,
      longitude,
      capacity: Number.parseInt(capacity, 10) || existingLot.capacity || 50,
      updatedAt: new Date().toISOString()
    };

    await kv.set(`lot:custom:${id}`, lotData);
    await kv.set(`lot:custom:${id}:info`, lotData);

    return c.json({ success: true, lot: lotData });
  } catch (err) {
    console.log('Update custom lot error:', err);
    return c.json({ error: 'Failed to update custom lot' }, 500);
  }
});

// Delete custom geofence
api.delete("/lots/custom/:id", async (c) => {
  try {
    const accessToken = getAccessToken(c);
    const supabase = getClient();

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (!user || error) {
      console.log('Auth error:', error?.message);
      return c.json({ error: error?.message || 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');
    await kv.del(`lot:custom:${id}`);
    await kv.del(`lot:custom:${id}:info`);

    return c.json({ success: true });
  } catch (err) {
    console.log('Delete custom lot error:', err);
    return c.json({ error: 'Failed to delete custom lot' }, 500);
  }
});

// Get all lots (standard + custom)
api.get("/lots", async (c) => {
  try {
    const lots = await kv.getByPrefix('lot:');
    const standardInfos = lots.filter(item => item.key.endsWith(':info') && !item.key.includes('lot:custom:'));

    // Fetch custom lots
    const customLots = await kv.getByPrefix('lot:custom:');
    const customInfos = customLots.filter(item => item.key.endsWith(':info'));

    const allInfos = [...standardInfos, ...customInfos];
    const uniqueInfos = Array.from(new Map(allInfos.map((item) => [item.value.id, item])).values());

    const lotsWithOccupancy = await Promise.all(
      uniqueInfos.map(async (item) => {
        const lotId = item.value.id;
        const occupancy = await kv.get(`lot:${lotId}:occupancy`) || { spots: {} };
        const occupiedCount = Object.keys(occupancy.spots).length;
        const capacity = item.value.capacity || 100;

        // Calculate centroid if latitude/longitude are missing (for custom lots)
        let { latitude, longitude, coordinates } = item.value;
        if ((!latitude || !longitude) && coordinates && coordinates.length > 0) {
          latitude = coordinates.reduce((sum: number, p: number[]) => sum + p[0], 0) / coordinates.length;
          longitude = coordinates.reduce((sum: number, p: number[]) => sum + p[1], 0) / coordinates.length;
        }

        return {
          ...item.value,
          latitude,
          longitude,
          occupiedCount,
          availableCount: Math.max(0, capacity - occupiedCount),
          occupancyRate: capacity > 0 ? (occupiedCount / capacity) * 100 : 0
        };
      })
    );

    return c.json({ lots: lotsWithOccupancy });
  } catch (err) {
    console.log('Get lots error:', err);
    return c.json({ error: 'Failed to get lots' }, 500);
  }
});

// Clear default/system parking lots
api.post("/lots/clear-defaults", async (c) => {
  try {
    const defaultLots = ['lot-1', 'lot-25', 'lot-64', 'lot-99'];

    for (const lotId of defaultLots) {
      await kv.del(`lot:${lotId}:info`);
      await kv.del(`lot:${lotId}:occupancy`);
    }

    return c.json({ success: true, message: 'System lots cleared' });
  } catch (err) {
    console.log('Clear lots error:', err);
    return c.json({ error: 'Failed to clear system lots' }, 500);
  }
});

// Admin stats endpoint – aggregates KV data for the dashboard
api.get("/admin/stats", async (c) => {
  try {
    // Fetch all user keys from KV once (needed for active sessions and potentially for fallback)
    const allUserKeys = await kv.getByPrefix('user:');

    // 1. Get total users from Supabase Auth directly (authoritative count)
    let totalUsers = 0;
    const supabaseAdmin = getAdminClient();
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });

    if (!userError && userData) {
      totalUsers = userData.total;
    } else {
      console.error('Error fetching user count, falling back to KV:', userError);
      // Fallback: Count users from KV profiles
      const userProfiles = allUserKeys.filter(item => {
        const rest = item.key.slice('user:'.length);
        return !rest.includes(':');
      });
      totalUsers = userProfiles.length;
    }

    // 2. Count active sessions using the already fetched keys
    const activeSessionKeys = allUserKeys.filter(item => item.key.endsWith(':active_session') && item.value);
    const activeSessions = activeSessionKeys.length;

    // Count geofences (standard + custom, deduped)
    const allLots = await kv.getByPrefix('lot:');
    const standardInfos = allLots.filter(item => item.key.endsWith(':info') && !item.key.includes('lot:custom:'));
    const customLots = await kv.getByPrefix('lot:custom:');
    const customInfos = customLots.filter(item => item.key.endsWith(':info'));
    const allInfos = [...standardInfos, ...customInfos];
    const uniqueInfos = Array.from(new Map(allInfos.map((item) => [item.value.id, item])).values());
    const totalGeofences = uniqueInfos.length;

    // Per-lot occupancy details
    const lots = await Promise.all(
      uniqueInfos.map(async (item) => {
        const lotId = item.value.id;
        const occupancy = await kv.get(`lot:${lotId}:occupancy`) || { spots: {} };
        const occupiedCount = Object.keys(occupancy.spots).length;
        const capacity = item.value.capacity || 100;
        return {
          id: lotId,
          name: item.value.name,
          campus: item.value.campus || '',
          capacity,
          occupiedCount,
          availableCount: Math.max(0, capacity - occupiedCount),
          occupancyRate: capacity > 0 ? Math.round((occupiedCount / capacity) * 100) : 0,
        };
      })
    );

    // Total capacity across all lots
    const totalCapacity = lots.reduce((sum, lot) => sum + lot.capacity, 0);

    return c.json({ totalUsers, activeSessions, totalGeofences, totalCapacity, lots });
  } catch (err) {
    console.log('Admin stats error:', err);
    return c.json({ error: 'Failed to get admin stats' }, 500);
  }
});

// Get all users (Admin only)
api.get("/admin/users", async (c) => {
  try {
    const accessToken = getAccessToken(c);
    const supabase = getClient();

    // Verify admin/user
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (!user || error) {
      console.log('Auth error:', error?.message);
      return c.json({
        error: `Unauthorized: ${error?.message || 'No user found'}`,
        debug: {
          tokenStart: accessToken ? accessToken.substring(0, 10) : 'none',
          hasUser: !!user
        }
      }, 401);
    }

    // In a real app, check for admin role here.
    // For this demo, we assume authenticated users are admins.

    const supabaseAdmin = getAdminClient();
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 100 // Limit to 100 for now
    });

    if (listError) {
      console.log('List users error:', listError);
      return c.json({ error: listError.message }, 500);
    }

    // Merge with minimal profile data if needed (mapped from metadata)
    const userList = users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.user_metadata?.name || 'N/A',
      user_metadata: u.user_metadata,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      email_confirmed_at: u.email_confirmed_at,
      phone: u.phone || 'N/A'
    }));

    return c.json({ users: userList });
  } catch (err) {
    console.log('Get users error:', err);
    return c.json({ error: 'Failed to get users' }, 500);
  }
});

// Delete user (Admin only)
api.delete("/admin/users/:id", async (c) => {
  try {
    const accessToken = getAccessToken(c);
    const supabase = getClient();

    // Verify admin/user
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (!user || error) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    if (user.user_metadata?.role !== 'admin') {
      return c.json({ error: 'Forbidden: Admins only' }, 403);
    }

    if (user.user_metadata?.role !== 'admin') {
      return c.json({ error: 'Forbidden: Admins only' }, 403);
    }

    const userId = c.req.param('id');
    const supabaseAdmin = getAdminClient();

    // Check if trying to delete self
    if (userId === user.id) {
      return c.json({ error: 'Cannot delete your own account' }, 400);
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
      return c.json({ error: deleteError.message }, 500);
    }

    // Also remove from KV
    await kv.del(`user:${userId}`);
    await kv.del(`user:${userId}:active_session`);

    return c.json({ success: true });
  } catch (err) {
    console.log('Delete user error:', err);
    return c.json({ error: 'Failed to delete user' }, 500);
  }
});

// Create user (Admin only)
api.post("/admin/users", async (c) => {
  try {
    const accessToken = getAccessToken(c);
    const supabase = getClient();

    // Verify admin
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (!user || error) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { email, password, name, role } = await c.req.json();

    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }

    const supabaseAdmin = getAdminClient();
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: name || '',
        role: role || 'user'
      }
    });

    if (createError) {
      return c.json({ error: createError.message }, 500);
    }

    // Store in KV
    if (newUser.user) {
      await kv.set(`user:${newUser.user.id}`, {
        id: newUser.user.id,
        email,
        name: name || '',
        role: role || 'user',
        created_at: new Date().toISOString()
      });
    }

    return c.json({ success: true, user: newUser.user });
  } catch (err) {
    console.log('Create user error:', err);
    return c.json({ error: 'Failed to create user' }, 500);
  }
});

// Update user role (Admin only)
api.put("/admin/users/:id/role", async (c) => {
  try {
    const accessToken = getAccessToken(c);
    const supabase = getClient();

    // Verify admin
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (!user || error) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    if (user.user_metadata?.role !== 'admin') {
      return c.json({ error: 'Forbidden: Admins only' }, 403);
    }

    const userId = c.req.param('id');
    const { role } = await c.req.json();

    if (!role) {
      return c.json({ error: 'Role is required' }, 400);
    }

    const supabaseAdmin = getAdminClient();
    const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { user_metadata: { role } }
    );

    if (updateError) {
      return c.json({ error: updateError.message }, 500);
    }

    // Update KV
    const kvUser = await kv.get(`user:${userId}`);
    if (kvUser) {
      kvUser.role = role;
      await kv.set(`user:${userId}`, kvUser);
    }

    return c.json({ success: true, user: updatedUser.user });
  } catch (err) {
    console.log('Update role error:', err);
    return c.json({ error: 'Failed to update user role' }, 500);
  }
});

// Friend request
api.post("/friends/request", async (c) => {
  try {
    const accessToken = getAccessToken(c);
    const supabase = getClient();

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (!user || error) {
      console.log('Auth error:', error?.message);
      return c.json({ error: error?.message || 'Unauthorized' }, 401);
    }

    const { friendEmail } = await c.req.json();

    // Find friend by email
    const users = await kv.getByPrefix('user:');
    const friendUser = users.find(u => u.value.email === friendEmail);

    if (!friendUser) {
      return c.json({ error: 'User not found' }, 404);
    }

    const friendId = friendUser.value.id;
    const requestId = `friend_request:${user.id}:${friendId}`;

    await kv.set(requestId, {
      id: requestId,
      fromUserId: user.id,
      toUserId: friendId,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    return c.json({ success: true });
  } catch (err) {
    console.log('Friend request error:', err);
    return c.json({ error: 'Failed to send friend request' }, 500);
  }
});

// Accept friend request
api.post("/friends/accept", async (c) => {
  try {
    const accessToken = getAccessToken(c);
    const supabase = getClient();

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (!user || error) {
      console.log('Auth error:', error?.message);
      return c.json({ error: error?.message || 'Unauthorized' }, 401);
    }

    const { requestId } = await c.req.json();
    const request = await kv.get(requestId);

    if (!request || request.toUserId !== user.id) {
      return c.json({ error: 'Invalid request' }, 400);
    }

    // Update request status
    request.status = 'accepted';
    await kv.set(requestId, request);

    // Create friendship entries
    const friendshipId = `friendship:${request.fromUserId}:${request.toUserId}`;
    await kv.set(friendshipId, {
      user1: request.fromUserId,
      user2: request.toUserId,
      createdAt: new Date().toISOString()
    });

    return c.json({ success: true });
  } catch (err) {
    console.log('Accept friend error:', err);
    return c.json({ error: 'Failed to accept friend request' }, 500);
  }
});

// Get friends
api.get("/friends", async (c) => {
  try {
    const accessToken = getAccessToken(c);
    const supabase = getClient();

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (!user || error) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const friendships = await kv.getByPrefix('friendship:');
    const userFriendships = friendships.filter(f =>
      f.value.user1 === user.id || f.value.user2 === user.id
    );

    const friendIds = userFriendships.map(f =>
      f.value.user1 === user.id ? f.value.user2 : f.value.user1
    );

    const friends = await Promise.all(
      friendIds.map(async (friendId) => {
        const friendProfile = await kv.get(`user:${friendId}`);
        const activeSessionId = await kv.get(`user:${friendId}:active_session`);
        let session = null;
        if (activeSessionId) {
          session = await kv.get(activeSessionId);
        }
        return {
          ...friendProfile,
          activeSession: session
        };
      })
    );

    return c.json({ friends });
  } catch (err) {
    console.log('Get friends error:', err);
    return c.json({ error: 'Failed to get friends' }, 500);
  }
});

app.route("/", api);
app.route("/server", api);
app.route("/make-server-8814ba2a", api);

Deno.serve(app.fetch);
