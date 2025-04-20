#!/usr/bin/env python3
"""stl_render_worker.py – Container‑friendly STL render worker

This version of the worker is refactored for **Google Cloud Run, AWS
Container Run, ECS, Kubernetes Jobs,** or any other environment where the
process should start, do some work, and then exit so the platform can scale it
back to zero.

Key differences to the long‑running version
------------------------------------------
* **Finite lifetime** – the worker exits after an *idle timeout* (no work
  found) or after processing a *batch size* of tasks.  Both values are
  configurable via environment variables so you can tune the trade‑off between
  cold‑starts and resource usage.
* **Graceful shutdown** – listens for SIGTERM/SIGINT so Cloud Run’s
  10‑second grace period is honoured.
* **All tunables are environment variables** – making it natural to override
  them at deploy time without rebuilding the image.
* **Structured logs** – uses `logging` so Cloud‑native log analysers can parse
  timestamps and severity levels.

To deploy on Cloud Run:
-----------------------
1.  Build & push the container (see *Dockerfile* at the bottom of this file).
2.  `gcloud run deploy stl-worker \`  
    `  --image gcr.io/PROJECT_ID/stl-worker:latest \`  
    `  --memory 512Mi --cpu 1 --min-instances 0 --max-instances 5 \`  
    `  --set-env-vars DATABASE_URL=…`  
    (plus any of the tunables below).
3.  Trigger the job ad‑hoc (`gcloud run jobs run stl-worker`), on a schedule
    (via Cloud Scheduler → Pub/Sub), or by letting a controller retry failed
    messages.

Environment variables
---------------------
| Variable                | Default | Meaning |
|-------------------------|---------|---------|
| `TARGET_SKU`            | PER-KEY3D-STY3-Y3D | Only process tasks for this SKU |
| `MAX_RETRIES`           | 3       | Max failed renders before the task is marked `failed` |
| `BATCH_LIMIT`           | 20      | Max tasks to process in one container invocation |
| `IDLE_TIMEOUT_SEC`      | 30      | Exit if idle (no tasks) for this many seconds |
| `OPENSCAD_PATH`         | /usr/bin/openscad | Path to the OpenSCAD binary |
| `SCAD_TEMPLATE_PATH`    | ../../openscad/DualColour.scad | Template SCAD file |
| `STL_OUTPUT_DIR_ABS`    | ../../public/stl | Absolute path for STL files |
| `STL_OUTPUT_DIR_RELATIVE` | public/stl | Relative path stored in DB |

"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import shlex
import signal
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from prisma import Prisma  # type: ignore[import-not-found]
from prisma.models import PrintOrderTask
from prisma.enums import PrintTaskStatus, StlRenderStatus

###############################################################################
# Configuration
###############################################################################

@dataclass(slots=True, frozen=True)
class Settings:
    target_sku: str = os.getenv("TARGET_SKU", "PER-KEY3D-STY3-Y3D")
    max_retries: int = int(os.getenv("MAX_RETRIES", 3))

    batch_limit: int = int(os.getenv("BATCH_LIMIT", 20))
    idle_timeout_sec: int = int(os.getenv("IDLE_TIMEOUT_SEC", 30))

    openscad_path: Path = Path(os.getenv("OPENSCAD_PATH", "/usr/bin/openscad"))
    scad_template_path: Path = Path(
        os.getenv(
            "SCAD_TEMPLATE_PATH",
            (Path(__file__).parent / "../../openscad/DualColour.scad").resolve(),
        )
    )
    stl_output_dir_abs: Path = Path(
        os.getenv("STL_OUTPUT_DIR_ABS", (Path(__file__).parent / "../../public/stl").resolve())
    )
    stl_output_dir_relative: str = os.getenv("STL_OUTPUT_DIR_RELATIVE", "public/stl")


SETTINGS = Settings()

###############################################################################
# Logging setup – emits RFC 3339 timestamps recognised by Cloud Run
###############################################################################

logging.basicConfig(
    stream=os.getenv("LOG_STREAM", "stderr"),
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)sZ %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    force=True,
)
log = logging.getLogger("stl-worker")
log.debug("Loaded settings: %s", SETTINGS)

###############################################################################
# Helpers
###############################################################################

_slug_re = re.compile(r"[^a-z0-9-_]+")


def slug(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"\s+", "_", text)
    text = _slug_re.sub("", text)
    text = re.sub(r"[_-]{2,}", "_", text).strip("-_")
    return text or "untitled"


async def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


###############################################################################
# Database
###############################################################################

prisma = Prisma()


async def reserve_task() -> Optional[PrintOrderTask]:
    async with prisma.tx() as tx:
        task = await tx.printorder_task.find_first(
            where={
                "status": PrintTaskStatus.pending,
                "stl_render_state": StlRenderStatus.pending,
                "product": {"sku": SETTINGS.target_sku},
            },
            order={"created_at": "asc"},
        )
        if not task:
            return None
        await tx.printorder_task.update(
            where={"id": task.id},
            data={
                "status": PrintTaskStatus.in_progress,
                "stl_render_state": StlRenderStatus.running,
            },
        )
        return task


###############################################################################
# Render logic
###############################################################################

async def process_task(task: PrintOrderTask) -> None:
    tid = task.id
    try:
        await ensure_dir(SETTINGS.stl_output_dir_abs)

        # split custom text into ≤3 lines
        expanded: list[str] = []
        for part in (task.custom_text or "").splitlines():
            expanded.extend(re.split(r"[/\\]", part))
        l1, l2, l3 = (ln.strip() for ln in (expanded + ["", "", ""])[:3])

        col1 = task.color_1 or "Black"
        col2 = task.color_2 or "White"

        fn_safe = slug(l1 or f"task_{tid}")
        filename = f"task_{tid}_{fn_safe}.stl"
        out_abs = SETTINGS.stl_output_dir_abs / filename
        out_rel = f"{SETTINGS.stl_output_dir_relative}/{filename}"

        def esc(s: str) -> str:  # escape for shell
            return s.replace("\"", r"\\\"")

        cmd = [
            str(SETTINGS.openscad_path),
            "-o",
            str(out_abs),
            str(SETTINGS.scad_template_path),
            "-D",
            f"text_line1=\"{esc(l1)}\"",
            "-D",
            f"text_line2=\"{esc(l2)}\"",
            "-D",
            f"text_line3=\"{esc(l3)}\"",
            "-D",
            f"color1=\"{esc(col1)}\"",
            "-D",
            f"color2=\"{esc(col2)}\"",
        ]
        command = " ".join(shlex.quote(p) for p in cmd)
        log.info("[%s] Exec %s", tid, command)

        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout_b, stderr_b = await proc.communicate()
        if stdout_b:
            log.debug("[%s] stdout: %s", tid, stdout_b.decode())
        if stderr_b:
            log.warning("[%s] stderr: %s", tid, stderr_b.decode())
        if proc.returncode != 0:
            raise RuntimeError(f"OpenSCAD exit {proc.returncode}")

        await prisma.printorder_task.update(
            where={"id": tid},
            data={
                "stl_path": out_rel,
                "stl_render_state": StlRenderStatus.completed,
                "annotation": None,
                "render_retries": 0,
                "status": PrintTaskStatus.completed,
            },
        )
        log.info("[%s] Success → %s", tid, out_rel)

    except Exception as exc:
        retries = task.render_retries + 1
        fatal = retries >= SETTINGS.max_retries
        await prisma.printorder_task.update(
            where={"id": tid},
            data={
                "render_retries": retries,
                "stl_render_state": StlRenderStatus.failed if fatal else StlRenderStatus.pending,
                "status": PrintTaskStatus.completed if fatal else PrintTaskStatus.pending,
                "annotation": f"STL render error ({retries}/{SETTINGS.max_retries}): {str(exc)[:1000]}",
            },
        )
        log.error("[%s] Failed (%s/%s): %s", tid, retries, SETTINGS.max_retries, exc)

###############################################################################
# Worker loop with idle‑exit and graceful shutdown
###############################################################################

_shutdown = asyncio.Event()


def _handle_sig(signum, frame):  # noqa: D401 – simple handler
    _shutdown.set()


signal.signal(signal.SIGTERM, _handle_sig)
signal.signal(signal.SIGINT, _handle_sig)


async def worker() -> None:
    await prisma.connect()
    processed = 0
    idle_since: Optional[float] = None
    try:
        while not _shutdown.is_set():
            task = await reserve_task()
            if task:
                idle_since = None  # reset idle timer
                await process_task(task)
                processed += 1
                if processed >= SETTINGS.batch_limit:
                    log.info("Batch limit %s reached – exiting", SETTINGS.batch_limit)
                    break
            else:
                now = asyncio.get_event_loop().time()
                idle_since = idle_since or now
                idle_duration = now - idle_since
                if idle_duration >= SETTINGS.idle_timeout_sec:
                    log.info("Idle for %.1fs – exiting", idle_duration)
                    break
                await asyncio.wait({ _shutdown.wait() }, timeout=1)
    finally:
        await prisma.disconnect()


if __name__ == "__main__":
    try:
        asyncio.run(worker())
    except Exception as e:  # pylint:disable=broad-except
        log.exception("Fatal error: %s", e)
        raise

###############################################################################
# Dockerfile – minimal container image
###############################################################################
# syntax=docker/dockerfile:1
# ----------------------------------
# FROM python:3.11-slim
# WORKDIR /app
# COPY . /app
# RUN pip install --no-cache-dir -r requirements.txt && \
#     prisma generate
# ENV PYTHONUNBUFFERED=1
# CMD ["python", "stl_render_worker.py"]
###############################################################################
