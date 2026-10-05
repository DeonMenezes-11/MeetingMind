#!/usr/bin/env python3
"""Capture screenshots of the running web app for the README and the lab write-up.

Uses headless Chrome over the DevTools protocol (websocket-client), so pages are fully
rendered (fonts, data, charts) before each capture. The server must be running:

    python3 server.py &
    python3 scripts/capture_screenshots.py                 # light theme -> results/screenshots/
    python3 scripts/capture_screenshots.py --theme dark --only 01_overview --suffix _dark
    python3 scripts/capture_screenshots.py --job <job_id>  # also capture a live processing page

"Ask the meeting" is populated by asking three demo questions through the real API first
(a fraction of a cent); the answers are also saved to results/ask_examples.json.
"""
from __future__ import annotations

import argparse
import base64
import json
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

import websocket

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "results" / "screenshots"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
RUN = "sample"
DEMO_QUESTIONS = [
    "What is Priya responsible for, and by when?",
    "When is the code freeze?",
    "Who won the cricket world cup in 2011?",
]
# name, path, max height (px at 1440 wide)
SHOTS = [
    ("00_home", "/", 1180),
    ("01_overview", f"/m/{RUN}/overview", 1320),
    ("02_transcript", f"/m/{RUN}/transcript", 1000),
    ("03_action_items", f"/m/{RUN}/actions", 1000),
    ("04_ask", f"/m/{RUN}/ask", 1180),
    ("05_emails", f"/m/{RUN}/emails", 940),
    ("06_analytics", f"/m/{RUN}/analytics", 1280),
    ("07_new_meeting", "/new", 980),
    ("08_about", "/about", 1900),
]


class CDP:
    def __init__(self, ws_url: str):
        self.ws = websocket.create_connection(ws_url, timeout=60, suppress_origin=True)
        self.n = 0

    def call(self, method: str, **params):
        self.n += 1
        self.ws.send(json.dumps({"id": self.n, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.n:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})

    def js(self, expr: str):
        r = self.call("Runtime.evaluate", expression=expr, awaitPromise=True, returnByValue=True)
        return r.get("result", {}).get("value")


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def post_json(url: str, body: dict) -> dict:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def demo_chat(base: str) -> list[dict]:
    cache = ROOT / "results" / "ask_examples.json"
    if cache.exists():
        return json.loads(cache.read_text())
    turns = []
    for i, q in enumerate(DEMO_QUESTIONS):
        res = post_json(f"{base}/api/runs/{RUN}/ask", {"question": q})
        turns.append({"id": f"demo{i}", "question": q, "result": res})
    cache.write_text(json.dumps(turns, indent=2, ensure_ascii=False))
    return turns


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8531")
    ap.add_argument("--theme", default="light", choices=["light", "dark"])
    ap.add_argument("--only", nargs="*", help="shot names to capture (default: all)")
    ap.add_argument("--suffix", default="")
    ap.add_argument("--job", help="job id to capture as 09_processing")
    ap.add_argument("--scale", type=float, default=2.0, help="device pixel ratio")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    shots = [s for s in SHOTS if not args.only or s[0] in args.only]
    if args.job:
        shots.append(("09_processing", f"/jobs/{args.job}", 1060))
    chat = demo_chat(args.base) if any(s[0] == "04_ask" for s in shots) else []

    port = free_port()
    profile = Path(tempfile.mkdtemp(prefix="mm_shots_"))
    chrome = subprocess.Popen(
        [CHROME, "--headless=new", f"--remote-debugging-port={port}", f"--user-data-dir={profile}",
         "--hide-scrollbars", "--disable-gpu", "--no-first-run", "--window-size=1440,900", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/json") as r:
                    pages = [p for p in json.loads(r.read()) if p.get("type") == "page"]
                if pages:
                    break
            except OSError:
                pass
            time.sleep(0.2)
        cdp = CDP(pages[0]["webSocketDebuggerUrl"])
        cdp.call("Page.enable")
        cdp.call("Emulation.setEmulatedMedia", features=[{"name": "prefers-color-scheme", "value": args.theme}])
        cdp.call("Emulation.setDeviceMetricsOverride", width=1440, height=900, deviceScaleFactor=args.scale, mobile=False)

        # seed per-browser state: theme + the demo chat
        cdp.call("Page.navigate", url=args.base + "/about")
        time.sleep(1.5)
        cdp.js(f"localStorage.setItem('mm-theme', {json.dumps(args.theme)});"
               f"localStorage.setItem('mm-chat-{RUN}', {json.dumps(json.dumps(chat))}); true")

        for name, path, max_h in shots:
            cdp.call("Emulation.setDeviceMetricsOverride", width=1440, height=900, deviceScaleFactor=args.scale, mobile=False)
            cdp.call("Page.navigate", url=args.base + path)
            time.sleep(2.2)
            cdp.js("document.fonts.ready.then(() => true)")
            cdp.js("window.scrollTo(0, 0); true")
            height = int(cdp.js("document.documentElement.scrollHeight") or 900)
            h = max(900, min(max_h, height))
            cdp.call("Emulation.setDeviceMetricsOverride", width=1440, height=h, deviceScaleFactor=args.scale, mobile=False)
            time.sleep(0.8)
            cdp.js("window.scrollTo(0, 0); true")
            png = base64.b64decode(cdp.call("Page.captureScreenshot", format="png")["data"])
            dest = OUT / f"{name}{args.suffix}.png"
            dest.write_bytes(png)
            print(f"  {dest.relative_to(ROOT)}  ({h}px)")
    finally:
        chrome.terminate()
        try:
            chrome.wait(5)
        except subprocess.TimeoutExpired:
            chrome.kill()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    main()
