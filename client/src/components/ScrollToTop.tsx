import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** Startar varje ny sida överst i stället för där föregående sida låg. */
export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);
  return null;
}
