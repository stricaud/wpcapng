// Google Drive integration config. Set these to your Google Cloud project's
// OAuth Web client ID and API key (see GOOGLE_DRIVE.md). You can provide them
// at build time (VITE_GOOGLE_CLIENT_ID / VITE_GOOGLE_API_KEY) or at runtime via
// localStorage keys "wpcapng.gClientId" / "wpcapng.gApiKey".
export const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ||
  (typeof localStorage !== "undefined" ? localStorage.getItem("wpcapng.gClientId") : "") ||
  "";

export const GOOGLE_API_KEY =
  (import.meta.env.VITE_GOOGLE_API_KEY as string | undefined) ||
  (typeof localStorage !== "undefined" ? localStorage.getItem("wpcapng.gApiKey") : "") ||
  "";

// Least-privilege scope: only files the user opens with the app.
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
