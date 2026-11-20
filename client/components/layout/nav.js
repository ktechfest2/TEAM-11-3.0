/** Every destination, grouped the way people think about them. */
export const NAV_GROUPS = [
  { key: "nav.groupElection", items: [
    { href: "/countcam", icon: "camera", key: "nav.countcam" },
    { href: "/verify", icon: "checkCircle", key: "nav.verify" },
    { href: "/results", icon: "shield", key: "track.title" },
    { href: "/report", icon: "alert", key: "nav.report" },
    { href: "/candidates", icon: "users", key: "candidates.title" },
  ] },
  { key: "nav.groupInfo", items: [
    { href: "/info", icon: "book", key: "nav.info" },
    { href: "/polling-unit", icon: "map", key: "nav.pollingUnit" },
    { href: "/dashboard", icon: "chart", key: "nav.dashboard" },
  ] },
  { key: "nav.groupMine", items: [
    { href: "/evidence", icon: "image", key: "nav.evidence" },
    { href: "/sync", icon: "upload", key: "nav.sync", badge: "sync" },
    { href: "/settings", icon: "settings", key: "nav.settings" },
    { href: "/languages", icon: "languages", key: "langs.title" },
    { href: "/voice", icon: "mic", key: "nav.voice" },
  ] },
];

export const isActive = (path, href) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
