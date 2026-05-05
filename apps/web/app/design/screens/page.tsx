"use client";

import { useState } from "react";
import Link from "next/link";

export default function WebScreensPage() {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold">Web Screen Inventory</h1>
          <p className="text-muted-foreground text-sm">
            Visual catalog of all web application screens and states.
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/design/screens/native" className="text-primary hover:underline">
            Native Screens
          </Link>
          <a
            href="/design/screen-inventory.html"
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
        src="/design/screen-inventory.html"
        className="w-full border-0 rounded"
        style={{ height: "calc(100vh - 200px)", display: loaded ? "block" : "none" }}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
