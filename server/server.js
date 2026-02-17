require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { Ollama } = require("ollama");

const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
let accessToken = process.env.STRAVA_ACCESS_TOKEN;
let refreshToken = process.env.STRAVA_REFRESH_TOKEN;
const BASE_URL = "https://www.strava.com/api/v3";

async function refreshAccessToken() {
  console.log("Refreshing Strava access token...");
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  const data = await response.json();
  accessToken = data.access_token;
  refreshToken = data.refresh_token;
  console.log("Strava token refreshed successfully");
}
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME || "strava_analytics";
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1";
const PORT = process.env.PORT || 8080;

const app = express();
app.use(cors());
app.use(express.json());

mongoose
  .connect(`${MONGODB_URI}/${DB_NAME}`)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

const insightSchema = new mongoose.Schema(
  {
    query: String,
    analysis: String,
    toolsUsed: [String],
    stravaData: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true },
);

const Insight = mongoose.model("Insight", insightSchema);

const ollama = new Ollama({ host: OLLAMA_HOST });

// strava helper functions
async function getAllActivities() {
  const activities = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    let response = await fetch(
      `${BASE_URL}/athlete/activities?per_page=${perPage}&page=${page}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (response.status === 401) {
      await refreshAccessToken();
      response = await fetch(
        `${BASE_URL}/athlete/activities?per_page=${perPage}&page=${page}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
    }

    if (!response.ok) {
      throw new Error(`Strava API error: ${response.status}`);
    }

    const batch = await response.json();
    if (batch.length === 0) break;

    activities.push(...batch);
    page++;
  }

  return activities;
}

function getRides(activities) {
  return activities.filter((a) => a.type === "Ride");
}

function getLongestRide(rides) {
  if (rides.length === 0) return null;
  return rides.reduce((max, ride) =>
    ride.distance > max.distance ? ride : max,
  );
}

function getFastestRide(rides) {
  if (rides.length === 0) return null;
  return rides.reduce((max, ride) =>
    ride.average_speed > max.average_speed ? ride : max,
  );
}

function formatRide(ride) {
  return {
    name: ride.name,
    date: ride.start_date_local,
    distance_km: (ride.distance / 1000).toFixed(2),
    avg_speed_kmh: (ride.average_speed * 3.6).toFixed(2),
    max_speed_kmh: (ride.max_speed * 3.6).toFixed(2),
    moving_time_min: (ride.moving_time / 60).toFixed(1),
    elevation_gain_m: ride.total_elevation_gain,
  };
}

function formatActivity(activity) {
  return {
    name: activity.name,
    type: activity.type,
    date: activity.start_date_local,
    distance_km: (activity.distance / 1000).toFixed(2),
    moving_time_min: (activity.moving_time / 60).toFixed(1),
    elevation_gain_m: activity.total_elevation_gain,
  };
}

let activityCache = { data: null, timestamp: 0 };
const CACHE_TTL = 5 * 60 * 1000;

async function getCachedActivities() {
  const now = Date.now();
  if (activityCache.data && now - activityCache.timestamp < CACHE_TTL) {
    return activityCache.data;
  }
  const activities = await getAllActivities();
  activityCache = { data: activities, timestamp: now };
  return activities;
}

// tool schemas
const tools = [
  {
    type: "function",
    function: {
      name: "get_longest_ride",
      description:
        "Find the single longest bike ride by distance. Returns one ride with name, date, distance, speed, and time.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_fastest_ride",
      description:
        "Find the single fastest bike ride by average speed. Returns one ride with name, date, distance, speed, and time.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_longest_run",
      description:
        "Find the single longest run by distance. Returns one run with name, date, distance, and time.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_fastest_run",
      description:
        "Find the single fastest run by average speed. Returns one run with name, date, distance, speed, and time.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_longest_swim",
      description:
        "Find the single longest swim by distance. Returns one swim with name, date, distance, and time.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_fastest_swim",
      description:
        "Find the single fastest swim by average speed. Returns one swim with name, date, distance, speed, and time.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_activity_summary",
      description:
        "Get a short summary of all activities: total count, breakdown by type, total distance, total time, and date range.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_activities",
      description: "Get the N most recent activities (default 5, max 10).",
      parameters: {
        type: "object",
        properties: {
          count: {
            type: "number",
            description: "Number of recent activities to return (default 5, max 10)",
          },
        },
        required: [],
      },
    },
  },
];

// TOOLS
const toolHandlers = {
  async get_longest_ride() {
    const activities = await getCachedActivities();
    const rides = getRides(activities);
    const longest = getLongestRide(rides);
    return longest ? formatRide(longest) : { message: "No bike rides found" };
  },

  async get_fastest_ride() {
    const activities = await getCachedActivities();
    const rides = getRides(activities);
    const fastest = getFastestRide(rides);
    return fastest ? formatRide(fastest) : { message: "No bike rides found" };
  },

  async get_longest_swim() {
    const activities = await getCachedActivities();
    const swims = activities.filter((a) => a.type === "Swim");
    if (swims.length === 0) return { message: "No swims found" };
    const longest = swims.reduce((max, s) => (s.distance > max.distance ? s : max));
    return formatActivity(longest);
  },

  async get_fastest_swim() {
    const activities = await getCachedActivities();
    const swims = activities.filter((a) => a.type === "Swim");
    if (swims.length === 0) return { message: "No swims found" };
    const fastest = swims.reduce((max, s) =>
      s.average_speed > max.average_speed ? s : max,
    );
    return {
      ...formatActivity(fastest),
      avg_speed_kmh: (fastest.average_speed * 3.6).toFixed(2),
    };
  },

  async get_longest_run() {
    const activities = await getCachedActivities();
    const runs = activities.filter((a) => a.type === "Run");
    if (runs.length === 0) return { message: "No runs found" };
    const longest = runs.reduce((max, r) => (r.distance > max.distance ? r : max));
    return formatActivity(longest);
  },

  async get_fastest_run() {
    const activities = await getCachedActivities();
    const runs = activities.filter((a) => a.type === "Run");
    if (runs.length === 0) return { message: "No runs found" };
    const fastest = runs.reduce((max, r) =>
      r.average_speed > max.average_speed ? r : max,
    );
    return {
      ...formatActivity(fastest),
      avg_speed_kmh: (fastest.average_speed * 3.6).toFixed(2),
    };
  },

  async get_activity_summary() {
    const activities = await getCachedActivities();
    const typeBreakdown = {};
    let totalDistance = 0;
    let totalTime = 0;

    for (const a of activities) {
      typeBreakdown[a.type] = (typeBreakdown[a.type] || 0) + 1;
      totalDistance += a.distance;
      totalTime += a.moving_time;
    }

    const dates = activities.map((a) => new Date(a.start_date_local));
    return {
      total_activities: activities.length,
      type_breakdown: typeBreakdown,
      total_distance_km: (totalDistance / 1000).toFixed(2),
      total_moving_time_hours: (totalTime / 3600).toFixed(2),
      earliest_activity: dates.length
        ? new Date(Math.min(...dates)).toISOString()
        : null,
      latest_activity: dates.length
        ? new Date(Math.max(...dates)).toISOString()
        : null,
    };
  },

  async get_recent_activities(args) {
    const count = Math.min(args?.count || 5, 10);
    const activities = await getCachedActivities();
    const sorted = [...activities].sort(
      (a, b) => new Date(b.start_date_local) - new Date(a.start_date_local),
    );
    return sorted.slice(0, count).map(formatActivity);
  },
};

// TOOL CALLLING LOOP
async function runAnalysis(query) {
  const messages = [
    {
      role: "system",
      content: `You are a Strava data lookup tool. Your ONLY job is to call the right tool, read the result, and report it back in 1-3 sentences. Do NOT make up data. Do NOT write long responses. Do NOT write code. Just call the tool and summarize what it returns.`,
    },
    { role: "user", content: query },
  ];

  const toolsUsed = [];
  const stravaData = {};

  const MAX_ITERATIONS = 10;
  let iterations = 0;

  while (iterations++ < MAX_ITERATIONS) {
    let response;
    try {
      response = await ollama.chat({
        model: OLLAMA_MODEL,
        messages,
        tools,
      });
    } catch (err) {
      // Model produced invalid tool call (e.g. wrote code instead of JSON)
      // Retry without tools so it gives a plain text answer
      console.error("Tool call parse error, retrying without tools:", err.message);
      const fallback = await ollama.chat({
        model: OLLAMA_MODEL,
        messages,
      });
      return { analysis: fallback.message.content, toolsUsed, stravaData };
    }

    const msg = response.message;
    messages.push(msg);

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return { analysis: msg.content, toolsUsed, stravaData };
    }

    for (const toolCall of msg.tool_calls) {
      const name = toolCall.function.name;
      const args = toolCall.function.arguments;

      console.log(`Tool called: ${name}`);
      toolsUsed.push(name);

      const handler = toolHandlers[name];
      if (!handler) {
        const errResult = { error: `Unknown tool: ${name}` };
        messages.push({ role: "tool", content: JSON.stringify(errResult) });
        continue;
      }

      const result = await handler(args);
      stravaData[name] = result;
      messages.push({ role: "tool", content: JSON.stringify(result) });
    }
  }

  return { analysis: "Analysis could not be completed.", toolsUsed, stravaData };
}

// ROUTES
app.post("/analyze", async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: "query is required" });
  }

  try {
    const { analysis, toolsUsed, stravaData } = await runAnalysis(query);
    const insight = await Insight.create({
      query,
      analysis,
      toolsUsed,
      stravaData,
    });
    res.json(insight);
  } catch (err) {
    console.error("Analysis error:", err.cause || err);
    res.status(500).json({ error: err.message, details: err.cause?.message });
  }
});

app.get("/insights", async (_req, res) => {
  try {
    const insights = await Insight.find().sort({ createdAt: -1 });
    res.json(insights);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/insights/:id", async (req, res) => {
  try {
    const insight = await Insight.findById(req.params.id);
    if (!insight) {
      return res.status(404).json({ error: "Insight not found" });
    }
    res.json(insight);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
