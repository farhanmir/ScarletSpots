import { createBrowserRouter } from "react-router";
import Root from "./Root";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import MapView from "./pages/MapView";
import CompassView from "./pages/CompassView";
import Friends from "./pages/Friends";
import Profile from "./pages/Profile";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: Login },
      { path: "signup", Component: Signup },
      { path: "map", Component: MapView },
      { path: "compass", Component: CompassView },
      { path: "friends", Component: Friends },
      { path: "profile", Component: Profile },
    ],
  },
]);
