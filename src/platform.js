import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Geolocation } from "@capacitor/geolocation";
export const native = Capacitor.isNativePlatform();
export const apiOrigin = native ? "https://omniview-contributors.onrender.com" : "";
export const authRedirect = native ? "com.omniview.contributors://auth/callback" : location.origin;
export async function openLogin(client) {
  const { data, error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: authRedirect, skipBrowserRedirect: native } });
  if (error) throw error;
  if (native && data.url) await Browser.open({ url: data.url });
}
export async function connectAuthLinks(client, report) {
  if (!native) return;
  const accept = async (url) => {
    if (!url?.startsWith("com.omniview.contributors://auth/callback")) return;
    try {
      const parsed = new URL(url);
      const code = parsed.searchParams.get("code");
      if (parsed.searchParams.get("error")) throw Error(parsed.searchParams.get("error_description") || "Sign-in failed");
      if (code) {
        const { error } = await client.auth.exchangeCodeForSession(code);
        if (error) throw error;
      }
      await Browser.close().catch(() => {});
    } catch (error) { report(error.message); }
  };
  await App.addListener("appUrlOpen", ({ url }) => accept(url));
  const launch = await App.getLaunchUrl();
  if (launch?.url) await accept(launch.url);
}
export async function startLocation(receive, failed) {
  if (native) {
    await Geolocation.requestPermissions();
    receive(await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }));
    return Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0, minimumUpdateInterval: 1000 }, (p, error) => p ? receive(p) : failed(error));
  }
  if (!navigator.geolocation) throw Error("Location is not supported on this device.");
  await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(p => { receive(p); resolve(); }, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }));
  return navigator.geolocation.watchPosition(receive, failed, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}
export async function stopLocation(id) {
  if (native) await Geolocation.clearWatch({ id });
  else navigator.geolocation.clearWatch(id);
}
export async function wakeBackend() {
  const r = await fetch(`${apiOrigin}/healthz`, { signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw Error("The server is starting. Please try again shortly.");
}
