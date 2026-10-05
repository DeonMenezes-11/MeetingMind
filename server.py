#!/usr/bin/env python3
"""Start the MeetingMind web app (FastAPI API + the React front end in web/dist).

    python3 server.py                 # http://127.0.0.1:8531
    python3 server.py --port 9000 --open
    python3 server.py --host 0.0.0.0  # listen on the network (e.g. inside Docker)
"""
from __future__ import annotations

import argparse
import threading
import webbrowser

import uvicorn

from meetingmind.webapi import WEB_DIST, create_app


def main() -> None:
    ap = argparse.ArgumentParser(description="MeetingMind web server")
    ap.add_argument("--host", default="127.0.0.1", help="interface to bind (default 127.0.0.1 = this machine only)")
    ap.add_argument("--port", type=int, default=8531)
    ap.add_argument("--open", action="store_true", help="open the site in the default browser")
    args = ap.parse_args()

    url = f"http://{'localhost' if args.host in ('127.0.0.1', '0.0.0.0') else args.host}:{args.port}"
    print(f"\n  MeetingMind  ->  {url}")
    if not (WEB_DIST / "index.html").exists():
        print("  (front end not built yet: npm --prefix web install && npm --prefix web run build)")
    print()
    if args.open:
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    uvicorn.run(create_app(), host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
