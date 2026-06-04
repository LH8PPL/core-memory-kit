#!/usr/bin/env python3
"""
register-crons.py — reads cron/jobs/*.md and registers the active jobs with
the host scheduler (Task Scheduler on Windows, crontab on Unix).

Idempotent: re-running re-registers any missing tasks without disturbing existing ones.

Usage:
  python scripts/register-crons.py [--dry-run] [--unregister NAME]

The task name prefix defaults to the project directory's basename
(slugified). Override with the env var CMK_TASK_PREFIX, e.g.:

  CMK_TASK_PREFIX=ytslide- python scripts/register-crons.py

Job file format (YAML frontmatter):
  ---
  name: Daily Memory Distillation
  time: '23:00'
  days: daily | mon | tue | wed | thu | fri | sat | sun
  active: 'true'
  job_type: timestamp_refresh | shell_command | claude_prompt
  command: 'bash scripts/run-daily-distill.sh'
  working_directory: '${CLAUDE_PROJECT_DIR}'
  ---
  [task body / prompt]
"""

from __future__ import annotations

import argparse
import os
import platform
import re
import subprocess
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print(
        "ERROR: pyyaml not installed. Run: python -m pip install pyyaml",
        file=sys.stderr,
    )
    sys.exit(1)

REPO_ROOT = Path(__file__).resolve().parent.parent
JOBS_DIR = REPO_ROOT / "cron" / "jobs"


def _default_prefix() -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", REPO_ROOT.name.lower()).strip("-")
    return f"{slug}-" if slug else "cmk-"


TASK_NAME_PREFIX = os.environ.get("CMK_TASK_PREFIX", _default_prefix())

DAY_MAP = {
    "daily": "DAILY",
    "mon": "MON",
    "tue": "TUE",
    "wed": "WED",
    "thu": "THU",
    "fri": "FRI",
    "sat": "SAT",
    "sun": "SUN",
}


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def parse_job_file(path: Path) -> dict | None:
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", text, re.DOTALL)
    if not m:
        print(f"WARN: {path.name} has no YAML frontmatter, skipping")
        return None
    front = yaml.safe_load(m.group(1)) or {}
    front["__body__"] = m.group(2).strip()
    front["__source__"] = path.name
    return front


def _windows_bash_path() -> str | None:
    """Find Git Bash on Windows. Task Scheduler runs `cmd /c` with System32
    high on PATH, so a bare `bash` command resolves to Windows' WSL bash
    launcher (which fails if no WSL distro is configured)."""
    candidates = [
        Path(r"C:\Program Files\Git\usr\bin\bash.exe"),
        Path(r"C:\Program Files\Git\bin\bash.exe"),
        Path(r"C:\Program Files (x86)\Git\usr\bin\bash.exe"),
    ]
    for p in candidates:
        if p.exists():
            return str(p)
    return None


def build_task_command(job: dict) -> str | None:
    jt = job.get("job_type")
    wd = job.get("working_directory", "").replace(
        "${CLAUDE_PROJECT_DIR}", str(REPO_ROOT)
    )
    if jt == "shell_command":
        cmd = job.get("command", "")
        if not cmd:
            return None
        if platform.system() == "Windows":
            if cmd.startswith("bash "):
                gitbash = _windows_bash_path()
                if gitbash:
                    cmd = f'"{gitbash}" {cmd[5:]}'
            if wd:
                return f'cmd /c "cd /d "{wd}" && {cmd}"'
            return f'cmd /c "{cmd}"'
        if wd:
            return f'sh -c "cd "{wd}" && {cmd}"'
        return cmd
    if jt == "timestamp_refresh":
        helper = REPO_ROOT / "scripts" / "refresh-distill-timestamp.py"
        py = "python" if platform.system() == "Windows" else "python3"
        return f'{py} "{helper}"'
    if jt == "claude_prompt":
        msg = f"Job {job.get('name')!r} is registered but its body needs Claude CLI to run."
        if platform.system() == "Windows":
            return f'cmd /c "echo {msg}"'
        return f'sh -c "echo {msg}"'
    return None


def register_windows(job: dict, dry_run: bool) -> tuple[bool, str]:
    name = TASK_NAME_PREFIX + slugify(job["name"])
    time = job.get("time", "")
    days = job.get("days", "daily")
    cmd = build_task_command(job)
    if not cmd:
        return False, "no command for this job_type"

    if days == "daily":
        schedule = ["/sc", "daily"]
    elif days in DAY_MAP:
        schedule = ["/sc", "weekly", "/d", DAY_MAP[days]]
    else:
        return False, f"unknown days value: {days!r}"

    args = [
        "schtasks",
        "/create",
        "/tn",
        name,
        "/tr",
        cmd,
        "/st",
        time,
        *schedule,
        "/f",
    ]
    if dry_run:
        return True, "DRY-RUN: " + " ".join(args)
    result = subprocess.run(args, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        return (
            False,
            f"schtasks failed: {result.stderr.strip() or result.stdout.strip()}",
        )
    return True, f"registered as {name}"


def register_unix(job: dict, dry_run: bool) -> tuple[bool, str]:
    name = TASK_NAME_PREFIX + slugify(job["name"])
    time = job.get("time", "")
    days = job.get("days", "daily")
    cmd = build_task_command(job)
    if not cmd:
        return False, "no command for this job_type"

    if not re.match(r"^\d{2}:\d{2}$", time):
        return False, f"bad time format: {time!r}"
    hh, mm = time.split(":")

    if days == "daily":
        day_field = "*"
    elif days in DAY_MAP:
        day_field = {
            "mon": "1",
            "tue": "2",
            "wed": "3",
            "thu": "4",
            "fri": "5",
            "sat": "6",
            "sun": "0",
        }[days]
    else:
        return False, f"unknown days value: {days!r}"

    cron_line = f"{mm} {hh} * * {day_field} {cmd}  # {name}"
    if dry_run:
        return True, "DRY-RUN: would append to crontab: " + cron_line

    existing = subprocess.run(["crontab", "-l"], capture_output=True, text=True).stdout
    if name in existing:
        return True, f"{name} already in crontab"
    new = existing.rstrip() + "\n" + cron_line + "\n"
    proc = subprocess.run(["crontab", "-"], input=new, text=True, capture_output=True)
    if proc.returncode != 0:
        return False, f"crontab failed: {proc.stderr.strip()}"
    return True, f"appended {name}"


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would happen without changing anything",
    )
    p.add_argument(
        "--unregister", help="Remove a task by name (with or without prefix)"
    )
    args = p.parse_args()

    if args.unregister:
        name = (
            args.unregister
            if args.unregister.startswith(TASK_NAME_PREFIX)
            else TASK_NAME_PREFIX + slugify(args.unregister)
        )
        if platform.system() == "Windows":
            r = subprocess.run(
                ["schtasks", "/delete", "/tn", name, "/f"],
                capture_output=True,
                text=True,
            )
            print(r.stdout or r.stderr)
            return r.returncode
        existing = subprocess.run(
            ["crontab", "-l"], capture_output=True, text=True
        ).stdout
        new = (
            "\n".join(line for line in existing.splitlines() if name not in line) + "\n"
        )
        subprocess.run(["crontab", "-"], input=new, text=True)
        print(f"Removed lines matching {name}")
        return 0

    jobs = sorted(JOBS_DIR.glob("*.md"))
    if not jobs:
        print(f"No job files found in {JOBS_DIR}")
        return 0

    print(f"Found {len(jobs)} job file(s) in {JOBS_DIR}")
    print(
        f"Platform: {platform.system()}; using {'schtasks' if platform.system() == 'Windows' else 'crontab'}"
    )
    print(f"Task name prefix: {TASK_NAME_PREFIX}")
    print()

    n_ok = 0
    n_skip = 0
    n_fail = 0
    for path in jobs:
        job = parse_job_file(path)
        if not job:
            continue
        name = job.get("name", "(unnamed)")
        active = str(job.get("active", "")).lower() == "true"
        if not active:
            print(f"SKIP   {name} (active: false)")
            n_skip += 1
            continue
        if platform.system() == "Windows":
            ok, msg = register_windows(job, args.dry_run)
        else:
            ok, msg = register_unix(job, args.dry_run)
        marker = "OK" if ok else "FAIL"
        print(f"{marker:6s} {name}: {msg}")
        if ok:
            n_ok += 1
        else:
            n_fail += 1

    print()
    print(f"Done. registered: {n_ok}, skipped: {n_skip}, failed: {n_fail}")
    return 0 if n_fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
