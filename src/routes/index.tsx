import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Titan Log — Strength Training Logger" },
      { name: "description", content: "Log every set of the Titan Build program and track your working max." },
      { property: "og:title", content: "Titan Log — Strength Training Logger" },
      { property: "og:description", content: "Log every set of the Titan Build program and track your working max." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/training" });
  },
});
