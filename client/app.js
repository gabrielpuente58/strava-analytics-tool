const { createApp } = Vue;

createApp({
  data() {
    return {
      query: "",
      loading: false,
      insightsLoading: false,
      currentResult: null,
      selectedInsight: null,
      insights: [],
      error: null,
      message: "",
      messageType: "",
      apiUrl: "http://localhost:8080",
      showModal: false,
    };
  },

  mounted() {
    this.fetchInsights();
  },

  methods: {
    async fetchInsights() {
      this.insightsLoading = true;
      this.error = null;

      try {
        const response = await fetch(`${this.apiUrl}/insights`);

        if (response.status !== 200) {
          throw new Error("Failed to fetch insights");
        }

        this.insights = await response.json();
      } catch (err) {
        this.error = err.message;
      } finally {
        this.insightsLoading = false;
      }
    },

    async analyze() {
      this.message = "";
      this.loading = true;
      this.currentResult = null;

      try {
        const response = await fetch(`${this.apiUrl}/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: this.query }),
        });

        if (response.status !== 200) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Analysis failed");
        }

        const data = await response.json();
        this.currentResult = data;
        this.message = "Analysis completed successfully!";
        this.messageType = "success";
        this.query = "";

        await this.fetchInsights();

        setTimeout(() => {
          this.message = "";
        }, 3000);
      } catch (err) {
        this.message = err.message;
        this.messageType = "error";
      } finally {
        this.loading = false;
      }
    },

    async viewInsight(insightId) {
      try {
        const response = await fetch(`${this.apiUrl}/insights/${insightId}`);

        if (response.status !== 200) {
          throw new Error("Failed to fetch insight");
        }

        this.selectedInsight = await response.json();
        this.showModal = true;
      } catch (err) {
        this.message = err.message;
        this.messageType = "error";
      }
    },

    formatDate(dateString) {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    },

    truncate(text, length) {
      if (!text) return "";
      if (text.length <= length) return text;
      return text.substring(0, length) + "...";
    },
  },
}).mount("#app");
