import Image from "next/image";
import { Text } from "./text";

interface FooterLink {
  href: string;
  label: string;
}

interface FooterColumn {
  title: string;
  links: FooterLink[];
}

const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: "About",
    links: [
      { href: "/robots", label: "robots.txt" },
      { href: "/faq", label: "FAQ" },
      { href: "/handbook", label: "handbook" },
      { href: "/blog", label: "blog" },
      { href: "/data", label: "your data" },
    ],
  },
  {
    title: "Product",
    links: [
      { href: "/docs", label: "docs" },
      { href: "/coding", label: "coding" },
      { href: "/models", label: "models" },
      { href: "/integrations", label: "integrations" },
      { href: "/orchestration", label: "orchestration" },
    ],
  },
  {
    title: "Connect",
    links: [
      { href: "https://discord.gg/twig", label: "discord" },
      { href: "https://github.com/twig", label: "GitHub" },
      { href: "https://youtube.com/@twig", label: "YouTube" },
      { href: "https://x.com/twig", label: "X (Twitter)" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative mt-24">
      <div className="border-t border-border bg-bg">
        <div className="container grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-8 pb-16 pt-8">
          <div className="flex flex-col gap-4">
            <Image
              src="/assets/wordmark-mono-dark.svg"
              alt="Twig"
              width={100}
              height={35}
            />
            <Text size="body-sm" className="text-fg/60">
              an ai editor that understands
              <br />
              your product and user behavior
            </Text>
            <Text size="body-sm" className="text-fg/40">
              from the makers of PostHog
            </Text>
            <a
              href="/waitlist"
              className="text-body-sm text-primary hover:text-primary/80"
            >
              // join the waitlist
            </a>
          </div>
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.title} className="flex flex-col gap-3">
              <Text
                size="body-sm"
                className="font-medium uppercase tracking-wider text-fg/40"
              >
                {column.title}
              </Text>
              {column.links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-body-sm text-fg/80 hover:text-fg"
                >
                  {link.label}
                </a>
              ))}
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
