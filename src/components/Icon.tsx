import React from "react";

type IconName =
  | "home" | "bank" | "coins" | "swap" | "credit-card" | "tags" | "gear"
  | "plus" | "minus" | "close" | "search" | "filter" | "chev-down"
  | "chev-right" | "chev-left" | "arrow-up" | "arrow-down"
  | "arrow-up-right" | "arrow-down-right" | "trend-up" | "trend-down"
  | "calendar" | "check" | "check-circle" | "alert" | "info"
  | "upload" | "download" | "trash" | "pencil" | "more" | "menu"
  | "log-out" | "sparkle" | "pie" | "wallet" | "grid" | "link"
  | "sliders" | "inbox" | "zap" | "database" | "shield" | "lock"
  | "globe" | "refresh" | "tags-2" | "copy";

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export default function Icon({ name, size = 20, strokeWidth = 1.8, className = "" }: IconProps) {
  const p = {
    width: size, height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  };

  switch (name) {
    case "home":          return <svg {...p}><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/></svg>;
    case "bank":          return <svg {...p}><path d="M3 9 12 4l9 5"/><path d="M5 9v10M12 9v10M19 9v10M3 20h18"/></svg>;
    case "coins":         return <svg {...p}><ellipse cx="8" cy="8" rx="5" ry="3"/><path d="M3 8v4c0 1.7 2.2 3 5 3s5-1.3 5-3V8"/><ellipse cx="16" cy="14" rx="5" ry="3"/><path d="M11 14v4c0 1.7 2.2 3 5 3s5-1.3 5-3v-4"/></svg>;
    case "swap":          return <svg {...p}><path d="M4 7h14l-3-3M20 17H6l3 3"/></svg>;
    case "credit-card":   return <svg {...p}><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/></svg>;
    case "tags":          return <svg {...p}><path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="7.5" r="1.2"/></svg>;
    case "gear":          return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>;
    case "plus":          return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>;
    case "minus":         return <svg {...p}><path d="M5 12h14"/></svg>;
    case "close":         return <svg {...p}><path d="M6 6l12 12M18 6 6 18"/></svg>;
    case "search":        return <svg {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>;
    case "filter":        return <svg {...p}><path d="M4 5h16M7 12h10M10 19h4"/></svg>;
    case "chev-down":     return <svg {...p}><path d="m6 9 6 6 6-6"/></svg>;
    case "chev-right":    return <svg {...p}><path d="m9 6 6 6-6 6"/></svg>;
    case "chev-left":     return <svg {...p}><path d="m15 6-6 6 6 6"/></svg>;
    case "arrow-up":      return <svg {...p}><path d="M12 19V5M5 12l7-7 7 7"/></svg>;
    case "arrow-down":    return <svg {...p}><path d="M12 5v14M19 12l-7 7-7-7"/></svg>;
    case "arrow-up-right":   return <svg {...p}><path d="M7 17 17 7M8 7h9v9"/></svg>;
    case "arrow-down-right": return <svg {...p}><path d="M7 7l10 10M17 8v9H8"/></svg>;
    case "trend-up":      return <svg {...p}><path d="M3 17 10 10l4 4 7-9"/><path d="M14 5h7v7"/></svg>;
    case "trend-down":    return <svg {...p}><path d="M3 7 10 14l4-4 7 9"/><path d="M14 19h7v-7"/></svg>;
    case "calendar":      return <svg {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>;
    case "check":         return <svg {...p}><path d="m5 12 5 5 9-10"/></svg>;
    case "check-circle":  return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>;
    case "alert":         return <svg {...p}><path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17v.5"/></svg>;
    case "info":          return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7v.5"/></svg>;
    case "upload":        return <svg {...p}><path d="M12 15V4M7 9l5-5 5 5M5 20h14"/></svg>;
    case "download":      return <svg {...p}><path d="M12 4v12M7 11l5 5 5-5M5 20h14"/></svg>;
    case "trash":         return <svg {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>;
    case "pencil":        return <svg {...p}><path d="M4 20h4l10-10-4-4L4 16v4Z"/><path d="m14 6 4 4"/></svg>;
    case "more":          return <svg {...p}><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>;
    case "menu":          return <svg {...p}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
    case "log-out":       return <svg {...p}><path d="M14 4h5v16h-5"/><path d="M9 8l-4 4 4 4M5 12h10"/></svg>;
    case "sparkle":       return <svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>;
    case "pie":           return <svg {...p}><path d="M12 3v9h9a9 9 0 1 1-9-9Z"/><path d="M14 3a7 7 0 0 1 7 7"/></svg>;
    case "wallet":        return <svg {...p}><path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15v-5"/><path d="M16 13h6v-2h-6a1 1 0 0 0 0 2Z"/></svg>;
    case "grid":          return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
    case "link":          return <svg {...p}><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.5 1.5"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 1 0 5.66 5.66l1.5-1.5"/></svg>;
    case "sliders":       return <svg {...p}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h14M18 18h2"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="16" cy="18" r="2"/></svg>;
    case "inbox":         return <svg {...p}><path d="M4 13h5l1 3h4l1-3h5"/><path d="M4 13 6 5h12l2 8v6H4v-6Z"/></svg>;
    case "zap":           return <svg {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></svg>;
    case "database":      return <svg {...p}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>;
    case "shield":        return <svg {...p}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/></svg>;
    case "lock":          return <svg {...p}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 1 1 8 0v3"/></svg>;
    case "globe":         return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>;
    case "refresh":       return <svg {...p}><path d="M4 12a8 8 0 0 1 14-5l2 2"/><path d="M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-14 5l-2-2"/><path d="M4 20v-4h4"/></svg>;
    case "copy":          return <svg {...p}><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
    default:              return <svg {...p}><circle cx="12" cy="12" r="9"/></svg>;
  }
}