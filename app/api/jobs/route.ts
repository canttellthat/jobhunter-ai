
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

type Job = {
  id: string;
  company: string;
  title: string;
  location: string;
  url: string;
  description: string;
  source: string;
  created?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
};

function isUSJob(job: Job) {
  const location = (job.location || "").toLowerCase();

  // Explicit US locations or remote roles open to US applicants.
  const usPatterns = [
    /\b(united states|usa|u\.s\.a\.|u\.s\.)\b/,
    /\bremote\b.*\b(us|usa|united states|north america)\b/,
    /\b(us|usa|united states)\b.*\bremote\b/,
    /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|district of columbia|washington,? dc)\b/,
  ];

  // Reject known non-US locations first.
  const nonUS = [
    /\b(mexico|united kingdom|england|london|scotland|wales|ireland|canada|india|nepal|australia|new zealand|germany|france|spain|italy|netherlands|singapore|philippines|brazil|argentina|poland|portugal|switzerland|sweden|norway|denmark|israel|japan|china)\b/,
  ];

  if (nonUS.some((pattern) => pattern.test(location))) {
    // A job explicitly saying US remote can still be eligible.
    if (!/\b(remote)\b.*\b(us|usa|united states)\b|\b(us|usa|united states)\b.*\bremote\b/.test(location)) {
      return false;
    }
  }

  return usPatterns.some((pattern) => pattern.test(location));
}

function deduplicate(jobs: Job[]) {
  const seen = new Set<string>();

  return jobs.filter((job) => {
    const url = (job.url || "")
      .toLowerCase()
      .split("?")[0]
      .replace(/\/+$/, "");

    const identity = [
      job.company.toLowerCase().replace(/[^a-z0-9]/g, ""),
      job.title.toLowerCase().replace(/[^a-z0-9]/g, ""),
      url,
    ].join("|");

    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

async function getGreenhouseJobs(boards: string[]): Promise<Job[]> {
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
        // Greenhouse's public board response may not provide a posting date.
      }));
    })
  );

  return results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  );
}

async function getAdzunaJobs(query: string, page: number): Promise<Job[]> {
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
    max_days_old: "7",
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
    location: job.location?.display_name || "",
    url: job.redirect_url || "",
    description: plain(job.description || "").slice(0, 7000),
    source: "Adzuna",
    created: job.created || undefined,
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

    const combined = [...greenhouse, ...adzuna];

    const filtered = combined.filter((job) => {
      if (!job.location || job.location === "Location not provided") {
        return false;
      }

      if (!isUSJob(job)) return false;

      if (job.source === "Adzuna" && job.created) {
        const posted = new Date(job.created).getTime();
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

        if (!Number.isFinite(posted) || posted < sevenDaysAgo) {
          return false;
        }
      }

      return Boolean(job.url);
    });

    const jobs = deduplicate(filtered).sort((a, b) => {
      const aDate = a.created ? new Date(a.created).getTime() : 0;
      const bDate = b.created ? new Date(b.created).getTime() : 0;
      return bDate - aDate;
    });

    return NextResponse.json({
      jobs,
      warning: jobs.length
        ? `Showing ${jobs.length} unique US listings. Adzuna listings are limited to the last 7 days; Greenhouse posting dates may be unavailable.`
        : "No matching US listings found. Try another keyword or check the company boards.",
    });
  } catch (error) {
    console.error("Job search failed:", error);
    return NextResponse.json(
      { error: "Job search failed. Check connection and retry." },
      { status: 500 }
    );
  }
}
