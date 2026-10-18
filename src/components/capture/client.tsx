"use client";

import dynamic from "next/dynamic";

function FormSkeleton() {
  return <div aria-busy="true" style={{ minHeight: "50dvh" }} />;
}

/** These forms restore unsaved drafts from this device, so they render on the client only. */
export const CaptureFlow = dynamic(() => import("./CaptureFlow").then((m) => m.CaptureFlow), { ssr: false, loading: FormSkeleton });
export const TastingEditor = dynamic(() => import("./Editors").then((m) => m.TastingEditor), { ssr: false, loading: FormSkeleton });
