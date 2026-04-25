import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    occupancy_read_peak: {
      executor: "ramping-vus",
      startVUs: 20,
      stages: [
        { duration: "2m", target: 200 },
        { duration: "5m", target: 500 },
        { duration: "2m", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<800"],
  },
};

const baseUrl = __ENV.BASE_URL || "http://localhost:8000/api/v1";

export default function () {
  const response = http.get(`${baseUrl}/lots/occupancy`);
  check(response, {
    "status is 200": (r) => r.status === 200,
    "response has json body": (r) => r.headers["Content-Type"]?.includes("application/json"),
  });
  sleep(1);
}
