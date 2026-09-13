import { fixWebmDuration } from "@fix-webm-duration/fix";
import { locationQuality } from "./recording-quality.js";
import "./style.css";
import { native, authRedirect, openLogin, connectAuthLinks, startLocation, stopLocation, wakeBackend } from "./platform.js";
import { uploadVideo, storageRequest } from "./b2-uploader.js";
import {
  createIcons,
  ScanLine,
  LayoutDashboard,
  Video,
  FolderOpen,
  Settings2,
  Sprout,
  CircleUserRound,
  LogOut,
  MapPin,
  ArrowUpRight,
  Film,
  Cloud,
  HardDrive,
  Scan,
  CloudUpload,
  ArrowRight,
  ShieldCheck,
  Camera,
  Circle,
  Square,
  Smartphone,
  Compass,
  Plus,
  Play,
  Trash2,
  Check,
} from "lucide";
import { createClient } from "@supabase/supabase-js";
import * as db from "./db.js";
import { CAP, clock, size, alignmentReminder, canFit } from "./logic.js";

const icons = {
  ScanLine,
  LayoutDashboard,
  Video,
  FolderOpen,
  Settings2,
  Sprout,
  CircleUserRound,
  LogOut,
  MapPin,
  ArrowUpRight,
  Film,
  CloudCheck: Cloud,
  HardDrive,
  Scan,
  CloudUpload,
  ArrowRight,
  ShieldCheck,
  Camera,
  Circle,
  Square,
  Smartphone,
  Compass,
  Plus,
  Play,
  Trash2,
  Check,
};
const env = import.meta.env;
// Remove obsolete onboarding data without touching local recordings.
for (const key of Object.keys(localStorage))
  if (key.startsWith("vehicle:")) localStorage.removeItem(key);
const client =
  env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY
    ? createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { flowType: native ? "pkce" : "implicit" } })
    : null;
const app = document.querySelector("#app");
let user = null,
  page = "home",
  clips = [],
  authMode = "signup",
  authMethod = "email",
  captcha = "",
  pendingPhone = "",
  stream = null,
  watch = null,
  recorder = null,
  active = null,
  timer = null,
  started = 0,
  writeChain = Promise.resolve(),
  gps = [],
  selected = new Set(),
  busy = false,
  orientation = null,
  orientationEnabled = false,
  wake = null;
let lastGPS = null;
let hintState = { badSince: null, lastHint: 0 },
  limit = 180,
  previewURL = null;
const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const owner = () => user?.id;
const isDemo = () => user?.id === "local-preview";
const notice = (message) => {
  const t = document.querySelector("#toast");
  t.textContent = message;
  t.classList.add("visible");
  clearTimeout(notice.timeout);
  notice.timeout = setTimeout(() => t.classList.remove("visible"), 6500);
};
const on = (id, event, fn) =>
  document.getElementById(id)?.addEventListener(event, fn);
const action = (id, fn) =>
  on(id, "click", async (e) => {
    try {
      await fn(e);
    } catch (error) {
      notice(error.message || "Something went wrong. Please try again.");
    }
  });
function paint() {
  createIcons({ icons });
}
async function refresh() {
  clips = await db.allClips(owner());
  render();
}
function render() {
  if (!user) return renderAuth();
  app.innerHTML = `<aside class="sidebar"><a class="brand" href="#">${icon("scan-line")}<span>omniview<span class="brand-sub">CONTRIBUTORS</span></span></a><div class="workspace-label">YOUR WORKSPACE</div><nav>${[
    ["home", "layout-dashboard", "Overview"],
    ["record", "video", "Record a clip"],
    ["archive", "folder-open", "My footage"],
    ["settings", "settings-2", "Preferences"],
  ]
    .map(
      ([key, i, text]) =>
        `<button class="nav-item ${page === key ? "active" : ""}" data-page="${key}">${icon(i)}${text}${key === "archive" ? `<span class="count">${clips.length}</span>` : ""}</button>`,
    )
    .join(
      "",
    )}</nav><div class="sidebar-note">${icon("sprout")}<strong>Small clips.<br>Better roads.</strong><p>Your everyday journey can make a real difference.</p></div><button id="signout" class="profile">${icon("circle-user-round")}<span>${escape(isDemo() ? "Local preview" : user.email?.split("@")[0] || user.phone || "Contributor")}<small>${isDemo() ? "Not an authenticated account" : "Contributor account"}</small></span>${icon("log-out")}</button></aside><div class="workspace"><header><span>Community / <strong>${{ home: "Overview", record: "Record a clip", archive: "My footage", settings: "Preferences" }[page]}</strong></span><span class="connection"><b class="${navigator.onLine ? "" : "offline"}"></b>${navigator.onLine ? "Online" : "Offline · saved locally"}</span></header><main>${isDemo() ? '<div class="demo-banner">Local preview · recordings stay on this device. Sign in to a configured account to upload.</div>' : ""}${{ home: homeView, record: recordView, archive: archiveView, settings: settingsView }[page]()}</main><footer><span>OMNIVIEW COMMUNITY</span><span>Every road deserves a better tomorrow.</span></footer></div><dialog id="modal"></dialog>`;
  paint();
  document
    .querySelectorAll("[data-page]")
    .forEach((b) => (b.onclick = () => navigate(b.dataset.page)));
  action("signout", async () => {
    if (active || busy)
      return notice("Finish recording or uploading before signing out.");
    await release();
    if (client && !isDemo()) await client.auth.signOut();
    user = null;
    selected.clear();
    render();
  });
  bindPage();
}
async function navigate(next) {
  if (busy)
    return notice("Let the current upload finish before switching screens.");
  if (active)
    return notice("Stop and save your recording before leaving this screen.");
  await release();
  page = next;
  render();
}
function homeView() {
  const uploaded = clips.filter((c) => c.status === "uploaded").length;
  const pending = clips.filter((c) => c.status !== "uploaded").length;
  return `<div class="heading"><div class="eyebrow">A LITTLE EFFORT. A LASTING DIFFERENCE.</div><h1>Better roads start with you<span class="green">.</span></h1><p>Capture what needs attention. We’ll take it from there.</p></div><section class="hero"><div class="hero-copy"><span class="pill">${icon("map-pin")} YOUR JOURNEY, OUR SHARED PROGRESS</span><h2>See a rough road?<br>Help smooth the way.</h2><p>A short clip can help identify cracks and potholes.<br>Record on your phone. Upload when you’re ready.</p><button class="button lime" id="start-home">${icon("video")} Record a road clip ${icon("arrow-up-right")}</button><small>3–5 minute clips <span>•</span> Location attached automatically</small></div><div class="road-art" aria-hidden="true"><div class="art-grid"></div><div class="road"><div class="road-line"></div><div class="car-shape"></div><div class="crack">⌁</div></div><div class="map-label label-one">${icon("map-pin")} Every journey counts</div><div class="map-label label-two"><b></b> A clearer picture of our roads</div><span class="art-ring ring-one"></span><span class="art-ring ring-two"></span></div></section><section class="stats">${[
    [
      "film",
      clips.length,
      "Clips recorded",
      "Your contribution, one clip at a time",
    ],
    [
      "cloud-check",
      uploaded,
      "Clips uploaded",
      "Safely received by the server",
    ],
    ["hard-drive", pending, "Ready when you are", "Saved on this device"],
  ]
    .map(
      ([i, n, t, s]) =>
        `<article class="stat"><div class="stat-icon">${icon(i)}</div><div><strong>${n}</strong><h3>${t}</h3><p>${s}</p></div></article>`,
    )
    .join(
      "",
    )}</section><div class="section-title"><h2>Your next contribution</h2><span>THREE SIMPLE STEPS</span></div><section class="steps">${[
    [
      "01",
      "smartphone",
      "Take out your phone",
      "Contribute as a passenger or pedestrian.",
    ],
    ["02", "scan", "Frame the road", "Use the guide to position your phone."],
    [
      "03",
      "cloud-upload",
      "Share on your terms",
      "Upload one clip or all your recordings.",
    ],
  ]
    .map(
      ([n, i, h, p]) =>
        `<article><span class="step-no">${n}</span>${icon(i)}<h3>${h}</h3><p>${p}</p></article>`,
    )
    .join(
      "",
    )}</section><div class="section-title"><h2>Recent footage</h2><button class="text-button" id="view-all">View archive ${icon("arrow-right")}</button></div>${clips.length ? clipRows(clips.slice(0, 3), false) : '<div class="empty-inline">' + icon("film") + '<div><strong>Your first contribution starts here</strong><p>Saved recordings will appear here, ready to review and upload.</p></div><button class="button secondary" id="first-clip">Record a clip</button></div>'}`;
}
function renderAuth() {
  app.innerHTML = `<div class="auth-layout"><section class="auth-story"><a class="brand">${icon("scan-line")}<span>omniview<span class="brand-sub">CONTRIBUTORS</span></span></a><div><span class="pill">BUILT FOR THE ROADS WE SHARE</span><h1>Your everyday drive.<br>A better road<br>for everyone.</h1><p>Join a community turning road footage into<br>meaningful change, one short clip at a time.</p><div class="auth-road" aria-hidden="true">╱ <span>┊</span> ╱</div></div><small>${icon("shield-check")} You choose what to record and what to share.</small></section><section class="auth-panel"><div class="auth-card"><div class="eyebrow">WELCOME TO OMNIVIEW</div><h2>${authMode === "signup" ? "Make your journey count." : "Good to see you again."}</h2><p>${authMode === "signup" ? "Create your contributor account to get started." : "Sign in to manage your contributions."}</p><div class="segmented"><button id="signup" class="${authMode === "signup" ? "chosen" : ""}">Sign up</button><button id="login" class="${authMode === "login" ? "chosen" : ""}">Log in</button></div><button class="button google full" id="google"><strong class="google-g">G</strong> Continue with Google</button><div class="divider"><span>or use a verification code</span></div><div class="method-tabs"><button id="email-method" class="${authMethod === "email" ? "chosen" : ""}">Email address</button><button id="phone-method" class="${authMethod === "phone" ? "chosen" : ""}">Phone number</button></div><form id="auth-form"><label for="identity">${authMethod === "email" ? "Email address" : "Phone number with country code"}</label><input id="identity" type="${authMethod === "email" ? "email" : "tel"}" placeholder="${authMethod === "email" ? "you@gmail.com" : "+91 98765 43210"}" required autocomplete="${authMethod === "email" ? "email" : "tel"}"><div id="captcha"></div><button class="button primary full" id="auth-submit">${authMethod === "email" ? "Email me a sign-in link" : "Send verification code"} ${icon("arrow-right")}</button></form><div id="otp-area" hidden><label for="otp">Verification code</label><input id="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6"><button id="verify-otp" class="button primary full">Verify & continue</button></div><p class="fine">${authMethod === "email" ? "No password to remember. Follow the secure link in your inbox." : "SMS delivery requires an enabled verification provider."}</p>${!client ? '<div class="setup-note">Account services are not connected yet. You can explore the app locally without creating an account.</div><button id="demo" class="button secondary full">Explore local preview ' + icon("arrow-up-right") + "</button>" : ""}<p class="fine centered">Camera and location are requested only when you record.<br>Audio is never recorded.</p></div></section></div>`;
  paint();
  action("signup", () => {
    authMode = "signup";
    renderAuth();
  });
  action("login", () => {
    authMode = "login";
    renderAuth();
  });
  action("email-method", () => {
    authMethod = "email";
    renderAuth();
  });
  action("phone-method", () => {
    authMethod = "phone";
    renderAuth();
  });
  action("demo", async () => {
    user = { id: "local-preview" };
    page = "home";
    await recover();
  });
  action("google", async () => {
    if (!client)
      return notice(
        "Connect authentication first. See SETUP.md in the app folder.",
      );
    await openLogin(client);
  });
  on("auth-form", "submit", async (e) => {
    e.preventDefault();
    const button = document.querySelector("#auth-submit");
    button.disabled = true;
    try {
      if (!client)
        throw Error(
          "Account services are not configured yet. Use the local preview.",
        );
      if (env.VITE_TURNSTILE_SITE_KEY && !captcha)
        throw Error("Please wait for the security check to complete.");
      const value = document.querySelector("#identity").value.trim();
      if (authMethod === "phone" && env.VITE_PHONE_AUTH_ENABLED !== "true")
        throw Error(
          "Phone verification is not enabled. Please use Google or email.",
        );
      pendingPhone = value.replace(/\s/g, "");
      if (authMethod === "phone" && !/^\+[1-9]\d{7,14}$/.test(pendingPhone))
        throw Error("Enter a valid phone number including country code.");
      if (authMethod === "phone") {
        button.textContent = "Connecting to verification service…";
        await wakeBackend();
      }
      const { error } = await client.auth.signInWithOtp(
        authMethod === "email"
          ? {
              email: value,
              options: {
                shouldCreateUser: authMode === "signup",
                emailRedirectTo: authRedirect,
                captchaToken: captcha,
              },
            }
          : {
              phone: pendingPhone,
              options: {
                shouldCreateUser: authMode === "signup",
                captchaToken: captcha,
              },
            },
      );
      if (error) throw error;
      if (authMethod === "phone")
        document.querySelector("#otp-area").hidden = false;
      notice(
        authMethod === "email"
          ? "Check your inbox for your secure sign-in link."
          : "Verification code requested. Check your phone.",
      );
    } catch (error) {
      notice(error.message);
    } finally {
      button.disabled = false;
      button.textContent = authMethod === "phone" ? "Send verification code" : "Email me a sign-in link";
      if (window.turnstile) window.turnstile.reset();
      captcha = "";
    }
  });
  action("verify-otp", async () => {
    const token = document.querySelector("#otp").value.trim();
    if (!/^\d{6}$/.test(token)) throw Error("Enter the six-digit code.");
    const { error } = await client.auth.verifyOtp({
      phone: pendingPhone,
      token,
      type: "sms",
    });
    if (error) throw error;
  });
  captcha = "";
  if (env.VITE_TURNSTILE_SITE_KEY) {
    const mount = () => {
      if (document.querySelector("#captcha"))
        window.turnstile.render("#captcha", {
          sitekey: env.VITE_TURNSTILE_SITE_KEY,
          callback: (t) => (captcha = t),
          "expired-callback": () => (captcha = ""),
        });
    };
    if (window.turnstile) mount();
    else if (!document.querySelector("#turnstile-script")) {
      const s = document.createElement("script");
      s.id = "turnstile-script";
      s.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.onload = mount;
      document.head.append(s);
    }
  }
}
function recordView() {
  return `<div class="heading"><div class="eyebrow">CAPTURE A CLEARER PICTURE</div><h1>A short clip. A step forward.</h1><p>Position your phone while parked. Keep this screen open during recording.</p></div><div class="record-layout"><section class="camera-card"><div class="camera-top"><span>${icon("video")} Phone camera</span><span id="record-state">READY WHEN YOU ARE</span></div><div class="viewfinder"><video id="camera" autoplay muted playsinline></video><div id="camera-placeholder">${icon("scan")}<h3>Your road view goes here</h3><p>Enable your camera to check the framing.<br>No footage leaves your device until you upload.</p></div><div class="frame-guides"><span></span><span></span><span></span><span></span></div><div class="horizon"><span>KEEP THE ROAD IN THE LOWER TWO THIRDS</span></div><div id="alignment-hint" class="camera-hint" hidden>Keep the phone steady and upright. Frame the road ahead.</div><div class="camera-bottom"><span id="gps-status">${icon("map-pin")} GPS not enabled</span><span id="elapsed">00:00 / ${clock(limit)}</span></div></div><div class="camera-controls"><button id="enable-camera" class="button primary">${icon("camera")} Enable camera & location</button><button id="record-button" class="button primary" disabled>${icon("circle")} Start recording</button><button id="stop-button" class="button danger" hidden>${icon("square")} Stop & save</button></div></section><aside class="record-options panel"><span class="eyebrow">BEFORE YOU START</span><h2>Make every frame useful.</h2><div class="tip">${icon("smartphone")}<div><strong>Mount your phone securely</strong><p>Use landscape framing where possible. Keep the lens clear.</p></div></div><div class="tip">${icon("scan-line")}<div><strong>Show the road ahead</strong><p>Keep the horizon near the upper third. Avoid the dashboard filling the frame.</p></div></div><div class="tip">${icon("shield-check")}<div><strong>You’re in control</strong><p>No live streaming or audio. Review clips before sharing.</p></div></div><label for="clip-length">Maximum clip length</label><select id="clip-length"><option value="180" ${limit === 180 ? "selected" : ""}>3 minutes · recommended</option><option value="300" ${limit === 300 ? "selected" : ""}>5 minutes</option></select><button id="motion" class="text-button">${icon("compass")} Enable gentle tilt reminders</button><p class="fine">Tilt reminders need motion-sensor support. The framing guide remains available without it; road visibility is not automatically verified.</p></aside></div>`;
}
function clipRows(list, selectable) {
  return `<div class="clip-list">${list.map((c, index) => `<article class="clip-row">${selectable ? `<input type="checkbox" aria-label="Select ${escape(c.name)}" data-select="${c.id}" ${selected.has(c.id) ? "checked" : ""} ${c.status === "uploaded" ? "disabled" : ""}>` : ""}<div class="clip-thumbnail">${icon("film")}<span>${clock(c.duration || 0)}</span></div><div class="clip-info"><strong>${escape(c.name)}</strong><p>${new Date(c.created).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} <span>·</span> ${size(c.bytes || 0)}</p><small>${c.gps?.length ? `${c.gps.length} location samples` : "No location samples"} ${c.status === "interrupted" ? "· Interrupted recording; playback may be incomplete" : ""}</small></div><span class="status ${c.status === "uploaded" ? "done" : ""}">${c.cloudRemoved ? "Transferred to OmniView" : c.status === "uploaded" ? "Uploaded" : c.status === "uploading" ? "Uploading…" : c.status === "interrupted" ? "Recovered" : "On this device"}</span><button class="icon-button" data-preview="${c.id}" aria-label="Preview ${escape(c.name)}">${icon("play")}</button>${selectable ? `<button class="icon-button" data-delete="${c.id}" aria-label="Delete ${escape(c.name)}">${icon("trash-2")}</button>` : ""}</article>`).join("")}</div>`;
}
function archiveView() {
  const pending = clips.filter((c) => c.status !== "uploaded");
  return `<div class="heading heading-row"><div><div class="eyebrow">YOUR CONTRIBUTIONS, IN ONE PLACE</div><h1>My footage<span class="green">.</span></h1><p>Review your clips. Choose what to share and when.</p></div><button id="archive-record" class="button primary">${icon("plus")} Record a clip</button></div><div class="archive-toolbar"><div><strong>${clips.length} recordings</strong><span> ${pending.length} awaiting upload</span></div><div class="toolbar-actions"><button id="select-all" class="text-button">${selected.size ? "Clear selection" : "Select pending"}</button><button id="upload-selected" class="button secondary" ${busy ? "disabled" : ""}>Upload selected (${selected.size})</button><button id="upload-all" class="button primary" ${busy || !pending.length ? "disabled" : ""}>${icon("cloud-upload")} Upload all</button></div></div><div id="upload-progress" role="status" class="fine">${busy ? "Upload in progress. Confirmed chunks are kept for retries." : ""}</div>${clips.length ? clipRows(clips, true) : `<div class="empty">${icon("folder-open")}<h2>A fresh start for better roads.</h2><p>Your recordings will appear here after you save a clip.</p><button id="empty-record" class="button primary">Record your first clip</button></div>`}<div class="info">${icon("hard-drive")} <span>Pending footage stays on this device. Uploads remove local video only after the server confirms receipt. Browser data clearing can remove local recordings.</span></div>`;
}
function settingsView() {
  const used = clips.reduce(
    (n, c) => n + (c.status === "uploaded" ? 0 : c.bytes || 0),
    0,
  );
  return `<div class="heading"><div class="eyebrow">MADE TO FIT YOUR JOURNEY</div><h1>Your preferences.</h1><p>Simple controls for your device and your data.</p></div><section class="panel narrow"><h2>Device storage</h2><div class="storage-label"><strong>${size(used)} used</strong><span>${size(CAP)} app limit</span></div><progress value="${used}" max="${CAP}"></progress><p>Recording pauses at the limit. Unuploaded clips are never automatically overwritten.</p><button id="persist" class="button secondary">${icon("hard-drive")} Request persistent storage</button><p class="fine">Your browser decides whether persistent storage is allowed. It does not protect against manually clearing site data.</p><hr><h2>Upload preferences</h2><label class="check-label"><input id="wifi" type="checkbox" ${localStorage.getItem("wifi-only") !== "false" ? "checked" : ""}> Prefer Wi-Fi uploads</label><p class="fine">Where your browser cannot identify the connection, we’ll ask before uploading.</p><hr><h2>Privacy by default</h2><p>Camera and location are used only for recording. Microphone access is never requested. Private uploads are accessible to your account under the configured storage policies.</p></section>`;
}
function bindPage() {
  ["start-home", "first-clip", "archive-record", "empty-record"].forEach((id) =>
    action(id, () => navigate("record")),
  );
  action("view-all", () => navigate("archive"));
  action("persist", async () =>
    notice(
      (await navigator.storage?.persist?.())
        ? "Persistent storage granted."
        : "Your browser did not grant persistent storage. Keep important clips backed up.",
    ),
  );
  on("wifi", "change", (e) =>
    localStorage.setItem("wifi-only", e.target.checked),
  );
  on("clip-length", "change", (e) => {
    limit = Number(e.target.value);
    document.querySelector("#elapsed").textContent = `00:00 / ${clock(limit)}`;
  });
  action("enable-camera", enableCamera);
  action("record-button", startRecording);
  action("stop-button", () => stopRecording());
  action("motion", enableMotion);
  document.querySelectorAll("[data-select]").forEach(
    (e) =>
      (e.onchange = () => {
        e.checked
          ? selected.add(e.dataset.select)
          : selected.delete(e.dataset.select);
        document.querySelector("#upload-selected").textContent =
          `Upload selected (${selected.size})`;
      }),
  );
  action("select-all", () => {
    selected = selected.size
      ? new Set()
      : new Set(clips.filter((c) => c.status !== "uploaded").map((c) => c.id));
    render();
  });
  action("upload-selected", () => upload([...selected]));
  action("upload-all", () =>
    upload(clips.filter((c) => c.status !== "uploaded").map((c) => c.id)),
  );
  document
    .querySelectorAll("[data-preview]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          preview(b.dataset.preview).catch((e) => notice(e.message))),
    );
  document.querySelectorAll("[data-delete]").forEach(
    (b) =>
      (b.onclick = () => {
        if (busy) return notice("Wait for the upload to finish.");
        const c = clips.find((c) => c.id === b.dataset.delete);
        modal(
          `<h2>Delete this recording?</h2><p>${c.status === "uploaded" ? "This removes the archive entry on this device. The server copy is retained." : "This removes the only local copy and its location data."}</p><button class="button danger" id="confirm-delete">Delete recording</button><button class="button secondary" id="cancel-delete">Keep it</button>`,
        );
        action("cancel-delete", closeModal);
        action("confirm-delete", async () => {
          await db.deleteClip(c.id);
          selected.delete(c.id);
          closeModal();
          await refresh();
        });
      }),
  );
}
async function enableCamera() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
    throw Error(
      "Recording requires a supported browser on HTTPS or localhost.",
    );
  const b = document.querySelector("#enable-camera");
  b.disabled = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    document.querySelector("#camera").srcObject = stream;
    document.querySelector("#camera-placeholder").hidden = true;
    await navigator.storage?.persist?.();
    watch = await startLocation(
      receiveGPS,
      () => {
        const el = document.querySelector("#gps-status");
        if (el) el.textContent = "GPS unavailable · location gap";
      },
    );
    document.querySelector("#record-button").disabled = false;
    b.hidden = true;
    showHint("Frame the road in the lower two thirds. Keep the phone steady.");
    stream.getVideoTracks()[0].onended = () => {
      if (active)
        stopRecording(
          "Camera disconnected. Your available footage has been saved.",
        );
    };
  } catch (error) {
    await release();
    document.querySelector("#camera-placeholder").hidden = false;
    throw error;
  } finally {
    b.disabled = false;
  }
}
function receiveGPS(position) {
  const p = {
    timestamp: position.timestamp,
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy,
    heading: position.coords.heading,
    speed: position.coords.speed,
  };
  lastGPS = p;
  if (active && active.captureStarted)
    gps.push({ ...p, relativeMs: position.timestamp - active.created });
  const el = document.querySelector("#gps-status");
  if (el) el.textContent = `GPS ±${Math.round(p.accuracy)} m${p.accuracy > 20 ? " · weak location" : ""}`;
}
async function enableMotion() {
  if (typeof DeviceOrientationEvent === "undefined")
    return notice(
      "Tilt sensors are unavailable. Use the visual framing guide.",
    );
  if (
    typeof DeviceOrientationEvent.requestPermission === "function" &&
    (await DeviceOrientationEvent.requestPermission()) !== "granted"
  )
    return notice(
      "Motion permission was not granted. The visual guide still works.",
    );
  if (!orientationEnabled) {
    window.addEventListener(
      "deviceorientation",
      (e) => (orientation = { beta: e.beta, gamma: e.gamma }),
    );
    orientationEnabled = true;
  }
  notice(
    "Tilt reminders enabled where supported. They appear only after 25 seconds of sustained tilt.",
  );
}
function showHint(text) {
  const el = document.querySelector("#alignment-hint");
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  setTimeout(() => {
    if (el.isConnected) el.hidden = true;
  }, 6500);
}
async function startRecording() {
  if (active || !stream) return;
  const used = await db.totalBytes();
  const estimate = await navigator.storage?.estimate?.();
  if (
    !canFit(used, 10 * 1024 * 1024) ||
    estimate?.quota - estimate?.usage < 10 * 1024 * 1024
  )
    throw Error(
      "Storage is almost full. Upload or delete saved clips before recording.",
    );
  if (matchMedia("(orientation: portrait)").matches) showHint("For road footage, hold the phone sideways and level before recording. Keep this orientation throughout the clip.");
  const mime = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp8", "video/webm"].find((t) =>
    MediaRecorder.isTypeSupported(t),
  );
  if (!mime)
    throw Error("This browser cannot record a supported video format.");
  recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 2500000,
  });
  active = {
    id: crypto.randomUUID(),
    owner: owner(),
    created: Date.now(),
    name: `Road clip ${String(clips.length + 1).padStart(2, "0")}`,
    status: "recording",
    mime,
    bytes: 0,
    duration: 0,
    gps: [],
    chunks: 0,
    timing:
      "v2: recorder start-event epoch with monotonic duration; GPS measurement timestamps; approximate frame alignment, not hardware synchronization",
  };
  gps = [];
  started = performance.now();
  hintState = { badSince: null, lastHint: started - 60000 };
  try {
    await db.putClip(active);
  } catch (error) {
    active = null;
    recorder = null;
    throw error;
  }
  const current = active;
  let n = 0;
  writeChain = Promise.resolve();
  recorder.ondataavailable = (e) => {
    if (!e.data.size) return;
    const index = n++;
    writeChain = writeChain
      .then(async () => {
        await db.putChunk(current.id, index, e.data);
        current.chunks = n;
        current.bytes += e.data.size;
        current.duration = (performance.now() - started) / 1000;
        current.gps = [...gps];
        await db.putClip(current);
        if (
          !canFit(used, current.bytes + 4 * 1024 * 1024) &&
          recorder?.state === "recording"
        )
          stopRecording("Storage limit reached. Your clip has been saved.");
      })
      .catch((error) => {
        notice(
          "Storage could not save all footage. Keep this screen open and free space.",
        );
        if (recorder?.state === "recording")
          stopRecording("Recording stopped because storage failed.");
        throw error;
      });
    writeChain.catch(() => {});
  };
  recorder.onerror = () =>
    stopRecording("Recording was interrupted. Review the saved clip.");
  recorder.onstop = async () => {
    clearInterval(timer);
    try {
      await writeChain;
      if (!current.bytes)
        throw Error("The camera did not produce any video frames.");
      current.status = "saved";
      current.duration = current.stoppedDuration ?? (performance.now() - started) / 1000;
      current.quality = locationQuality(gps, current.duration);
      current.gps = [...gps];
      await db.putClip(current);
    } catch {
      current.status = "interrupted";
      await db.putClip(current).catch(() => {});
    }
    active = null;
    recorder = null;
    await release();
    await refresh();
    modal(
      `<div class="success-mark">${icon("check")}</div><h2>${current.status === "saved" ? "Your clip is saved." : "Recording was interrupted."}</h2><p>${clock(current.duration)} · ${size(current.bytes)} · ${gps.length} location samples</p><p>${current.quality?.usable ? "Location coverage passed basic checks; alignment remains approximate." : "Weak or incomplete location coverage. Footage is saved, but precise location labels need review."}</p><p>${current.status === "saved" ? "Record another clip or head to your archive to review and upload." : "Some footage could not be saved. Review the recovered clip before uploading."}</p><button id="another" class="button primary">Record another clip</button><button id="to-archive" class="button secondary">Review footage</button>`,
    );
    action("another", () => {
      closeModal();
      render();
    });
    action("to-archive", () => {
      closeModal();
      navigate("archive");
    });
  };
  recorder.onstart = () => {
    started = performance.now();
    current.created = Date.now();
    current.captureStarted = true;
    gps = lastGPS && Date.now() - lastGPS.timestamp <= 2000
      ? [{ ...lastGPS, relativeMs: lastGPS.timestamp - current.created }] : [];
  };
  try {
    recorder.start(2000);
  } catch (error) {
    active = null;
    recorder = null;
    await db.deleteClip(current.id);
    throw error;
  }
  navigator.wakeLock
    ?.request("screen")
    .then(async (lock) => {
      if (active) wake = lock;
      else await lock.release();
    })
    .catch(() => {});
  document.querySelector("#record-button").hidden = true;
  document.querySelector("#stop-button").hidden = false;
  document.querySelector("#clip-length").disabled = true;
  document.querySelector("#record-state").textContent =
    "● RECORDING · SAVING LOCALLY";
  timer = setInterval(() => {
    if (!active?.captureStarted) return;
    const elapsed = (performance.now() - started) / 1000;
    const gpsLabel = document.querySelector("#gps-status");
    if (gpsLabel && (!lastGPS || Date.now() - lastGPS.timestamp > 3000)) gpsLabel.textContent = "GPS signal stale · location needs review";
    document.querySelector("#elapsed").textContent =
      `${clock(elapsed)} / ${clock(limit)}`;
    if (elapsed >= limit) stopRecording();
    if (orientation?.beta != null) {
      const landscape = matchMedia("(orientation: landscape)").matches;
      const tilt = landscape
        ? Math.abs(orientation.gamma)
        : Math.abs(orientation.beta);
      hintState = alignmentReminder({
        ...hintState,
        now: performance.now(),
        bad: tilt < 45 || tilt > 135,
      });
      if (hintState.show)
        showHint(
          "Your phone may be tilted. When safe, check the road framing.",
        );
    }
  }, 500);
}
function stopRecording(message) {
  if (recorder?.state === "recording") {
    active.stoppedDuration = (performance.now() - started) / 1000;
    recorder.stop();
    clearInterval(timer);
    document.querySelector("#stop-button").disabled = true;
    if (message) notice(message);
  }
}
async function release() {
  if (active) return;
  clearInterval(timer);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  if (watch !== null) await stopLocation(watch);
  watch = null;
  try {
    await wake?.release();
  } catch {}
  wake = null;
}
function modal(html) {
  document.querySelector("#modal").innerHTML = html;
  document.querySelector("#modal").showModal();
  paint();
}
function closeModal() {
  document.querySelector("#modal")?.close();
  if (previewURL) {
    URL.revokeObjectURL(previewURL);
    previewURL = null;
  }
}
async function preview(id) {
  const c = clips.find((c) => c.id === id);
  let url;
  if (c.cloudRemoved)
    return notice(
      "Transferred to local OmniView. The temporary cloud copy has been removed.",
    );
  if (c.status === "uploaded") {
    if (!client || isDemo())
      throw Error("Sign in to the account that uploaded this clip.");
    const data = await storageRequest(client, `/footage/${id}/playback`);
    url = data.url;
  } else {
    const parts = await db.chunks(id);
    previewURL = URL.createObjectURL(
      await playableBlob(parts, c),
    );
    url = previewURL;
  }
  modal(
    `<h2>${escape(c.name)}</h2><video controls playsinline src="${escape(url)}" class="preview-video"></video><p>${c.gps?.length ? "Location data is attached." : "No location track is available."}</p><a class="button secondary" href="${escape(url)}" download="${escape(c.name)}.${c.mime.includes("mp4") ? "mp4" : "webm"}">Save video</a><button id="close-preview" class="button primary">Done</button>`,
  );
  action("close-preview", closeModal);
  document.querySelector("#modal").addEventListener(
    "close",
    () => {
      if (previewURL) {
        URL.revokeObjectURL(previewURL);
        previewURL = null;
      }
    },
    { once: true },
  );
}
async function upload(ids, confirmed = false) {
  if (busy) return;
  if (!ids.length) return notice("Select at least one pending clip.");
  if (!client || isDemo())
    return notice(
      "Uploads require a configured account. Your recordings remain on this device.",
    );
  if (!navigator.onLine)
    return notice("You’re offline. Clips remain safely queued on this device.");
  if (
    !confirmed &&
    localStorage.getItem("wifi-only") !== "false" &&
    navigator.connection?.type !== "wifi"
  ) {
    modal(
      '<h2>Ready to upload?</h2><p>This browser cannot confirm a Wi-Fi connection. Uploading video may use mobile data.</p><button class="button primary" id="confirm-upload">Upload now</button><button class="button secondary" id="cancel-upload">Wait for Wi-Fi</button>',
    );
    action("cancel-upload", closeModal);
    action("confirm-upload", () => {
      closeModal();
      upload(ids, true);
    });
    return;
  }
  busy = true;
  render();
  try {
    for (const id of ids) {
      const c = clips.find((c) => c.id === id);
      if (!c || c.status === "uploaded") continue;
      const parts = await db.chunks(id);
      if (!parts.length)
        throw Error(
          "Local video data is missing. This clip cannot be uploaded.",
        );
      c.status = "uploading";
      await db.putClip(c);
      const progress = document.querySelector("#upload-progress");
      if (progress) progress.textContent = `Uploading ${c.name}…`;
      const blob = await playableBlob(parts, c);
      await uploadVideo(client, c, blob, (percent) => {
        const el = document.querySelector("#upload-progress");
        if (el) el.textContent = `Uploading ${c.name} · ${percent}%`;
      });
      c.status = "uploaded";
      await db.putClip(c);
      await db.clearChunks(id);
      selected.delete(id);
    }
    notice(
      "Upload complete. Confirmed local video copies have been cleaned up.",
    );
  } catch (error) {
    notice(
      `Upload paused: ${error.message}. Local footage is retained; retry from the archive.`,
    );
    for (const c of clips.filter((c) => c.status === "uploading")) {
      c.status = "saved";
      await db.putClip(c);
    }
  } finally {
    busy = false;
    await refresh();
  }
}
async function recover() {
  clips = await db.allClips(owner());
  for (const c of clips) {
    if (c.status === "recording" || c.status === "uploading") {
      c.status = c.status === "recording" ? "interrupted" : "saved";
      await db.putClip(c);
    }
  }
  if (client && !isDemo()) {
    const { data, error } = await client
      .from("contributions")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error)
      for (const c of data) {
        const local = clips.find((item) => item.id === c.id);
        if (local && c.cloud_deleted_at) {
          local.cloudRemoved = true;
          await db.putClip(local);
        }
        if (!clips.some((local) => local.id === c.id))
          await db.putClip({
            id: c.id,
            owner: owner(),
            name: c.name,
            created: Date.parse(c.created_at),
            duration: c.duration,
            bytes: c.bytes,
            status: "uploaded",
            cloudRemoved: !!c.cloud_deleted_at,
            gps: c.metadata?.gps || [],
            mime: c.metadata?.mime || "video/webm",
          });
      }
  }
  await refresh();
}
window.addEventListener("beforeunload", (e) => {
  if (active || busy) {
    e.preventDefault();
    e.returnValue = "";
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && active)
    stopRecording("Recording stopped when the app left the foreground.");
});
window.addEventListener("offline", () =>
  notice("Connection lost. Recordings stay on this device."),
);
window.addEventListener("online", () =>
  notice("You’re back online. Open My footage to upload pending clips."),
);
if (client) {
  await connectAuthLinks(client, notice);
  const {
    data: { session },
  } = await client.auth.getSession();
  if (session) {
    user = session.user;
    await recover();
  } else render();
  client.auth.onAuthStateChange((event, session) => {
    if (session && user?.id !== session.user.id) {
      user = session.user;
      page = "home";
      setTimeout(() => recover().catch((e) => notice(e.message)), 0);
    } else if (!session && user && !isDemo()) {
      user = null;
      render();
    }
  });
} else render();

async function playableBlob(parts, clip) {
  const blob = new Blob(parts.map(p => p.blob), { type: clip.mime });
  // Preserve the bytes of legacy uploads so interrupted multipart uploads resume.
  return clip.mime.includes("webm") && clip.timing?.startsWith("v2:")
    ? fixWebmDuration(blob, clip.duration * 1000, { logger: false }) : blob;
}
screen.orientation?.addEventListener("change", () => {
  if (active?.captureStarted) stopRecording("Phone rotated. Clip saved; align the phone before starting another clip.");
});
