#!/usr/bin/env python3
"""Clean-context browser paint smoke test against the local mock application.

This is a renderability and diagnostics guard, not a Lighthouse score or a
production performance benchmark. It deliberately applies no timing budget.
"""

import datetime
import json
import os
import sys
from urllib.parse import urlencode

from playwright.sync_api import sync_playwright

BASE = os.environ.get("E2E_BASE", "http://127.0.0.1:8765").rstrip("/")
API = BASE + "/api"
URL = BASE + "/?" + urlencode({"api": API})

PAINT_PROBE = r"""
(() => {
  const metrics = {
    lcpMs: null,
    cls: 0,
    longTaskCount: 0,
    longTaskTotalDurationMs: 0,
    longTaskMaxDurationMs: 0,
    observerSupport: {}
  };

  const observe = (type, callback) => {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) callback(entry);
      });
      observer.observe({ type, buffered: true });
      metrics.observerSupport[type] = true;
    } catch (_) {
      metrics.observerSupport[type] = false;
    }
  };

  observe("largest-contentful-paint", (entry) => {
    metrics.lcpMs = entry.startTime;
  });
  observe("layout-shift", (entry) => {
    if (!entry.hadRecentInput) metrics.cls += entry.value;
  });
  observe("longtask", (entry) => {
    metrics.longTaskCount += 1;
    metrics.longTaskTotalDurationMs += entry.duration;
    metrics.longTaskMaxDurationMs = Math.max(metrics.longTaskMaxDurationMs, entry.duration);
  });

  window.__cvPaintProbe = metrics;
})();
"""


def rounded(value):
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return round(number, 2) if number >= 0 else None


def write_report(report):
    destination = os.environ.get("CV_BROWSER_PAINT_REPORT", "").strip()
    if not destination:
        return
    parent = os.path.dirname(destination)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(destination, "w", encoding="utf-8") as output:
        json.dump(report, output, indent=2, ensure_ascii=False)
        output.write("\n")


def main():
    report = {
        "schemaVersion": 1,
        "capturedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "status": "failed",
        "scope": "local-mock-clean-browser-context",
        "targetOrigin": BASE,
        "journey": "anonymous first render at 390x800 CSS pixels",
        "environment": {
            "browser": "Playwright Chromium",
            "viewport": {"width": 390, "height": 800},
            "deviceScaleFactor": 1,
            "serviceWorkers": "blocked for an uncontaminated initial-document smoke",
            "storageState": "fresh browser context; no saved cookies or storage state supplied",
        },
        "interpretation": (
            "Renderability and diagnostic smoke only. No timing budgets are applied. "
            "This local mock result is not a Lighthouse score, staging measurement, "
            "real Apps Script/Sheets latency, or production SLO."
        ),
        "checks": {},
        "metrics": {},
        "browserErrors": [],
    }
    failure = None

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        context = browser.new_context(
            viewport={"width": 390, "height": 800},
            device_scale_factor=1,
            color_scheme="light",
            service_workers="block",
        )
        page = context.new_page()
        page.add_init_script(PAINT_PROBE)
        page.on("pageerror", lambda error: report["browserErrors"].append(str(error)))

        response_status = None
        login_heading_visible = False
        login_form_visible = False

        try:
            response = page.goto(URL, wait_until="load", timeout=30000)
            response_status = response.status if response is not None else None
            page.locator("#loginTitle").wait_for(state="visible", timeout=10000)
            page.locator("#loginForm").wait_for(state="visible", timeout=10000)
            login_heading_visible = page.locator("#loginTitle").is_visible()
            login_form_visible = page.locator("#loginForm").is_visible()
            page.evaluate(
                "() => new Promise((resolve) => requestAnimationFrame(() => "
                "requestAnimationFrame(resolve)))"
            )
            metrics = page.evaluate(
                """() => {
                  const navigation = performance.getEntriesByType('navigation')[0];
                  const paints = performance.getEntriesByType('paint');
                  const fcp = paints.find((entry) => entry.name === 'first-contentful-paint');
                  const resources = performance.getEntriesByType('resource').filter((entry) => {
                    try {
                      return new URL(entry.name, location.href).origin === location.origin;
                    } catch (_) {
                      return false;
                    }
                  });
                  const scripts = resources.filter((entry) => /\\.m?js(?:[?#]|$)/i.test(entry.name));
                  const stylesheets = resources.filter((entry) => /\\.css(?:[?#]|$)/i.test(entry.name));
                  const sum = (entries, key) => entries.reduce(
                    (total, entry) => total + (Number(entry[key]) || 0), 0
                  );
                  const probe = window.__cvPaintProbe || {};
                  const viewport = document.querySelector('meta[name="viewport"]');
                  return {
                    document: {
                      title: document.title,
                      doctype: document.doctype ? document.doctype.name : null,
                      language: document.documentElement.lang || null,
                      charset: document.characterSet || null,
                      viewport: viewport ? viewport.content : null
                    },
                    fcpMs: fcp ? fcp.startTime : null,
                    lcpMs: Number.isFinite(probe.lcpMs) ? probe.lcpMs : null,
                    cls: Number(probe.cls) || 0,
                    longTasks: {
                      count: Number(probe.longTaskCount) || 0,
                      totalDurationMs: Number(probe.longTaskTotalDurationMs) || 0,
                      maxDurationMs: Number(probe.longTaskMaxDurationMs) || 0
                    },
                    observers: probe.observerSupport || {},
                    navigation: navigation ? {
                      ttfbMs: navigation.responseStart > 0
                        ? navigation.responseStart - navigation.requestStart : null,
                      domContentLoadedMs: navigation.domContentLoadedEventEnd || null,
                      loadEventMs: navigation.loadEventEnd || null
                    } : {},
                    resources: {
                      sameOriginCount: resources.length,
                      sameOriginTransferBytes: sum(resources, 'transferSize'),
                      scriptCount: scripts.length,
                      scriptTransferBytes: sum(scripts, 'transferSize'),
                      stylesheetCount: stylesheets.length,
                      stylesheetTransferBytes: sum(stylesheets, 'transferSize')
                    },
                    domNodeCount: document.getElementsByTagName('*').length
                  };
                }"""
            )
            report["metrics"] = {
                "fcpMs": rounded(metrics.get("fcpMs")),
                "lcpMs": rounded(metrics.get("lcpMs")),
                "cls": rounded(metrics.get("cls")),
                "longTasks": {
                    "count": metrics.get("longTasks", {}).get("count", 0),
                    "totalDurationMs": rounded(
                        metrics.get("longTasks", {}).get("totalDurationMs")
                    ),
                    "maxDurationMs": rounded(metrics.get("longTasks", {}).get("maxDurationMs")
                    ),
                },
                "navigation": {
                    key: rounded(value)
                    for key, value in metrics.get("navigation", {}).items()
                },
                "resources": metrics.get("resources", {}),
                "domNodeCount": metrics.get("domNodeCount"),
                "observerSupport": metrics.get("observers", {}),
            }
            document = metrics.get("document", {})
            fcp = metrics.get("fcpMs")
            report["document"] = document
            report["checks"] = {
                "http_success": response_status is not None and 200 <= response_status < 300,
                "doctype_is_html": document.get("doctype") == "html",
                "html_language_is_en": document.get("language") == "en",
                "charset_is_utf8": (document.get("charset") or "").lower().replace("-", "") == "utf8",
                "viewport_meta_present": bool(document.get("viewport")),
                "document_title_present": document.get("title") == "Cash Payment Vouchers",
                "login_heading_visible": login_heading_visible,
                "login_form_visible": login_form_visible,
                "first_contentful_paint_recorded": fcp is not None and fcp > 0,
            }
        except Exception as error:
            failure = f"{type(error).__name__}: {error}"
            report["error"] = failure
            report["checks"]["navigation_and_render_completed"] = False
        finally:
            report["responseStatus"] = response_status
            report["status"] = (
                "passed"
                if report["checks"] and all(report["checks"].values())
                else "failed"
            )
            browser.close()

    print("Browser first-paint smoke: " + json.dumps(report, ensure_ascii=False, sort_keys=True))
    write_report(report)

    failed_checks = [name for name, passed in report["checks"].items() if not passed]
    if failure or failed_checks:
        print("Browser first-paint smoke failed: " + (failure or ", ".join(failed_checks)))
        return 1
    print("Browser first-paint smoke passed; no timing budget or production claim is applied.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
