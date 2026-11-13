#!/usr/bin/env python3
"""Sync history for the node status page.

Reads the znnd logs and writes a small JSON file with periods in which the
node was out of sync, stalled or restarting. Nothing else from the logs is
published: only start, end, type and duration.

znnd logs a pillar event line every ~10 s ("do not process current event"),
with reason "sync is not done" while it is behind. That line is used as a
heartbeat:
  - heartbeat says "sync is not done"  -> out_of_sync
  - no heartbeat for a while           -> stalled (or restart, if znnd was
                                           stopped in that gap)

Usage: sync-history.py <log dir> <output json> [days]
Run it every few minutes from cron as the user that owns the logs.
"""
import glob, json, os, re, subprocess, sys, tempfile
from datetime import datetime, timedelta, timezone

LOG_DIR, OUT = sys.argv[1], sys.argv[2]
DAYS = int(sys.argv[3]) if len(sys.argv) > 3 else 7
HEARTBEAT = "do not process current event"
NOT_SYNCED = 'reason="sync is not done"'
STOPPING = "Stopping znnd"
GAP = 30          # seconds without heartbeat before it counts as a stall
MERGE = 30        # merge periods of the same type closer together than this
MIN_LEN = 20      # ignore periods shorter than this

now = datetime.now(timezone.utc)
since = now - timedelta(days=DAYS)
ts_re = re.compile(r"^t=(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d{4})")

files = [f for f in glob.glob(os.path.join(LOG_DIR, "zenon*.log"))
         if datetime.fromtimestamp(os.path.getmtime(f), timezone.utc) >= since]
lines = []
if files:
    out = subprocess.run(["grep", "-h", "-F", "-e", HEARTBEAT, "-e", STOPPING, *files],
                         capture_output=True, text=True).stdout
    for line in out.splitlines():
        m = ts_re.match(line)
        if not m:
            continue
        t = datetime.strptime(m.group(1), "%Y-%m-%dT%H:%M:%S%z")
        if t < since:
            continue
        kind = "stop" if STOPPING in line else ("behind" if NOT_SYNCED in line else "ok")
        lines.append((t, kind))
lines.sort()

periods = []  # [type, start, end]
def add(kind, start, end):
    if periods and periods[-1][0] == kind and (start - periods[-1][2]).total_seconds() <= MERGE:
        periods[-1][2] = max(periods[-1][2], end)
    else:
        periods.append([kind, start, end])

prev = None
stopped = False
for t, kind in lines:
    if kind == "stop":
        stopped = True
        continue
    if prev is not None and (t - prev).total_seconds() > GAP:
        add("restart" if stopped else "stalled", prev, t)
    stopped = False
    if kind == "behind":
        add("out_of_sync", t, t + timedelta(seconds=10))
    prev = t

ongoing = None
if prev is not None and (now - prev).total_seconds() > GAP * 2:
    ongoing = ["restart" if stopped else "stalled", prev, None]

events = []
for kind, start, end in periods:
    secs = int((end - start).total_seconds())
    if secs >= MIN_LEN:
        events.append({"type": kind, "start": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                       "end": end.strftime("%Y-%m-%dT%H:%M:%SZ"), "seconds": secs})
if ongoing:
    events.append({"type": ongoing[0], "start": ongoing[1].strftime("%Y-%m-%dT%H:%M:%SZ"),
                   "end": None, "seconds": int((now - ongoing[1]).total_seconds())})
events.reverse()  # newest first

data = {"updated": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "days": DAYS, "events": events[:50]}
fd, tmp = tempfile.mkstemp(dir=os.path.dirname(OUT) or ".")
with os.fdopen(fd, "w") as f:
    json.dump(data, f, separators=(",", ":"))
os.chmod(tmp, 0o644)
os.replace(tmp, OUT)
