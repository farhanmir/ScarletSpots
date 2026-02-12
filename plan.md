# ScarletSpots - Project Plan

## Project Overview
ScarletSpots is a smart parking application designed to help users find and share parking information, particularly focused on campus environments. The app combines location tracking, social features, and crowd-sourced data to create a comprehensive parking solution.

---

## Core Features

### 1. Intelligent Parking Detection System
**Objective:** Automatically detect and log where users park their vehicles with minimal manual input.

**Implementation Details:**
- **Geofencing Integration:** Mark designated parking lots on the app's map interface
- **Automatic Location Logging:** When a user's device location enters a marked parking area, the system automatically begins tracking
- **Smart Exit Detection:** The app monitors multiple signals to detect when the user has parked and exited their vehicle:
  - Bluetooth disconnection from car audio/systems
  - Significant movement patterns indicating walking
  - GPS velocity changes
- **User Confirmation Flow:** 
  - When parking is detected, the app marks the approximate location
  - Prompts the user to confirm if this is their actual parking spot
  - Allows manual adjustment if GPS accuracy is off (accounting for 1-2 parking spot variance)
- **GPS Accuracy Compensation:** Built-in tolerance for GPS drift to ensure reliable parking spot identification

**User Benefits:**
- Hands-free parking location tracking
- Never forget where you parked
- Automatic logging reduces cognitive load

---

### 2. Common Commuter Spots Database
**Objective:** Pre-populate the app with frequently visited campus locations to enhance navigation and parking recommendations.

**Location Categories:**
- **Student Centers:** Main hubs, dining halls, lounges
- **Athletic Facilities:** Gyms, recreation centers, sports complexes
- **Major Classrooms:** Lecture halls, academic buildings, libraries
- **Administrative Buildings:** Offices, services centers
- **Other High-Traffic Areas:** Health centers, bookstores, event venues

**Implementation:**
- Database of pre-mapped locations with coordinates
- Integration with parking detection to suggest nearby parking for destinations
- Allow users to set favorite/frequent destinations

---

### 3. ScarletSpots Premium - Ticketing Reporting & Analytics
**Objective:** Create a premium subscription tier that provides real-time parking enforcement data to help users avoid tickets.

**Core Functionality:**
- **Ticket Reporting System:**
  - Users who receive parking tickets can report them in the app
  - Report includes: parking lot, time of ticket, date, enforcement agency
  - Community-driven data collection  

- **Real-Time Alerts:**
  - When a ticket is reported at a specific lot, all users currently parked there receive immediate notifications
  - Proactive warnings help users move their vehicles or take corrective action  

- **Enforcement Pattern Analytics:**
  - Track which lots are being checked by parking enforcement
  - Time-of-day analysis (e.g., "Lot C is checked most frequently between 10 AM - 2 PM")
  - Day-of-week patterns
  - Historical data visualization  

- **Smart Parking Recommendations:**
  - Suggest parking locations with lower enforcement activity
  - Risk ratings for different lots based on historical ticket data
  - Best times to park in specific areas  

**Monetization Strategy:**
- Users save money by avoiding parking passes
- Premium subscription fee is positioned as cheaper than parking permits
- Revenue from subscriptions can sustain app development and operations

---

### 4. Social Features & Friend Integration
**Objective:** Add social connectivity to make parking a collaborative experience.

**Features:**
- **User Accounts & Authentication:**
  - Secure user registration and login
  - Profile management  

- **Friend System:**
  - Add and manage friends within the app
  - Privacy controls for sharing parking data  

- **Friend Parking Visibility:**
  - Highlight parking spots where friends are currently parked
  - Visual indicators on the map (e.g., friend avatars, colored markers)
  - "Park near friends" suggestions  

- **Spot Tagging:**
  - Users can tag specific parking spots
  - Share tagged spots with friends
  - Create custom labels (e.g., "Best spot near gym", "Covered parking")  

- **Social Coordination:**
  - See where friends parked for meetups
  - Coordinate group parking for events

---

## Technical Architecture

### Backend Infrastructure
**Database: Supabase (PostgreSQL)**
- **Why Supabase:**
  - Built on PostgreSQL for robust relational data management
  - Easy setup and configuration
  - Built-in authentication and user management
  - Real-time subscriptions for live updates
  - Session handling out of the box
  - RESTful API auto-generation
  
**Database Schema (Preliminary):**
- **Users Table:** user_id, username, email, password_hash, created_at, premium_status
- **Parking_Spots Table:** spot_id, lot_id, coordinates, user_id, timestamp, confirmed
- **Lots Table:** lot_id, name, coordinates, boundary_polygon, capacity
- **Tickets Table:** ticket_id, lot_id, user_id, timestamp, enforcement_agency
- **Friends Table:** friendship_id, user_id_1, user_id_2, status, created_at
- **Common_Locations Table:** location_id, name, type (student center, gym, classroom), coordinates, building_name

**Server:**
- Supabase server for backend operations
- Real-time database subscriptions for live parking updates
- Row-level security for data privacy

### Mobile App Development
- Location services integration (GPS, geofencing)
- Bluetooth monitoring for car connectivity
- Push notifications for ticket alerts
- Map interface with custom markers and overlays
- User authentication and session management

---

## Development Phases

### Phase 1: MVP (Minimum Viable Product)
- Basic parking detection and logging
- Simple map interface with parking lots
- User accounts and authentication
- Core database setup with Supabase

### Phase 2: Social Features
- Friend system implementation
- Friend parking visibility
- Spot tagging and sharing

### Phase 3: Premium Features
- Ticket reporting system
- Real-time alerts
- Enforcement analytics dashboard
- Subscription payment integration

### Phase 4: Enhancement & Optimization
- Common locations database population
- Advanced analytics and recommendations
- Performance optimization
- UI/UX improvements based on user feedback

---

## Success Metrics
- User adoption and retention rates
- Number of parking spots logged daily
- Premium subscription conversion rate
- Ticket avoidance success rate (user survey)
- Friend network growth
- App engagement time and frequency

---

## Future Considerations
- Integration with university parking systems
- Expansion to multiple campuses
- Parking availability predictions using historical data
- Integration with navigation apps
- Carbon footprint tracking for sustainable parking choices