require("dotenv").config();

const ACCESS_TOKEN = process.env.STRAVA_ACCESS_TOKEN;

async function testStravaAPI() {
  try {
    console.log("Fetching activities from Strava...");

    const response = await fetch(
      "https://www.strava.com/api/v3/athlete/activities?per_page=10",
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Strava API error: ${response.status}`);
    }

    const activities = await response.json();

    console.log(`\nFound ${activities.length} activities`);
    console.log("\nFirst activity:");
    console.log(JSON.stringify(activities[0], null, 2));

    // Filter for bike rides
    const bikeRides = activities.filter((a) => a.type === "Ride");
    console.log(`\nBike rides in first 10: ${bikeRides.length}`);

    if (bikeRides.length > 0) {
      const longest = bikeRides.reduce((max, ride) =>
        ride.distance > max.distance ? ride : max,
      );
      console.log("\nLongest ride:");
      console.log(`Name: ${longest.name}`);
      console.log(`Distance: ${(longest.distance / 1000).toFixed(2)} km`);
      console.log(
        `Avg Speed: ${(longest.average_speed * 3.6).toFixed(2)} km/h`,
      );
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

testStravaAPI();
