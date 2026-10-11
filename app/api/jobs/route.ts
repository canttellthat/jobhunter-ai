
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const defaults = [
  "stripe", "anthropic", "datadog", "doordash", "ramp",
  "rippling", "scaleai", "snowflake", "wayfair", "openai",
  "databricks", "figma", "glean", "huggingface", "instacart",
  "pinterest", "reddit", "roblox", "samsara", "coinbase",
  "cloudflare", "brex", "plaid", "grammarly", "chime",
  "airtable", "anduril", "gitlab", "hubspot", "mongodb",
  "confluent", "clickhouse",
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
  openai: "OpenAI",
  databricks: "Databricks",
  figma: "Figma",
  huggingface: "Hugging Face",
  coinbase: "Coinbase",
  cloudflare: "Cloudflare",
};

async function getGreenhouseJobs(boards: string[]) {
  const results = await Promise.allSettled(
    [...new Set(boards)].map(async (board) => {
      const response = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`,
        { cache: "no-store", signal: AbortSignal.timeout(12000) }
      );

      if (!response.ok) throw new Error("Board unavailable");

      const data = await response.json();

      return (data.jobs || []).map((job: any) => ({
        id: `gh:${board}:${job.id}`,
        company: labels[board.toLowerCase()] || board,
        title: job.title || "Untitled role",
        location: job.location?.name || "Location not provided",
        url: job.absolute_url || "",
        description: plain(job.content || "").slice(0, 7000),
        source: "Greenhouse",
      }));
    })
  );

  return results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  );
}

async function getAdzunaJobs(query: string, page: number) {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) return [];

  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: "50",
    what: query || "data scientist machine learning AI engineer",
    where: "United States",
    "content-type": "application/json",
    sort_by: "date",
  });

  const response = await fetch(
    `https://api.adzuna.com/v1/api/jobs/us/search/${page}?${params}`,
    { cache: "no-store", signal: AbortSignal.timeout(15000) }
  );

  if (!response.ok) {
    console.error("Adzuna API returned status:", response.status);
    return [];
  }

  const data = await response.json();

  return (data.results || []).map((job: any) => ({
    id: `adzuna:${job.id}`,
    company: job.company?.display_name || "Company not provided",
    title: job.title || "Untitled role",
    location: job.location?.display_name || "United States",
    url: job.redirect_url || "",
    description: plain(job.description || "").slice(0, 7000),
    source: "Adzuna",
    salaryMin: job.salary_min ?? null,
    salaryMax: job.salary_max ?? null,
  }));
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const boards = (
      Array.isArray(body.boards) ? body.boards : defaults
    )
      .map((item: unknown) => String(item).trim())
      .filter((item: string) => /^[a-zA-Z0-9_-]{1,60}$/.test(item))
      .slice(0, 40);

    const query =
      typeof body.query === "string" ? body.query.trim().slice(0, 120) : "";

    const page = Math.min(
      5,
      Math.max(1, Number.parseInt(String(body.page || "1"), 10) || 1)
    );

    const [greenhouse, adzuna] = await Promise.all([
      getGreenhouseJobs(boards),
      getAdzunaJobs(query, page).catch((error) => {
        console.error("Adzuna search failed:", error);
        return [];
      }),
    ]);

    const jobs = Array.from(
      new Map(
        [...greenhouse, ...adzuna].map((job: any) => [job.id, job])
      ).values()
    );

    return NextResponse.json({
      jobs,
      warning: jobs.length
        ? undefined
        : "No listings returned. Check API credentials, internet connection, and search settings.",
    });
  } catch (error) {
    console.error("Job search failed:", error);
    return NextResponse.json(
      { error: "Job search failed. Check connection and retry." },
      { status: 500 }
    );
  }
}
