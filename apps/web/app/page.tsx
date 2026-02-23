import { BlogPostPreview } from "./components/blog-post-preview";
import { Footer } from "./components/footer";
import { Header } from "./components/header";
import { Heading } from "./components/heading";
import { ArrowRightIcon, DownloadIcon } from "./components/icons";
import { Text } from "./components/text";
import { FlowDiagram } from "./features/flow-diagram/flow-diagram";
import { MasonryDemo } from "./features/masonry/masonry-demo";

export default function Home() {
  return (
    <main className="relative pb-0">
      <div className="container pt-6">
        <Header />
      </div>

      <div className="container">
        <section className="relative mt-[140px] w-full border border-border bg-bg md:w-[40%]">
          <div className="flex flex-col justify-center bg-bg p-8 md:px-16 md:py-16">
            <Heading size={2} className="mb-8">
              product engineering
              <br />
              <span className="text-primary">&gt;</span>evolved
            </Heading>
            <div className="space-y-6">
              <div className="space-y-4">
                <Text size="body" className="text-fg/80">
                  Codex, Claude Code, and similar tools accelerate code
                  generation, but you always make the first move.
                </Text>
                <Text size="body" className="text-fg/80">
                  Twig determines what matters right now, runs autonomous work
                  against it, and hands you contextual code to merge, kill or
                  iterate on.
                </Text>
              </div>
              <div className="flex gap-4">
                <a
                  href="/download"
                  className="flex items-center gap-2 border border-border bg-fg px-6 py-3 font-medium text-bg text-body transition-colors hover:bg-fg/90"
                >
                  Download Twig
                  <DownloadIcon />
                </a>
                <a
                  href="/docs"
                  className="flex items-center gap-2 border border-border bg-bg px-6 py-3 font-medium text-body text-fg transition-colors hover:bg-fg/5"
                >
                  Learn how it works
                  <ArrowRightIcon />
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="container relative mt-24">
        <MasonryDemo />
      </section>

      <section className="container relative mt-24">
        <div className="grid grid-cols-1 border border-border bg-bg md:grid-cols-[3fr_3fr]">
          <div className="relative flex items-center gap-8 py-10 pl-10">
            <div className="flex-1">
              <Heading size={5} className="mb-6 text-balance">
                we want to make your product run itself
              </Heading>
              <div className="space-y-4">
                <Text size="body" className="text-fg/80">
                  You did not become an engineer to triage support tickets, or
                  break down marketing funnels. Context switching is your enemy.
                  You became an engineer to build products that change the
                  world.
                </Text>
                <Text size="body" className="text-fg/80">
                  Twig is an agent orchestrator that runs your product for you.
                  It autonomously identifies what needs to be done, executes the
                  work, and gives you the results to review.
                </Text>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center border-border bg-subtle p-2 md:border-l">
            <FlowDiagram />
          </div>
        </div>
      </section>

      <section className="container mt-24">
        <div className="divide-y divide-border border border-border bg-bg">
          <BlogPostPreview
            title={
              <>
                announcing twig: an agentic code
                <br />
                editor that understands your users
              </>
            }
            date="JAN 2026"
            href="/blog/announcing-twig"
          >
            <Text size="body" className="text-fg/80">
              at posthog, we've spent years building tools that help teams
              understand their users. product analytics, session recordings,
              feature flags, a/b testing - all designed to answer one
              fundamental question: what do your users actually do?
            </Text>
            <Text size="body" className="text-fg/80">
              then we looked at how software gets built, and something struck us
              as deeply wrong.
            </Text>
            <Text size="body" className="font-medium text-fg">
              code editors are stupid
            </Text>
            <Text size="body" className="text-fg/80">
              not in the "they lack ai" sense. the latest generation of
              ai-powered editors are remarkably capable at writing code. they
            </Text>
          </BlogPostPreview>
          <BlogPostPreview
            title={
              <>
                announcing twig: an agentic code
                <br />
                editor that understands your users
              </>
            }
            date="JAN 2026"
            href="/blog/announcing-twig"
          >
            <Text size="body" className="text-fg/80">
              at posthog, we've spent years building tools that help teams
              understand their users. product analytics, session recordings,
              feature flags, a/b testing - all designed to answer one
              fundamental question: what do your users actually do?
            </Text>
            <Text size="body" className="text-fg/80">
              then we looked at how software gets built, and something struck us
              as deeply wrong.
            </Text>
            <Text size="body" className="font-medium text-fg">
              code editors are stupid
            </Text>
            <Text size="body" className="text-fg/80">
              not in the "they lack ai" sense. the latest generation of
              ai-powered editors are remarkably capable at writing code. they
            </Text>
          </BlogPostPreview>
        </div>
      </section>

      <Footer />
    </main>
  );
}
