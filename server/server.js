require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const { ChatOllama } = require("@langchain/ollama");
const { HumanMessage, SystemMessage, ToolMessage } = require("@langchain/core/messages");
const { StateGraph, START, END } = require("@langchain/langgraph");
const { StructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");

// Environment
const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
let accessToken = process.env.STRAVA_ACCESS_TOKEN;
let refreshToken = process.env.STRAVA_REFRESH_TOKEN;
const BASE_URL = "https://www.strava.com/api/v3";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME || "strava_analytics";
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1";
const PORT = process.env.PORT || 8080;

// Express
const app = express();
app.use(cors());
app.use(express.json());

// MongoDB
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
  { timestamps: true }
);

const Insight = mongoose.model("Insight", insightSchema);

// LLM
const llm = new ChatOllama({
  baseUrl: OLLAMA_HOST,
  model: OLLAMA_MODEL,
  numCtx: 131072,
});

// Strava helpers
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

  if (!response.ok) throw new Error(`Token refresh failed: ${response.status}`);

  const data = await response.json();
  accessToken = data.access_token;
  refreshToken = data.refresh_token;
  console.log("Strava token refreshed successfully");
}

async function getAllActivities() {
  const activities = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    let response = await fetch(
      `${BASE_URL}/athlete/activities?per_page=${perPage}&page=${page}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (response.status === 401) {
      await refreshAccessToken();
      response = await fetch(
        `${BASE_URL}/athlete/activities?per_page=${perPage}&page=${page}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
    }

    if (!response.ok) throw new Error(`Strava API error: ${response.status}`);

    const batch = await response.json();
    if (batch.length === 0) break;

    activities.push(...batch);
    page++;
  }

  return activities;
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

const KM_TO_MILES = 0.621371;

function formatRun(run) {
  return {
    name: run.name,
    date: run.start_date_local,
    distance_miles: (run.distance / 1000 * KM_TO_MILES).toFixed(2),
    moving_time_min: (run.moving_time / 60).toFixed(1),
    elevation_gain_ft: (run.total_elevation_gain * 3.28084).toFixed(0),
  };
}

// TOOL: GetRecentRunActivity
class GetRecentRunActivityTool extends StructuredTool {
  name = "get_recent_run_activity";
  description = "Get the most recent run activity from Strava. Returns name, date, distance in miles, and moving time in minutes.";
  schema = z.object({});

  async _call() {
    const activities = await getCachedActivities();
    const runs = activities.filter((a) => a.type === "Run");
    if (runs.length === 0) return { message: "No run activities found." };

    const sorted = [...runs].sort(
      (a, b) => new Date(b.start_date_local) - new Date(a.start_date_local)
    );

    return formatRun(sorted[0]);
  }
}

// GRAPH STATE
const graphStateData = {
  query: {
    value: (x, y) => y,
    default: () => "",
  },
  result: {
    value: (x, y) => y,
    default: () => null,
  },
  messages: {
    value: (x, y) => x.concat(y),
    default: () => [],
  },
  toolCalls: {
    value: (x, y) => x.concat(y),
    default: () => [],
  },
  toolsUsed: {
    value: (x, y) => x.concat(y),
    default: () => [],
  },
  stravaData: {
    value: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  },
};

const recentRunTool = new GetRecentRunActivityTool();

// NODE #1: Call LLM with tools bound
async function callLLMNode(state) {
  const systemMsg = new SystemMessage(
    `You are a Strava data lookup tool. Your ONLY job is to call the right tool, read the result, and report it back in 1-3 sentences. Do NOT make up data. Do NOT write long responses. Do NOT write code. Just call the tool and summarize what it returns. All distances are in miles. Always use these units in your response — never use kilometers.`
  );

  const llmWithTools = llm.bindTools([recentRunTool]);
  const response = await llmWithTools.invoke([
    systemMsg,
    new HumanMessage(state.query),
    ...state.messages,
  ]);

  console.log("LLM responded:", response);

  if (!response.tool_calls || response.tool_calls.length === 0) {
    return { result: response.content, messages: [response] };
  }

  return { toolCalls: response.tool_calls, messages: [response] };
}

// NODE #2: Execute get_recent_run_activity tool
async function executeGetRecentRunNode(state) {
  const toolCall = state.toolCalls[state.toolCalls.length - 1];
  console.log("Tool call:", toolCall);

  const toolResult = await recentRunTool.invoke(toolCall.args);
  console.log("Tool result:", toolResult);

  const message = new ToolMessage({
    content: JSON.stringify(toolResult),
    name: toolCall.name,
    tool_call_id: toolCall.id,
  });

  return {
    messages: [message],
    toolsUsed: [toolCall.name],
    stravaData: { [toolCall.name]: toolResult },
  };
}

// ROUTING FUNCTION
function routingFunction(state) {
  if (state.result) return END;

  if (
    state.toolCalls.length > 0 &&
    state.toolCalls[state.toolCalls.length - 1].name === "get_recent_run_activity"
  ) {
    console.log("Routing to executeGetRecentRun");
    return "executeGetRecentRun";
  }

  return END;
}

// BUILD GRAPH
const workflow = new StateGraph({ channels: graphStateData });

workflow.addNode("callLLM", callLLMNode);
workflow.addNode("executeGetRecentRun", executeGetRecentRunNode);

workflow.addEdge(START, "callLLM");
workflow.addConditionalEdges("callLLM", routingFunction, ["executeGetRecentRun", END]);
workflow.addEdge("executeGetRecentRun", "callLLM");

const graph = workflow.compile();

// ROUTES
app.post("/analyze", async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "query is required" });

  try {
    const state = await graph.invoke({ query });
    const insight = await Insight.create({
      query,
      analysis: state.result,
      toolsUsed: state.toolsUsed,
      stravaData: state.stravaData,
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
    if (!insight) return res.status(404).json({ error: "Insight not found" });
    res.json(insight);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
