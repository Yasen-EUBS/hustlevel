import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "NSS — Strength Training Logger" },
      { name: "description", content: "Log every set of the Titan Build program and track your working max." },
      { property: "og:title", content: "NSS — Strength Training Logger" },
      { property: "og:description", content: "Log every set of the Titan Build program and track your working max." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/training" });
  },
});
