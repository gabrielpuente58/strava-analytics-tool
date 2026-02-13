require("dotenv").config();

const CLIENT_ID = proccess.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = proccess.env.CLIENT_SECRET;

console.log(
  `http://www.strava.com/oauth/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=http://localhost&approval_prompt=force&scope=activity:read_all`,
);

async function get_access_token(authCode) {
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: authCode,
      grant_type: "authorization_code",
    }),
  });

  const data = await response.json();

  console.log("STRAVA ACCESS TOKEN", data.access_token);
  console.log("STRAVA REFRESH TOEKN", data.refresh_token);

  return data;
}

get_access_token();
