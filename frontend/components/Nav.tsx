"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Analyse" },
  { href: "/referentiel", label: "Référentiel" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="Navigation">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
