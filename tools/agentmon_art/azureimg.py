"""Azure OpenAI `gpt-image-2` client with disk caching, retries and concurrency."""

from __future__ import annotations

import base64
import hashlib
import json
import os
import random
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Sequence

import requests

API_VERSION = "2025-04-01-preview"
DEFAULT_ENDPOINT = "https://prisa-demo-comic-resource.cognitiveservices.azure.com"
DEFAULT_DEPLOYMENT = "gpt-image-2-1"


@dataclass
class ImageRequest:
    """One art asset to generate."""

    key: str
    prompt: str
    size: str = "1024x1024"
    quality: str = "medium"
    n: int = 1
    meta: dict = field(default_factory=dict)


class AzureImageClient:
    def __init__(
        self,
        endpoint: str | None = None,
        deployment: str | None = None,
        api_key: str | None = None,
        cache_dir: str | Path = "tools/.cache/images",
        max_workers: int = 3,
    ) -> None:
        self.endpoint = (endpoint or os.environ.get("AGENTMON_IMAGE_ENDPOINT") or DEFAULT_ENDPOINT).rstrip("/")
        self.deployment = deployment or os.environ.get("AGENTMON_IMAGE_DEPLOYMENT") or DEFAULT_DEPLOYMENT
        self.api_key = api_key or os.environ.get("AGENTMON_IMAGE_KEY") or ""
        if not self.api_key:
            raise RuntimeError("Set AGENTMON_IMAGE_KEY (Azure AI Services key) before generating art.")
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.max_workers = max_workers
        self._lock = threading.Lock()
        self._done = 0

    # ------------------------------------------------------------------ cache
    def _cache_path(self, req: ImageRequest) -> Path:
        digest = hashlib.sha256(
            json.dumps(
                {"p": req.prompt, "s": req.size, "q": req.quality, "d": self.deployment},
                sort_keys=True,
            ).encode("utf-8")
        ).hexdigest()[:20]
        return self.cache_dir / f"{req.key}.{digest}.png"

    def cached(self, req: ImageRequest) -> Path | None:
        p = self._cache_path(req)
        return p if p.exists() and p.stat().st_size > 1024 else None

    # ----------------------------------------------------------------- single
    def generate(self, req: ImageRequest, force: bool = False) -> Path:
        out = self._cache_path(req)
        if out.exists() and not force and out.stat().st_size > 1024:
            return out

        url = f"{self.endpoint}/openai/deployments/{self.deployment}/images/generations?api-version={API_VERSION}"
        payload = {"prompt": req.prompt, "size": req.size, "n": req.n, "quality": req.quality}
        headers = {"api-key": self.api_key, "Content-Type": "application/json"}

        last_err: Exception | None = None
        for attempt in range(6):
            try:
                resp = requests.post(url, headers=headers, json=payload, timeout=420)
                if resp.status_code == 429:
                    wait = float(resp.headers.get("retry-after", 0) or (4 * (attempt + 1)))
                    time.sleep(wait + random.uniform(0, 2.0))
                    continue
                if resp.status_code >= 500:
                    time.sleep(3 * (attempt + 1) + random.uniform(0, 2.0))
                    continue
                resp.raise_for_status()
                data = resp.json()["data"][0]
                if data.get("b64_json"):
                    blob = base64.b64decode(data["b64_json"])
                else:
                    blob = requests.get(data["url"], timeout=180).content
                out.write_bytes(blob)
                return out
            except Exception as exc:  # noqa: BLE001 - retry any transport error
                last_err = exc
                time.sleep(3 * (attempt + 1) + random.uniform(0, 2.0))
        raise RuntimeError(f"Failed to generate '{req.key}': {last_err}")

    # ------------------------------------------------------------------ batch
    def generate_many(
        self,
        reqs: Sequence[ImageRequest],
        force: bool = False,
        on_done: Callable[[ImageRequest, Path], None] | None = None,
    ) -> dict[str, Path]:
        results: dict[str, Path] = {}
        total = len(reqs)

        def work(req: ImageRequest) -> tuple[str, Path | None]:
            try:
                path = self.generate(req, force=force)
            except Exception as exc:  # noqa: BLE001
                print(f"  !! {req.key}: {exc}", flush=True)
                return req.key, None
            with self._lock:
                self._done += 1
                print(f"  [{self._done}/{total}] {req.key}", flush=True)
            if on_done:
                try:
                    on_done(req, path)
                except Exception as exc:  # noqa: BLE001
                    print(f"  !! post-process {req.key}: {exc}", flush=True)
            return req.key, path

        self._done = 0
        with ThreadPoolExecutor(max_workers=self.max_workers) as pool:
            for key, path in pool.map(work, reqs):
                if path is not None:
                    results[key] = path
        return results
