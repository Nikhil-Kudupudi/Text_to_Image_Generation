import { useCallback, useEffect, useState } from "react";

export type Route = "home" | "results" | "workflow" | "generate";

const ROUTES: readonly Route[] = ["home", "results", "workflow", "generate"];

/** "#/results" -> "results"; "", "#/" and unknown hashes -> "home". Extra segments are ignored. */
export function parseHash(hash: string): Route {
  const seg = hash.replace(/^#\/?/, "").split(/[/?]/)[0].toLowerCase();
  return (ROUTES as readonly string[]).includes(seg) ? (seg as Route) : "home";
}

/** "home" -> "#/", "results" -> "#/results" */
export function routeHash(r: Route): string {
  return r === "home" ? "#/" : `#/${r}`;
}

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const navigate = useCallback((r: Route) => {
    if (window.location.hash !== routeHash(r)) window.location.hash = routeHash(r);
    setRoute(r);
  }, []);
  return [route, navigate];
}
