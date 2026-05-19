"use client";

import { useState } from "react";
import Link from "next/link";

export default function WireframePage() {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold">Canonical Wireframe</h1>
          <p className="text-muted-foreground text-sm">
            Alpha wireframe, synced from outside_assets/Jits Arena SharePoint/Brand/activation-kit/app-screens/wireframe.html. 28 screens with light and dark mode toggles.
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/design/style-guide" className="text-primary hover:underline">
            Style Guide
          </Link>
          <a
            href="/design/wireframe.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Open in new tab
          </a>
        </div>
      </div>
      {!loaded && (
        <div className="w-full rounded bg-muted animate-pulse" style={{ height: "calc(100vh - 200px)" }} />
      )}
      <iframe
        src="/design/wireframe.html"
        className="w-full border-0 rounded"
        style={{ height: "calc(100vh - 200px)", display: loaded ? "block" : "none" }}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
