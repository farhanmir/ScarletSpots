import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

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

// Health check endpoint
app.get("/make-server-8814ba2a/health", (c) => {
  return c.json({ status: "ok" });
});

// User signup - only allows @rutgers.edu or @scarletmail.rutgers.edu emails
app.post("/make-server-8814ba2a/signup", async (c) => {
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
app.get("/make-server-8814ba2a/user/profile", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getClient();

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (!user || error) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const profile = await kv.get(`user:${user.id}`);
    return c.json({ profile });
  } catch (err) {
    console.log('Profile fetch error:', err);
    return c.json({ error: 'Failed to fetch profile' }, 500);
  }
});

// Create parking session
app.post("/make-server-8814ba2a/park/session", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getClient();

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (!user || error) {
      return c.json({ error: 'Unauthorized' }, 401);
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
app.post("/make-server-8814ba2a/park/session/end", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getClient();

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (!user || error) {
      return c.json({ error: 'Unauthorized' }, 401);
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
app.get("/make-server-8814ba2a/park/session/active", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getClient();

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (!user || error) {
      return c.json({ error: 'Unauthorized' }, 401);
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
app.get("/make-server-8814ba2a/lot/:id", async (c) => {
  try {
    const lotId = c.req.param('id');

    const lotInfo = await kv.get(`lot:${lotId}:info`);
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
app.post("/make-server-8814ba2a/lots/custom", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getClient();

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (!user || error) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { name, campus, coordinates } = await c.req.json();

    if (!name || !coordinates || coordinates.length < 3) {
      return c.json({ error: 'Invalid geofence data' }, 400);
    }

    const id = `custom:${Date.now()}`;
    const lotData = {
      id,
      name,
      campus,
      coordinates,
      createdBy: user.id,
      createdAt: new Date().toISOString(),
      capacity: 50, // Default for custom lots
      isCustom: true
    };

    await kv.set(`lot:custom:${id}`, lotData);
    await kv.set(`lot:custom:${id}:info`, lotData); // For compatibility with standard lots

    return c.json({ success: true, lot: lotData });
  } catch (err) {
    console.log('Save custom lot error:', err);
    return c.json({ error: 'Failed to save custom lot' }, 500);
  }
});

// Delete custom geofence
app.delete("/make-server-8814ba2a/lots/custom/:id", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getClient();

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (!user || error) {
      return c.json({ error: 'Unauthorized' }, 401);
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
app.get("/make-server-8814ba2a/lots", async (c) => {
  try {
    // Fetch standard lots
    const lots = await kv.getByPrefix('lot:');
    const standardInfos = lots.filter(item => item.key.endsWith(':info') && !item.key.includes(':custom:'));

    // Fetch custom lots
    const customLots = await kv.getByPrefix('lot:custom:');
    const customInfos = customLots.filter(item => item.key.endsWith(':info'));

    const allInfos = [...standardInfos, ...customInfos];

    const lotsWithOccupancy = await Promise.all(
      allInfos.map(async (item) => {
        const lotId = item.value.id;
        const occupancy = await kv.get(`lot:${lotId}:occupancy`) || { spots: {} };
        const occupiedCount = Object.keys(occupancy.spots).length;
        const capacity = item.value.capacity || 100;

        return {
          ...item.value,
          occupiedCount,
          availableCount: capacity - occupiedCount,
          occupancyRate: (occupiedCount / capacity) * 100
        };
      })
    );

    return c.json({ lots: lotsWithOccupancy });
  } catch (err) {
    console.log('Get lots error:', err);
    return c.json({ error: 'Failed to get lots' }, 500);
  }
});

// Initialize default parking lots (for demo)
app.post("/make-server-8814ba2a/lots/init", async (c) => {
  try {
    const defaultLots = [
      {
        id: 'lot-1',
        name: 'Lot 1 - Livingston Campus',
        latitude: 40.5229,
        longitude: -74.4360,
        capacity: 150,
        campus: 'Livingston'
      },
      {
        id: 'lot-25',
        name: 'Lot 25 - College Ave',
        latitude: 40.5008,
        longitude: -74.4474,
        capacity: 200,
        campus: 'College Avenue'
      },
      {
        id: 'lot-64',
        name: 'Lot 64 - Busch Campus',
        latitude: 40.5212,
        longitude: -74.4587,
        capacity: 180,
        campus: 'Busch'
      },
      {
        id: 'lot-99',
        name: 'Lot 99 - Cook/Douglass',
        latitude: 40.4798,
        longitude: -74.4369,
        capacity: 120,
        campus: 'Cook/Douglass'
      }
    ];

    for (const lot of defaultLots) {
      await kv.set(`lot:${lot.id}:info`, lot);
    }

    return c.json({ success: true, message: 'Default lots initialized' });
  } catch (err) {
    console.log('Init lots error:', err);
    return c.json({ error: 'Failed to initialize lots' }, 500);
  }
});

// Friend request
app.post("/make-server-8814ba2a/friends/request", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getClient();

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (!user || error) {
      return c.json({ error: 'Unauthorized' }, 401);
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
app.post("/make-server-8814ba2a/friends/accept", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getClient();

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (!user || error) {
      return c.json({ error: 'Unauthorized' }, 401);
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
app.get("/make-server-8814ba2a/friends", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
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

Deno.serve(app.fetch);
