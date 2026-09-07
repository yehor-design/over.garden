"""The Wikidata query service answers 429 and 500 on a long serial run.

Until 2026-09-07 the first one ended the whole crosswalk: production held 29
identifiers on 114,669 nodes because every attempt died early, and the job's
`last_error` said only `transient_handler_error`. These hold the retry to what
it must do — wait when the service says later, give up when it says no, and
never sit on a `Retry-After` longer than the cap.
"""

from __future__ import annotations

import urllib.error

import pytest

from app import wikidata_crosswalk as crosswalk


class _Answer:
    def __init__(self, payload: str) -> None:
        self._payload = payload

    def read(self) -> bytes:
        return self._payload.encode("utf8")

    def __enter__(self) -> "_Answer":
        return self

    def __exit__(self, *_args: object) -> None:
        return None


def _http_error(code: int, headers: dict[str, str] | None = None) -> urllib.error.HTTPError:
    return urllib.error.HTTPError("https://query.wikidata.org/sparql", code, "nope", headers or {}, None)  # type: ignore[arg-type]


def test_a_rate_limit_is_waited_out_rather_than_ending_the_run(monkeypatch) -> None:
    receipt = crosswalk.WikidataCrosswalkReceipt()
    waits: list[float] = []
    answers = [_http_error(429, {"Retry-After": "2"}), _Answer('{"ok": true}')]

    def fake_urlopen(_request, timeout=None):  # noqa: ANN001, ARG001
        answer = answers.pop(0)
        if isinstance(answer, urllib.error.HTTPError):
            raise answer
        return answer

    monkeypatch.setattr(crosswalk.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(crosswalk.time, "sleep", lambda seconds: waits.append(seconds))

    assert crosswalk.fetch_json("https://query.wikidata.org/sparql", receipt=receipt) == {"ok": True}
    assert receipt.upstream_retries == 1
    # The service asked for two seconds, so two seconds is what it waits.
    assert 2.0 in waits


def test_a_refusal_that_means_no_is_not_retried(monkeypatch) -> None:
    receipt = crosswalk.WikidataCrosswalkReceipt()
    calls = {"n": 0}

    def fake_urlopen(_request, timeout=None):  # noqa: ANN001, ARG001
        calls["n"] += 1
        raise _http_error(400)

    monkeypatch.setattr(crosswalk.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(crosswalk.time, "sleep", lambda _seconds: None)

    with pytest.raises(urllib.error.HTTPError):
        crosswalk.fetch_json("https://query.wikidata.org/sparql", receipt=receipt)
    assert calls["n"] == 1
    assert receipt.upstream_retries == 0


def test_a_service_that_never_recovers_still_gives_up(monkeypatch) -> None:
    receipt = crosswalk.WikidataCrosswalkReceipt()

    def fake_urlopen(_request, timeout=None):  # noqa: ANN001, ARG001
        raise _http_error(503)

    monkeypatch.setattr(crosswalk.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(crosswalk.time, "sleep", lambda _seconds: None)

    with pytest.raises(urllib.error.HTTPError):
        crosswalk.fetch_json("https://query.wikidata.org/sparql", receipt=receipt)
    assert receipt.upstream_retries == crosswalk.MAX_REQUEST_ATTEMPTS - 1


def test_a_wait_is_capped_however_long_the_service_asks(monkeypatch) -> None:
    receipt = crosswalk.WikidataCrosswalkReceipt()
    waits: list[float] = []
    answers = [_http_error(429, {"Retry-After": "86400"}), _Answer('{"ok": true}')]

    def fake_urlopen(_request, timeout=None):  # noqa: ANN001, ARG001
        answer = answers.pop(0)
        if isinstance(answer, urllib.error.HTTPError):
            raise answer
        return answer

    monkeypatch.setattr(crosswalk.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(crosswalk.time, "sleep", lambda seconds: waits.append(seconds))

    crosswalk.fetch_json("https://query.wikidata.org/sparql", receipt=receipt)
    assert max(waits) <= crosswalk.MAX_RETRY_WAIT_SECONDS
