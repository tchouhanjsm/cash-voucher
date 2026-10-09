import base64
import datetime
import json
import os
import urllib.parse

from playwright.sync_api import sync_playwright

BASE = os.environ.get('E2E_BASE', 'http://127.0.0.1:8765').rstrip('/')
API = BASE + '/api?' + urllib.parse.urlencode({'drop_vendor': 'Offline Vendor', 'count_vendor': 'Multi-tab Vendor'})
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
    logs = []
    page.add_init_script('window.__xssFired = false;')
    page.on('console', lambda message: logs.append(message.text) if message.type == 'error' else None)
    page.on('pageerror', lambda error: logs.append('PAGEERR ' + str(error)))

    page.goto(URL)
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
    check(page.locator('#nav button').count() == 8, 'owner sees 8 nav items')
    check(
        page.locator('[data-v=dash]').get_attribute('aria-current') == 'page',
        'current navigation view is announced to assistive technology',
    )
    check(
        page.locator('[data-v=dash] .ic').get_attribute('aria-hidden') == 'true',
        'decorative navigation icon is hidden from assistive technology',
    )

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
    page.wait_for_selector('#aud tr')
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
    page.wait_for_function(
        "document.querySelector('#aud').innerText.includes('<svg onload=window.__xssFired=true></svg>')"
    )
    check(
        page.locator('#aud img, #aud svg').count() == 0
        and xss_vendor in page.locator('#aud').inner_text()
        and not page.evaluate('window.__xssFired === true'),
        'audit-log details are rendered as text, not executable HTML',
    )
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
        and page.locator('.rc').first.get_attribute('aria-label') == 'Category, row 1',
        'payment row fields have explicit accessible names',
    )
    page.click('#nsave')
    page.wait_for_selector('#nres .form-error')
    check(
        'Add at least one payment' in page.inner_text('#nres')
        and page.evaluate("document.activeElement === document.querySelector('.rv')"),
        'empty form submission is announced and focuses the first row',
    )
    page.fill('.rv', 'Ram Traders')
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
    check(
        page.locator('.thumb').first.get_attribute('src').startswith('blob:'),
        'receipt preview source is assigned as a generated blob URL',
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
    page.locator('.erow').nth(1).locator('[data-act=delrow]').click()
    check(
        page.locator('.erow').count() == 1
        and page.locator('.rv').first.get_attribute('aria-label') == 'Payee / vendor, row 1'
        and page.evaluate("document.activeElement === document.querySelector('.rv')"),
        'removing a row restores focus and keeps the remaining row labelled',
    )
    page.click('[data-act=addrow]')
    page.wait_for_function("document.querySelectorAll('.erow').length === 2")
    page.locator('.rv').nth(1).fill('Shiv Gas')
    page.locator('.ra').nth(1).fill('900')
    page.click('#nsave')
    page.wait_for_selector('.ok-panel')
    check('Saved 2 payments' in page.inner_text('#nres'), 'saved 2 payments')

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
    check(
        xss_note in page.locator('#rbody').inner_text()
        and page.locator('#rbody img').count() == 0,
        'user-controlled note is rendered as text, not executable HTML',
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
        and xss_note in print_text
        and page.locator('#printArea img, #printArea svg').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'stored voucher note remains text in printable output',
    )

    context.set_offline(True)
    page.click('[data-v=new]')
    page.fill('.rv', 'Offline Vendor')
    page.fill('.ra', '75')
    page.click('#nsave')
    page.wait_for_selector('.ok-panel')
    check('Saved on this device' in page.inner_text('#nres'), 'offline queued')
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

    def import_recovery_file(file_path):
        selector = '#banner [data-act=import-pending]'
        if not page.locator(selector).is_visible():
            selector = '#view [data-act=import-pending]'
        page.once('dialog', lambda dialog: dialog.accept())
        with page.expect_file_chooser() as chooser_info:
            page.locator(selector).click()
        chooser_info.value.set_files(file_path)

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

    page.click('[data-v=acct]')
    page.click('[data-act=signout]')
    page.wait_for_selector('#loginForm')

    login('m@test.com', '246810')
    page.wait_for_selector('#op')
    page.fill('#op', '246810')
    page.fill('#np', '864209')
    page.click('.mcard .primary')
    page.wait_for_selector('#nav button')
    check(page.locator('#nav button').count() == 6, 'manager sees 6 nav items')

    page.click('[data-v=new]')
    page.click('[data-k=RECEIPT]')
    page.fill('.rv', 'Guest Room 5')
    page.fill('.ra', '5000')
    page.click('#nsave')
    page.wait_for_selector('.ok-panel')
    check('R-1' in page.inner_text('#nres'), 'cash received saved as R-1')

    page.click('[data-v=bulk]')
    page.wait_for_selector('#bt')
    today = datetime.date.today()
    date_text = today.strftime('%d/%m/%Y')
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
    check('Imported 2' in page.inner_text('#bprev'), 'imported 2')

    page.click('[data-v=dash]')
    page.wait_for_selector('svg.chart')
    page.click('[data-k=mtd]')
    page.wait_for_selector('.stats')
    check('cash in hand' in page.inner_text('.stats').lower(), 'dashboard shows cash in hand')
    check(page.locator('.hb').count() >= 3, 'dashboard bars')

    page.click('[data-v=reg]')
    page.wait_for_selector('[data-act=edit]')
    page.set_viewport_size({'width': 390, 'height': 844})
    manager_row = page.locator('#rbody tr').filter(has_text='Ram Traders').first
    check(
        manager_row.locator('.voucher-kind').inner_text() == 'Cash paid',
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
    edit_trigger.evaluate("(element) => element.removeAttribute('data-focus-restore-probe')")
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

    # Finish with a full staff cash-receipt journey and verify the next-entry action preserves mode.
    page.set_viewport_size({'width': 390, 'height': 800})
    page.click('[data-v=new]')
    page.wait_for_selector('#nf')
    page.click('[data-k=RECEIPT]')
    page.fill('.erow .rv', 'Mobile cash receipt workflow')
    page.fill('.erow .ra', '25')
    check(page.locator('#nsave').inner_text() == 'Save cash receipt', 'cash receipt form has matching save action')
    page.click('#nsave')
    page.wait_for_function("document.querySelector('#nres')?.innerText.includes('Saved 1 cash receipt')")
    check('Saved 1 cash receipt' in page.locator('#nres').inner_text(), 'saved confirmation uses cash-receipt terminology')
    page.click('#nres [data-act=newagain]')
    page.wait_for_selector('#nf')
    check(page.locator('#nsave').inner_text() == 'Save cash receipt', 'new cash receipt action preserves the selected mode')

    browser.close()

print(f'e2e: {ok} checks passed, {len(errs)} failed')
raise SystemExit(1 if errs else 0)
