# wpcapng — Wireshark for the web

Open, dissect and analyse `.pcap` / `.pcapng` capture files entirely in your
**web browser**. No install, no server, **nothing is uploaded** — the file is
parsed in-memory by [libpcapng](https://github.com/stricaud/libpcapng) compiled
to WebAssembly.

- **Packet list** with Wireshark-style summary columns and protocol coloring
- **Detail tree** — full protocol dissection with field abbrevs
- **Hex view** with byte highlighting synced to the selected field
- **Custom dissectors** — add your own declarative (posa) decoders at runtime;
  they persist in your browser (localStorage)
- Reads both classic `.pcap` and `.pcapng`

> No live capture (a browser can't sniff the wire) — this is for analysing
> saved captures, which is what libpcapng's OS-independent dissection engine
> does.

## Architecture

```
.pcap / .pcapng  ──►  libpcapng (C) → WebAssembly  ──►  React UI
   (in browser)          bindings/js, no capture.c        3-pane view
```

The WASM engine is the [`bindings/js`](https://github.com/stricaud/libpcapng/tree/main/bindings/js)
build of libpcapng.

## Develop

```sh
# 1. Build the WASM engine from a sibling libpcapng checkout (../libpcapng),
#    a submodule (./libpcapng), or $LIBPCAPNG_DIR. Needs Emscripten.
npm run sync-wasm

# 2. Install and run
npm install
npm run dev
```

Then open the printed URL and load a capture.

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` builds the WASM bindings and the site and
publishes to Pages on every push to `main`. It expects libpcapng as a git
submodule so CI can build the engine:

```sh
git submodule add https://github.com/stricaud/libpcapng.git libpcapng
git commit -m "Add libpcapng submodule"
```

Enable **Settings → Pages → Source: GitHub Actions**. The site is served at
`https://<user>.github.io/<repo>/` (Vite's `base` is set from the repo name in
CI; override locally with `BASE_PATH`).

## Roadmap

- [ ] Real Wireshark-style display filters (`tcp.port == 443`) — needs the
      libpcapng filter engine exposed through the JS bindings
- [ ] Statistics (protocol hierarchy, conversations, endpoints, IO graph)
- [ ] Follow TCP/UDP/TLS stream
- [ ] Export displayed/selected packets
- [ ] Virtualised packet list for very large captures
