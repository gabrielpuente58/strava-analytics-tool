require("dotenv").config();

const CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;

const authCode = process.argv[2];

if (!authCode) {
  console.log("Step 1: Open this URL in your browser and authorize:");
  console.log(
    `https://www.strava.com/oauth/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=http://localhost&approval_prompt=force&scope=activity:read_all`,
  );
  console.log("\nStep 2: After authorizing, copy the 'code' param from the redirect URL");
  console.log("Step 3: Run again with: node test-strava-auth.js <CODE>");
  process.exit(0);
}

async function get_access_token(code) {
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code,
      grant_type: "authorization_code",
    }),
  });

  const data = await response.json();

  if (data.errors) {
    console.error("Error:", JSON.stringify(data.errors));
    return;
  }

  console.log("STRAVA ACCESS TOKEN:", data.access_token);
  console.log("STRAVA REFRESH TOKEN:", data.refresh_token);
  console.log("\nUpdate your .env with these values.");
}

get_access_token(authCode);
