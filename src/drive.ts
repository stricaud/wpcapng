// Client-side Google Drive integration (no backend): OAuth via Google Identity
// Services, download via the Drive REST API, plus the "Open with" state parser
// and a Google Picker for browsing.

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { google?: any; gapi?: any }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (Array.from(document.scripts).some((s) => s.src === src)) return resolve();
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(el);
  });
}

// Request an OAuth access token via Google Identity Services (implicit flow).
export async function getAccessToken(clientId: string, scope: string): Promise<string> {
  await loadScript("https://accounts.google.com/gsi/client");
  return new Promise((resolve, reject) => {
    const tc = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope,
      callback: (r: any) => (r && r.access_token ? resolve(r.access_token) : reject(new Error(r?.error || "authorization failed"))),
      error_callback: (e: any) => reject(new Error(e?.message || "authorization error")),
    });
    tc.requestAccessToken();
  });
}

// Download a Drive file's name + bytes.
export async function driveDownload(id: string, token: string): Promise<{ name: string; bytes: Uint8Array }> {
  const auth = { Authorization: `Bearer ${token}` };
  const meta = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=name`, { headers: auth });
  if (!meta.ok) throw new Error(`metadata ${meta.status}`);
  const name = (await meta.json()).name || "capture.pcap";
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`, { headers: auth });
  if (!r.ok) throw new Error(`download ${r.status}`);
  return { name, bytes: new Uint8Array(await r.arrayBuffer()) };
}

// Parse Drive's "Open with" ?state= parameter: {action, ids, userId}.
export function parseDriveState(): { action?: string; ids: string[] } | null {
  const s = new URLSearchParams(location.search).get("state");
  if (!s) return null;
  try {
    const o = JSON.parse(s);
    return { action: o.action, ids: Array.isArray(o.ids) ? o.ids : [] };
  } catch {
    return null;
  }
}

// Show the Google Picker; resolves to a file id or null if cancelled.
export async function showPicker(apiKey: string, token: string): Promise<string | null> {
  await loadScript("https://apis.google.com/js/api.js");
  await new Promise<void>((res) => window.gapi.load("picker", () => res()));
  return new Promise((resolve) => {
    const g = window.google;
    const view = new g.picker.DocsView(g.picker.ViewId.DOCS)
      .setMode(g.picker.DocsViewMode.LIST)
      .setMimeTypes("application/vnd.tcpdump.pcap,application/x-pcapng,application/octet-stream,application/cap");
    const picker = new g.picker.PickerBuilder()
      .setOAuthToken(token)
      .setDeveloperKey(apiKey)
      .addView(view)
      .setCallback((d: any) => {
        if (d.action === g.picker.Action.PICKED) resolve(d.docs[0].id);
        else if (d.action === g.picker.Action.CANCEL) resolve(null);
      })
      .build();
    picker.setVisible(true);
  });
}
