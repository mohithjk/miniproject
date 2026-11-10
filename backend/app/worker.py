"""Continuous background worker loop executing queued jobs with SKIP LOCKED."""
import asyncio
import logging
import signal

from app.db import AsyncSessionLocal
from app.services.jobs import run_worker_once

logger = logging.getLogger("coordinator_worker")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


async def main():
    logger.info("Starting background worker loop...")
    running = True

    def handle_stop(sig, frame):
        nonlocal running
        logger.info(f"Received shutdown signal {sig}, terminating worker loop...")
        running = False

    signal.signal(signal.SIGINT, handle_stop)
    signal.signal(signal.SIGTERM, handle_stop)

    while running:
        try:
            async with AsyncSessionLocal() as db:
                job = await run_worker_once(db)
                if not job:
                    # Queue is empty, sleep briefly before polling
                    await asyncio.sleep(1.0)
        except Exception as exc:
            logger.error(f"Worker exception: {exc}")
            await asyncio.sleep(2.0)

    logger.info("Worker gracefully stopped.")


if __name__ == "__main__":
    asyncio.run(main())
