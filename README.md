# ScarletSpots - Native Mobile Parking App

**ScarletSpots** is a smart parking application designed for Rutgers University students.  
> 📱 **Project Goal**: A Native iOS/Android app built with **React Native (Expo)**.  
> 🚧 **Current Status**: **Phase 1 Web Prototype** (React + Vite) is currently implemented in this repository.

See [PLAN.md](PLAN.md) for the full Native Mobile implementation blueprint.

---

## 📱 Project Vision (Native Mobile & Admin Web)
ScarletSpots is a dual-platform ecosystem:
1.  **Mobile App (Native)**: For students to find parking (Consumers).
2.  **Web Dashboard (React)**: For admins to manage geofences and data (Producers).

### Core Architecture (Target)
- **Mobile**: React Native (Expo) - [Planned]
- **Web Admin**: React + Vite - [Current Prototype]
- **Maps**: Apple Maps (iOS) / Google Maps (Android) via `react-native-maps`
- **Backend**: FastAPI + PostGIS
- **Auth**: Supabase

### Key Features (Planned)
- **Intelligent Parking Detection**: Geofences + Motion Activity to auto-log parking.
- **Knight Needle Compass**: Haptic compass for finding your car in large lots.
- **Dual-Map Strategy**: Uses the best native map for each platform.
- **Rush-Hour Prediction**: Historical data to forecast lot fullness.

---

## 💻 Admin Dashboard (Current Web App)
The current codebase in this repository is the foundation for the **Admin Web Interface**. It presently serves as a prototype but will evolve into the control center for:
- Editing Parking Lot Geofences (Draw on map).
- Viewing Real-time Heatmaps.
- Managing System Data.

### Prototype Features (Implemented)
- **🔐 Analytics & Auth**: Rutgers-only signup (@rutgers.edu) via Supabase.
- **🗺️ Interactive Map**: Real-time availability for Lot 1, 25, 64, 99 (using Leaflet).
- **🧭 Compass UI**: Visual "Knight Needle" compass (using device orientation API).
- **👥 Social**: Add friends and see their parking spots.
- **🚗 Session Management**: fast parking check-in/out.

### Tech Stack (Prototype)
- **Framework**: React + Vite
- **Styling**: Tailwind CSS
- **Maps**: Leaflet / React-Leaflet
- **Backend**: Supabase Edge Functions (Deno) + KV Store

---

## 🛠️ Local Development (Running the Prototype)
Follow these steps to run the current web version locally:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/farhanmir/ScarletSpots.git
    cd ScarletSpots
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up environment variables:**
    Copy `.env.example` to `.env` and fill in your Supabase credentials.
    ```bash
    cp .env.example .env
    ```

4.  **Run the development server:**
    ```bash
    npm run dev
    ```
    Open [http://localhost:5173](http://localhost:5173) to view it.

5.  **Lint & Format:**
    ```bash
    npm run lint
    npm run format
    ```

---

## 📂 Project Structure
- `src/`: React Web source code.
- `supabase/functions/`: Backend Edge Functions (Deno).
- `PLAN.md`: Detailed specification for the **Native Mobile** version.

---
🎓 **For Rutgers Students, By Rutgers Students**
Built with ❤️ for the Rutgers community.
