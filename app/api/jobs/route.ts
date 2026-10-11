
import { NextResponse } from "next/server";

export const runtime = "nodejs";


const defaults = [
  "stripe",
  "anthropic",
  "datadog",
  "doordash",
  "ramp",
  "rippling",
  "scaleai",
  "snowflake",
  "wayfair",
  "openai",
  "databricks",
  "figma",
  "glean",
  "huggingface",
  "instacart",
  "pinterest",
  "reddit",
  "roblox",
  "samsara",
  "coinbase",
  "cloudflare",
  "brex",
  "plaid",
  "grammarly",
  "chime",
  "airtable",
  "anduril",
  "gitlab",
  "hubspot",
  "mongodb",
  "confluent",
  "clickhouse",
];


function plain(s = "") {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const labels: Record<string, string> = {
  stripe: "Stripe",
  anthropic: "Anthropic",
  datadog: "Datadog",
  doordash: "DoorDash",
  ramp: "Ramp",
  rippling: "Rippling",
  scaleai: "Scale AI",
  snowflake: "Snowflake",
  wayfair: "Wayfair",
};

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));

    const boards = (
      Array.isArray(b.boards) ? b.boards : defaults
    )
      .map((x: unknown) => String(x).trim())
      .filter((x: string) => /^[a-zA-Z0-9_-]{1,60}$/.test(x))
      .slice(0, 40);

    const settled = await Promise.allSettled(
      [...new Set(boards)].map(async (board: string) => {
        const url =
          "https://boards-api.greenhouse.io/v1/boards/" +
          encodeURIComponent(board) +
          "/jobs?content=true";

        const r = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(12000),
        });

        if (!r.ok) throw new Error("Board unavailable");

        const d = await r.json();

        return (d.jobs || []).map((j: any) => ({
          id: "gh:" + board + ":" + j.id,
          company: labels[board.toLowerCase()] || board,
          title: j.title || "Untitled role",
          location: j.location?.name || "Location not provided",
          url: j.absolute_url || "",
          description: plain(j.content || "").slice(0, 7000),
          source: "Greenhouse",
        }));
      })
    );

    const jobs = Array.from(
      new Map(
        settled
          .flatMap((x) =>
            x.status === "fulfilled" ? x.value : []
          )
          .map((j: any) => [j.id, j])
      ).values()
    );

    return NextResponse.json({
      jobs,
      warning: jobs.length
        ? undefined
        : "No listings returned. Some Greenhouse board tokens may be invalid or unavailable.",
    });
  } catch {
    return NextResponse.json(
      { error: "Job search failed. Check connection and retry." },
      { status: 500 }
    );
  }
}
