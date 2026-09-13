import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45000,
  use: {
    baseURL: "http://localhost:5174",
    channel: "msedge",
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
    permissions: ["camera", "geolocation"],
    geolocation: { latitude: 19.076, longitude: 72.8777 },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 5174 --strictPort",
    url: "http://localhost:5174",
    env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "", VITE_TURNSTILE_SITE_KEY: "" },
    reuseExistingServer: false,
  },
  workers: 1,
});
