import Link from "next/link";
import { ArrowRight } from "lucide-react";

const cards = [
  {
    href: "/design/style-guide",
    title: "Style Guide",
    description:
      "Brand identity, colors, typography, spacing, and motion rules.",
  },
  {
    href: "/design/ui-kit",
    title: "UI Kit",
    description:
      "Live component showcase with all variants and states.",
  },
  {
    href: "/design/wireframe",
    title: "Canonical Wireframe",
    description:
      "Alpha wireframe (28 screens, light + dark) synced from the SharePoint brand kit.",
  },
  {
    href: "/design/web-layouts",
    title: "Web Layouts",
    description:
      "Six full-screen desktop layout concepts (one per screen) for previewing how the web app could use the whole viewport.",
  },
  {
    href: "/design/screens",
    title: "Web Screens",
    description:
      "Complete web app screen inventory with implementation status.",
  },
  {
    href: "/design/screens/native",
    title: "Native Screens",
    description:
      "React Native mobile app screen inventory.",
  },
];

export default function DesignOverviewPage() {
  return (
    <div className="space-y-12">
      <section className="space-y-4 pt-8">
        <h1 className="font-display text-5xl uppercase leading-none text-foreground sm:text-6xl">
          ELO RATED Design System
        </h1>
        <p className="max-w-2xl font-body text-lg text-muted-foreground">
          The single source of truth for brand identity, component library, and
          screen inventory. Everything you need to build consistent experiences
          across web and native.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group flex items-start justify-between gap-4 rounded-sm border border-border bg-card p-6 transition-colors hover:border-primary/40"
          >
            <div className="space-y-2">
              <h2 className="font-heading text-lg font-bold uppercase tracking-wide text-foreground">
                {card.title}
              </h2>
              <p className="font-body text-sm text-muted-foreground">
                {card.description}
              </p>
            </div>
            <ArrowRight
              size={20}
              className="mt-1 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary"
            />
          </Link>
        ))}
      </section>
    </div>
  );
}
