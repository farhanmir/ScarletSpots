import { Outlet } from "react-router";

export default function Root() {
  return (
    <div className="h-screen w-full bg-zinc-950">
      <Outlet />
    </div>
  );
}
