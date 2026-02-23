import Image from "next/image";

const NAV_LINKS = [
  { href: "/blog", label: "Blog" },
  { href: "/docs", label: "Docs" },
  { href: "/changelog", label: "Changelog" },
];

export function Header() {
  return (
    <header className="relative flex items-center justify-between border border-border bg-bg">
      <div className="flex items-center gap-8">
        <div className="p-4">
          <Image
            src="/assets/wordmark-dark.svg?v=3"
            alt="Twig"
            width={80}
            height={28}
            priority
          />
        </div>
        <nav className="flex h-full items-center gap-6">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-body text-fg transition-colors hover:text-fg/60"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
