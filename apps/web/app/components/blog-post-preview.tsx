import { Heading } from "./heading";
import { Text } from "./text";

interface BlogPostPreviewProps {
  title: React.ReactNode;
  date: string;
  children: React.ReactNode;
  href: string;
}

export function BlogPostPreview({
  title,
  date,
  children,
  href,
}: BlogPostPreviewProps) {
  return (
    <article className="grid grid-cols-2">
      <div className="p-16">
        <Heading size={4} className="mb-4">
          {title}
        </Heading>
        <Text size="body-sm" className="text-fg/40 uppercase tracking-wider">
          {date}
        </Text>
      </div>
      <div className="border-border border-l p-16">
        <div className="space-y-6">
          {children}
          <a
            href={href}
            className="inline-block text-body text-primary hover:text-primary/80"
          >
            read more
          </a>
        </div>
      </div>
    </article>
  );
}
