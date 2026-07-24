// Small shared helpers.

export function download(filename: string, data: Uint8Array | string, mime = "application/octet-stream") {
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const latin1 = new TextDecoder("latin1");

// Bytes → printable text (non-printable shown as ".").
export function toText(bytes: Uint8Array): string {
  const s = latin1.decode(bytes);
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += c === 0x0a || c === 0x0d || c === 0x09 || (c >= 0x20 && c < 0x7f) ? s[i] : ".";
  }
  return out;
}

// Bytes → classic hex dump lines.
export function toHexDump(bytes: Uint8Array): string {
  const lines: string[] = [];
  for (let off = 0; off < bytes.length; off += 16) {
    const slice = bytes.subarray(off, off + 16);
    let hex = "";
    let asc = "";
    for (let i = 0; i < 16; i++) {
      if (i < slice.length) {
        hex += slice[i].toString(16).padStart(2, "0") + " ";
        const c = slice[i];
        asc += c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : ".";
      } else {
        hex += "   ";
      }
      if (i === 7) hex += " ";
    }
    lines.push(`${off.toString(16).padStart(6, "0")}  ${hex} ${asc}`);
  }
  return lines.join("\n");
}

// Prompt the user to pick a file and return its text.
export function pickTextFile(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      f.text().then(resolve).catch(() => resolve(null));
    };
    input.click();
  });
}

// Make a filesystem-safe, unique object name (mirrors carscal's safe_name).
export function safeName(filename: string, frame: number, i: number): string {
  const base = (filename.split(/[/\\]/).pop() ?? "").trim() || `frame-${frame}`;
  const cleaned = base.replace(/[^A-Za-z0-9.\-_]/g, "_");
  return `${String(i).padStart(3, "0")}_${cleaned}`;
}
