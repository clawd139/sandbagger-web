"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/rounds", label: "Rounds", icon: "📋" },
  { href: "/rounds/new", label: "Log Round", icon: "✏️" },
  { href: "/stats", label: "Stats", icon: "📊" },
  { href: "/courses", label: "Courses", icon: "⛳" },
];

export default function BottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/rounds/new") return pathname === "/rounds/new";
    if (href === "/rounds") return pathname === "/rounds" || (pathname.startsWith("/rounds") && !pathname.startsWith("/rounds/new"));
    if (href === "/courses") return pathname.startsWith("/courses");
    if (href === "/stats") return pathname.startsWith("/stats");
    return pathname === href;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="max-w-md mx-auto flex justify-around items-center h-14">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center px-2 py-1 transition-colors ${
                active ? "text-green-700" : "text-gray-400"
              }`}
            >
              <span className="text-base leading-none mb-0.5">{item.icon}</span>
              <span className={`text-[10px] font-medium ${active ? "font-semibold" : ""}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
