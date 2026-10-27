"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Bottom navigation bar — fixed at the bottom of the mobile viewport.
 *
 * Four tabs matching the FINN workflow:
 * 1. Portfolio (home) — the push digest view
 * 2. Alerts — configurable alert thresholds + triggered alerts
 * 3. Research — pull mode, on-demand company analysis
 * 4. Settings — portfolio config, thresholds
 *
 * Uses emoji icons for now — can replace with an icon library later
 * if we have time on Day 4 polish.
 */

const NAV_ITEMS = [
  { href: "/", label: "Portfolio", icon: "📊", id: "portfolio" },
  { href: "/alerts", label: "Alerts", icon: "🔔", id: "alerts" },
  { href: "/research", label: "Research", icon: "🔍", id: "research" },
  { href: "/settings", label: "Settings", icon: "⚙️", id: "settings" },
];

export default function BottomNav({ active, alertCount = 0 }) {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {NAV_ITEMS.map((item) => {
        const isActive =
          active === item.id || pathname === item.href;

        return (
          <Link
            key={item.id}
            href={item.href}
            className={`nav-item ${isActive ? "nav-item--active" : ""}`}
            aria-current={isActive ? "page" : undefined}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
            {item.id === "alerts" && alertCount > 0 && (
              <span className="alert-badge">
                {alertCount > 9 ? "9+" : alertCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
