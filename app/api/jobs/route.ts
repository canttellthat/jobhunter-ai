
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const defaults = [
  "stripe", "anthropic", "datadog", "doordash", "ramp",
  "rippling", "scaleai", "snowflake", "wayfair", "openai",
  "databricks", "figma", "glean", "huggingface", "instacart",
  "pinterest", "reddit", "roblox", "samsara", "coinbase",
  "cloudflare", "brex", "plaid", "grammarly", "chime",
  "airtable", "anduril", "gitlab", "hubspot", "mongodb",
  "confluent", "clickhouse",
];

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

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function plain(s = "") {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isRecent(job: Job) {
  if (!job.created) return false;

  const timestamp = new Date(job.created).getTime();

  return (
    Number.isFinite(timestamp) &&
    timestamp <= Date.now() &&
    timestamp >= Date.now() - SEVEN_DAYS_MS
  );
}

function isUSJob(job: Job) {
  const location = (job.location || "").toLowerCase();

  const explicitUSRemote =
    /\b(remote)\b.*\b(us|usa|united states|u\.s\.)\b/.test(location) ||
    /\b(us|usa|united states|u\.s\.)\b.*\bremote\b/.test(location);

  const nonUS =
    /\b(mexico|united kingdom|england|london|scotland|wales|ireland|canada|india|nepal|australia|new zealand|germany|france|spain|italy|netherlands|singapore|philippines|brazil|argentina|poland|portugal|switzerland|sweden|norway|denmark|israel|japan|china)\b/;

  if (nonUS.test(location) && !explicitUSRemote) {
    return false;
  }

  const usLocation =
    /\b(united states|usa|u\.s\.a\.|u\.s\.)\b/.test(location) ||
    /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|district of columbia|washington,? dc)\b/.test(location);

  return usLocation || explicitUSRemote;
}

function deduplicate(jobs: Job[]) {
  const seen = new Set<string>();

  return jobs.filter((job) => {
    const normalize = (value: string) =>
      value.toLowerCase().replace(/[^a-z0-9]/g, "");

    const identity =
      `${normalize(job.company)}|${normalize(job.title)}`;

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
        {
          cache: "no-store",
          signal: AbortSignal.timeout(12000),
        }
      );

      if (!response.ok) throw new Error("Board unavailable");

      const data = await response.json();

      return (data.jobs || []).map((job: any) => ({
        id: `gh:${board}:${job.id}`,
        company: labels[board.toLowerCase()] || board,
        title: job.title || "Untitled role",
        location: job.location?.name || "",
        url: job.absolute_url || "",
        description: plain(job.content || "").slice(0, 7000),
        source: "Greenhouse",
        created: job.updated_at || job.created_at || undefined,
      } satisfies Job));
    })
  );

  return results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  );
}

async function getAdzunaJobs(
  query: string,
  page: number
): Promise<Job[]> {
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
    {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    }
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
  } satisfies Job));
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
      typeof body.query === "string"
        ? body.query.trim().slice(0, 120)
        : "";

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
      if (!job.location || !job.url) return false;
      if (!isUSJob(job)) return false;
      if (!isRecent(job)) return false;

      return true;
    });

    const jobs = deduplicate(filtered).sort((a, b) => {
      return (
        new Date(b.created!).getTime() -
        new Date(a.created!).getTime()
      );
    });

    return NextResponse.json(
      {
        jobs,
        warning: jobs.length
          ? `Showing ${jobs.length} deduplicated US listings with dates from the last 7 days. Some new jobs may be excluded if their source does not provide a date.`
          : "No recently dated US listings found. Try a different keyword or search again later.",
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("Job search failed:", error);

    return NextResponse.json(
      { error: "Job search failed. Check connection and retry." },
      { status: 500 }
    );
  }
}
