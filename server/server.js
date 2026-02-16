require("dotenv").config();

const ACCESS_TOKEN = process.env.STRAVA_ACCESS_TOKEN;
const BASE_URL = "https://www.strava.com/api/v3";

async function getAllActivities() {
  const activities = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const response = await fetch(
      `${BASE_URL}/athlete/activities?per_page=${perPage}&page=${page}`,
      { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } },
    );

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

async function main() {
  console.log("Fetching all activities from Strava...");
  const activities = await getAllActivities();
  console.log(`Total activities: ${activities.length}`);

  const rides = getRides(activities);
  console.log(`Total bike rides: ${rides.length}`);

  if (rides.length === 0) {
    console.log("No bike rides found.");
    return;
  }

  const longest = getLongestRide(rides);
  console.log("\nLongest Ride:");
  console.log(formatRide(longest));

  const fastest = getFastestRide(rides);
  console.log("\nFastest Ride (by avg speed):");
  console.log(formatRide(fastest));
}

main().catch(console.error);
