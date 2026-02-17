<template>
  <div class="app">
    <h1>Strava Analytics</h1>

    <form @submit.prevent="analyze" class="query-form">
      <input
        v-model="query"
        placeholder="Ask about your Strava activities..."
        :disabled="loading"
      />
      <button :disabled="loading || !query.trim()">
        {{ loading ? "Analyzing..." : "Analyze" }}
      </button>
    </form>

    <div v-if="loading" class="loading">
      Thinking... this may take a moment.
    </div>

    <div v-if="currentResult" class="result">
      <h2>Analysis</h2>
      <p>{{ currentResult.analysis }}</p>
      <div v-if="currentResult.toolsUsed.length" class="tools-used">
        <strong>Tools used:</strong> {{ currentResult.toolsUsed.join(", ") }}
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <hr />

    <h2>Past Insights</h2>
    <button @click="loadInsights" class="refresh-btn">Refresh</button>

    <div v-if="insights.length === 0" class="empty">No insights yet.</div>

    <div v-for="insight in insights" :key="insight._id" class="insight-card">
      <div class="insight-query">{{ insight.query }}</div>
      <div class="insight-analysis">{{ insight.analysis }}</div>
      <div class="insight-meta">
        <span>{{ new Date(insight.createdAt).toLocaleString() }}</span>
        <span v-if="insight.toolsUsed.length">
          | Tools: {{ insight.toolsUsed.join(", ") }}
        </span>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      query: "",
      loading: false,
      currentResult: null,
      error: null,
      insights: [],
    };
  },
  mounted() {
    this.loadInsights();
  },
  methods: {
    async analyze() {
      this.loading = true;
      this.error = null;
      this.currentResult = null;

      try {
        const res = await fetch("/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: this.query }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Request failed");
        }

        this.currentResult = await res.json();
        this.query = "";
        this.loadInsights();
      } catch (err) {
        this.error = err.message;
      } finally {
        this.loading = false;
      }
    },
    async loadInsights() {
      try {
        const res = await fetch("/insights");
        this.insights = await res.json();
      } catch (err) {
        console.error("Failed to load insights:", err);
      }
    },
  },
};
</script>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #1a1a2e;
  color: #e0e0e0;
  min-height: 100vh;
}

.app {
  max-width: 700px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

h1 {
  color: #fc4c02;
  margin-bottom: 1.5rem;
}

h2 {
  margin-bottom: 0.75rem;
  color: #ccc;
}

.query-form {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.query-form input {
  flex: 1;
  padding: 0.75rem;
  border: 1px solid #333;
  border-radius: 6px;
  background: #16213e;
  color: #e0e0e0;
  font-size: 1rem;
}

.query-form button {
  padding: 0.75rem 1.5rem;
  background: #fc4c02;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
}

.query-form button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading {
  color: #fc4c02;
  margin-bottom: 1rem;
}

.result {
  background: #16213e;
  padding: 1.25rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  border-left: 3px solid #fc4c02;
}

.result p {
  line-height: 1.6;
  white-space: pre-wrap;
}

.tools-used {
  margin-top: 0.75rem;
  font-size: 0.85rem;
  color: #888;
}

.error {
  color: #ff6b6b;
  margin-bottom: 1rem;
}

hr {
  border: none;
  border-top: 1px solid #333;
  margin: 1.5rem 0;
}

.refresh-btn {
  padding: 0.4rem 1rem;
  background: #333;
  color: #ccc;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  margin-bottom: 1rem;
}

.empty {
  color: #666;
}

.insight-card {
  background: #16213e;
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 0.75rem;
}

.insight-query {
  font-weight: bold;
  color: #fc4c02;
  margin-bottom: 0.5rem;
}

.insight-analysis {
  line-height: 1.5;
  white-space: pre-wrap;
}

.insight-meta {
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: #666;
}
</style>
