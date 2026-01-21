import { Route, Routes } from "react-router";
import { ComponentExample } from "@/components/component-example";
import Home from "./pages/Home/Home";
import Dashboard from "./pages/Home/Dashboard";

enum Path  {
    Home = "/",
    Example = "/example",
    Dashboard = "/dashboard",
    Settings = "/settings",
    Help = "/help",
    Search = "/search",
    Reports = "/reports",
    WordAssistant = "/word-assistant",
    DataLibrary = "/data-library",
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path={Path.Home} element={<Home />} />
      <Route path={Path.Dashboard} element={<Dashboard />} />
      <Route path={Path.Example} element={<ComponentExample />} />
    </Routes>
  );
}