import datetime
import os
import uuid

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

BASE = os.environ.get("E2E_BASE", "http://127.0.0.1:8766").rstrip("/")
API_URL = os.environ.get("CV_STAGING_API_URL", "").strip()
PASS = 0


def check(condition, message):
    global PASS
    if not condition:
        raise AssertionError(message)
    PASS += 1
    print("PASS:", message)


def call_api(page, action, payload=None):
    return page.evaluate(
        """async ({ url, action, payload }) => {
          try {
            const token = localStorage.getItem('cv.token');
            const response = await fetch(url, {
              method: 'POST',
              body: JSON.stringify({ action, token, ...(payload || {}) })
            });
            return await response.json();
          } catch (_) {
            return { ok: false };
          }
        }""",
        {"url": API_URL, "action": action, "payload": payload or {}},
    )


def api_data(page, action, payload=None):
    result = call_api(page, action, payload)
    check(isinstance(result, dict) and result.get("ok") is True,
          "staging API action responds successfully: " + action)
    return result.get("data")


def go(page, view):
    button = page.locator(f'#nav [data-v="{view}"]')
    if button.count() == 1 and button.is_visible():
        button.click()
        return
    page.locator("#mobileMoreBtn").click()
    overflow = page.locator(f'#navMoreItems [data-v="{view}"]')
    check(overflow.count() == 1, "requested UAT screen is available in navigation")
    overflow.click()


def sign_in(page, email, pin, role):
    page.goto(BASE, wait_until="domcontentloaded")
    configured = page.evaluate("() => window.CV_CONFIG && window.CV_CONFIG.API_URL")
    check(configured == API_URL, role + " browser targets the configured staging endpoint")
    page.locator("#lEmail").fill(email)
    page.locator("#lPin").fill(pin)
    page.locator("#lBtn").click()
    try:
        page.locator("#app:not(.hidden)").wait_for(state="visible", timeout=20000)
    except PlaywrightTimeoutError as exc:
        raise AssertionError(
            role + " sign-in failed; confirm the dedicated staging account is active and its initial PIN change was completed manually."
        ) from exc
    check(page.locator("#op").count() == 0, role + " account has completed first-login PIN setup")
    token = page.evaluate("() => localStorage.getItem('cv.token')")
    check(isinstance(token, str) and len(token) >= 20, role + " receives an authenticated session")
    return token


def active_payment_total(page, date):
    report = api_data(page, "recordedMovementReport", {
        "from": date, "to": date, "type": "ALL", "status": "ALL"
    })
    value = report.get("activePaymentTotal") if isinstance(report, dict) else None
    check(isinstance(value, (int, float)), "staging movement report returns a numeric active-payment total")
    return float(value)


def find_uat_payment(page, vendor):
    bootstrap = api_data(page, "bootstrap")
    vouchers = bootstrap.get("vouchers") if isinstance(bootstrap, dict) else None
    check(isinstance(vouchers, list), "staging bootstrap returns a voucher list")
    matches = [
        row for row in vouchers
        if isinstance(row, dict) and row.get("vendor") == vendor and row.get("type") == "PAYMENT"
    ]
    check(len(matches) == 1 and isinstance(matches[0].get("id"), str),
          "unique staging UAT payment can be identified for safe cancellation")
    return matches[0]


def staging_target_check(page):
    target = api_data(page, "deploymentReadiness")
    stage = {
        "scriptId": os.environ["CV_STAGING_SCRIPT_ID"].strip(),
        "spreadsheetId": os.environ["CV_STAGING_SPREADSHEET_ID"].strip(),
        "receiptFolderId": os.environ["CV_STAGING_RECEIPT_FOLDER_ID"].strip(),
        "backupFolderId": os.environ["CV_STAGING_BACKUP_FOLDER_ID"].strip(),
    }
    production = {
        os.environ["CV_PRODUCTION_SCRIPT_ID"].strip(),
        os.environ["CV_PRODUCTION_SPREADSHEET_ID"].strip(),
        os.environ["CV_PRODUCTION_RECEIPT_FOLDER_ID"].strip(),
        os.environ["CV_PRODUCTION_BACKUP_FOLDER_ID"].strip(),
    }
    for field, expected in stage.items():
        check(target.get(field) == expected, "deployed readiness probe matches a configured staging resource")
        check(expected not in production, "staging target does not match a configured production resource")
    check(target.get("scriptId") == stage["scriptId"], "live Apps Script project identity is the staging project")
    checks = target.get("checks", {})
    check(checks.get("spreadsheetReadable") is True, "staging spreadsheet is readable")
    check(checks.get("missingSheets") == [], "all required staging tabs exist")
    check(checks.get("invalidHeaders") == [], "staging sheet headers match the current schema")
    check(checks.get("receiptFolderReadable") is True, "staging receipt folder is readable")
    check(checks.get("backupFolderReadable") is True, "staging backup folder is readable")
    check(checks.get("backupTriggerInstalled") is True, "scheduled backup trigger is installed")


def cancel_by_id(page, voucher_id):
    response = call_api(page, "cancelVoucher", {
        "id": voucher_id,
        "reason": "Automated staging UAT cleanup; retain audit trace",
    })
    return isinstance(response, dict) and response.get("ok") is True


def run():
    if os.environ.get("CV_STAGING_UAT_CONFIRM_WRITES") != "true":
        raise AssertionError("Transactional staging UAT requires CV_STAGING_UAT_CONFIRM_WRITES=true.")
    if not API_URL:
        raise AssertionError("CV_STAGING_API_URL is missing.")

    owner_email = os.environ["CV_STAGING_UAT_OWNER_EMAIL"].strip()
    owner_pin = os.environ["CV_STAGING_UAT_OWNER_PIN"].strip()
    manager_email = os.environ["CV_STAGING_UAT_MANAGER_EMAIL"].strip()
    manager_pin = os.environ["CV_STAGING_UAT_MANAGER_PIN"].strip()
    if owner_email.lower() == manager_email.lower() or owner_pin == manager_pin:
        raise AssertionError("Staging owner and manager UAT accounts must be distinct.")

    unique_vendor = "UAT-P19-" + datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:8]
    business_date = datetime.date.today().isoformat()
    target_verified = False
    payment_created = False
    payment_cancelled = False
    owner_page = None
    manager_context = None
    owner_context = None
    browser = None

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        owner_context = browser.new_context(viewport={"width": 1280, "height": 800})
        owner_page = owner_context.new_page()
        owner_signin = sign_in(owner_page, owner_email, owner_pin, "staging owner")
        staging_target_check(owner_page)
        target_verified = True

        go(owner_page, "dash")
        check(bool(owner_page.locator("#view").inner_text().strip()), "Dashboard renders")

        go(owner_page, "new")
        owner_page.locator("#nf").wait_for(state="visible")
        check(owner_page.locator("#nd").count() == 1 and owner_page.locator("#rows .rci").count() >= 1,
              "New Entry renders date and required cash-settlement controls")

        go(owner_page, "reg")
        check(owner_page.locator("#rq").count() == 1 and owner_page.locator("#rbody").count() == 1,
              "Register renders searchable voucher rows")

        go(owner_page, "reports")
        owner_page.locator("#movementFilters").wait_for(state="visible")
        owner_page.locator('#movementFilters button[type="submit"]').click()
        try:
            owner_page.locator("#view .stats").wait_for(state="attached", timeout=15000)
        except PlaywrightTimeoutError as exc:
            raise AssertionError("Staging Recorded Movement Report did not return validated totals.") from exc
        check(True, "Recorded Movement Report returns report totals")

        go(owner_page, "cashClose")
        owner_page.locator("#cc-date").wait_for(state="visible")
        owner_page.locator("#cc-results").wait_for(state="attached")
        try:
            owner_page.locator('#cc-results[aria-busy="false"]').wait_for(state="attached", timeout=12000)
        except PlaywrightTimeoutError as exc:
            raise AssertionError("Staging Cash Close preview did not complete; no close was created.") from exc
        check(owner_page.locator("#cc-results [role=alert]").count() == 0,
              "Cash Close preview loads without creating a close")

        go(owner_page, "set")
        owner_page.locator("#backup-status h2").wait_for(state="attached")
        owner_page.locator('[data-act="dqscan"]').click()
        try:
            owner_page.locator("#dq-results").get_by_text("Scanned", exact=False).wait_for(state="attached", timeout=15000)
        except PlaywrightTimeoutError as exc:
            raise AssertionError("Staging data-quality scan failed.") from exc
        check(owner_page.locator('[data-act="dqexport"]').count() == 1,
              "successful staging data-quality scan exposes JSON export")
        owner_page.locator('[data-act="bkintegrity"]').click()
        try:
            owner_page.locator("#backup-integrity-results").get_by_text("Inspected", exact=False).wait_for(state="attached", timeout=15000)
        except PlaywrightTimeoutError as exc:
            raise AssertionError("Staging backup-integrity inspection failed.") from exc
        check(owner_page.locator('[data-act="bkexport"]').count() == 1,
              "successful staging backup-integrity scan exposes JSON export")

        go(owner_page, "audit")
        owner_page.locator("#aud-health").wait_for(state="attached")
        audit = api_data(owner_page, "auditLog")
        check(isinstance(audit, dict) and isinstance(audit.get("rows"), list),
              "owner Audit Log returns an event list and health status")

        # Capture the baseline so UAT proves pending approval cannot inflate approved totals,
        # approval changes the total by exactly INR 10,000, and cancellation restores baseline.
        baseline_total = active_payment_total(owner_page, business_date)

        try:
            go(owner_page, "new")
            owner_page.locator("#nf").wait_for(state="visible")
            owner_page.locator("#nd").fill(business_date)
            owner_page.locator("#rows .rv").first.fill(unique_vendor)
            owner_page.locator("#rows .ra").first.fill("10000")
            owner_page.locator("#rows .rci").first.select_option("CASH_OUT")
            owner_page.locator("#rows .rn").first.fill("Staging UAT high-value approval journey")
            owner_page.locator("#nsave").click()
            payment_created = True
            try:
                owner_page.locator("#nres").get_by_text("pending owner/manager approval", exact=False).wait_for(
                    state="attached", timeout=15000
                )
            except PlaywrightTimeoutError as exc:
                raise AssertionError("High-value UAT payment did not show pending approval treatment.") from exc
            check(
                "excluded from approved totals" in owner_page.locator("#nres").inner_text()
                and "Daily Cash Close" in owner_page.locator("#nres").inner_text(),
                "high-value payment is shown as pending and excluded from totals and Cash Close",
            )
            voucher = find_uat_payment(owner_page, unique_vendor)
            check(voucher.get("approvalStatus") == "PENDING", "created high-value payment is pending on the server")
            voucher_id = voucher["id"]
            pending_total = active_payment_total(owner_page, business_date)
            check(abs(pending_total - baseline_total) < 0.005,
                  "pending payment does not change active approved-payment total")

            go(owner_page, "reg")
            owner_page.locator("#rq").fill(unique_vendor)
            owner_row = owner_page.locator("#rbody tr").filter(has_text=unique_vendor)
            owner_row.wait_for(state="attached", timeout=10000)
            check("PENDING APPROVAL" in owner_row.inner_text()
                  and owner_row.locator('[data-act="approve"]').count() == 0,
                  "payment creator cannot self-approve")

            manager_context = browser.new_context(viewport={"width": 1280, "height": 800})
            manager_page = manager_context.new_page()
            manager_token = sign_in(manager_page, manager_email, manager_pin, "staging manager")
            go(manager_page, "reg")
            manager_page.locator("#rq").fill(unique_vendor)
            manager_row = manager_page.locator("#rbody tr").filter(has_text=unique_vendor)
            manager_row.wait_for(state="attached", timeout=10000)
            check("PENDING APPROVAL" in manager_row.inner_text()
                  and manager_row.locator('[data-act="approve"]').count() == 1,
                  "independent manager can review the pending payment")
            check(
                manager_page.locator('#nav [data-v="set"]').count() == 0
                and manager_page.locator('#navMoreItems [data-v="set"]').count() == 0
                and manager_page.locator('#nav [data-v="audit"]').count() == 0,
                "manager navigation does not expose owner Settings or Audit",
            )

            manager_row.locator('[data-act="approve"]').evaluate("(element) => element.click()")
            manager_page.locator('#modal:not(.hidden) .mcard .primary').wait_for(state="visible", timeout=10000)
            manager_page.locator('#modal:not(.hidden) .mcard .primary').click()
            manager_page.locator("#rbody tr").filter(has_text=unique_vendor).get_by_text("APPROVED", exact=False).wait_for(
                state="attached", timeout=15000
            )
            approved_total = active_payment_total(manager_page, business_date)
            check(abs(approved_total - (baseline_total + 10000)) < 0.005,
                  "independent approval adds exactly INR 10,000 to active approved totals")

            manager_page.locator("#rbody tr").filter(has_text=unique_vendor).locator(
                '[data-act="cancel"]'
            ).evaluate("(element) => element.click()")
            manager_page.locator('#modal:not(.hidden) #cr').wait_for(state="visible", timeout=10000)
            manager_page.locator("#cr").fill("Automated staging UAT cleanup; retain audit trace")
            manager_page.locator('#modal:not(.hidden) .mcard .primary').click()
            manager_page.locator("#rs").select_option("ALL")
            manager_page.locator("#rq").fill(unique_vendor)
            cancelled_row = manager_page.locator("#rbody tr").filter(has_text=unique_vendor)
            cancelled_row.get_by_text("CANCELLED", exact=False).wait_for(state="attached", timeout=10000)
            cancelled_total = active_payment_total(manager_page, business_date)
            check(abs(cancelled_total - baseline_total) < 0.005,
                  "cancelling the staging test payment returns approved totals to baseline")
            check("CANCELLED" in cancelled_row.inner_text(),
                  "the UAT payment is cancelled with a retained audit trace")
            payment_cancelled = True

            final_audit = api_data(owner_page, "auditLog")
            check(
                any(isinstance(row, dict) and row.get("target") == "#" + str(voucher.get("no"))
                    for row in final_audit.get("rows", [])),
                "owner Audit Log retains events associated with the staging UAT voucher",
            )
        finally:
            if target_verified and payment_created and not payment_cancelled and owner_page and owner_page.is_closed() is False:
                try:
                    # Look up only the unique test marker and cancel exactly that one record;
                    # never delete it or remove its audit events.
                    owner_token = owner_page.evaluate("() => localStorage.getItem('cv.token')") or owner_token
                    result = call_api(owner_page, "bootstrap")
                    data = result.get("data") if isinstance(result, dict) and result.get("ok") else {}
                    vouchers = data.get("vouchers", []) if isinstance(data, dict) else []
                    hits = [row for row in vouchers if isinstance(row, dict)
                            and row.get("vendor") == unique_vendor and row.get("type") == "PAYMENT"]
                    if len(hits) == 1 and hits[0].get("status") == "ACTIVE":
                        cleanup = call_api(owner_page, "cancelVoucher", {
                            "id": hits[0].get("id"),
                            "reason": "Automated staging UAT cleanup; retain audit trace",
                        })
                        print("CLEANUP: " + ("staging voucher cancelled; audit history retained."
                                              if cleanup.get("ok") is True else
                                              "cleanup could not be confirmed; owner review is required."))
                    else:
                        print("CLEANUP: test marker was not uniquely recoverable; owner review is required.")
                except Exception:
                    print("CLEANUP: automatic cancellation could not be confirmed; owner review is required.")
            if manager_context:
                manager_context.close()
            if owner_context:
                owner_context.close()
            browser.close()

    print("STAGING UAT: " + str(PASS) + " checks passed, 0 failures.")


if __name__ == "__main__":
    try:
        run()
    except Exception as error:
        # Keep credentials, deployment URLs, and raw API payloads out of logs.
        print("STAGING UAT FAILED:", str(error) if isinstance(error, AssertionError) else
              "unexpected browser or transport error")
        raise SystemExit(1)
