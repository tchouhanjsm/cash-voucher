import base64
import csv
import datetime
import json
import os
import urllib.parse

from playwright.sync_api import sync_playwright

BASE = os.environ.get('E2E_BASE', 'http://127.0.0.1:8765').rstrip('/')
API = BASE + '/api?' + urllib.parse.urlencode({
    'drop_vendor': 'Offline Vendor',
    'count_vendor': 'Multi-tab Vendor',
    'fail_vendor': 'Poison Vendor',
})
URL = BASE + '/?' + urllib.parse.urlencode({'api': API})
errs = []
ok = 0


def check(condition, message):
    global ok
    if not condition:
        print('FAIL:', message)
        errs.append(message)
    else:
        ok += 1


png = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
)

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(
        viewport={'width': 390, 'height': 800},
        accept_downloads=True,
    )
    page = context.new_page()

    def choose_cash_impact_for_current_rows():
        impact = 'CASH_IN' if page.locator('.seg button.on[data-k="RECEIPT"]').count() else 'CASH_OUT'
        for control in page.locator('#rows .rci').all():
            control.select_option(impact)

    def choose_bulk_cash_impact_for_current_rows():
        impact = 'CASH_IN' if page.locator('#bt2').input_value() == 'RECEIPT' else 'CASH_OUT'
        count = page.locator('#bprev .bci').count()
        for index in range(count):
            page.locator('#bprev .bci').nth(index).select_option(impact)

    logs = []
    page.add_init_script(
        """window.__xssFired = false;
        window.__createdObjectUrls = [];
        window.__revokedObjectUrls = [];
        const __createObjectURL = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (value) => {
            const url = __createObjectURL(value);
            window.__createdObjectUrls.push(url);
            return url;
        };
        const __revokeObjectURL = URL.revokeObjectURL.bind(URL);
        URL.revokeObjectURL = (url) => {
            window.__revokedObjectUrls.push(String(url));
            return __revokeObjectURL(url);
        };
        window.__dashboardKeyBaseline = [
            Object.prototype,
            Object,
            Object.prototype.toString,
            Object.prototype.hasOwnProperty,
        ].map((target) => ({
            target,
            n: Object.getOwnPropertyDescriptor(target, 'n'),
            s: Object.getOwnPropertyDescriptor(target, 's'),
        }));"""
    )
    csp_violations = []

    def capture_console(message):
        if message.type != 'error':
            return
        logs.append(message.text)
        if 'content security policy' in message.text.lower():
            csp_violations.append(message.text)

    page.on('console', capture_console)
    page.on('pageerror', lambda error: logs.append('PAGEERR ' + str(error)))

    page.goto(URL)
    csp = page.locator('meta[http-equiv="Content-Security-Policy"]')
    csp_content = csp.get_attribute('content') if csp.count() == 1 else ''
    check(
        csp.count() == 1
        and "script-src 'self'" in csp_content
        and "script-src-attr 'none'" in csp_content
        and "'unsafe-eval'" in csp_content,
        'mock E2E server adds eval-only exception for Playwright; source CSP remains strict',
    )
    check(
        page.locator('#lUrl').count() == 0 or page.locator('#lUrl').is_hidden(),
        'local E2E API override is active',
    )

    page.fill('#lEmail', 'owner@test.com')
    page.fill('#lPin', '000000')
    page.click('#lBtn')
    page.wait_for_selector('#lErr:not(:empty)')
    check('Invalid' in page.inner_text('#lErr'), 'wrong pin message')

    page.fill('#lPin', '483921')
    page.click('#lBtn')
    page.wait_for_selector('#mErr')
    check(
        page.get_by_role('dialog', name='Choose a new PIN').count() == 1,
        'PIN dialog has an accessible name',
    )
    check(
        page.evaluate("document.activeElement?.id === 'op'"),
        'dialog moves keyboard focus to the first field',
    )
    check(
        page.locator('#op').get_attribute('aria-label') == 'Current temporary PIN'
        and page.locator('#np').get_attribute('aria-label') == 'New PIN',
        'forced PIN change fields have explicit accessible names',
    )
    check(
        page.locator('#op').get_attribute('pattern') == '[0-9]{6}'
        and page.locator('#np').get_attribute('pattern') == '[0-9]{6}',
        'forced PIN change fields require six numeric digits',
    )
    page.locator('.mcard .primary').focus()
    page.keyboard.press('Tab')
    check(
        page.evaluate("document.activeElement?.id === 'op'"),
        'Tab wraps from the last dialog control to the first',
    )
    page.locator('#op').focus()
    page.keyboard.press('Shift+Tab')
    check(
        page.evaluate("document.activeElement?.matches('.mcard .primary')"),
        'Shift+Tab wraps from the first dialog control to the last',
    )
    page.fill('#op', '483921')
    page.fill('#np', '579246')
    page.click('.mcard .primary')
    page.wait_for_selector('#nav button')
    check(page.locator('#nav button').count() == 11, 'owner sees 11 nav items including Cash Close')
    check(
        page.locator('[data-v=dash]').get_attribute('aria-current') == 'page',
        'current navigation view is announced to assistive technology',
    )
    check(
        page.locator('[data-v=dash] .ic').get_attribute('aria-hidden') == 'true',
        'decorative navigation icon is hidden from assistive technology',
    )

    # Daily Cash Close journey: manual opening, immutable report, correction note and carry-forward.
    page.click('[data-v=cashClose]')
    page.wait_for_selector('#cc-date')
    page.fill('#cc-date', '2020-01-01')
    page.click('[data-act=closePreview]')
    page.wait_for_selector('#cc-opening')
    page.fill('#cc-opening', '80')
    page.fill('#cc-opening-reason', 'Opening cash counted before the first test day')
    page.click('[data-act=closePreview]')
    page.wait_for_selector('#cc-counted')
    page.fill('#cc-counted', '100')
    page.fill('#cc-variance-reason', 'Initial count differs from expected cash')
    page.click('[data-act=closeCreate]')
    page.wait_for_selector('#cc-closed-report')
    check(
        '₹80' in page.locator('#cc-closed-report').inner_text()
        and '₹100' in page.locator('#cc-closed-report').inner_text()
        and '₹20' in page.locator('#cc-closed-report').inner_text(),
        'cash close report shows opening, physical count and variance',
    )
    check('owner@test.com' in page.locator('#cc-closed-report').inner_text(), 'close report records the accountable operator')
    page.fill('#cc-corr-details', 'E2E correction note recorded after close')
    page.fill('#cc-corr-reason', 'Follow-up is documented without reopening close')
    page.click('[data-act=closeCorrection]')
    page.wait_for_function("document.querySelector('#cc-closed-report')?.innerText.includes('CLOSED')")
    check('E2E correction note recorded' in page.locator('.cc-corrections').inner_text(), 'correction note is displayed separately')
    page.fill('#cc-date', '2020-01-02')
    page.click('[data-act=closePreview]')
    page.wait_for_selector('#cc-counted')
    check(page.locator('#cc-opening').count() == 0 and '₹100' in page.locator('#cc-results').inner_text(), 'next day carries forward the accepted physical count')
    page.fill('#cc-counted', '100')
    page.click('[data-act=closeCreate]')
    page.wait_for_selector('#cc-closed-report')
    check('Previous accepted close' in page.locator('#cc-closed-report').inner_text(), 'report discloses carry-forward opening source')

    # A locally stored record must block finalization; test record is deleted without submitting it.
    page.evaluate("""() => new Promise((resolve, reject) => {
      const request = indexedDB.open('cash-voucher', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('outbox', 'readwrite');
        tx.objectStore('outbox').put({
          clientId: 'cash-close-e2e-pending',
          entry: { type: 'PAYMENT', vendor: 'E2E local-only test', amount: 1, date: '2020-01-03', cashImpact: 'CASH_OUT' },
          ownerKey: '',
          status: 'pending',
          attempts: 0,
          failure: '',
          leaseOwner: '',
          leaseUntil: 0,
          createdAt: Date.now()
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    })""")
    page.fill('#cc-date', '2020-01-03')
    page.click('[data-act=closePreview]')
    page.wait_for_selector('#cc-create')
    check(
        page.locator('#cc-create').is_disabled()
        and 'offline/recovery entr' in page.locator('#cc-results').inner_text().lower(),
        'a local offline entry blocks the cash close',
    )
    page.evaluate("""() => new Promise((resolve, reject) => {
      const request = indexedDB.open('cash-voucher', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('outbox', 'readwrite');
        tx.objectStore('outbox').delete('cash-close-e2e-pending');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    })""")

    page.click('[data-v=users]')
    page.wait_for_selector('#uf')
    check(
        page.locator('#un').get_attribute('aria-label') == 'User name'
        and page.locator('#ue').get_attribute('aria-label') == 'Email address'
        and page.locator('#ur').get_attribute('aria-label') == 'New user role',
        'add-user form fields have explicit accessible names',
    )
    check(
        page.locator('#up').get_attribute('type') == 'password'
        and page.locator('#up').get_attribute('pattern') == '[0-9]{6}',
        'temporary user PIN is masked and constrained to six digits',
    )
    check(
        page.locator('[data-v=users]').get_attribute('aria-current') == 'page'
        and page.locator('[data-v=dash]').get_attribute('aria-current') is None,
        'navigation current-page state follows the selected view',
    )
    for name, email, role, pin in [
        ('Mona', 'm@test.com', 'manager', '246810'),
        ('Sam', 's@test.com', 'staff', '135790'),
    ]:
        page.fill('#un', name)
        page.fill('#ue', email)
        page.select_option('#ur', role)
        page.fill('#up', pin)
        page.click('#uf .primary')
        page.wait_for_timeout(300)
    check(page.locator('tbody tr').count() == 3, '3 users listed')

    # Owner cannot self-approve a new high-value payment; a manager can review it.
    page.click('[data-v=new]')
    page.wait_for_selector('#nf')
    page.locator('#rows .rv').first.fill('Approval E2E vendor')
    page.locator('#rows .ra').first.fill('10000')
    choose_cash_impact_for_current_rows()
    page.click('#nsave')
    page.wait_for_function(
        "document.querySelector('#nres')?.innerText.includes('pending owner/manager approval')"
    )
    check(
        'excluded from approved totals and Daily Cash Close' in page.locator('#nres').inner_text(),
        'new payment at INR 10,000 clearly explains the approval requirement and financial treatment',
    )
    page.click('[data-v=reg]')
    page.wait_for_selector('#rq')
    page.fill('#rq', 'Approval E2E vendor')
    page.wait_for_function(
        "document.querySelector('#rbody')?.innerText.includes('PENDING APPROVAL')"
    )
    check(
        page.locator('#rbody [data-act=approve]').count() == 0
        and page.locator('#rbody [data-act=reject]').count() == 0,
        'voucher creator cannot self-approve or self-reject from the Register',
    )
    page.click('[data-v=dash]')
    page.wait_for_selector('[data-v=dash][aria-current=page]')
    check(
        'active payment(s) are pending approval' in page.locator('#view').inner_text()
        and 'excluded from approved totals' in page.locator('#view').inner_text(),
        'Dashboard discloses pending approval exceptions and their total treatment',
    )
    page.click('[data-v=reg]')
    page.wait_for_selector('#rq')
    page.fill('#rq', 'Approval E2E vendor')

    manager_context = browser.new_context(
        viewport={'width': 390, 'height': 800},
        accept_downloads=True,
    )
    manager_page = manager_context.new_page()
    manager_page.goto(URL)
    manager_page.fill('#lEmail', 'm@test.com')
    manager_page.fill('#lPin', '246810')
    manager_page.click('#lBtn')
    manager_page.wait_for_selector('#op')
    manager_page.fill('#op', '246810')
    manager_page.fill('#np', '864209')
    manager_page.click('.mcard .primary')
    manager_page.wait_for_selector('#nav button')
    manager_page.click('[data-v=reg]')
    manager_page.wait_for_selector('#rq')
    manager_page.fill('#rq', 'Approval E2E vendor')
    manager_page.wait_for_function(
        "document.querySelector('#rbody')?.innerText.includes('PENDING APPROVAL')"
    )
    check(
        manager_page.locator('#rbody [data-act=approve]').count() == 1
        and manager_page.locator('#rbody [data-act=reject]').count() == 1,
        'another manager can review a pending high-value payment',
    )
    check(
        '10,000' not in manager_page.locator('#rtot').inner_text()
        and 'excluded from approved totals' in manager_page.locator('#rtot').inner_text(),
        'Register totals exclude the pending INR 10,000 payment',
    )
    manager_page.click('#rbody [data-act=approve]')
    manager_page.get_by_role('button', name='Approve payment', exact=True).click()
    manager_page.wait_for_function(
        "document.querySelector('#rbody')?.innerText.includes('APPROVED')"
    )
    check(
        'PENDING APPROVAL' not in manager_page.locator('#rbody').inner_text()
        and 'APPROVED' in manager_page.locator('#rbody').inner_text(),
        'manager approval updates status and removes pending treatment',
    )
    check(
        '10,000' in manager_page.locator('#rtot').inner_text()
        and 'excluded from approved totals' not in manager_page.locator('#rtot').inner_text(),
        'approved INR 10,000 payment becomes eligible for Register totals',
    )
    page.click('[data-act=refresh]')
    page.wait_for_function(
        "document.querySelector('#rbody')?.innerText.includes('APPROVED')"
    )
    check(
        'APPROVED' in page.locator('#rbody').inner_text()
        and page.locator('#rbody [data-act=approve]').count() == 0,
        'approval persists across users and the creator view refresh',
    )
    manager_context.close()

    xss_payload = '<svg onload=window.__xssFired=true></svg>'
    page.fill('#un', xss_payload)
    page.fill('#ue', 'stored-xss@test.com')
    page.select_option('#ur', 'staff')
    page.fill('#up', '258369')
    page.click('#uf .primary')
    page.wait_for_function(
        "document.querySelector('#view').innerText.includes('stored-xss@test.com')"
    )
    check(
        page.locator('#view img, #view svg').count() == 0
        and xss_payload in page.locator('#view').inner_text()
        and not page.evaluate('window.__xssFired === true'),
        'user name is rendered as text, not executable HTML',
    )

    # Malformed owner user-list responses must not crash the active Users view.
    invalid_user_envelope = False

    def inject_malformed_user_rows(route):
        try:
            request_data = json.loads(route.request.post_data or '{}')
        except json.JSONDecodeError:
            request_data = {}
        if request_data.get('action') != 'listUsers':
            route.continue_()
            return

        response = route.fetch()
        payload = response.json()
        if payload.get('ok'):
            if invalid_user_envelope:
                payload['data'] = {'unexpected': 'not a user list'}
            elif isinstance(payload.get('data'), list):
                payload['data'].extend([
                    None,
                    'unexpected user row',
                    {
                        'id': 'malformed-user-name',
                        'name': {'toString': None, 'valueOf': None},
                        'email': 'bad-name@test.com',
                        'role': 'staff',
                        'active': True,
                    },
                    {
                        'id': 'malformed-user-email',
                        'name': 'Malformed Email',
                        'email': {'toString': None, 'valueOf': None},
                        'role': 'staff',
                        'active': True,
                    },
                    {
                        'id': 'malformed-user-role',
                        'name': 'Malformed Role',
                        'email': 'bad-role@test.com',
                        'role': {'name': 'owner'},
                        'active': True,
                    },
                ])
        route.fulfill(response=response, body=json.dumps(payload))

    page.route('**/api?*', inject_malformed_user_rows)
    page.click('[data-v=dash]')
    page.click('[data-v=users]')
    page.wait_for_function(
        "document.querySelector('#view [role=status]')?.innerText.includes('malformed user record(s) omitted')"
    )
    check(
        '5 malformed user record(s) omitted from this response' in page.locator('#view').inner_text()
        and page.locator('#view tbody tr').count() == 4
        and page.locator('#view [data-act=utog]').count() == 4,
        'owner Users view omits malformed rows while keeping valid user records actionable',
    )
    check(
        page.locator('#view img, #view svg').count() == 0
        and '[object Object]' not in page.locator('#view').inner_text()
        and not page.evaluate('window.__xssFired === true'),
        'malformed user names, emails and roles are not coerced or rendered as active markup',
    )
    invalid_user_envelope = True
    page.click('[data-v=dash]')
    page.click('[data-v=users]')
    page.wait_for_function(
        "document.querySelector('#view [role=status]')?.innerText.includes('User data is unavailable because the server response was invalid')"
    )
    check(
        'No users yet' not in page.locator('#view').inner_text()
        and page.locator('#uf').count() == 1
        and page.locator('#view tbody tr').count() == 1,
        'non-array user response is disclosed instead of being treated as an empty list',
    )
    invalid_user_envelope = False
    page.unroute('**/api?*', inject_malformed_user_rows)
    page.click('[data-v=dash]')
    page.click('[data-v=users]')
    page.wait_for_selector('#uf')
    check(
        page.locator('#view tbody tr').count() == 4
        and page.locator('#view [role=status]').count() == 0,
        'owner Users view recovers after a valid list response returns',
    )

    xss_vendor = '<svg onload=window.__xssFired=true></svg>'
    xss_company = '<img src=x onerror=window.__xssFired=true>'
    page.click('[data-v=vend]')
    page.wait_for_selector('#vf')
    check(
        page.locator('#vn').get_attribute('aria-label') == 'Vendor name'
        and page.locator('#vc').get_attribute('aria-label') == 'Company name (optional)'
        and page.locator('#vm').get_attribute('aria-label') == 'Mobile number (optional)',
        'vendor form fields have explicit accessible names',
    )
    page.fill('#vn', xss_vendor)
    page.fill('#vc', xss_company)
    page.fill('#vm', '9876543210')
    page.click('#vf .primary')
    page.wait_for_function(
        "document.querySelector('#view').innerText.includes('9876543210')"
    )
    check(
        page.locator('#view img, #view svg').count() == 0
        and xss_vendor in page.locator('#view').inner_text()
        and xss_company in page.locator('#view').inner_text()
        and not page.evaluate('window.__xssFired === true'),
        'vendor name and company are rendered as text, not executable HTML',
    )

    page.click('[data-v=set]')
    page.wait_for_function(
        "document.querySelector('#backup-status').innerText.includes('No completed backup recorded')"
    )
    check(
        'Backup & recovery' in page.locator('#backup-status').inner_text()
        and '90 days' in page.locator('#backup-status').inner_text()
        and 'Last success: Not recorded' in page.locator('#backup-status').inner_text()
        and 'does not verify the current Drive backup contents' in page.locator('#backup-status').inner_text(),
        'owner settings show honest backup status and recovery limitations',
    )
    page.click('[data-act=dqscan]')
    page.wait_for_function("document.querySelector('#dq-results').innerText.includes('Scanned')")
    dq_text = page.locator('#dq-results').inner_text()
    check(
        'structural consistency' in dq_text
        and 'does not determine tax compliance' in dq_text,
        'owner data-quality scan shows results and its accounting/tax limitation',
    )
    page.click('[data-act=bkintegrity]')
    page.wait_for_function(
        "document.querySelector('#backup-integrity-results').getAttribute('role') === 'alert' && document.querySelector('#backup-integrity-results').innerText.includes('Backup integrity inspection returned an invalid response or failed.')"
    )
    check(
        page.locator('#backup-integrity-results').get_attribute('role') == 'alert'
        and 'Backup integrity inspection returned an invalid response or failed.'
        in page.locator('#backup-integrity-results').inner_text()
        and not page.locator('[data-act=bkintegrity]').is_disabled(),
        'backup inspection failure is announced as an alert and the retry action is restored',
    )

    status_fixture_ok = page.evaluate(
        "() => fetch('/test-backup-failure', { method: 'POST' }).then((response) => response.ok)"
    )
    check(status_fixture_ok, 'backup failure alert fixture is available')
    page.click('[data-v=dash]')
    page.wait_for_function(
        "document.querySelector('[data-v=dash]').getAttribute('aria-current') === 'page'"
    )
    page.click('[data-v=set]')
    page.wait_for_function(
        "document.querySelector('#backup-status').innerText.includes('Latest backup attempt failed')"
    )
    failed_backup_text = page.locator('#backup-status').inner_text()
    check(
        page.locator('#backup-status p[role=alert]').count() == 1
        and 'Latest error: Drive permission denied' in failed_backup_text
        and 'Last successful runtime: 1.25 s' in failed_backup_text
        and 'Receipt copies in last successful backup: 12' in failed_backup_text
        and 'Receipt payload in last successful backup: 7.00 MiB' in failed_backup_text
        and 'Owner notification issue: Mail service unavailable' in failed_backup_text,
        'backup failure is assertively announced with separate error, delivery, runtime and payload metrics',
    )
    check(page.locator('#aud').count() == 0, 'audit events are no longer embedded in Settings')
    check(page.locator('[data-v=audit]').count() == 1, 'owner has a dedicated audit navigation item')
    page.click('[data-v=audit]')
    page.wait_for_selector('#aud tr')
    page.wait_for_function(
        "document.querySelector('#aud').innerText.includes('<svg onload=window.__xssFired=true></svg>')"
    )
    check(
        page.locator('#aud img, #aud svg').count() == 0
        and xss_vendor in page.locator('#aud').inner_text()
        and not page.evaluate('window.__xssFired === true'),
        'audit-log details are rendered as text, not executable HTML',
    )
    check(
        'pages of 200' in page.locator('#audit-scope').inner_text().lower()
        and 'loaded pages only' in page.locator('#audit-scope').inner_text(),
        'audit page explains server limit and filtered export scope',
    )
    page.fill('#aud-q', xss_vendor)
    page.wait_for_function(
        "document.querySelector('#aud-count').innerText.includes('of')"
    )
    check(
        xss_vendor in page.locator('#aud').inner_text()
        and 'VENDOR_CREATE' in page.locator('#aud').inner_text(),
        'audit search filters loaded events by user-controlled detail text',
    )
    with page.expect_download() as audit_download_info:
        page.click('[data-act=audcsv]')
    audit_download = audit_download_info.value
    check(
        audit_download.suggested_filename.startswith('cash-voucher-audit-')
        and audit_download.suggested_filename.endswith('.csv'),
        'audit export downloads a CSV for the active filters',
    )
    page.click('[data-act=audclear]')
    check(
        'No audit events match these filters.' not in page.locator('#aud').inner_text()
        and page.locator('#aud-q').input_value() == '',
        'clear audit filters restores the loaded event list',
    )
    page.click('[data-v=set]')
    page.wait_for_selector('#sn')
    page.fill('#sn', xss_payload)
    page.fill('#sa', xss_company)
    page.click('#sf .primary')
    page.wait_for_function("document.querySelector('#brand').textContent === " + json.dumps(xss_payload))
    page.wait_for_timeout(300)
    check(
        page.locator('#brand').inner_text() == xss_payload
        and page.locator('#brand img, #brand svg').count() == 0
        and page.locator('#sa').input_value() == xss_company
        and page.locator('#sf img, #sf svg').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'stored property name and address remain inert text in navigation and settings',
    )
    page.fill('#sn', 'Hotel Test')
    page.fill('#sa', '1 Fort Road')
    page.click('#sf .primary')
    page.wait_for_function("document.querySelector('#brand').textContent === 'Hotel Test'")
    check(page.locator('#brand').inner_text() == 'Hotel Test', 'settings saved')

    # Malformed bootstrap values must not escape quoted numeric-input value attributes.
    settings_attribute_payload = '"><svg onload=window.__xssFired=true></svg><input value="'
    settings_object_mode = False
    settings_identity_object_mode = False
    settings_category_mode = False

    def tamper_bootstrap_settings(route):
        request_data = json.loads(route.request.post_data or '{}')
        response = route.fetch()
        payload = response.json()
        settings = payload.get('data', {}).get('settings', {})
        if request_data.get('action') == 'bootstrap' and settings:
            settings['propertyName'] = 'Attribute Context Test'
            if settings_object_mode:
                # JSON objects can shadow ordinary coercion methods with non-callable own fields.
                invalid_scalar = {'toString': None, 'valueOf': None}
                settings['nextVoucherNo'] = invalid_scalar
                settings['nextReceiptNo'] = invalid_scalar
                settings['openingBalance'] = invalid_scalar
            else:
                settings['nextVoucherNo'] = settings_attribute_payload
                settings['nextReceiptNo'] = settings_attribute_payload
                settings['openingBalance'] = settings_attribute_payload
            if settings_identity_object_mode:
                invalid_scalar = {'toString': None, 'valueOf': None}
                settings['propertyName'] = invalid_scalar
                user = payload.get('data', {}).get('user')
                if isinstance(user, dict):
                    user['name'] = invalid_scalar
            if settings_category_mode:
                invalid_scalar = {'toString': None, 'valueOf': None}
                settings['propertyName'] = 'Category Shape Test'
                settings['categories'] = ['Office', invalid_scalar, None, 42, ' Office ', 'Other', 'Office']
                settings['receiptCategories'] = invalid_scalar
                settings['nextVoucherNo'] = 201
                settings['nextReceiptNo'] = 12
                settings['openingBalance'] = 0
            route.fulfill(response=response, json=payload)
        else:
            route.fulfill(response=response)

    page.route('**/api?*', tamper_bootstrap_settings)
    with page.expect_response(
        lambda response: '/api?' in response.url
        and json.loads(response.request.post_data or '{}').get('action') == 'bootstrap'
    ):
        page.reload(wait_until='domcontentloaded')
    page.wait_for_selector('#nav button')
    page.wait_for_function(
        "document.querySelector('#brand').textContent === 'Attribute Context Test'"
    )
    page.click('[data-v=set]')
    page.wait_for_selector('#sq')
    page.wait_for_timeout(250)
    check(
        page.locator('#sf svg, #sf img').count() == 0
        and not page.evaluate('window.__xssFired === true')
        and page.locator('#sq').get_attribute('value') == settings_attribute_payload
        and page.locator('#sr').get_attribute('value') == settings_attribute_payload
        and page.locator('#so').get_attribute('value') == settings_attribute_payload,
        'malformed bootstrap settings remain literal attribute data, not active markup',
    )
    settings_object_mode = True
    with page.expect_response(
        lambda response: '/api?' in response.url
        and json.loads(response.request.post_data or '{}').get('action') == 'bootstrap'
    ):
        page.reload(wait_until='domcontentloaded')
    page.wait_for_selector('#nav button')
    page.wait_for_function(
        "document.querySelector('#brand').textContent === 'Attribute Context Test'"
    )
    page.click('[data-v=set]')
    page.wait_for_selector('#sq')
    check(
        page.locator('#sq').count() == 1
        and page.locator('#sr').count() == 1
        and page.locator('#so').count() == 1
        and page.locator('#sq').get_attribute('value') == ''
        and page.locator('#sr').get_attribute('value') == ''
        and page.locator('#so').get_attribute('value') == ''
        and page.locator('#sf svg, #sf img').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'object-valued settings with hostile coercion hooks render blank without crashing or injecting markup',
    )

    settings_identity_object_mode = True
    with page.expect_response(
        lambda response: '/api?' in response.url
        and json.loads(response.request.post_data or '{}').get('action') == 'bootstrap'
    ):
        page.reload(wait_until='domcontentloaded')
    page.wait_for_selector('#nav button')
    page.wait_for_function("document.querySelector('#brand').textContent === 'Cash Vouchers'")
    check(
        page.locator('#brand').inner_text() == 'Cash Vouchers'
        and page.title() == 'Vouchers'
        and page.locator('#who').inner_text().strip() == 'owner'
        and page.locator('#nav button').count() > 0
        and not page.evaluate('window.__xssFired === true'),
        'object-valued property and profile names stay inert and do not abort navigation bootstrap',
    )
    page.click('[data-v=set]')
    page.wait_for_selector('#sn')
    check(
        page.locator('#sn').input_value() == ''
        and page.locator('#sf img, #sf svg').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'Settings remains usable when bootstrap display fields are non-scalar',
    )

    settings_identity_object_mode = False
    settings_object_mode = False
    settings_category_mode = True
    with page.expect_response(
        lambda response: '/api?' in response.url
        and json.loads(response.request.post_data or '{}').get('action') == 'bootstrap'
    ):
        page.reload(wait_until='domcontentloaded')
    page.wait_for_selector('#nav button')
    page.wait_for_function("document.querySelector('#brand').textContent === 'Category Shape Test'")
    page.click('[data-v=set]')
    page.wait_for_selector('#sc')
    check(
        page.locator('#sc').input_value() == 'Office\nOther'
        and page.locator('#sx').input_value() == 'Other'
        and page.locator('#sf img, #sf svg').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'malformed category setting arrays normalize to string-only lists in Settings',
    )
    page.click('[data-v=new]')
    page.wait_for_selector('#rows .erow .rc')
    check(
        page.locator('#rows .erow .rci').input_value() == ''
        and 'CASH_OUT' in page.locator('#rows .erow .ci-suggestion').inner_text(),
        'new payment requires explicit classification while showing a non-binding suggestion',
    )
    page.locator('#rows .erow .rv').fill('Cash Impact Test Vendor')
    page.locator('#rows .erow .ra').fill('10')
    page.locator('#nsave').click()
    check(
        page.locator('#rows .erow .row-error').inner_text()
        == 'Choose a cash-impact classification before saving.',
        'saving without cash-impact selection is blocked with an actionable error',
    )
    page.select_option('#rows .erow .rci', 'NO_CASH')
    page.select_option('#rows .erow .rc', 'Office')
    check(
        page.locator('#rows .erow .rci').input_value() == 'NO_CASH',
        'category changes do not overwrite explicit cash-impact choice',
    )
    check(
        page.locator('#rows .erow .rc option').all_text_contents() == ['Office', 'Other']
        and page.locator('#rows .erow .rc option').count() == 2
        and page.locator('#rows .erow .rc option').evaluate_all(
            "options => options.every(option => typeof option.value === 'string')"
        )
        and not page.evaluate('window.__xssFired === true'),
        'payment category options render only valid string categories',
    )
    page.click('[data-act=ntype][data-k=RECEIPT]')
    check(
        page.locator('#rows .erow .rc option').all_text_contents() == ['Other']
        and page.locator('#rows .erow .rc option').count() == 1
        and not page.evaluate('window.__xssFired === true'),
        'receipt category options fail safely to Other for malformed settings',
    )

    settings_category_mode = False
    page.unroute('**/api?*', tamper_bootstrap_settings)
    page.reload(wait_until='domcontentloaded')
    page.wait_for_selector('#nav button')

    page.wait_for_function("!!localStorage.getItem('cv.offlineAuth')", timeout=12000)
    stored_offline_credential = page.evaluate("localStorage.getItem('cv.offlineAuth')")
    check(
        stored_offline_credential is not None
        and '579246' not in stored_offline_credential
        and json.loads(stored_offline_credential).get('version') == 1,
        'successful online sign-in stores only a versioned PIN verifier, never the raw PIN',
    )
    page.evaluate("localStorage.removeItem('cv.token')")
    page.evaluate("navigator.serviceWorker.ready.then(() => true)")
    context.set_offline(True)
    page.reload(wait_until='domcontentloaded')
    page.wait_for_selector('#loginForm', timeout=10000)

    page.fill('#lEmail', 'owner@test.com')
    page.fill('#lPin', '000000')
    page.click('#lBtn')
    page.wait_for_selector('#lErr:not(:empty)', timeout=8000)
    check(
        'Connect and sign in to verify this account.' in page.locator('#lErr').inner_text()
        and page.locator('#nav button').count() == 0,
        'offline unlock rejects an incorrect PIN without opening the application',
    )

    page.fill('#lEmail', 'owner@test.com')
    page.fill('#lPin', '579246')
    page.click('#lBtn')
    page.wait_for_selector('#nav button', timeout=10000)
    page.wait_for_function(
        "document.querySelector('#banner')?.innerText.includes('Offline workspace')",
        timeout=10000,
    )
    check(
        page.locator('#nav button').count() == 4
        and page.locator('[data-v=new]').count() == 1
        and page.locator('[data-v=reg]').count() == 1
        and page.locator('[data-v=acct]').count() == 1
        and page.locator('[data-v=users], [data-v=set], [data-v=audit], [data-v=vend], [data-v=reports], [data-v=bulk]').count() == 0
        and page.evaluate("!localStorage.getItem('cv.token')"),
        'correct offline PIN opens a local workspace, hides privileged routes and issues no server token',
    )
    check(
        'server vouchers are unavailable' in page.locator('#banner').inner_text().lower()
        and page.locator('#banner [data-act=reconnect-signin]').inner_text() == 'Sign in to sync',
        'offline workspace states its limitations and offers a clear online sign-in path',
    )

    offline_create_requests = []
    offline_sync_actions = []

    def track_offline_create(request):
        if request.method != 'POST':
            return
        try:
            action = json.loads(request.post_data or '{}').get('action')
        except (TypeError, ValueError):
            return
        if action in ('login', 'bootstrap', 'createVouchers'):
            offline_sync_actions.append(action)
        if action == 'createVouchers':
            offline_create_requests.append(request.url)

    page.on('request', track_offline_create)
    page.click('[data-v=new]')
    page.wait_for_selector('#nf')
    page.fill('.rv', 'Offline Unlock Vendor')
    page.fill('.ra', '42')
    with open('/tmp/offline-unlock.png', 'wb') as image_file:
        image_file.write(png)
    page.set_input_files('.rf', '/tmp/offline-unlock.png')
    page.wait_for_selector('.thumb')
    choose_cash_impact_for_current_rows()
    page.click('#nsave')
    page.wait_for_selector('#nres .ok-panel', timeout=10000)
    check(
        'Saved on this device' in page.locator('#nres').inner_text()
        and 'Sign in online to synchronize' in page.locator('#nres').inner_text()
        and page.evaluate("!localStorage.getItem('cv.token')"),
        'offline-unlocked entry saves locally and explicitly requires online sign-in to sync',
    )
    offline_records = page.evaluate(
        """async () => {
          const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('cash-voucher', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const records = await new Promise((resolve, reject) => {
            const request = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          db.close();
          return records.filter(record => record.entry?.vendor === 'Offline Unlock Vendor');
        }"""
    )
    check(
        len(offline_records) == 1
        and offline_records[0]['status'] == 'pending'
        and offline_records[0]['ownerKey'].endswith('|owner@test.com')
        and offline_records[0]['entry']['amount'] == 42
        and len(offline_records[0]['entry']['receipts']) == 1
        and offline_records[0]['entry']['receipts'][0]['mime'] == 'image/jpeg'
        and bool(offline_records[0]['entry']['receipts'][0]['data']),
        'offline-unlocked payment and compressed receipt are preserved in the account-bound outbox',
    )
    check(
        offline_create_requests == []
        and offline_sync_actions == []
        and '1 payment waiting to upload' in page.locator('#banner').inner_text(),
        'offline-unlocked save makes no server create request and exposes pending queue status',
    )
    queued_review = page.locator('.outbox-pending')
    queued_review.locator('summary').click()
    check(
        queued_review.locator('summary').inner_text() == 'Review queued entries'
        and 'Offline Unlock Vendor' in queued_review.inner_text()
        and 'Waiting to upload' in queued_review.inner_text()
        and '₹' in queued_review.inner_text()
        and offline_records[0]['entry']['date'] in queued_review.inner_text()
        and '1 receipt image' in queued_review.inner_text(),
        'queue review shows an owned pending voucher, amount, date, status and receipt count',
    )

    # Simulate locally modified IndexedDB text to prove the new queue renderer escapes it.
    hostile_queued_vendor = '<img src=x onerror=window.__xssFired=true>'

    def unlock_offline_owner():
        page.wait_for_selector('#loginForm', timeout=10000)
        page.fill('#lEmail', 'owner@test.com')
        page.fill('#lPin', '579246')
        page.click('#lBtn')

    page.evaluate(
        """async (hostileVendor) => {
          const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('cash-voucher', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          await new Promise((resolve, reject) => {
            const transaction = db.transaction('outbox', 'readwrite');
            const store = transaction.objectStore('outbox');
            const request = store.getAll();
            request.onsuccess = () => {
              const target = request.result.find(
                record => record.entry?.vendor === 'Offline Unlock Vendor'
              );
              if (!target) {
                transaction.abort();
                reject(new Error('Offline queue fixture disappeared.'));
                return;
              }
              target.entry.vendor = hostileVendor;
              store.put(target);
            };
            request.onerror = () => reject(request.error);
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error || new Error('Queue fixture mutation aborted.'));
          });
          db.close();
        }""",
        hostile_queued_vendor,
    )
    page.reload(wait_until='domcontentloaded')
    unlock_offline_owner()
    page.wait_for_selector('.outbox-pending', timeout=10000)
    page.locator('.outbox-pending summary').click()
    queued_review_text = page.locator('.outbox-pending').inner_text()
    check(
        hostile_queued_vendor in queued_review_text
        and page.locator('.outbox-pending img, .outbox-pending svg').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'tampered local queue vendor content remains inert text in the review list',
    )
    page.evaluate(
        """async () => {
          const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('cash-voucher', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          await new Promise((resolve, reject) => {
            const transaction = db.transaction('outbox', 'readwrite');
            const store = transaction.objectStore('outbox');
            const request = store.getAll();
            request.onsuccess = () => {
              const target = request.result.find(
                record => record.entry?.vendor === '<img src=x onerror=window.__xssFired=true>'
              );
              if (!target) {
                transaction.abort();
                reject(new Error('Tampered queue fixture could not be recovered.'));
                return;
              }
              target.entry.vendor = 'Offline Unlock Vendor';
              store.put(target);
            };
            request.onerror = () => reject(request.error);
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error || new Error('Queue fixture restore aborted.'));
          });
          db.close();
        }"""
    )
    page.reload(wait_until='domcontentloaded')
    unlock_offline_owner()
    page.wait_for_selector('.outbox-pending', timeout=10000)
    page.locator('.outbox-pending summary').click()
    check(
        'Offline Unlock Vendor' in page.locator('.outbox-pending').inner_text(),
        'queue review resumes after the hostile local fixture is restored',
    )

    # Exclude the offline-startup bootstrap attempts from the subsequent reconnect window.
    offline_sync_actions.clear()
    context.set_offline(False)
    page.wait_for_timeout(350)
    still_queued = page.evaluate(
        """async () => {
          const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('cash-voucher', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const records = await new Promise((resolve, reject) => {
            const request = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          db.close();
          return records.filter(record => record.entry?.vendor === 'Offline Unlock Vendor');
        }"""
    )
    check(
        len(offline_create_requests) == 0
        and offline_sync_actions == []
        and len(still_queued) == 1
        and still_queued[0]['status'] == 'pending'
        and page.evaluate("!localStorage.getItem('cv.token')")
        and 'Offline workspace' in page.locator('#banner').inner_text(),
        'network recovery alone does not upload local-only entries before online authentication',
    )
    page.click('#banner [data-act=reconnect-signin]')
    page.wait_for_selector('#loginForm', timeout=8000)
    page.fill('#lEmail', 'owner@test.com')
    page.fill('#lPin', '579246')
    page.click('#lBtn')
    page.wait_for_function("document.querySelectorAll('#nav button').length === 11", timeout=10000)
    page.wait_for_function(
        """async () => {
          const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('cash-voucher', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const records = await new Promise((resolve, reject) => {
            const request = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          db.close();
          return !records.some(record => record.entry?.vendor === 'Offline Unlock Vendor');
        }""",
        timeout=15000,
    )
    check(
        page.evaluate("!!localStorage.getItem('cv.token')")
        and (
            page.locator('#banner').is_hidden()
            or 'offline workspace' not in page.locator('#banner').inner_text().lower()
        ),
        'online sign-in restores the server-verified owner workspace',
    )
    check(
        page.evaluate("!!localStorage.getItem('cv.token')"),
        'offline-unlocked queue entry synchronizes only after online authentication',
    )
    required_sync_actions = ['login', 'bootstrap', 'createVouchers']
    check(
        all(action in offline_sync_actions for action in required_sync_actions)
        and [
            offline_sync_actions.index(action)
            for action in required_sync_actions
        ] == sorted(
            offline_sync_actions.index(action)
            for action in required_sync_actions
        ),
        'online login, server bootstrap and voucher upload occur in order before queue drain',
    )
    page.remove_listener('request', track_offline_create)

    page.click('[data-v=acct]')
    page.click('[data-act=signout]')
    page.wait_for_selector('#loginForm')

    def login(email, pin):
        page.fill('#lEmail', email)
        page.fill('#lPin', pin)
        page.click('#lBtn')

    login('stored-xss@test.com', '258369')
    page.wait_for_selector('#op')
    page.fill('#op', '258369')
    page.fill('#np', '852741')
    page.click('.mcard .primary')
    page.wait_for_selector('#nav button')
    check(
        xss_payload in page.locator('#who').inner_text()
        and page.locator('#who img, #who svg').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'stored user name is inert text in the signed-in account label',
    )
    page.click('[data-v=acct]')
    page.click('[data-act=signout]')
    page.wait_for_selector('#loginForm')

    login('s@test.com', '135790')
    page.wait_for_selector('#op')
    page.fill('#op', '135790')
    page.fill('#np', '975310')
    page.click('.mcard .primary')
    page.wait_for_selector('#nav button')
    check(page.locator('#nav button').count() == 4, 'staff sees 4 nav items (dash,new,reg,acct)')

    page.click('[data-v=new]')
    page.wait_for_selector('#nf')
    check(
        page.locator('.rv').first.get_attribute('aria-label') == 'Payee / vendor, row 1'
        and page.locator('.ra').first.get_attribute('aria-label') == 'Amount in rupees, row 1'
        and page.locator('.rc').first.get_attribute('aria-label') == 'Category, row 1'
        and page.locator('.rci').first.get_attribute('aria-label') == 'Cash impact, row 1',
        'payment row fields have explicit accessible names',
    )
    choose_cash_impact_for_current_rows()
    page.click('#nsave')
    page.wait_for_selector('#nres .form-error')
    check(
        'Add at least one payment' in page.inner_text('#nres')
        and page.evaluate("document.activeElement === document.querySelector('.rv')"),
        'empty form submission is announced and focuses the first row',
    )
    page.fill('.rv', 'Ram Traders')
    choose_cash_impact_for_current_rows()
    page.click('#nsave')
    page.wait_for_selector('.row-error')
    check(
        'valid amount' in page.inner_text('.row-error')
        and page.locator('.ra').first.get_attribute('aria-invalid') == 'true'
        and page.evaluate("document.activeElement === document.querySelector('.ra')"),
        'invalid payment amount is announced and focused for correction',
    )
    page.fill('.ra', '1,250.50')
    page.wait_for_function("document.querySelector('.row-error') === null")
    check(
        page.locator('.ra').first.get_attribute('aria-invalid') is None,
        'payment validation state clears when the amount is corrected',
    )
    page.fill('.ra', '1,250.50')
    page.select_option('.rc', 'Kitchen')
    xss_note = '<img src=x onerror=window.__xssFired=true>'
    page.fill('.rn', xss_note)
    with open('/tmp/r.png', 'wb') as image_file:
        image_file.write(png)
    page.set_input_files('.rf', '/tmp/r.png')
    page.wait_for_selector('.thumb')
    receipt_preview_url = page.locator('.thumb').first.get_attribute('src')
    check(
        receipt_preview_url.startswith('blob:')
        and page.evaluate("url => window.__createdObjectUrls.includes(url)", receipt_preview_url),
        'receipt preview source is a tracked generated blob URL',
    )
    page.press('.ra', 'Enter')
    check(page.locator('.erow').count() == 2, 'enter adds row')
    check(
        page.locator('.rv').nth(1).get_attribute('aria-label') == 'Payee / vendor, row 2'
        and page.locator('.ra').nth(1).get_attribute('aria-label') == 'Amount in rupees, row 2',
        'added payment row receives distinct accessible names',
    )
    page.locator('.rv').nth(1).fill('Shiv Gas')
    page.locator('.ra').nth(1).fill('900')
    second_row = page.locator('.erow').nth(1)
    second_row.locator('.rf').set_input_files('/tmp/r.png')
    page.wait_for_function("document.querySelectorAll('.erow .thumb').length === 2")
    cleared_preview_url = second_row.locator('.thumb').get_attribute('src')
    second_row.locator('[data-act=clrrec]').click()
    page.wait_for_function(
        "url => window.__revokedObjectUrls.includes(url)", arg=cleared_preview_url
    )
    check(
        page.evaluate("url => window.__revokedObjectUrls.includes(url)", cleared_preview_url)
        and second_row.locator('.thumb').count() == 0,
        'clearing a receipt removes its preview and revokes its object URL',
    )
    second_row.locator('.rf').set_input_files('/tmp/r.png')
    page.wait_for_function("document.querySelectorAll('.erow .thumb').length === 2")
    removed_preview_url = second_row.locator('.thumb').get_attribute('src')
    second_row.locator('[data-act=delrow]').click()
    page.wait_for_function(
        "url => window.__revokedObjectUrls.includes(url)", arg=removed_preview_url
    )
    check(
        page.locator('.erow').count() == 1
        and page.locator('.rv').first.get_attribute('aria-label') == 'Payee / vendor, row 1'
        and page.evaluate("document.activeElement === document.querySelector('.rv')")
        and page.evaluate("url => window.__revokedObjectUrls.includes(url)", removed_preview_url),
        'removing a receipt row restores focus and revokes its preview URL',
    )
    page.click('[data-act=addrow]')
    page.wait_for_function("document.querySelectorAll('.erow').length === 2")
    page.locator('.rv').nth(1).fill('Shiv Gas')
    page.locator('.ra').nth(1).fill('900')

    # A malformed server response must not become active HTML in the save confirmation.
    success_number_payload = '<svg onload=window.__xssFired=true></svg>'

    def tamper_created_voucher_number(route):
        request_data = json.loads(route.request.post_data or '{}')
        response = route.fetch()
        payload = response.json()
        created = payload.get('data', {}).get('created', [])
        if request_data.get('action') == 'createVouchers' and created:
            created[0]['no'] = success_number_payload
            route.fulfill(response=response, json=payload)
        else:
            route.fulfill(response=response)

    page.route('**/api?*', tamper_created_voucher_number)
    choose_cash_impact_for_current_rows()
    page.click('#nsave')
    page.wait_for_selector('.ok-panel')
    check('Saved 2 payments' in page.inner_text('#nres'), 'saved 2 payments')
    check(
        page.locator('#nres svg').count() == 0
        and success_number_payload in page.locator('#nres').inner_text()
        and not page.evaluate('window.__xssFired === true'),
        'server-returned voucher number remains inert text in save confirmation',
    )
    page.unroute('**/api?*', tamper_created_voucher_number)
    check(
        page.evaluate("url => window.__revokedObjectUrls.includes(url)", receipt_preview_url),
        'successful online save releases the receipt preview object URL',
    )

    # Clearing an existing receipt while a second compression is pending must not
    # allow the late result to repopulate the cleared row.
    page.click('[data-act=newagain]')
    page.wait_for_selector('#nf')
    page.set_input_files('.rf', '/tmp/r.png')
    page.wait_for_selector('.thumb')
    page.evaluate(
        """() => {
            window.__nativeToBlob = HTMLCanvasElement.prototype.toBlob;
            window.__pendingToBlob = null;
            HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
                window.__pendingToBlob = { canvas: this, callback, type, quality };
            };
        }"""
    )
    created_before_clear_race = page.evaluate('window.__createdObjectUrls.length')
    page.set_input_files('.rf', '/tmp/r.png')
    page.wait_for_function('window.__pendingToBlob !== null')
    page.locator('.erow').first.locator('[data-act=clrrec]').click()
    page.evaluate(
        """() => {
            const pending = window.__pendingToBlob;
            window.__pendingToBlob = null;
            HTMLCanvasElement.prototype.toBlob = window.__nativeToBlob;
            if (!pending) throw new Error('Expected the delayed canvas conversion.');
            window.__nativeToBlob.call(
                pending.canvas,
                pending.callback,
                pending.type,
                pending.quality,
            );
        }"""
    )
    page.wait_for_function(
        'count => window.__createdObjectUrls.length >= count',
        arg=created_before_clear_race + 2,
    )
    cleared_late_preview_url = page.evaluate(
        'window.__createdObjectUrls[window.__createdObjectUrls.length - 1]'
    )
    page.wait_for_function(
        'url => window.__revokedObjectUrls.includes(url)', arg=cleared_late_preview_url
    )
    check(
        page.evaluate("url => window.__revokedObjectUrls.includes(url)", cleared_late_preview_url)
        and page.locator('.erow').first.locator('.thumb').count() == 0,
        'clearing during compression revokes the late preview and keeps the row cleared',
    )

    # Leaving an unsaved entry must release previews even though no save occurs.
    page.set_input_files('.rf', '/tmp/r.png')
    page.wait_for_selector('.thumb')
    abandoned_preview_url = page.locator('.thumb').first.get_attribute('src')
    page.click('[data-v=dash]')
    page.wait_for_function(
        "document.querySelector('[data-v=dash]')?.getAttribute('aria-current') === 'page'"
    )
    check(
        page.evaluate("url => window.__revokedObjectUrls.includes(url)", abandoned_preview_url)
        and page.locator('#nf').count() == 0,
        'navigating away from an unsaved entry revokes its receipt preview URL',
    )

    # Force image compression to finish after its row has been detached.
    page.click('[data-v=new]')
    page.wait_for_selector('#nf')
    page.evaluate(
        """() => {
            window.__nativeToBlob = HTMLCanvasElement.prototype.toBlob;
            window.__pendingToBlob = null;
            HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
                window.__pendingToBlob = { canvas: this, callback, type, quality };
            };
        }"""
    )
    created_before = page.evaluate('window.__createdObjectUrls.length')
    page.set_input_files('.rf', '/tmp/r.png')
    page.wait_for_function('window.__pendingToBlob !== null')
    page.click('[data-v=dash]')
    page.wait_for_function(
        "document.querySelector('[data-v=dash]')?.getAttribute('aria-current') === 'page'"
    )
    page.evaluate(
        """() => {
            const pending = window.__pendingToBlob;
            window.__pendingToBlob = null;
            HTMLCanvasElement.prototype.toBlob = window.__nativeToBlob;
            if (!pending) throw new Error('Expected the delayed canvas conversion.');
            window.__nativeToBlob.call(
                pending.canvas,
                pending.callback,
                pending.type,
                pending.quality,
            );
        }"""
    )
    page.wait_for_function(
        'count => window.__createdObjectUrls.length >= count',
        arg=created_before + 2,
    )
    late_preview_url = page.evaluate(
        'window.__createdObjectUrls[window.__createdObjectUrls.length - 1]'
    )
    page.wait_for_function(
        'url => window.__revokedObjectUrls.includes(url)', arg=late_preview_url
    )
    check(
        page.evaluate("url => window.__revokedObjectUrls.includes(url)", late_preview_url)
        and page.locator('#nf').count() == 0,
        'compression finishing after navigation revokes its preview URL instead of retaining it',
    )

    page.click('[data-v=reg]')
    page.wait_for_selector('#rbody tr')
    check(
        page.locator('#rq').get_attribute('aria-label') == 'Search vouchers by number, vendor or note'
        and page.locator('#rv').get_attribute('aria-label') == 'Filter by vendor'
        and page.locator('#rc').get_attribute('aria-label') == 'Filter by category'
        and page.locator('#rt').get_attribute('aria-label') == 'Filter by transaction type'
        and page.locator('#rs').get_attribute('aria-label') == 'Filter by status',
        'register search and filter controls have explicit accessible names',
    )
    check(page.locator('#rbody tr').count() == 2, 'staff register 2 rows')
    page.fill('#rq', 'No matching voucher 987654')
    page.wait_for_function("!document.querySelector('#rempty').classList.contains('hidden')")
    check(
        page.locator('#rempty .empty-state-message').inner_text() == 'No vouchers match the current filters.'
        and page.locator('#rempty [data-act=rclear]').is_visible(),
        'register explains an empty filter result and offers a clear-filters action',
    )
    page.click('#rempty [data-act=rclear]')
    check(
        page.locator('#rq').input_value() == ''
        and page.locator('#rbody tr').count() == 2,
        'empty-state clear-filters action restores matching vouchers',
    )
    page.fill('#rfrom', '2026-10-20')
    page.fill('#rto', '2026-10-10')
    check(
        'The start date must be on or before the end date.' in page.locator('#rempty').inner_text()
        and 'Totals unavailable' in page.locator('#rtot').inner_text()
        and page.locator('#rf [data-act=csv]').is_disabled()
        and page.locator('#rempty [data-act=rclear]').is_visible(),
        'invalid register date range blocks misleading totals and CSV export with a recovery action',
    )
    page.click('#rempty [data-act=rclear]')
    check(
        page.locator('#rbody tr').count() == 2
        and not page.locator('#rf [data-act=csv]').is_disabled(),
        'clearing an invalid register range restores rows and export availability',
    )
    check(
        xss_note in page.locator('#rbody').inner_text()
        and page.locator('#rbody img').count() == 0,
        'user-controlled note is rendered as text, not executable HTML',
    )

    # Treat a malformed persisted voucher number as untrusted at every HTML sink.
    number_payload = '<svg onload=window.__xssFired=true></svg>'

    def tamper_bootstrap_voucher_number(route):
        request_data = json.loads(route.request.post_data or '{}')
        response = route.fetch()
        payload = response.json()
        vouchers = payload.get('data', {}).get('vouchers', [])
        if request_data.get('action') == 'bootstrap' and vouchers:
            vouchers[0]['no'] = number_payload
            route.fulfill(response=response, json=payload)
        else:
            route.fulfill(response=response)

    page.route('**/api?*', tamper_bootstrap_voucher_number)
    page.locator('[data-act=refresh]').click()
    page.wait_for_function(
        "document.querySelector('#rbody').innerText.includes(" + json.dumps(number_payload) + ")"
    )
    check(
        page.locator('#rbody svg').count() == 0
        and number_payload in page.locator('#rbody').inner_text()
        and not page.evaluate('window.__xssFired === true'),
        'malformed persisted voucher number remains inert text in the register',
    )
    page.locator('#rbody [data-act=print]').first.click()
    page.wait_for_function("document.querySelector('#printArea .pv') !== null")
    check(
        page.locator('#printArea svg').count() == 0
        and number_payload in (page.locator('#printArea').text_content() or '')
        and not page.evaluate('window.__xssFired === true'),
        'malformed persisted voucher number remains inert text in the print template',
    )
    page.unroute('**/api?*', tamper_bootstrap_voucher_number)
    page.locator('[data-act=refresh]').click()
    page.wait_for_function(
        "document.querySelector('#rbody').innerText.includes('Ram Traders')"
    )
    check(
        page.locator('[data-act=edit]').count() == 0 and page.locator('[data-act=cancel]').count() == 0,
        'staff has no edit/cancel',
    )

    receipt_failure = {'remaining': 1}

    def fail_first_receipt(route):
        request_data = json.loads(route.request.post_data or '{}')
        if request_data.get('action') == 'getReceipt' and receipt_failure['remaining']:
            receipt_failure['remaining'] -= 1
            route.fulfill(
                status=200,
                content_type='application/json',
                body=json.dumps({
                    'ok': False,
                    'error': 'Temporary receipt service error.',
                    'code': 'TEMP',
                }),
            )
        else:
            route.continue_()

    page.route('**/api?*', fail_first_receipt)
    page.locator('#rbody tr', has_text='Ram Traders').locator('[data-act=rec]').click()
    page.wait_for_selector('#rimgs [data-act=retry-receipt]')
    check(
        'Temporary receipt service error.' in page.locator('#rimgs').inner_text()
        and page.locator('#rimgs [role=alert]').count() == 1,
        'receipt load failure is announced and exposes a retry action',
    )
    page.click('#rimgs [data-act=retry-receipt]')
    page.wait_for_selector('.rimg')
    check(
        page.locator('.rimg').count() >= 1
        and page.locator('#rimgs [data-act=retry-receipt]').count() == 0,
        'receipt retry recovers and displays the image',
    )
    page.unroute('**/api?*', fail_first_receipt)
    page.click('[data-x]')

    # Force one bootstrap failure to verify visible refresh progress and recovery.
    page.evaluate("""() => {
      const originalFetch = window.fetch.bind(window);
      window.__failNextBootstrap = true;
      window.fetch = (input, init = {}) => {
        let body;
        try { body = JSON.parse(init.body || '{}'); } catch {}
        if (window.__failNextBootstrap && body?.action === 'bootstrap') {
          window.__failNextBootstrap = false;
          return new Promise((resolve, reject) => {
            setTimeout(() => reject(new TypeError('Failed to fetch')), 200);
          });
        }
        return originalFetch(input, init);
      };
    }""")
    page.locator('[data-act=refresh]').click()
    page.wait_for_function(
        "document.querySelector('[data-act=refresh]')?.getAttribute('aria-busy') === 'true'"
    )
    check(
        page.locator('[data-act=refresh]').is_disabled()
        and page.locator('[data-act=refresh]').inner_text() == 'Refreshing…',
        'register refresh exposes a disabled progress state',
    )
    page.wait_for_function(
        "document.querySelector('.toast.err')?.innerText.includes('No connection to the server')"
    )
    check(
        not page.locator('[data-act=refresh]').is_disabled()
        and page.locator('[data-act=refresh]').get_attribute('aria-busy') is None,
        'failed register refresh restores the control for retry',
    )
    note_row = page.locator('#rbody tr', has_text='Ram Traders').first
    note_row.locator('[data-act=print]').evaluate("window.print = () => {}")
    note_row.locator('[data-act=print]').click()
    page.wait_for_timeout(200)
    print_text = page.locator('#printArea').inner_text()
    check(
        'Rupees' in print_text
        and 'One Thousand Two Hundred Fifty Rupees and Fifty Paise Only' in print_text
        and xss_note in print_text
        and page.locator('#printArea img, #printArea svg').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'stored voucher note remains text in printable output',
    )

    context.set_offline(True)
    page.click('[data-v=new]')
    page.fill('.rv', 'Offline Vendor')
    page.fill('.ra', '75')
    page.set_input_files('.rf', '/tmp/r.png')
    page.wait_for_selector('.thumb')
    offline_receipt_preview_url = page.locator('.thumb').first.get_attribute('src')
    choose_cash_impact_for_current_rows()
    page.click('#nsave')
    page.wait_for_selector('.ok-panel')
    check('Saved on this device' in page.inner_text('#nres'), 'offline queued')
    check(
        page.evaluate("url => window.__revokedObjectUrls.includes(url)", offline_receipt_preview_url),
        'successful offline queueing releases the receipt preview URL',
    )
    check(not page.locator('#banner').is_hidden(), 'banner shown')

    with page.expect_download() as download_info:
        page.click('[data-act=export-pending]')
    pending_download = download_info.value
    pending_export_path = pending_download.path()
    check(
        pending_download.suggested_filename.startswith('cash-vouchers-pending-')
        and pending_download.suggested_filename.endswith('.json')
        and pending_export_path is not None,
        'pending export downloads JSON',
    )

    page.reload(wait_until='domcontentloaded')
    page.wait_for_selector('#banner:not(.hidden)', timeout=8000)
    check('1 payment waiting to upload' in page.inner_text('#banner'), 'offline queue survives page restart')
    page.click('[data-v=dash]')
    offline_dashboard_text = page.locator('#view').inner_text()
    check(
        'Voucher data is unavailable while offline.' in offline_dashboard_text
        and page.locator('#view .stats').count() == 0
        and page.locator('#view svg.chart, #view .hb').count() == 0
        and not page.locator('[data-act=refresh]').is_disabled(),
        'offline startup withholds unverified Dashboard totals and charts while preserving refresh recovery',
    )
    page.click('[data-v=reg]')
    offline_register_text = page.locator('#view').inner_text()
    check(
        'Voucher data is unavailable while offline.' in offline_register_text
        and 'Totals unavailable while offline.' in offline_register_text
        and page.locator('#rempty .empty-state-message').inner_text().startswith('Voucher data is unavailable while offline.')
        and page.locator('#view #rbody tr').count() == 0
        and page.locator('#rf [data-act=csv]').is_disabled(),
        'offline Register does not present zero-like totals, empty records, or CSV export as valid data',
    )
    page.click('[data-v=new]')

    def select_recovery_file(file_path, accept_dialog=False):
        selector = '#banner [data-act=import-pending]'
        if not page.locator(selector).is_visible():
            selector = '#view [data-act=import-pending]'
        if accept_dialog:
            page.once('dialog', lambda dialog: dialog.accept())
        with page.expect_file_chooser() as chooser_info:
            page.locator(selector).click()
        chooser_info.value.set_files(file_path)

    def import_recovery_file(file_path):
        select_recovery_file(file_path, accept_dialog=True)

    import_recovery_file(pending_export_path)
    page.wait_for_function(
        "document.querySelector('#toast').innerText.includes('matching item(s) already queued and skipped')",
        timeout=8000,
    )
    check('1 payment waiting to upload' in page.inner_text('#banner'), 'duplicate recovery import is skipped')

    with open(pending_export_path, encoding='utf-8') as recovery_file:
        recovery_payload = json.load(recovery_file)
    conflicting_payload = json.loads(json.dumps(recovery_payload))
    conflicting_payload['records'][0]['entry']['vendor'] = 'Conflicting Vendor'
    conflict_path = '/tmp/cash-voucher-recovery-conflict.json'
    with open(conflict_path, 'w', encoding='utf-8') as conflict_file:
        json.dump(conflicting_payload, conflict_file)

    import_recovery_file(conflict_path)
    page.wait_for_function(
        "document.querySelector('#toast').innerText.includes('different details. Nothing was imported.')",
        timeout=8000,
    )
    check(
        '1 payment waiting to upload' in page.inner_text('#banner'),
        'conflicting recovery import preserves original queued payment',
    )

    def write_recovery_variant(filename, mutate):
        variant = json.loads(json.dumps(recovery_payload))
        mutate(variant)
        path = '/tmp/' + filename
        with open(path, 'w', encoding='utf-8') as recovery_file:
            json.dump(variant, recovery_file)
        return path

    hostile_id_path = write_recovery_variant(
        'cash-voucher-recovery-hostile-id.json',
        lambda payload: payload['records'][0].update({
            'clientId': {'toString': None, 'valueOf': None},
        }),
    )
    select_recovery_file(hostile_id_path)
    page.wait_for_function(
        "document.querySelector('#toast').innerText.includes('invalid payment ID')",
        timeout=8000,
    )
    check(
        '1 payment waiting to upload' in page.inner_text('#banner'),
        'hostile recovery IDs are rejected without coercion or queue mutation',
    )

    hostile_owner_path = write_recovery_variant(
        'cash-voucher-recovery-hostile-owner.json',
        lambda payload: payload['records'][0].update({
            'ownerKey': {'toString': None, 'valueOf': None},
        }),
    )
    select_recovery_file(hostile_owner_path)
    page.wait_for_function(
        "document.querySelector('#toast').innerText.includes('invalid account binding')",
        timeout=8000,
    )
    check(
        '1 payment waiting to upload' in page.inner_text('#banner'),
        'hostile recovery account bindings are rejected without queue mutation',
    )

    hostile_receipt_path = write_recovery_variant(
        'cash-voucher-recovery-hostile-receipt.json',
        lambda payload: payload['records'][0]['entry'].update({
            'receipts': [{'mime': {'toString': None, 'valueOf': None}, 'data': 'AQID'}],
        }),
    )
    select_recovery_file(hostile_receipt_path)
    page.wait_for_function(
        "document.querySelector('#toast').innerText.includes('invalid or oversized receipt')",
        timeout=8000,
    )
    check(
        '1 payment waiting to upload' in page.inner_text('#banner'),
        'hostile recovery receipt metadata is rejected without coercion or queue mutation',
    )

    stale_lease_count = page.evaluate(
        """async () => {
          const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('cash-voucher', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          return await new Promise((resolve, reject) => {
            const transaction = db.transaction('outbox', 'readwrite');
            const store = transaction.objectStore('outbox');
            let count = 0;
            transaction.oncomplete = () => {
              db.close();
              resolve(count);
            };
            transaction.onerror = () => reject(transaction.error);
            const request = store.getAll();
            request.onsuccess = () => {
              request.result.forEach((record) => {
                record.status = 'sending';
                record.leaseOwner = 'abandoned-tab';
                record.leaseUntil = Date.now() - 1000;
                store.put(record);
                count++;
              });
            };
            request.onerror = () => reject(request.error);
          });
        }"""
    )
    check(stale_lease_count == 1, 'test seeds one expired lease from an abandoned tab')

    context.set_offline(False)
    page.wait_for_function(
        "document.querySelector('#banner').classList.contains('hidden')",
        timeout=15000,
    )
    drop_state = page.evaluate(
        "() => fetch('/test-status').then((response) => response.json())"
    )
    check(drop_state.get('droppedClientResponses') == 1, 'server accepted then dropped one response')
    page.click('[data-v=reg]')
    page.wait_for_timeout(500)
    page.click('[data-act=refresh]')
    page.wait_for_timeout(500)
    check(page.locator('#rbody tr').count() == 3, 'lost-response retry is idempotent')

    page.click('[data-v=new]')
    import_recovery_file(pending_export_path)
    page.wait_for_selector('#banner:not(.hidden)', timeout=8000)
    check('1 payment waiting to upload' in page.inner_text('#banner'), 'synced recovery export can be restored')
    page.click('#banner [data-act=flush]')
    page.wait_for_function(
        "document.querySelector('#banner').classList.contains('hidden')",
        timeout=8000,
    )
    page.click('[data-v=reg]')
    page.wait_for_timeout(500)
    page.click('[data-act=refresh]')
    page.wait_for_timeout(500)
    check(
        page.locator('#rbody tr').count() == 3,
        'restoring an already-synced export does not create a duplicate voucher',
    )

    second_page = context.new_page()
    second_page.goto(URL)
    second_page.wait_for_selector('#nav button')
    check(second_page.locator('#nav button').count() == 4, 'second tab shares the staff session')

    context.set_offline(True)
    page.click('[data-v=new]')
    page.fill('.rv', 'Multi-tab Vendor')
    page.fill('.ra', '525')
    choose_cash_impact_for_current_rows()
    page.click('#nsave')
    page.wait_for_selector('.ok-panel')
    check('Saved on this device' in page.inner_text('#nres'), 'multi-tab payment queued locally')
    second_page.wait_for_function(
        "document.querySelector('#banner').innerText.includes('1 payment waiting to upload')",
        timeout=8000,
    )

    context.set_offline(False)
    page.wait_for_function(
        "document.querySelector('#banner').classList.contains('hidden')",
        timeout=15000,
    )
    second_page.wait_for_function(
        "document.querySelector('#banner').classList.contains('hidden')",
        timeout=15000,
    )
    multi_tab_state = page.evaluate(
        "() => fetch('/test-status').then((response) => response.json())"
    )
    check(
        multi_tab_state.get('countedCreateRequests') == 1,
        'two tabs submit one create request for the same queued transaction',
    )
    page.click('[data-v=reg]')
    page.wait_for_timeout(400)
    page.click('[data-act=refresh]')
    page.wait_for_timeout(400)
    check(page.locator('#rbody tr').count() == 4, 'multi-tab sync creates exactly one voucher')
    second_page.close()

    # Exercise account binding: a queued payment must remain untouched by another account.
    def outbox_vendor_records(vendor):
        return page.evaluate(
            """async (vendor) => {
              const db = await new Promise((resolve, reject) => {
                const request = indexedDB.open('cash-voucher', 1);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
              });
              const records = await new Promise((resolve, reject) => {
                const request = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
                request.onsuccess = () => resolve(request.result
                  .filter((record) => record.entry.vendor === vendor)
                  .map((record) => ({
                    clientId: record.clientId,
                    ownerKey: record.ownerKey || '',
                    status: record.status,
                    failure: record.failure || '',
                  })));
                request.onerror = () => reject(request.error);
              });
              db.close();
              return records;
            }""",
            vendor,
        )

    def update_outbox_owner(vendor, owner_key):
        return page.evaluate(
            """async ({ vendor, ownerKey }) => {
              const db = await new Promise((resolve, reject) => {
                const request = indexedDB.open('cash-voucher', 1);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
              });
              let originalOwner = '';
              await new Promise((resolve, reject) => {
                const transaction = db.transaction('outbox', 'readwrite');
                const store = transaction.objectStore('outbox');
                const request = store.getAll();
                request.onsuccess = () => {
                  const record = request.result.find((item) => item.entry.vendor === vendor);
                  if (!record) {
                    transaction.abort();
                    reject(new Error('Expected outbox record was not found.'));
                    return;
                  }
                  originalOwner = record.ownerKey || '';
                  record.ownerKey = ownerKey;
                  store.put(record);
                };
                request.onerror = () => reject(request.error);
                transaction.oncomplete = resolve;
                transaction.onerror = () => reject(transaction.error);
                transaction.onabort = () => reject(transaction.error || new Error('Outbox update aborted.'));
              });
              db.close();
              return originalOwner;
            }""",
            {"vendor": vendor, "ownerKey": owner_key},
        )

    context.set_offline(True)
    page.click('[data-v=new]')
    page.fill('.rv', 'Account-bound Vendor')
    page.fill('.ra', '81')
    choose_cash_impact_for_current_rows()
    page.click('#nsave')
    page.wait_for_selector('.ok-panel')
    check('Saved on this device' in page.inner_text('#nres'), 'account-binding test payment is queued offline')

    account_records = outbox_vendor_records('Account-bound Vendor')
    check(
        len(account_records) == 1
        and account_records[0]['ownerKey'].endswith('|s@test.com')
        and account_records[0]['status'] == 'pending',
        'offline payment stores the creating account binding',
    )
    original_owner_key = account_records[0]['ownerKey']

    # Legacy/unbound records are visible for recovery but are not eligible for generic discard.
    update_outbox_owner('Account-bound Vendor', '')
    page.evaluate(
        """() => {
          const channel = new BroadcastChannel('cash-voucher-outbox');
          channel.postMessage({ type: 'changed' });
          channel.close();
        }"""
    )
    page.wait_for_function(
        "document.querySelector('#banner').innerText.includes('need account confirmation')",
        timeout=8000,
    )
    check(
        page.locator('#banner [data-act=discard]').count() == 0,
        'legacy unbound entries cannot be discarded through the signed-in account action',
    )

    update_outbox_owner(
        'Account-bound Vendor',
        original_owner_key.rsplit('|', 1)[0] + '|another-user@test.com',
    )
    context.set_offline(False)
    page.wait_for_timeout(500)
    foreign_records = outbox_vendor_records('Account-bound Vendor')
    check(
        page.locator('#banner').is_hidden()
        and len(foreign_records) == 1
        and foreign_records[0]['status'] == 'pending'
        and foreign_records[0]['ownerKey'].endswith('|another-user@test.com'),
        'another account neither sees nor uploads a foreign-bound outbox item',
    )

    # Restore the intended account binding and leave a draft open while the background sync runs.
    context.set_offline(True)
    update_outbox_owner('Account-bound Vendor', original_owner_key)
    page.click('[data-v=new]')
    page.fill('.rv', 'Draft preserved during sync')
    page.fill('.ra', '15')
    context.set_offline(False)
    page.wait_for_function(
        "document.querySelector('#banner').classList.contains('hidden')",
        timeout=10000,
    )
    page.wait_for_function(
        """async () => {
          const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('cash-voucher', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const records = await new Promise((resolve, reject) => {
            const request = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          db.close();
          return !records.some((record) => record.entry.vendor === 'Account-bound Vendor');
        }""",
        timeout=10000,
    )
    check(
        page.locator('.rv').first.input_value() == 'Draft preserved during sync'
        and page.locator('.ra').first.input_value() == '15',
        'background outbox sync preserves the in-progress New Entry form',
    )

    # A malformed row is isolated; a valid neighbour still uploads from the same offline batch.
    context.set_offline(True)
    page.click('[data-v=new]')
    page.fill('.rv', 'Poison Vendor')
    page.fill('.ra', '99')
    page.click('[data-act=addrow]')
    page.locator('#rows .erow').nth(1).locator('.rv').fill('Healthy Neighbor Vendor')
    page.locator('#rows .erow').nth(1).locator('.ra').fill('101')
    choose_cash_impact_for_current_rows()
    page.click('#nsave')
    page.wait_for_selector('.ok-panel')
    check('Saved on this device' in page.inner_text('#nres'), 'mixed valid/invalid batch is safely queued offline')

    # Keep another draft open while the queued records are processed.
    page.click('[data-v=new]')
    page.fill('.rv', 'Draft survives rejected neighbour')
    page.fill('.ra', '12')
    context.set_offline(False)
    page.wait_for_function(
        "document.querySelector('#banner').innerText.includes('need review')",
        timeout=10000,
    )
    failed_records = outbox_vendor_records('Poison Vendor')
    check(
        len(failed_records) == 1
        and failed_records[0]['status'] == 'failed'
        and 'Simulated validation failure' in failed_records[0]['failure'],
        'rejected outbox entry is retained with a reviewable failure state',
    )

    check(
        page.locator('.outbox-failures summary').inner_text() == 'Review rejected entries',
        'banner exposes rejected-entry review details',
    )
    page.locator('.outbox-failures summary').click()
    review_text = page.locator('.outbox-failures').inner_text()
    check(
        'Payment: Poison Vendor' in review_text
        and 'Simulated validation failure' in review_text
        and page.locator('[data-act=discard-failed]').count() == 1,
        'rejected-entry review identifies transaction type, vendor, reason, and an explicit recovery action',
    )
    with page.expect_download() as cancelled_export_info:
        page.once('dialog', lambda dialog: dialog.dismiss())
        page.click('[data-act=discard-failed]')
    cancelled_export = cancelled_export_info.value
    cancelled_entry = outbox_vendor_records('Poison Vendor')
    check(
        cancelled_export.path() is not None
        and len(cancelled_entry) == 1
        and cancelled_entry[0]['status'] == 'failed',
        'cancelling rejected-entry removal keeps the failed record after exporting it',
    )
    with page.expect_download() as rejected_export_info:
        page.once('dialog', lambda dialog: dialog.accept())
        page.click('[data-act=discard-failed]')
    rejected_export = rejected_export_info.value
    check(
        rejected_export.suggested_filename.startswith('cash-vouchers-pending-')
        and rejected_export.suggested_filename.endswith('.json')
        and rejected_export.path() is not None,
        'removing a rejected entry first exports the full recovery queue',
    )
    page.wait_for_function(
        "document.querySelector('#toast').innerText.includes('Rejected entry removed from this device')",
        timeout=8000,
    )
    check(
        not outbox_vendor_records('Poison Vendor'),
        'explicit rejected-entry removal deletes only the selected local failed record',
    )
    healthy_records = outbox_vendor_records('Healthy Neighbor Vendor')
    check(
        not healthy_records
        and 'waiting to upload' not in page.locator('#banner').inner_text(),
        'one rejected record does not block the valid neighbour or retry endlessly',
    )
    rejection_state = page.evaluate("() => fetch('/test-status').then((response) => response.json())")
    check(
        rejection_state.get('rejectedClientRequests') == 1,
        'invalid queue entry is attempted once and excluded from automatic retries',
    )
    check(
        page.locator('.rv').first.input_value() == 'Draft survives rejected neighbour'
        and page.locator('.ra').first.input_value() == '12',
        'form remains editable after partial outbox failure and successful neighbour upload',
    )
    page.click('[data-v=reg]')
    page.wait_for_selector('#rbody')
    page.click('[data-act=refresh]')
    page.wait_for_timeout(400)
    check(
        page.locator('#rbody tr', has_text='Healthy Neighbor Vendor').count() == 1,
        'valid payment uploads even when a neighboring queue record is rejected',
    )

    # A queued cash receipt must be labeled accurately and sync when connectivity returns.
    context.set_offline(True)
    page.click('[data-v=new]')
    page.click('[data-k=RECEIPT]')
    page.fill('.rv', 'Offline Receipt Label Test')
    page.fill('.ra', '21')
    choose_cash_impact_for_current_rows()
    page.click('#nsave')
    page.wait_for_selector('#nres .ok-panel')
    page.wait_for_function(
        "document.querySelector('#banner').innerText.includes('1 cash receipt waiting to upload')",
        timeout=8000,
    )
    check(
        'Saved on this device' in page.locator('#nres').inner_text(),
        'cash receipt remains visibly device-local while offline',
    )
    context.set_offline(False)
    page.wait_for_function(
        """async () => {
          const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('cash-voucher', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const records = await new Promise((resolve, reject) => {
            const request = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          db.close();
          return !records.some((record) => record.entry?.vendor === 'Offline Receipt Label Test');
        }""",
        timeout=10000,
    )
    page.click('[data-v=reg]')
    page.wait_for_selector('#rbody')
    page.click('[data-act=refresh]')
    page.wait_for_timeout(300)
    offline_receipt_row = page.locator('#rbody tr', has_text='Offline Receipt Label Test')
    check(
        offline_receipt_row.count() == 1 and 'R-1' in offline_receipt_row.inner_text(),
        'queued offline cash receipt syncs successfully and receives the next receipt number',
    )

    page.click('[data-v=acct]')
    page.click('[data-act=signout]')
    page.wait_for_selector('#loginForm')

    login('m@test.com', '246810')
    page.wait_for_selector('#op')
    page.fill('#op', '246810')
    page.fill('#np', '864209')
    page.click('.mcard .primary')
    page.wait_for_selector('#nav button')
    check(page.locator('#nav button').count() == 8, 'manager sees 8 nav items including Reports and Cash Close')

    page.click('[data-v=new]')
    page.click('[data-k=RECEIPT]')
    page.fill('.rv', 'Guest Room 5')
    page.fill('.ra', '5000')
    choose_cash_impact_for_current_rows()
    page.click('#nsave')
    page.wait_for_selector('.ok-panel')
    check(
        'R-2' in page.inner_text('#nres'),
        'next cash receipt receives the next sequential number after offline sync',
    )

    page.click('[data-v=bulk]')
    page.wait_for_selector('#bt')
    today = datetime.date.today()
    date_text = today.strftime('%d/%m/%Y')

    file_accept = page.locator('#bf').get_attribute('accept') or ''
    check(
        '.csv' in file_accept and '.tsv' in file_accept and '.txt' in file_accept
        and '.xls' not in file_accept and '.xlsx' not in file_accept,
        'bulk file picker offers text-based formats but not Excel workbooks',
    )

    for excel_name in ('blocked.xlsx', 'blocked.xls'):
        page.locator('#bf').set_input_files({
            'name': excel_name,
            'mimeType': 'application/octet-stream',
            'buffer': b'not a real workbook',
        })
        page.click('[data-act=parse]')
        page.wait_for_function(
            "document.querySelector('#toast').textContent.includes('temporarily disabled for security')"
        )
        check(
            'Save the workbook as CSV/TSV or paste its rows instead.' in page.locator('#toast').inner_text(),
            f'{excel_name} is rejected with a clear secure fallback',
        )
        check(
            page.locator('script[src*="xlsx"]').count() == 0,
            f'{excel_name} does not load a runtime Excel parser',
        )

    # CSV file parsing remains functional without a third-party runtime parser.
    page.locator('#bf').set_input_files({
        'name': 'cash-voucher-import.csv',
        'mimeType': 'text/csv',
        'buffer': (
            'Date,Vendor,Amount,Category,Notes\n'
            f'{date_text},CSV File Vendor,33,Other,CSV file compatibility regression\n'
        ).encode(),
    })
    page.click('[data-act=parse]')
    page.wait_for_selector('#bprev table')
    choose_bulk_cash_impact_for_current_rows()
    check(
        'CSV File Vendor' in page.locator('#bprev').inner_text()
        and '1 ready' in page.locator('#bprev').inner_text().replace('\n', ' '),
        'CSV file upload still parses and previews a valid row',
    )
    page.locator('#bf').set_input_files([])

    rows = (
        'Date\tVendor\tAmount\tCategory\tNotes\n'
        f'{date_text}\tRam Traders\t1250.50\tKitchen\tdup of staff entry\n'
        f'{date_text}\tNew Vendor\t₹ 3,000\tFuel\t\n'
        '31/02/2026\tBad Date\t10\t\t\n'
        f'{date_text}\t\t50\t\t\n'
        f'{date_text}\t{xss_payload}\t40\tNonsense\t'
    )
    page.fill('#bt', rows)
    page.click('[data-act=parse]')
    page.wait_for_selector('#bprev table')
    choose_bulk_cash_impact_for_current_rows()
    preview_text = page.inner_text('#bprev')
    check(
        '2 ready' in preview_text or '2\nready' in preview_text or '2 ready' in preview_text.replace('\n', ' '),
        '2 ready rows: ' + preview_text[:90].replace('\n', ' '),
    )
    check(page.locator('.badge.bad').count() == 2, '2 error rows')
    check(page.locator('.badge.warn').count() == 2, 'dup + category warn')
    check(
        xss_payload in preview_text
        and page.locator('#bprev img, #bprev svg').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'bulk preview renders imported vendor values as text, not executable HTML',
    )

    page.click('[data-act=import]')
    page.wait_for_selector('.ok-panel')
    check('Imported 2 payments' in page.inner_text('#bprev'), 'payment import completion names payments')
    check(
        page.locator('#bprev .ok-panel').get_attribute('role') == 'status'
        and page.locator('#bprev .ok-panel').get_attribute('aria-live') == 'polite',
        'bulk import completion is announced as a polite status update',
    )

    # Import one receipt to ensure completion wording reflects the selected operation type.
    page.click('[data-v=bulk]')
    page.wait_for_selector('#bt')
    page.fill(
        '#bt',
        'Date\tVendor\tAmount\tCategory\tNotes\n'
        f'{date_text}\tBulk Receipt Test\t25\tOther\treceipt completion wording',
    )
    page.select_option('#bt2', 'RECEIPT')
    page.click('[data-act=parse]')
    page.wait_for_selector('#bprev table')
    choose_bulk_cash_impact_for_current_rows()
    check('1 ready' in page.inner_text('#bprev').replace('\n', ' '), 'receipt import row is ready after explicit classification')
    check(
        'Import 1 cash receipt' in page.locator('#bprev').inner_text(),
        'receipt import action uses the correct singular label',
    )
    check(
        page.locator('#bprog').get_attribute('role') == 'status'
        and page.locator('#bprog').get_attribute('aria-live') == 'polite',
        'bulk import progress has an accessible status announcement',
    )
    page.click('[data-act=import]')
    page.wait_for_function("document.querySelector('#bprev .ok-panel')?.innerText.includes('Imported 1 cash receipts')")
    check(
        'Imported 1 cash receipts' in page.inner_text('#bprev')
        and page.locator('#bprev .ok-panel').get_attribute('role') == 'status'
        and page.locator('#bprev .ok-panel').get_attribute('aria-live') == 'polite',
        'receipt import completion is accurate and announced',
    )

    page.click('[data-v=dash]')
    page.wait_for_selector('svg.chart')
    page.click('[data-k=mtd]')
    page.wait_for_selector('.stats')
    check(
        'book balance' in page.inner_text('.stats').lower()
        and 'cash in hand' not in page.inner_text('.stats').lower()
        and 'not a physical cash count' in page.inner_text('.stats').lower(),
        'dashboard clearly labels recorded net movement as book balance, not physical cash',
    )
    check(page.locator('.hb').count() >= 3, 'dashboard bars')

    # Prototype-named user data must be ordinary aggregation keys, not Object properties.
    prototype_group_values = ['constructor', '__proto__', 'toString', 'hasOwnProperty']
    invalid_vendor_envelope = False
    invalid_voucher_envelope = False

    def tamper_dashboard_groups(route):
        request_data = json.loads(route.request.post_data or '{}')
        response = route.fetch()
        payload = response.json()
        data = payload.get('data', {})
        if request_data.get('action') == 'bootstrap':
            vouchers = data.get('vouchers', [])
            template = vouchers[0].copy() if vouchers else {
                'id': '',
                'no': 0,
                'date': datetime.date.today().isoformat(),
                'vendor': '',
                'amount': 1,
                'category': '',
                'notes': '',
                'type': 'PAYMENT',
                'status': 'ACTIVE',
                'createdBy': 'owner@test.com',
                'createdAt': '',
                'updatedBy': '',
                'updatedAt': '',
                'receipts': [],
                'cancelReason': '',
            }
            for index, value in enumerate(prototype_group_values):
                entry = template.copy()
                entry.update({
                    'id': 'prototype-dashboard-' + str(index),
                    'no': 900001 + index,
                    'date': datetime.date.today().isoformat(),
                    'vendor': value,
                    'category': value,
                    'amount': 900001 + index,
                    'type': 'PAYMENT',
                    'status': 'ACTIVE',
                    'createdBy': 'owner@test.com',
                    'receipts': [],
                })
                vouchers.append(entry)
            vouchers.extend([
                None,
                'not-a-voucher-record',
                {
                    **template,
                    'id': {'unexpected': 'object id'},
                    'no': 900010,
                    'date': datetime.date.today().isoformat(),
                    'vendor': 'BAD_CORE_ROW',
                    'amount': 30,
                    'type': 'PAYMENT',
                    'status': 'ACTIVE',
                },
                {
                    **template,
                    'id': 'malformed-voucher-metadata',
                    'no': 900011,
                    'date': datetime.date.today().isoformat(),
                    'vendor': {'toString': None, 'valueOf': None},
                    'category': {'toString': None, 'valueOf': None},
                    'notes': {'toString': None, 'valueOf': None},
                    'amount': {'toString': None, 'valueOf': None},
                    'type': 'PAYMENT',
                    'status': 'ACTIVE',
                    'createdBy': {'toString': None, 'valueOf': None},
                    'createdAt': {'toString': None, 'valueOf': None},
                    'updatedBy': {'toString': None, 'valueOf': None},
                    'updatedAt': {'toString': None, 'valueOf': None},
                    'receipts': None,
                    'cancelReason': {'toString': None, 'valueOf': None},
                },
            ])
            data['vouchers'] = {'unexpected': 'not a voucher list'} if invalid_voucher_envelope else vouchers
            if invalid_vendor_envelope:
                data['vendors'] = {'unexpected': 'not a vendor list'}
            else:
                vendors = data.get('vendors', [])
                if isinstance(vendors, list):
                    vendors.extend([
                        None,
                        {
                            'id': 'malformed-vendor-option',
                            'name': {'toString': None, 'valueOf': None},
                            'active': True,
                        },
                        {
                            'id': 'malformed-vendor-company',
                            'name': 'Bad Metadata Vendor',
                            'company': {'toString': None, 'valueOf': None},
                            'mobile': '123',
                            'active': True,
                        },
                    ])
                    data['vendors'] = vendors
            route.fulfill(response=response, json=payload)
        else:
            route.fulfill(response=response)

    page.route('**/api?*', tamper_dashboard_groups)
    with page.expect_response(
        lambda response: '/api?' in response.url
        and json.loads(response.request.post_data or '{}').get('action') == 'bootstrap'
    ):
        page.reload(wait_until='domcontentloaded')
    page.wait_for_selector('#nav button')
    page.click('[data-v=dash]')
    page.wait_for_selector('.hb-l')
    vendor_labels = page.locator('.two .card').nth(0).locator('.hb-l').all_inner_texts()
    category_labels = page.locator('.two .card').nth(1).locator('.hb-l').all_inner_texts()
    check(
        all(value in vendor_labels for value in prototype_group_values),
        'dashboard preserves constructor, __proto__ and toString vendor groups',
    )
    check(
        all(value in category_labels for value in prototype_group_values),
        'dashboard preserves prototype-named category groups',
    )
    check(
        '3 malformed voucher record(s) omitted from Dashboard and Register' in page.locator('#view').inner_text()
        and '8 malformed voucher field(s) handled for safe display' in page.locator('#view').inner_text()
        and '[object Object]' not in page.locator('#view').inner_text()
        and '1 recorded voucher amount(s) are invalid and excluded from totals.' in page.locator('#view').inner_text(),
        'dashboard announces shared malformed voucher diagnostics, excludes malformed amounts, and keeps coercion inert',
    )
    page.click('[data-v=reg]')
    page.wait_for_selector('#rtot')
    check(
        '3 malformed voucher record(s) omitted from Dashboard and Register' in page.locator('#rtot').inner_text()
        and '8 malformed voucher field(s) handled for safe display' in page.locator('#rtot').inner_text()
        and '[object Object]' not in page.locator('#view').inner_text(),
        'register surfaces the same bootstrap diagnostics and keeps malformed metadata safe',
    )
    page.click('[data-v=dash]')
    builtins_unchanged = page.evaluate(
        """() => {
          const baseline = window.__dashboardKeyBaseline || [];
          const changed = baseline.some(({ target, n, s }) =>
            JSON.stringify(Object.getOwnPropertyDescriptor(target, 'n') || null) !== JSON.stringify(n || null) ||
            JSON.stringify(Object.getOwnPropertyDescriptor(target, 's') || null) !== JSON.stringify(s || null)
          );
          baseline.forEach(({ target, n, s }) => {
            if (n) Object.defineProperty(target, 'n', n);
            else delete target.n;
            if (s) Object.defineProperty(target, 's', s);
            else delete target.s;
          });
          return !changed;
        }"""
    )
    check(
        builtins_unchanged,
        'prototype-like dashboard labels do not mutate built-in object/function properties',
    )

    # The shared vendor datalist must retain prototype-named labels and ignore malformed cache/API values.
    cache_before_vendor_options = page.evaluate(
        """() => {
          const previous = localStorage.getItem('cv.cache');
          const cache = JSON.parse(previous || '{}');
          cache.vn = [];
          localStorage.setItem('cv.cache', JSON.stringify(cache));
          return previous;
        }"""
    )
    page.click('[data-v=new]')
    page.wait_for_selector('#vlist', state='attached')
    vendor_option_values = page.locator('#vlist option').evaluate_all(
        'options => options.map(option => option.value)'
    )
    check(
        all(value in vendor_option_values for value in prototype_group_values),
        'vendor suggestions preserve constructor, __proto__, toString and hasOwnProperty names',
    )
    check(
        page.locator('#view img, #view svg').count() == 0
        and not page.evaluate('window.__xssFired === true')
        and '[object Object]' not in vendor_option_values,
        'malformed vendor API values are ignored without unsafe coercion or injected markup',
    )
    page.evaluate(
        """previous => {
          if (previous === null) localStorage.removeItem('cv.cache');
          else localStorage.setItem('cv.cache', previous);
        }""",
        cache_before_vendor_options,
    )
    page.click('[data-v=vend]')
    page.wait_for_selector('#vf')
    check(
        '3 malformed vendor record(s) omitted from this response' in page.locator('#view').inner_text()
        and page.locator('#view [data-act=vedit]').count() >= 1,
        'vendor list discloses malformed bootstrap rows and preserves valid vendor records',
    )
    check(
        page.locator('#view [data-id="malformed-vendor-option"], #view [data-id="malformed-vendor-company"]').count() == 0
        and '[object Object]' not in page.locator('#view').inner_text()
        and page.locator('#view img, #view svg').count() == 0,
        'vendor list omits malformed names and contact metadata without rendering unsafe markup',
    )
    invalid_vendor_envelope = True
    page.reload(wait_until='domcontentloaded')
    page.wait_for_selector('#nav button')
    page.click('[data-v=vend]')
    page.wait_for_selector('#vf')
    check(
        'Vendor data is unavailable because the server response was invalid.' in page.locator('#view').inner_text()
        and 'No vendors yet' not in page.locator('#view').inner_text(),
        'non-array vendor response is disclosed instead of looking like a genuinely empty list',
    )
    invalid_vendor_envelope = False
    invalid_voucher_envelope = True
    page.reload(wait_until='domcontentloaded')
    page.wait_for_selector('#nav button')
    page.click('[data-v=dash]')
    check(
        'Voucher data is unavailable because the server response was invalid. Refresh and retry.'
        in page.locator('#view').inner_text()
        and 'No vouchers are available' not in page.locator('#view').inner_text(),
        'invalid bootstrap voucher envelope is distinct from a legitimate empty collection',
    )
    dashboard_invalid_text = page.locator('#view').inner_text()
    check(
        'Dashboard totals unavailable' in dashboard_invalid_text
        and page.locator('#view .stats').count() == 0
        and page.locator('#view svg.chart, #view .hb').count() == 0
        and all(
            label not in dashboard_invalid_text
            for label in ('Total paid', 'Cash received', 'Book balance', 'Spending trend', 'Top vendors', 'By category')
        ),
        'invalid bootstrap envelope withholds dashboard KPIs and charts instead of showing zero-like totals',
    )
    page.click('[data-v=reg]')
    page.wait_for_selector('#rempty')
    register_invalid_text = page.locator('#view').inner_text()
    check(
        'Voucher data is unavailable because the server response was invalid. Refresh and retry.'
        in register_invalid_text
        and 'No vouchers are available to show' not in register_invalid_text
        and 'Clear filters' not in register_invalid_text
        and 'Totals unavailable because the voucher response was invalid.' in register_invalid_text
        and page.locator('#rf [data-act=csv]').is_disabled(),
        'invalid Register envelope does not imply empty data, show zero-like totals, or permit CSV export',
    )
    page.click('[data-v=dash]')
    invalid_voucher_envelope = False
    page.unroute('**/api?*', tamper_dashboard_groups)
    page.reload(wait_until='domcontentloaded')
    page.wait_for_selector('#nav button')
    page.click('[data-v=dash]')
    recovered_dashboard_text = page.locator('#view').inner_text()
    check(
        'Voucher data is unavailable' not in recovered_dashboard_text
        and page.locator('#view .stats').count() == 1
        and page.locator('#view svg.chart').count() == 1
        and page.locator('#view .hb').count() > 0,
        'dashboard restores KPIs and charts after a valid voucher collection returns',
    )

    # Malformed bootstrap data must not produce invalid CSS geometry.
    hostile_vendor = '<svg onload=window.__xssFired=true></svg>'

    def tamper_dashboard_numeric_values(route):
        request_data = json.loads(route.request.post_data or '{}')
        response = route.fetch()
        payload = response.json()
        data = payload.get('data', {})
        if request_data.get('action') == 'bootstrap':
            vouchers = data.get('vouchers', [])
            template = vouchers[0].copy() if vouchers else {
                'id': '',
                'no': 0,
                'date': datetime.date.today().isoformat(),
                'vendor': '',
                'amount': 1,
                'category': 'Other',
                'notes': '',
                'type': 'PAYMENT',
                'status': 'ACTIVE',
                'createdBy': 'owner@test.com',
                'createdAt': '',
                'updatedBy': '',
                'updatedAt': '',
                'receipts': [],
                'cancelReason': '',
            }
            values = [
                ('numeric-nan', 'NaN', 'numeric-nan'),
                ('numeric-infinity', 'Infinity', 'numeric-infinity'),
                ('numeric-null', None, 'numeric-null'),
                ('numeric-empty', '', 'numeric-empty'),
                ('numeric-boolean', True, 'numeric-boolean'),
                ('numeric-negative', -500, 'numeric-negative'),
                # A non-finite amount must stay in its own vendor group but never poison chart geometry.
                ('numeric-string', hostile_vendor, 'numeric-string'),
                # Large valid values make the hostile text row deterministic in the top-eight vendor chart.
                ('hostile-vendor', 910005, hostile_vendor),
            ]
            for index, (suffix, amount, vendor) in enumerate(values):
                entry = template.copy()
                entry.update({
                    'id': suffix,
                    'no': 910001 + index,
                    'date': datetime.date.today().isoformat(),
                    'vendor': vendor,
                    'category': 'Rendering boundary',
                    'amount': amount,
                    'type': 'PAYMENT',
                    'status': 'ACTIVE',
                    'createdBy': 'owner@test.com',
                    'receipts': [],
                })
                vouchers.append(entry)
            data['vouchers'] = vouchers
            route.fulfill(response=response, json=payload)
        else:
            route.fulfill(response=response)

    page.route('**/api?*', tamper_dashboard_numeric_values)
    with page.expect_response(
        lambda response: '/api?' in response.url
        and json.loads(response.request.post_data or '{}').get('action') == 'bootstrap'
    ):
        page.reload(wait_until='domcontentloaded')
    page.wait_for_selector('#nav button')
    page.click('[data-v=dash]')
    page.wait_for_selector('.hb-l')
    dashboard_amount_text = page.locator('.stats').inner_text()
    check(
        'NaN' not in dashboard_amount_text
        and 'Infinity' not in dashboard_amount_text
        and any(
            'invalid and excluded from totals' in message
            for message in page.locator('#view [role=status]').all_inner_texts()
        ),
        'dashboard excludes malformed amounts from financial figures and explains the exclusion',
    )
    bar_styles = page.locator('.hb-t i').evaluate_all(
        "elements => elements.map(element => ({width: element.style.width, value: element.getAttribute('style')}))"
    )
    check(
        bool(bar_styles)
        and all(
            value['width']
            and value['width'].endswith('%')
            and value['width'] != 'NaN%'
            and value['width'] != 'Infinity%'
            and value['width'] != '-Infinity%'
            and 0 <= float(value['width'][:-1]) <= 100
            for value in bar_styles
        ),
        'dashboard bars clamp computed widths to finite 0–100% values',
    )
    trend_geometry = page.locator('svg.chart rect.b').evaluate_all(
        "elements => elements.map(element => ({y: element.getAttribute('y'), height: element.getAttribute('height')}))"
    )
    check(
        bool(trend_geometry)
        and all(
            value['y'] is not None
            and value['height'] is not None
            and all(
                part.lower() != 'nan' and part.lower() not in ('infinity', '-infinity')
                for part in (value['y'], value['height'])
            )
            and float(value['height']) >= 0
            for value in trend_geometry
        ),
        'dashboard SVG trend bars keep finite non-negative vertical geometry',
    )
    vendor_texts = page.locator('.hb-l').all_inner_texts()
    hostile_vendor_visible = any(hostile_vendor in label for label in vendor_texts)
    injected_svg_count = page.locator('.hb-l svg, .hb-t svg, .hb-v svg, svg.chart svg').count()
    hostile_handler_fired = page.evaluate('window.__xssFired === true')
    check(
        hostile_vendor_visible,
        'dashboard displays the hostile vendor payload as literal text',
    )
    check(
        injected_svg_count == 0 and not hostile_handler_fired,
        'hostile vendor text creates no SVG element and does not execute its handler',
    )
    page.click('[data-v=reg]')
    page.wait_for_selector('#rtot')
    register_amount_text = page.locator('#rtot').inner_text()
    check(
        'NaN' not in register_amount_text
        and 'Infinity' not in register_amount_text
        and 'invalid amount(s) excluded from totals' in register_amount_text,
        'register totals exclude malformed active amounts and disclose the exclusion',
    )
    # Malformed API amounts must not hang or corrupt printed amount-in-words output.
    page.evaluate('window.print = () => {}')
    for suffix in [
        'numeric-nan',
        'numeric-infinity',
        'numeric-null',
        'numeric-empty',
        'numeric-boolean',
        'numeric-negative',
    ]:
        row = page.locator('#rbody tr', has_text=suffix).first
        row.locator('[data-act=print]').click()
        page.wait_for_function(
            "document.querySelector('#printArea .pv-words')?.textContent.includes('Amount unavailable')"
        )
        printed = page.locator('#printArea').inner_text()
        check(
            'Amount unavailable' in printed
            and 'undefined' not in printed.lower()
            and 'NaN Rupees' not in printed
            and 'Infinity' not in printed,
            f'{suffix} is handled safely by voucher amount-in-words printing',
        )
    page.click('[data-v=dash]')
    page.wait_for_selector('.hb-l')
    page.unroute('**/api?*', tamper_dashboard_numeric_values)
    page.reload(wait_until='domcontentloaded')
    page.wait_for_selector('#nav button')

    page.click('[data-v=reg]')
    page.wait_for_selector('[data-act=edit]')
    page.set_viewport_size({'width': 390, 'height': 844})
    manager_row = page.locator('#rbody tr').filter(has_text='Ram Traders').first
    check(
        manager_row.locator('.voucher-kind').inner_text() == 'Payment',
        'manager register identifies cash-paid voucher rows explicitly',
    )
    check(
        manager_row.locator('.voucher-actions').get_attribute('role') == 'group'
        and manager_row.locator('.voucher-actions').get_attribute('aria-label').startswith('Actions for'),
        'manager voucher actions have a labelled action group',
    )
    manager_targets = manager_row.locator('.voucher-actions button').evaluate_all(
        "elements => elements.map(element => ({label: element.innerText, height: element.getBoundingClientRect().height}))"
    )
    check(
        all(target['height'] >= 44 for target in manager_targets),
        'manager register row actions meet 44px mobile target height',
    )
    check(
        not page.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth'),
        'manager register mobile layout has no page-level horizontal overflow',
    )
    page.set_viewport_size({'width': 1280, 'height': 800})
    check(
        manager_row.locator('.voucher-actions').evaluate("element => getComputedStyle(element).display") == 'flex',
        'desktop register keeps a grouped action layout',
    )
    check(
        xss_payload in page.locator('#rv').locator('option').all_text_contents()
        and page.locator('#rv img, #rv svg').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'stored vendor values remain inert text in register filter options',
    )
    note_row = page.locator('#rbody tr', has_text='Ram Traders').first
    edit_trigger = note_row.locator('[data-act=edit]')
    edit_trigger.evaluate("(element) => element.dataset.focusRestoreProbe = 'edit-dialog-trigger'")
    edit_trigger.click()
    page.wait_for_selector('#modal #en')
    check(
        page.locator('#modal img, #modal svg').count() == 0
        and page.locator('#en').input_value() == xss_note
        and not page.evaluate('window.__xssFired === true'),
        'stored vendor and note remain text in edit dialog fields',
    )
    check(
        page.locator('#modal').get_attribute('role') == 'dialog'
        and page.locator('#modal').get_attribute('aria-modal') == 'true'
        and page.locator('#modal').get_attribute('aria-labelledby') == 'modalTitle'
        and page.locator('#modal #modalTitle').count() == 1
        and page.locator('#app').evaluate('(element) => element.inert'),
        'edit dialog exposes modal semantics/title and isolates the background app',
    )
    page.locator('#modal .primary').evaluate("(element) => element.setAttribute('disabled', '')")
    page.keyboard.press('Escape')
    check(
        not page.locator('#modal').evaluate("(element) => element.classList.contains('hidden')"),
        'Escape leaves the dialog open while its primary action is disabled',
    )
    page.locator('#modal .primary').evaluate("(element) => element.removeAttribute('disabled')")
    page.keyboard.press('Shift+Tab')
    check(
        page.evaluate("document.activeElement?.matches('#modal .primary')"),
        'Shift+Tab from the first dialog field wraps to the last control',
    )
    page.keyboard.press('Tab')
    check(
        page.evaluate("document.activeElement?.matches('#modal #ed')"),
        'Tab from the last dialog control wraps to the first field',
    )
    page.keyboard.press('Escape')
    page.wait_for_function("document.querySelector('#modal').classList.contains('hidden')")
    check(
        page.evaluate("document.activeElement?.dataset.focusRestoreProbe === 'edit-dialog-trigger'")
        and not page.locator('#app').evaluate('(element) => element.inert'),
        'Escape closes dialog, restores opener focus, and re-enables the app',
    )

    update_requests = []

    def capture_voucher_update(request):
        if request.method != 'POST':
            return
        try:
            payload = json.loads(request.post_data or '{}')
        except json.JSONDecodeError:
            return
        if payload.get('action') == 'updateVoucher':
            update_requests.append(payload)

    page.on('request', capture_voucher_update)
    edit_trigger.click()
    page.wait_for_selector('#modal #er')
    reason_field = page.locator('#modal #er')
    check(
        reason_field.get_attribute('required') is not None
        and reason_field.get_attribute('minlength') == '3'
        and reason_field.get_attribute('maxlength') == '200',
        'voucher correction dialog requires a bounded reason',
    )
    page.fill('#ea', '177.77')
    page.click('#modal .primary')
    check(
        len(update_requests) == 0
        and not reason_field.evaluate('(element) => element.checkValidity()')
        and not page.locator('#modal').evaluate("(element) => element.classList.contains('hidden')"),
        'voucher edit cannot be submitted without a correction reason',
    )
    correction_reason = 'Corrected after receipt review <svg onload=window.__xssFired=true></svg>'
    page.fill('#er', correction_reason)
    page.click('#modal .primary')
    page.wait_for_function("document.querySelector('#modal').classList.contains('hidden')")
    page.remove_listener('request', capture_voucher_update)
    check(
        len(update_requests) == 1
        and update_requests[0].get('reason') == correction_reason
        and update_requests[0].get('fields', {}).get('amount') == 177.77,
        'voucher edit sends its reason alongside the actual field changes',
    )
    check(
        page.locator('#rbody tr', has_text='Ram Traders').locator('.voucher-amount').inner_text()
        and '177.77' in page.locator('#rbody tr', has_text='Ram Traders').inner_text(),
        'corrected amount appears in the register after saving',
    )

    audit_context = browser.new_context(viewport={'width': 1280, 'height': 800})
    audit_page = audit_context.new_page()
    audit_page.add_init_script('window.__xssFired = false;')

    legacy_update_text = 'amount,vendor <svg onload=window.__xssFired=true></svg>'

    def inject_legacy_update_audit(route):
        try:
            request_data = json.loads(route.request.post_data or '{}')
        except json.JSONDecodeError:
            request_data = {}
        if request_data.get('action') != 'auditLog':
            route.continue_()
            return

        response = route.fetch()
        payload = response.json()
        if request_data.get('beforeRow') is not None:
            payload['data'] = {
                'rows': [
                    {
                        'time': '2026-10-10T09:00:00',
                        'user': 'owner@test.com',
                        'action': 'AUDIT_PAGE_FIXTURE',
                        'target': '#older',
                        'details': 'older audit row fixture',
                    }
                ],
                'nextBeforeRow': None,
                'totalCount': 201,
            }
        elif (
            payload.get('ok')
            and isinstance(payload.get('data'), dict)
            and isinstance(payload['data'].get('rows'), list)
        ):
            payload['data']['rows'].append(
                {
                    'time': '2026-10-11T15:00:00',
                    'user': 'owner@test.com',
                    'action': 'UPDATE',
                    'target': '#legacy',
                    'details': legacy_update_text,
                }
            )
            payload['data']['nextBeforeRow'] = 2
            payload['data']['totalCount'] = max(201, payload['data'].get('totalCount', 0))
        route.fulfill(response=response, body=json.dumps(payload))

    audit_page.route('**/api?*', inject_legacy_update_audit)
    audit_page.goto(URL)
    audit_page.fill('#lEmail', 'owner@test.com')
    audit_page.fill('#lPin', '579246')
    audit_page.click('#lBtn')
    audit_page.wait_for_selector('[data-v=audit]')
    audit_page.click('[data-v=audit]')
    audit_page.wait_for_function(
        "document.querySelector('#aud').innerText.includes('Corrected after receipt review')",
        timeout=10000,
    )
    correction_audit_text = audit_page.locator('#aud').inner_text()
    check(
        'Reason: Corrected after receipt review' in correction_audit_text
        and '<svg onload=window.__xssFired=true></svg>' in correction_audit_text
        and 'Amount:' in correction_audit_text
        and '177.77' in correction_audit_text
        and '→' in correction_audit_text
        and audit_page.locator('#aud svg, #aud img').count() == 0
        and not audit_page.evaluate('window.__xssFired === true'),
        'owner audit log displays correction reason and field deltas as inert text',
    )
    legacy_row = audit_page.locator('#aud tr', has_text='#legacy')
    check(
        legacy_row.count() == 1
        and legacy_update_text in legacy_row.inner_text()
        and legacy_row.locator('svg, img').count() == 0
        and not audit_page.evaluate('window.__xssFired === true'),
        'legacy free-text update details remain compatible and render as inert text',
    )
    check(
        not audit_page.locator('#aud-more').is_hidden(),
        'owner audit log exposes Load older when a continuation cursor exists',
    )
    audit_page.click('#aud-more')
    audit_page.wait_for_function(
        "document.querySelector('#aud').innerText.includes('older audit row fixture')",
        timeout=10000,
    )
    check(
        audit_page.locator('#aud tr', has_text='#older').count() == 1
        and audit_page.locator('#aud-more').is_hidden(),
        'Load older appends a preceding page and hides itself at the end of history',
    )
    audit_context.close()
    xss_vendor_row = page.locator('#rbody tr', has_text=xss_payload).first
    xss_vendor_row.locator('[data-act=cancel]').click()
    page.wait_for_selector('#modal #cr')
    check(
        page.locator('#modal img, #modal svg').count() == 0
        and xss_payload in page.locator('#modal').inner_text()
        and not page.evaluate('window.__xssFired === true'),
        'stored vendor remains text in cancellation dialog',
    )
    page.click('#modal [data-x]')
    page.wait_for_function("document.querySelector('#modal').classList.contains('hidden')")
    page.wait_for_selector('[data-act=cancel]')
    page.locator('[data-act=cancel]').first.click()
    page.fill('#cr', 'entered twice')
    page.click('.mcard .primary')
    page.wait_for_timeout(500)
    page.select_option('#rs', 'CANCELLED')
    check(page.locator('#rbody tr.cx').count() == 1, 'cancelled voucher visible under filter')

    # Exercise the recorded movement report through the actual browser/API mock.
    page.click('[data-v=reports]')
    page.wait_for_selector('#movementFilters')
    page.locator('#movementFilters button[type=submit]').click()
    page.wait_for_function(
        "document.querySelector('#view').innerText.includes('Source vouchers')"
    )
    report_text = page.locator('#view').inner_text()
    check(
        'Recorded Movement Report' in report_text,
        'movement report heading is visible',
    )
    check(
        'does not establish physical cash' in report_text,
        'movement report discloses that it is not a physical-cash reconciliation',
    )
    check(
        'SELECTED PAYMENT TOTAL' in report_text.upper() and 'SELECTED RECEIPT TOTAL' in report_text.upper(),
        'movement report exposes payment and receipt totals',
    )
    report_rows = page.locator('#view table tbody tr')
    check(
        'Guest Room 5' in report_text
        and 'RECEIPT' in report_text
        and report_rows.count() >= 1
        and all(row.locator('td').nth(5).inner_text() == 'ACTIVE' for row in report_rows.all()),
        'default active report lists active source vouchers and excludes cancelled records',
    )

    # Malformed row entries and object-valued fields must not crash the report renderer.
    def tamper_report_rows(route):
        request_data = json.loads(route.request.post_data or '{}')
        response = route.fetch()
        payload = response.json()
        if request_data.get('action') == 'recordedMovementReport':
            summary = payload.get('data', {})
            summary['items'].extend([
                None,
                'not-a-report-row',
                {
                    'id': 'malformed-report-object',
                    'date': {'toString': None, 'valueOf': None},
                    'voucherNo': {'toString': None, 'valueOf': None},
                    'type': {'toString': None, 'valueOf': None},
                    'vendor': 'MALFORMED_REPORT_ROW_MARKER',
                    'category': {'toString': None, 'valueOf': None},
                    'notes': {'toString': None, 'valueOf': None},
                    'amount': {'toString': None, 'valueOf': None},
                    'status': {'toString': None, 'valueOf': None},
                },
                {
                    'id': 'malformed-report-amount',
                    'date': datetime.date.today().isoformat(),
                    'voucherNo': '999',
                    'type': 'PAYMENT',
                    'vendor': 'MALFORMED_AMOUNT_ROW_MARKER',
                    'category': 'General',
                    'notes': '',
                    'amount': '125.00',
                    'status': 'ACTIVE',
                    'cancelReason': '',
                    'createdBy': 'owner@test.com',
                },
            ])
            payload['data'] = summary
            route.fulfill(response=response, json=payload)
        else:
            route.fulfill(response=response)

    page.route('**/api?*', tamper_report_rows)
    with page.expect_response(
        lambda response: '/api?' in response.url
        and json.loads(response.request.post_data or '{}').get('action') == 'recordedMovementReport'
    ):
        page.locator('#movementFilters button[type=submit]').click()
    page.wait_for_function(
        "document.querySelector('#view').innerText.includes('4 malformed report row(s) omitted')"
    )
    report_text = page.locator('#view').inner_text()
    check(
        '4 malformed report row(s) omitted' in report_text
        and 'MALFORMED_REPORT_ROW_MARKER' not in report_text
        and 'MALFORMED_AMOUNT_ROW_MARKER' not in report_text
        and page.locator('#view svg, #view img').count() == 0,
        'report omits null, primitive, wrong-field-type and nonnumeric-amount rows with a visible count',
    )
    page.unroute('**/api?*', tamper_report_rows)
    with page.expect_response(
        lambda response: '/api?' in response.url
        and json.loads(response.request.post_data or '{}').get('action') == 'recordedMovementReport'
    ):
        page.locator('#movementFilters button[type=submit]').click()
    page.wait_for_function(
        "document.querySelector('#view').innerText.includes('Type: ALL · Status: ACTIVE')"
    )

    # Report summary counts are API response fields and must remain inert at HTML text sinks.
    report_count_payload = '<svg onload=window.__reportCountXss=true></svg>'
    report_active_count_payload = '<img src=x onerror=window.__reportCountXss=true>'
    report_cancelled_count_payload = '<svg/onload=window.__reportCountXss=true>'

    def tamper_report_summary(route):
        request_data = json.loads(route.request.post_data or '{}')
        response = route.fetch()
        payload = response.json()
        if request_data.get('action') == 'recordedMovementReport':
            summary = payload.get('data', {})
            summary['count'] = report_count_payload
            summary['activeCount'] = report_active_count_payload
            summary['cancelledCount'] = report_cancelled_count_payload
            payload['data'] = summary
            route.fulfill(response=response, json=payload)
        else:
            route.fulfill(response=response)

    page.evaluate('window.__reportCountXss = false')
    page.route('**/api?*', tamper_report_summary)
    with page.expect_response(
        lambda response: '/api?' in response.url
        and json.loads(response.request.post_data or '{}').get('action') == 'recordedMovementReport'
    ):
        page.locator('#movementFilters button[type=submit]').click()
    page.wait_for_function(
        "payload => document.querySelector('#view')?.innerText.includes(payload)",
        arg=report_count_payload,
    )
    report_text = page.locator('#view').inner_text()
    page.wait_for_timeout(100)
    check(
        report_count_payload in report_text
        and report_active_count_payload in report_text
        and report_cancelled_count_payload in report_text
        and page.locator('#view svg, #view img').count() == 0
        and not page.evaluate('window.__reportCountXss === true'),
        'hostile report summary count fields remain literal text without markup or execution',
    )
    page.unroute('**/api?*', tamper_report_summary)
    with page.expect_response(
        lambda response: '/api?' in response.url
        and json.loads(response.request.post_data or '{}').get('action') == 'recordedMovementReport'
    ):
        page.locator('#movementFilters button[type=submit]').click()
    page.wait_for_function(
        "document.querySelector('#view').innerText.includes('Type: ALL · Status: ACTIVE')"
    )

    # A malformed report envelope is an explicit recoverable error, never a render crash.
    def tamper_report_envelope(route):
        request_data = json.loads(route.request.post_data or '{}')
        response = route.fetch()
        payload = response.json()
        if request_data.get('action') == 'recordedMovementReport':
            summary = payload.get('data', {})
            summary['items'] = {'unexpected': 'object instead of array'}
            payload['data'] = summary
            route.fulfill(response=response, json=payload)
        else:
            route.fulfill(response=response)

    page.route('**/api?*', tamper_report_envelope)
    with page.expect_response(
        lambda response: '/api?' in response.url
        and json.loads(response.request.post_data or '{}').get('action') == 'recordedMovementReport'
    ):
        page.locator('#movementFilters button[type=submit]').click()
    page.wait_for_selector('.form-error[role=alert]')
    check(
        'invalid response' in page.locator('.form-error').inner_text().lower()
        and page.locator('#view table tbody tr').count() == 0
        and page.locator('.form-error [data-act=reportRun]').is_enabled(),
        'invalid report envelope clears stale rows and offers an enabled retry',
    )
    page.unroute('**/api?*', tamper_report_envelope)
    with page.expect_response(
        lambda response: '/api?' in response.url
        and json.loads(response.request.post_data or '{}').get('action') == 'recordedMovementReport'
    ):
        page.locator('.form-error [data-act=reportRun]').click()
    page.wait_for_function(
        "document.querySelector('#view').innerText.includes('Source vouchers')"
    )
    check(
        'invalid response' not in page.locator('#view').inner_text().lower(),
        'movement report recovers after a malformed response is removed',
    )

    # Adversarially tamper with the date control's value getter so malformed
    # state reaches the renderer; user-facing date inputs normally constrain it.
    range_payload = '<svg onload=window.__xssFired=true></svg>'
    page.evaluate(
        """payload => {
          const input = document.querySelector('#movementFrom');
          Object.defineProperty(input, 'value', {
            configurable: true,
            get: () => payload,
          });
        }""",
        range_payload,
    )
    page.locator('#movementFilters button[type=submit]').click()
    page.wait_for_function(
        "document.querySelector('#view').innerText.includes('Choose a valid date range')"
    )
    check(
        page.locator('#view svg').count() == 0
        and range_payload not in page.locator('#view').inner_text()
        and 'Choose a valid date range' in page.locator('#view').inner_text()
        and not page.evaluate('window.__xssFired === true'),
        'malformed report date-range value is rejected without reflecting hostile input',
    )
    # Restore a valid month-to-date filter before continuing the report workflow.
    page.locator('#movementFrom').fill(datetime.date.today().replace(day=1).isoformat())
    page.locator('#movementFilters button[type=submit]').click()
    page.wait_for_function(
        "document.querySelector('#movementFilters button[type=submit]').innerText.trim() === 'Run report'"
    )
    page.wait_for_function(
        "document.querySelector('#view').innerText.includes('Type: ALL · Status: ACTIVE')"
    )

    page.select_option('#movementStatus', 'CANCELLED')
    page.locator('#movementFilters button[type=submit]').click()
    page.wait_for_function(
        "document.querySelector('#view').innerText.includes('Type: ALL · Status: CANCELLED')"
    )
    cancelled_report_rows = page.locator('#view table tbody tr')
    check(
        cancelled_report_rows.count() >= 1
        and all('CANCELLED' in row.inner_text() for row in cancelled_report_rows.all()),
        'cancelled-only report filter returns only cancelled source vouchers',
    )
    with page.expect_download() as movement_download_info:
        page.click('[data-act=reportCsv]')
    movement_download = movement_download_info.value
    movement_csv_path = movement_download.path()
    with open(movement_csv_path, 'r', encoding='utf-8', newline='') as movement_file:
        cancelled_reader = csv.DictReader(movement_file)
        cancelled_csv_fields = set(cancelled_reader.fieldnames or [])
        cancelled_csv_rows = list(cancelled_reader)
    cancelled_vouchers = {
        row.locator('td').nth(1).inner_text().removeprefix('R-')
        for row in cancelled_report_rows.all()
    }
    exported_cancelled_vouchers = [row['voucherNo'] for row in cancelled_csv_rows]
    check(
        movement_download.suggested_filename.startswith('recorded-movement-')
        and movement_download.suggested_filename.endswith('.csv')
        and 'cancelReason' in cancelled_csv_fields
        and any(row['cancelReason'] == 'entered twice' for row in cancelled_csv_rows)
        and all(row['status'] == 'CANCELLED' for row in cancelled_csv_rows),
        'movement CSV preserves cancellation status and reason only for cancelled source rows',
    )
    check(
        len(exported_cancelled_vouchers) == len(cancelled_vouchers)
        and set(exported_cancelled_vouchers) == cancelled_vouchers,
        'cancelled report CSV contains exactly the voucher rows shown by the selected filter',
    )

    page.select_option('#movementType', 'RECEIPT')
    page.select_option('#movementStatus', 'ACTIVE')
    page.locator('#movementFilters button[type=submit]').click()
    page.wait_for_function(
        "document.querySelector('#view').innerText.includes('Type: RECEIPT · Status: ACTIVE')"
    )
    receipt_rows = page.locator('#view table tbody tr')
    receipt_table_text = page.locator('#view table tbody').inner_text()
    check(
        receipt_rows.count() >= 1
        and 'Guest Room 5' in receipt_table_text
        and all('RECEIPT' in row.locator('td').nth(2).inner_text() for row in receipt_rows.all())
        and 'CANCELLED' not in receipt_table_text,
        'receipt-only active report filters by transaction type and status',
    )
    with page.expect_download() as receipt_report_download_info:
        page.click('[data-act=reportCsv]')
    receipt_report_download = receipt_report_download_info.value
    with open(receipt_report_download.path(), 'r', encoding='utf-8', newline='') as receipt_file:
        receipt_reader = csv.DictReader(receipt_file)
        receipt_csv_rows = list(receipt_reader)
    receipt_vouchers = {
        row.locator('td').nth(1).inner_text().removeprefix('R-')
        for row in receipt_rows.all()
    }
    exported_receipt_vouchers = [row['voucherNo'] for row in receipt_csv_rows]
    check(
        receipt_report_download.suggested_filename.startswith('recorded-movement-')
        and any(row['vendor'] == 'Guest Room 5' for row in receipt_csv_rows)
        and all(row['type'] == 'RECEIPT' and row['status'] == 'ACTIVE' for row in receipt_csv_rows),
        'receipt-only report CSV contains active receipt rows only',
    )
    check(
        len(exported_receipt_vouchers) == len(receipt_vouchers)
        and set(exported_receipt_vouchers) == receipt_vouchers,
        'receipt report CSV contains exactly the voucher rows shown by the selected filters',
    )

    page.click('[data-v=reg]')
    page.wait_for_selector('#rbody')
    page.select_option('#rs', 'ALL')

    # The register must stay usable when API records have malformed vendor/note/receipt fields.
    def tamper_register_metadata(route):
        request_data = json.loads(route.request.post_data or '{}')
        response = route.fetch()
        payload = response.json()
        data = payload.get('data', {})
        if request_data.get('action') == 'bootstrap':
            vouchers = data.get('vouchers', [])
            template = next((item.copy() for item in vouchers if isinstance(item, dict)), {})
            template.update({
                'id': 'malformed-register-fixture',
                'no': 999991,
                'date': datetime.date.today().isoformat(),
                'vendor': None,
                'category': 'Other',
                'notes': {'toString': None, 'valueOf': None},
                'amount': 12.5,
                'type': 'PAYMENT',
                'status': 'ACTIVE',
                'createdBy': 'm@test.com',
                'createdAt': '2026-10-12T00:00:00.000Z',
                'receipts': None,
            })
            vouchers.append(template)
            vouchers.append(None)
            data['vouchers'] = vouchers
            payload['data'] = data
            route.fulfill(response=response, json=payload)
        else:
            route.fulfill(response=response)

    page.route('**/api?*', tamper_register_metadata)
    page.locator('[data-act=refresh]').click()
    page.wait_for_function(
        "document.querySelector('#rtot').innerText.includes('1 malformed voucher record(s) omitted')"
    )
    check(
        page.locator('[data-id=malformed-register-fixture][data-act=rec]').count() == 1
        and 'Receipt metadata unavailable' in page.locator('#rbody').inner_text(),
        'register omits malformed voucher records and visibly flags missing receipt metadata',
    )
    page.fill('#rq', '999991')
    check(
        page.locator('#rbody tr').count() == 1
        and 'malformed voucher record(s) omitted' in page.locator('#rtot').inner_text(),
        'register search tolerates null vendor and object-valued notes',
    )
    page.fill('#rq', 'query with no match')
    page.wait_for_function("!document.querySelector('#rempty').classList.contains('hidden')")
    check(
        page.locator('#rempty .empty-state-message').inner_text()
        == 'No vouchers match the current filters.',
        'malformed fields do not break the register empty state',
    )
    page.click('#rempty [data-act=rclear]')
    page.locator('[data-id=malformed-register-fixture][data-act=rec]').click()
    page.wait_for_selector('#rimgs .receipt-error[role=alert]')
    check(
        'Receipt metadata is missing or malformed' in page.locator('#rimgs').inner_text()
        and page.locator('#radd').count() == 0,
        'receipt dialog blocks add/open operations and explains how to recover from malformed metadata',
    )
    page.click('#modal [data-x]')
    page.unroute('**/api?*', tamper_register_metadata)
    page.locator('[data-act=refresh]').click()
    page.wait_for_function(
        "document.querySelector('#rtot').innerText.includes('vouchers') && !document.querySelector('#rtot').innerText.includes('malformed voucher record(s) omitted')"
    )

    with page.expect_download() as download_info:
        page.click('[data-act=csv]')
    check(download_info.value.suggested_filename.endswith('.csv'), 'csv downloads')

    check(page.locator('[data-v=users]').count() == 0, 'manager has no Users nav')

    page.set_viewport_size({'width': 1280, 'height': 800})
    page.click('[data-v=dash]')
    page.wait_for_selector('.two')
    page.screenshot(path='/tmp/desktop.png')

    # Keyboard focus must remain visible after navigation moves from pointer to keyboard.
    page.keyboard.press('Tab')
    keyboard_focus_visible = page.evaluate(
        """() => {
          const element = document.activeElement;
          const style = getComputedStyle(element);
          return element.matches(':focus-visible')
            && style.outlineStyle === 'solid'
            && style.outlineWidth === '3px';
        }"""
    )
    check(keyboard_focus_visible, 'keyboard navigation exposes a visible 3px focus indicator')

    viewport_widths = (320, 360, 390, 768, 801, 1024, 1280)
    for width in viewport_widths:
        page.set_viewport_size({'width': width, 'height': 800})
        page_overflow = page.evaluate(
            'document.documentElement.scrollWidth > document.documentElement.clientWidth'
        )
        check(not page_overflow, f'{width}px dashboard has no page-level horizontal overflow')
        if width <= 800:
            nav_height = page.locator('#nav button').first.evaluate(
                '(element) => element.getBoundingClientRect().height'
            )
            check(nav_height >= 44, f'{width}px mobile navigation targets are at least 44px tall')

    page.click('[data-v=reg]')
    page.wait_for_selector('#rbody')
    for width in viewport_widths:
        page.set_viewport_size({'width': width, 'height': 800})
        page_overflow = page.evaluate(
            'document.documentElement.scrollWidth > document.documentElement.clientWidth'
        )
        check(not page_overflow, f'{width}px register has no page-level horizontal overflow')

    # Exercise the payment-entry workflow at the narrow reflow width used for 400% zoom.
    page.click('[data-v=new]')
    page.wait_for_selector('#nf')
    page.set_viewport_size({'width': 320, 'height': 800})
    check(
        not page.evaluate(
            'document.documentElement.scrollWidth > document.documentElement.clientWidth'
        ),
        '320px payment entry has no page-level horizontal overflow',
    )
    check(page.locator('#nsave').inner_text() == 'Save payment', 'payment form uses a clear singular save action')
    touch_targets = page.locator('#nsave, .seg button[data-act=ntype]').evaluate_all(
        "elements => elements.map(element => ({label: element.innerText, height: element.getBoundingClientRect().height}))"
    )
    check(
        all(target['height'] >= 44 for target in touch_targets),
        'payment save and payment/receipt switch targets are at least 44px tall on mobile',
    )
    page.click('[data-k=RECEIPT]')
    check(page.locator('#nsave').inner_text() == 'Save cash receipt', 'cash-receipt mode uses matching save terminology')
    page.click('[data-k=PAYMENT]')
    page.locator('.erow .rv').first.fill('Mobile workflow vendor')
    page.locator('.erow .ra').first.fill('42')
    check(page.locator('#nsave').inner_text() == 'Save payment', 'single-entry save label stays singular')
    page.click('[data-act=addrow]')
    page.locator('.erow .rv').nth(1).fill('Second workflow vendor')
    check(page.locator('#nsave').inner_text() == 'Save payments', 'save label reflects multiple entered payments')
    row_layout = page.locator('.erow .top').first.evaluate(
        """(element) => {
          const vendor = element.querySelector('.rv').getBoundingClientRect();
          const amount = element.querySelector('.ra').getBoundingClientRect();
          const remove = element.querySelector('.x').getBoundingClientRect();
          return {
            columns: getComputedStyle(element).gridTemplateColumns.split(' ').length,
            vendorWidth: vendor.width,
            amountTop: amount.top,
            vendorBottom: vendor.bottom,
            amountRight: amount.right,
            removeLeft: remove.left,
            removeWidth: remove.width,
            removeHeight: remove.height,
            viewportWidth: document.documentElement.clientWidth,
          };
        }"""
    )
    check(
        row_layout['columns'] == 2
        and row_layout['vendorWidth'] > 0
        and row_layout['amountTop'] >= row_layout['vendorBottom']
        and row_layout['amountRight'] <= row_layout['removeLeft']
        and row_layout['removeWidth'] >= 44
        and row_layout['removeHeight'] >= 44
        and row_layout['removeLeft'] + row_layout['removeWidth'] <= row_layout['viewportWidth'],
        'narrow payment rows reflow fields and preserve a 44px remove target',
    )

    page.emulate_media(reduced_motion='reduce')
    motion = page.locator('#nsave').evaluate(
        """(element) => ({
          preferred: matchMedia('(prefers-reduced-motion: reduce)').matches,
          transition: Number.parseFloat(getComputedStyle(element).transitionDuration),
          animation: Number.parseFloat(getComputedStyle(element).animationDuration),
        })"""
    )
    check(
        motion['preferred'] and motion['transition'] <= 0.0001 and motion['animation'] <= 0.0001,
        'reduced-motion preference minimizes transition and animation durations',
    )
    page.emulate_media(reduced_motion='no-preference')

    page.set_viewport_size({'width': 1280, 'height': 800})
    page.click('[data-v=dash]')
    page.wait_for_selector('.two')
    amount_style = page.locator('.stats b').first.evaluate(
        '(element) => getComputedStyle(element).fontVariantNumeric'
    )
    check(
        'tabular-nums' in amount_style,
        'dashboard financial figures use tabular numerals',
    )
    muted_color = page.locator('.muted').first.evaluate(
        '(element) => getComputedStyle(element).color'
    )
    check(
        muted_color == 'rgb(89, 105, 120)',
        'muted interface text uses the reviewed higher-contrast token',
    )
    page.set_viewport_size({'width': 390, 'height': 800})
    page.screenshot(path='/tmp/mobile.png')

    real_errors = [
        message
        for message in logs
        if 'favicon' not in message
        and 'sw.js' not in message
        and 'INTERNET_DISCONNECTED' not in message
    ]
    check(not real_errors, 'no console errors: ' + '; '.join(real_errors[:3]))

    legacy_entry = {
        'date': datetime.date.today().isoformat(),
        'type': 'PAYMENT',
        'vendor': 'Legacy Migration Vendor',
        'amount': 321,
        'category': 'Other',
        'notes': 'phase 21 migration',
        'receipts': [],
    }
    legacy_json = json.dumps([legacy_entry], separators=(',', ':'))
    migration_context = browser.new_context()
    migration_context.add_init_script(
        script=(
            "if (!localStorage.getItem('cv.phase21.migrationSeeded')) {"
            "localStorage.setItem('cv.outbox', "
            + json.dumps(legacy_json)
            + ");"
            "localStorage.setItem('cv.phase21.migrationSeeded', '1');"
            "}"
        )
    )
    migration_page_a = migration_context.new_page()
    migration_page_b = migration_context.new_page()
    migration_page_a.goto(URL, wait_until='commit')
    migration_page_b.goto(URL, wait_until='domcontentloaded')
    migration_page_a.wait_for_function(
        "localStorage.getItem('cv.outbox') === null",
        timeout=10000,
    )
    migration_page_b.wait_for_function(
        "localStorage.getItem('cv.outbox') === null",
        timeout=10000,
    )
    migrated_records = migration_page_a.evaluate(
        """async () => {
          const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('cash-voucher', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const records = await new Promise((resolve, reject) => {
            const request = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          db.close();
          return records.map((record) => ({
            clientId: record.clientId,
            status: record.status,
            vendor: record.entry.vendor,
            entryClientId: record.entry.clientId,
          }));
        }"""
    )
    check(len(migrated_records) == 1, 'legacy queue migrated once across two tabs')
    check(
        migrated_records[0]['status'] == 'pending'
        and migrated_records[0]['vendor'] == 'Legacy Migration Vendor'
        and migrated_records[0]['clientId'] == migrated_records[0]['entryClientId']
        and migrated_records[0]['clientId'].startswith('legacy-'),
        'legacy migration persists deterministic client ID and transaction',
    )
    migration_context.close()

    corrupt_context = browser.new_context()
    corrupt_context.add_init_script(
        "localStorage.setItem('cv.outbox', '{malformed legacy queue');"
    )
    corrupt_page = corrupt_context.new_page()
    corrupt_page.goto(URL, wait_until='domcontentloaded')
    corrupt_page.wait_for_function(
        "document.querySelector('#banner').textContent.includes('Existing offline payments could not be migrated.')",
        timeout=8000,
    )
    legacy_after_failure = corrupt_page.evaluate(
        "() => localStorage.getItem('cv.outbox')"
    )
    check(
        legacy_after_failure == '{malformed legacy queue',
        'failed legacy migration preserves original localStorage data',
    )
    corrupt_context.close()

    # Malformed audit and owner-diagnostic responses must fail closed and recover.
    audit_malformed_payload = '<svg onload=window.__xssFired=true></svg>'
    audit_response_mode = 'malformed'
    diagnostic_response_modes = {
        'dataQualityReport': 'valid',
        'backupIntegrityReport': 'valid',
    }

    def inject_malformed_audit_rows(route):
        try:
            request_data = json.loads(route.request.post_data or '{}')
        except json.JSONDecodeError:
            request_data = {}
        action = request_data.get('action')
        if action not in ('auditLog', 'dataQualityReport', 'backupIntegrityReport'):
            route.continue_()
            return

        response = route.fetch()
        payload = response.json()
        if not payload.get('ok'):
            if action == 'backupIntegrityReport':
                payload = {
                    'ok': True,
                    'data': {
                        'generatedAt': '2026-10-12T09:00:00.000Z',
                        'inspected': 1,
                        'limit': 10,
                        'passCount': 1,
                        'warningCount': 0,
                        'failCount': 0,
                        'snapshots': [
                            {
                                'name': 'backup-2026-10-12_090000',
                                'createdAt': '2026-10-12T09:00:00.000Z',
                                'state': 'pass',
                                'checks': [
                                    {
                                        'code': 'SHEET_COPY',
                                        'state': 'pass',
                                        'detail': 'Spreadsheet copy is present.',
                                    },
                                ],
                                'rowCounts': {'Vouchers': 3},
                                'receiptCount': 0,
                                'manifestCount': 0,
                            },
                        ],
                        'note': 'Structural inspection only; restore testing remains required.',
                    },
                }
            else:
                route.fulfill(response=response, body=json.dumps(payload))
                return

        if action == 'auditLog':
            if audit_response_mode == 'invalid-envelope':
                payload['data'] = {'unexpected': 'not an audit page'}
            elif audit_response_mode == 'empty':
                payload['data'] = {'rows': [], 'nextBeforeRow': None, 'totalCount': 0}
            elif (
                audit_response_mode == 'malformed'
                and isinstance(payload.get('data'), dict)
                and isinstance(payload['data'].get('rows'), list)
            ):
                payload['data']['rows'] = [
                    None,
                    'unexpected audit row',
                    42,
                    {
                        'time': '2026-10-12T09:00:00',
                        'user': {'toString': None, 'valueOf': None},
                        'action': 'UPDATE',
                        'target': 'voucher',
                        'details': 'malformed user field',
                    },
                    {
                        'time': '2026-10-12T09:00:00',
                        'user': audit_malformed_payload,
                        'action': 'UPDATE',
                        'target': 'voucher',
                        'details': audit_malformed_payload,
                    },
                    *payload['data']['rows'],
                ]
        elif action == 'dataQualityReport':
            mode = diagnostic_response_modes[action]
            if mode == 'invalid-envelope':
                payload['data'] = {'issues': 'not-an-issue-list'}
            elif mode == 'malformed-rows' and isinstance(payload.get('data'), dict):
                report = payload['data']
                report['issues'] = [
                    None,
                    {'severity': 'error'},
                    {
                        'severity': 'error',
                        'code': 'TEST_HOSTILE_TEXT',
                        'sourceRow': 2,
                        'voucherId': 'test-voucher-id',
                        'voucherNo': '201',
                        'date': '2026-10-12',
                        'type': 'PAYMENT',
                        'field': 'Vendor',
                        'message': audit_malformed_payload,
                    },
                ]
                report['issueCount'] = 3
                report['errors'] = 2
                report['warnings'] = 1
                report['truncated'] = False
        elif action == 'backupIntegrityReport':
            mode = diagnostic_response_modes[action]
            if mode == 'invalid-envelope':
                payload['data'] = {'snapshots': 'not-a-snapshot-list'}
            elif mode == 'invalid-snapshot' and isinstance(payload.get('data'), dict):
                report = payload['data']
                report['snapshots'].append({'name': audit_malformed_payload, 'state': 'pass'})
                report['inspected'] += 1
                report['passCount'] += 1

        route.fulfill(response=response, body=json.dumps(payload))

    audit_context = browser.new_context(viewport={'width': 1280, 'height': 800})
    audit_page = audit_context.new_page()
    audit_page.add_init_script('window.__xssFired = false;')
    audit_page.route('**/api?*', inject_malformed_audit_rows)
    audit_page.goto(URL)
    audit_page.fill('#lEmail', 'owner@test.com')
    audit_page.fill('#lPin', '579246')
    audit_page.click('#lBtn')
    audit_page.wait_for_selector('[data-v=audit]')
    audit_page.click('[data-v=audit]')
    audit_page.wait_for_function(
        "document.querySelector('#aud-count')?.innerText.includes('malformed audit event(s) omitted')",
        timeout=10000,
    )
    check(
        audit_page.locator('#aud img, #aud svg').count() == 0
        and audit_malformed_payload in audit_page.locator('#aud').inner_text()
        and 'malformed user field' not in audit_page.locator('#aud').inner_text()
        and not audit_page.evaluate('window.__xssFired === true'),
        'malformed audit records are omitted and hostile string fields stay inert text',
    )
    check(
        '4 malformed audit event(s) omitted' in audit_page.locator('#aud-count').inner_text(),
        'audit status discloses rows with malformed members and field types',
    )
    check(
        audit_page.locator('#aud-user option').count() >= 1
        and audit_page.locator('#aud-action option').count() >= 1,
        'audit filters remain usable after malformed rows are discarded',
    )
    audit_page.fill('#aud-q', 'voucher')
    check(
        '4 malformed audit event(s) omitted from loaded pages.' in audit_page.locator('#aud-count').inner_text(),
        'malformed-row disclosure persists after audit filters rerender the count status',
    )

    audit_response_mode = 'invalid-envelope'
    audit_page.click('[data-v=dash]')
    audit_page.click('[data-v=audit]')
    audit_page.wait_for_function(
        "document.querySelector('#aud-count')?.innerText.includes('invalid server response')",
        timeout=10000,
    )
    check(
        'Audit data is unavailable because the server response was invalid.'
        in audit_page.locator('#aud').inner_text()
        and 'No audit events are available' not in audit_page.locator('#aud').inner_text(),
        'invalid audit envelope is not misreported as an empty audit history',
    )
    audit_page.click('[data-act=audcsv]')
    check(
        'invalid' in audit_page.locator('#toast').inner_text().lower()
        or 'invalid' in audit_page.locator('[role=alert]').last.inner_text().lower(),
        'CSV export gives unavailable feedback for an invalid audit response',
    )

    audit_response_mode = 'empty'
    audit_page.click('[data-v=dash]')
    audit_page.click('[data-v=audit]')
    audit_page.wait_for_function(
        "document.querySelector('#aud-count')?.innerText.includes('Showing 0 of 0 loaded events;')",
        timeout=10000,
    )
    check(
        'No audit events are available in the loaded pages.'
        in audit_page.locator('#aud').inner_text(),
        'a valid empty audit list remains distinct from an invalid response',
    )

    audit_response_mode = 'valid'
    audit_page.click('[data-v=dash]')
    audit_page.click('[data-v=audit]')
    audit_page.wait_for_function(
        "document.querySelector('#aud-count')?.innerText.startsWith('Showing ')",
        timeout=10000,
    )
    check(
        'unavailable' not in audit_page.locator('#aud-count').inner_text().lower()
        and 'malformed audit event(s) omitted' not in audit_page.locator('#aud-count').inner_text(),
        'audit view recovers when a valid response returns',
    )

    audit_page.click('[data-v=set]')
    audit_page.wait_for_selector('[data-act=dqscan]')
    diagnostic_response_modes['dataQualityReport'] = 'invalid-envelope'
    audit_page.click('[data-act=dqscan]')
    audit_page.wait_for_function(
        "document.querySelector('#dq-results')?.getAttribute('role') === 'alert' && document.querySelector('#dq-results')?.innerText.includes('invalid response')",
        timeout=10000,
    )
    check(
        'Scanned undefined' not in audit_page.locator('#dq-results').inner_text()
        and audit_page.locator('[data-act=dqscan]').is_enabled(),
        'invalid data-quality response fails closed and leaves the scan retryable',
    )

    diagnostic_response_modes['dataQualityReport'] = 'malformed-rows'
    audit_page.click('[data-act=dqscan]')
    audit_page.wait_for_function(
        "document.querySelector('#dq-results')?.innerText.includes('malformed data-quality issue(s) omitted')",
        timeout=10000,
    )
    check(
        '2 malformed data-quality issue(s) omitted' in audit_page.locator('#dq-results').inner_text()
        and audit_malformed_payload in audit_page.locator('#dq-results').inner_text()
        and audit_page.locator('#dq-results svg').count() == 0
        and not audit_page.evaluate('window.__xssFired === true'),
        'data-quality scan omits malformed issue rows and renders valid hostile text inertly',
    )

    diagnostic_response_modes['backupIntegrityReport'] = 'invalid-snapshot'
    audit_page.click('[data-act=bkintegrity]')
    audit_page.wait_for_function(
        "document.querySelector('#backup-integrity-results')?.getAttribute('role') === 'alert' && document.querySelector('#backup-integrity-results')?.innerText.includes('invalid response')",
        timeout=10000,
    )
    check(
        'undefined · PASS' not in audit_page.locator('#backup-integrity-results').inner_text()
        and audit_page.locator('[data-act=bkintegrity]').is_enabled(),
        'malformed backup snapshot fails closed and leaves inspection retryable',
    )

    diagnostic_response_modes['backupIntegrityReport'] = 'valid'
    audit_page.click('[data-act=bkintegrity]')
    audit_page.wait_for_function(
        "document.querySelector('#backup-integrity-results')?.getAttribute('role') === 'status' && document.querySelector('#backup-integrity-results')?.innerText.startsWith('Inspected ')",
        timeout=10000,
    )
    check(
        'invalid response' not in audit_page.locator('#backup-integrity-results').inner_text().lower(),
        'backup integrity inspection recovers after a valid report returns',
    )
    audit_page.close()

    # Finish with a full staff cash-receipt journey and verify the next-entry action preserves mode.
    page.set_viewport_size({'width': 390, 'height': 800})
    page.click('[data-v=new]')
    page.wait_for_selector('#nf')
    page.click('[data-k=RECEIPT]')
    page.fill('.erow .rv', 'Mobile cash receipt workflow')
    page.fill('.erow .ra', '25')
    check(page.locator('#nsave').inner_text() == 'Save cash receipt', 'cash receipt form has matching save action')
    choose_cash_impact_for_current_rows()
    page.click('#nsave')
    page.wait_for_function("document.querySelector('#nres')?.innerText.includes('Saved 1 cash receipt')")
    check('Saved 1 cash receipt' in page.locator('#nres').inner_text(), 'saved confirmation uses cash-receipt terminology')
    page.click('#nres [data-act=newagain]')
    page.wait_for_selector('#nf')
    check(page.locator('#nsave').inner_text() == 'Save cash receipt', 'new cash receipt action preserves the selected mode')

    check(
        not csp_violations,
        'CSP does not block required assets, scripts, or API requests during browser workflows',
    )
    browser.close()

print(f'e2e: {ok} checks passed, {len(errs)} failed')
raise SystemExit(1 if errs else 0)
