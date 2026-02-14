# ScarletSpots - Rutgers Parking Finder

A smart parking application for Rutgers University students to find available parking spots, share locations with friends, and navigate back to their parked cars.

## Features

### 🔐 Authentication
- **Rutgers-only signup**: Only accepts @rutgers.edu and @scarletmail.rutgers.edu email addresses
- Secure authentication via Supabase Auth
- Session management with automatic redirect

### 🗺️ Interactive Map View
- Real-time parking lot availability across all Rutgers campuses:
  - Livingston Campus (Lot 1)
  - College Avenue (Lot 25)
  - Busch Campus (Lot 64)
  - Cook/Douglass (Lot 99)
- Color-coded occupancy indicators:
  - 🟢 Green: Available (< 70% full)
  - 🟡 Yellow: Busy (70-90% full)
  - 🔴 Red: Full (> 90% full)
- Heat map overlays showing parking density
- Your current location tracking
- Friend parking locations visible on map

### 🧭 Knight Needle Compass
- Navigate back to your parked car with a Rutgers-themed compass
- Real-time distance calculation
- Arrow points directly to your parking spot
- Uses device orientation sensors for accurate heading
- Visual and distance feedback as you get closer

### 👥 Social Features
- Add friends by Rutgers email
- See where your friends are parked in real-time
- Privacy-first: only friends can see your location
- Friend parking spots highlighted on the map

### 🚗 Parking Session Management
- Mark your parking spot when you arrive
- Automatic session tracking
- End session when you leave
- Session history

## Tech Stack

### Frontend
- **React** with TypeScript
- **React Router** for navigation
- **Tailwind CSS** for styling
- **Leaflet** / **React-Leaflet** for interactive maps
- **Supabase Client** for auth and API calls

### Backend
- **Supabase** for authentication and database
- **Hono** web server (Edge Functions)
- **KV Store** for data persistence
- RESTful API architecture

### Key Libraries
- `lucide-react` - Icons
- `sonner` - Toast notifications
- `@radix-ui` - UI components

## API Endpoints

### Authentication
- `POST /signup` - Create new user account (Rutgers email only)
- Uses Supabase Auth for login/logout

### Parking Sessions
- `POST /park/session` - Start a new parking session
- `POST /park/session/end` - End current parking session
- `GET /park/session/active` - Get user's active parking session

### Parking Lots
- `GET /lots` - Get all parking lots with occupancy data
- `GET /lot/:id` - Get specific lot information
- `POST /lots/init` - Initialize default lots (admin)

### Friends
- `POST /friends/request` - Send friend request by email
- `POST /friends/accept` - Accept pending friend request
- `GET /friends` - Get all friends with their active sessions

### User
- `GET /user/profile` - Get current user profile

## Data Models

### User Profile
```typescript
{
  id: string
  email: string
  name: string
  created_at: string
}
```

### Parking Session
```typescript
{
  id: string
  userId: string
  lotId: string
  spotNumber: string
  latitude: number
  longitude: number
  confirmed: boolean
  startTime: string
  endTime: string | null
  active: boolean
}
```

### Parking Lot
```typescript
{
  id: string
  name: string
  latitude: number
  longitude: number
  capacity: number
  campus: string
  occupiedCount: number
  availableCount: number
  occupancyRate: number
}
```

## Design Philosophy

### Dark Theme with Rutgers Red
- Background: Zinc 950 (near black)
- Accents: Rutgers Scarlet Red (#dc2626)
- Text: White and Zinc variants
- Inspired by modern, clean mobile interfaces

### Mobile-First
- Responsive design optimized for mobile devices
- Touch-friendly UI elements
- Optimized map interactions
- Bottom sheets for quick actions

### Privacy & Security
- University-only email restriction prevents spam
- Row-level security on backend
- Friend relationships require explicit consent
- Location data only shared with accepted friends

## Future Enhancements (From Plan)

Based on the original plan.md, future features could include:

1. **Automatic Parking Detection**
   - Geofencing to detect lot entry
   - Bluetooth disconnection detection
   - Movement pattern analysis

2. **Predictive Analytics**
   - Rush-hour forecasting
   - Historical occupancy patterns
   - 1-hour ahead predictions

3. **Virtual Grid System**
   - More precise spot identification
   - GPS accuracy compensation
   - Smart exit detection

4. **Premium Features** (Post-launch)
   - Ticket reporting system
   - Enforcement alerts
   - Analytics dashboard

## Development Notes

- This is a **web application** (not native mobile) built with Figma Make
- Uses Leaflet for web maps instead of native React Native Maps
- Device orientation API used for compass (requires HTTPS and permissions)
- Supabase provides backend infrastructure
- All parking lot data stored in KV store for prototyping

## Getting Started

1. **Sign Up**: Use your @rutgers.edu email address
2. **View Map**: See all parking lots and their availability
3. **Park**: When you arrive, tap a lot and enter your spot number
4. **Add Friends**: Share parking info with classmates
5. **Find Your Car**: Use the Knight Needle compass to navigate back

## Important Notes

⚠️ **Prototype Status**: This is a prototype built for demonstration. For production:
- Would need proper database schema (not just KV store)
- Additional security reviews
- Compliance with university policies
- Real parking lot data integration
- Mobile app version for better sensor access

🎓 **For Rutgers Students, By Rutgers Students**

---

Built with ❤️ for the Rutgers community
