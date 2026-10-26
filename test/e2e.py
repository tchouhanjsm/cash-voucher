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
    'direct_drop_vendor': 'Direct Lost Response Vendor',
    'direct_malformed_vendor': 'Direct Malformed Response Vendor',
    'ack_vendor': 'Acknowledgement Failure Vendor',
    'session_vendor': 'Stale Session Vendor',
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


def click_with_draft_discard(page, button):
    dirty_draft = page.evaluate(
        """() => {
          const form = document.querySelector('#nf');
          return Boolean(
            form
              && form.isConnected
              && !form.classList.contains('hidden')
              && !form.closest('.hidden')
              && form.dataset.unsavedWork === 'true'
              && !form.querySelector('#nsave')?.disabled
          );
        }"""
    )
    if not dirty_draft:
        button.click()
        return

    def handle_dialog(dialog):
        if dialog.type == 'confirm' and dialog.message.startswith(
            'This voucher draft has unsaved changes.'
        ):
            dialog.accept()
        else:
            dialog.dismiss()

    page.on('dialog', handle_dialog)
    try:
        button.click()
    finally:
        page.remove_listener('dialog', handle_dialog)


def go_view(page, view):
    """Navigate through the visible mobile shortcut or the accessible More sheet."""
    shortcut = page.locator(f'#nav [data-v="{view}"]')
    if shortcut.count() == 1 and shortcut.is_visible():
        click_with_draft_discard(page, shortcut)
        return

    more_button = page.locator('#mobileMoreBtn')
    if not more_button.is_visible():
        raise AssertionError(f'Navigation item {view!r} is not visible and More is unavailable.')

    more_button.click()
    overflow_item = page.locator(f'#navMoreItems [data-v="{view}"]')
    if overflow_item.count() != 1:
        page.keyboard.press('Escape')
        raise AssertionError(f'Navigation item {view!r} is not available in More.')
    click_with_draft_discard(page, overflow_item)


png = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
)

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(
        viewport={'width': 390, 'height': 800},
        color_scheme='light',
        accept_downloads=True,
    )
    page = context.new_page()

    def choose_cash_impact_for_current_rows():
        for control in page.locator('#rows .rci').all():
            control.select_option('CASH')

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

    # FrontUI Studio is a static, same-origin design reference. Keep it independent
    # from authentication and verify the shared kit is present without inline assets.
    studio_page = context.new_page()
    studio_page.goto(BASE + '/ui-studio.html', wait_until='domcontentloaded')
    check(
        'FrontUI Studio' in studio_page.title()
        and studio_page.locator('#studio-main h1').inner_text() == 'FrontUI Studio',
        'FrontUI Studio gallery loads as a standalone static page',
    )
    studio_csp = studio_page.locator('meta[http-equiv="Content-Security-Policy"]')
    studio_csp_content = studio_csp.get_attribute('content') if studio_csp.count() == 1 else ''
    check(
        studio_csp.count() == 1
        and "style-src 'self'" in studio_csp_content
        and "script-src 'self'" in studio_csp_content
        and studio_page.locator('script').count() == 0
        and studio_page.locator('[style]').count() == 0,
        'FrontUI Studio uses a strict static CSP without inline scripts or styles',
    )
    kit_metrics = studio_page.evaluate("""() => {
        const root = getComputedStyle(document.documentElement);
        const button = document.querySelector('.studio-button-row .btn.primary');
        const card = document.querySelector('.studio-card');
        return {
            space4: root.getPropertyValue('--ui-space-4').trim(),
            buttonHeight: Number.parseFloat(getComputedStyle(button).minHeight),
            cardRadius: Number.parseFloat(getComputedStyle(card).borderTopLeftRadius),
            kitStylesheet: Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
                .some((link) => link.getAttribute('href') === 'frontend-ui-kit.css'),
        };
    }""")
    check(
        kit_metrics['space4'] == '16px'
        and kit_metrics['buttonHeight'] >= 44
        and kit_metrics['cardRadius'] >= 14
        and kit_metrics['kitStylesheet'],
        'FrontUI Studio consumes the shared spacing, control and card tokens',
    )
    check(
        all(
            studio_page.locator('#' + section).count() == 1
            for section in ['foundations', 'components', 'patterns', 'themes']
        ),
        'FrontUI Studio exposes all four named kit sections',
    )
    for width in [320, 360, 390, 768, 801, 1024, 1280]:
        studio_page.set_viewport_size({'width': width, 'height': 800})
        check(
            not studio_page.evaluate(
                'document.documentElement.scrollWidth > document.documentElement.clientWidth'
            ),
            f'FrontUI Studio has no page-level horizontal overflow at {width}px',
        )
    studio_page.close()

    page.goto(URL)
    escaped_header_html = page.evaluate("""async () => {
        const { head } = await import('/frontend/core/ui.js');
        const payload = '<svg onload=window.__xssFired=true></svg>';
        return head('Heading', '', { section: payload, description: payload });
    }""")
    check(
        '&lt;svg' in escaped_header_html
        and '<svg' not in escaped_header_html
        and not page.evaluate('window.__xssFired === true'),
        'shared page header escapes hostile section and description values as text',
    )
    check(
        page.locator('html').get_attribute('data-theme') == 'light'
        and page.evaluate("localStorage.getItem('cv.theme')") is None,
        'first-use workspace defaults to light without creating a saved preference',
    )
    page.emulate_media(color_scheme='dark')
    page.wait_for_timeout(150)
    check(
        page.locator('html').get_attribute('data-theme') == 'light'
        and page.evaluate("localStorage.getItem('cv.theme')") is None,
        'dark operating-system preference does not silently override the light workspace',
    )
    page.emulate_media(color_scheme='light')
    page.wait_for_timeout(150)
    check(
        page.locator('html').get_attribute('data-theme') == 'light',
        'workspace remains light when the operating-system preference returns to light',
    )
    manifest_data = page.evaluate(
        """async () => {
            const response = await fetch('manifest.webmanifest');
            return response.ok ? response.json() : null;
        }"""
    )
    check(
        manifest_data is not None
        and manifest_data.get('display') == 'standalone'
        and any(icon.get('sizes') == '192x192' for icon in manifest_data.get('icons', []))
        and any(icon.get('sizes') == '512x512' for icon in manifest_data.get('icons', []))
        and any(icon.get('purpose') == 'maskable' for icon in manifest_data.get('icons', []))
        and page.locator('link[rel="apple-touch-icon"]').get_attribute('sizes') == '192x192',
        'PWA launch manifest and standard, Apple and maskable app icons are wired',
    )
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
    page.set_viewport_size({'width': 1280, 'height': 800})
    login_style = page.evaluate("""() => {
      const root = document.querySelector('#login');
      const shell = root.querySelector('.auth-login__shell');
      const panel = root.querySelector('.auth-login__panel');
      const control = root.querySelector('.auth-login__control');
      const submit = root.querySelector('.auth-login__submit');
      const bounds = shell.getBoundingClientRect();
      return {
        theme: root.dataset.theme,
        columns: getComputedStyle(shell).gridTemplateColumns,
        panelPadding: Number.parseFloat(getComputedStyle(panel).paddingTop),
        controlHeight: control.getBoundingClientRect().height,
        submitHeight: submit.getBoundingClientRect().height,
        viewportWidth: document.documentElement.clientWidth,
        pageWidth: document.documentElement.scrollWidth,
        shellWithinViewport: bounds.left >= 0 && bounds.right <= document.documentElement.clientWidth
      };
    }""")
    check(
        login_style['theme'] == 'sky'
        and len(login_style['columns'].split()) == 2
        and login_style['panelPadding'] >= 24
        and login_style['controlHeight'] >= 48
        and login_style['submitHeight'] >= 48
        and login_style['shellWithinViewport']
        and login_style['pageWidth'] <= login_style['viewportWidth'],
        'sign-in surface uses the new two-panel login design with generous spacing and touch-friendly controls',
    )
    page.click('[data-login-theme="mint"]')
    page.wait_for_function(
        "() => getComputedStyle(document.querySelector('#login .auth-login__story')).backgroundColor === 'rgb(221, 241, 229)'"
    )
    check(
        page.locator('#login').get_attribute('data-theme') == 'mint'
        and page.locator('html').get_attribute('data-palette') == 'mint'
        and page.evaluate("localStorage.getItem('cv.palette')") == 'mint'
        and page.evaluate(
            "getComputedStyle(document.querySelector('#login .auth-login__story')).backgroundColor"
        ) == 'rgb(221, 241, 229)',
        'login theme selector persists the selected palette before authentication',
    )
    page.set_viewport_size({'width': 390, 'height': 800})

    page.fill('#lEmail', 'not-an-email')
    page.fill('#lPassword', '')
    page.click('#lBtn')
    check(
        'valid work email' in page.inner_text('#lEmailErr')
        and page.locator('#lEmail').get_attribute('aria-invalid') == 'true',
        'invalid email receives an inline error and accessible invalid state',
    )

    page.fill('#lEmail', 'owner@test.com')
    page.fill('#lPassword', '')
    page.click('#lBtn')
    check(
        page.inner_text('#lPasswordErr') == 'Enter your password.'
        and page.locator('#lPassword').get_attribute('aria-invalid') == 'true',
        'empty password receives an inline error and accessible invalid state',
    )

    page.fill('#lPassword', 'Wrong#Password2026')
    page.click('#lBtn')
    page.wait_for_selector('#lErr:not(:empty)')
    check('Invalid' in page.inner_text('#lErr'), 'wrong password message')

    page.fill('#lPassword', 'Owner#Start2026')
    page.click('#lBtn')
    page.get_by_role('dialog', name='Choose a new password').wait_for(state='visible', timeout=10000)
    check(
        page.get_by_role('dialog', name='Choose a new password').count() == 1,
        'password dialog has an accessible name',
    )
    check(
        page.locator('#modal').get_attribute('aria-labelledby') == 'modalTitle'
        and page.locator('#modalTitle').inner_text() == 'Choose a new password',
        'forced password change uses the shared accessible dialog heading',
    )
    check(
        page.locator('#currentPassword').get_attribute('aria-label') == 'Current temporary password'
        and page.locator('#newPassword').get_attribute('aria-label') == 'New password',
        'forced password change fields have explicit accessible names',
    )
    check(
        page.locator('#currentPassword').get_attribute('type') == 'password'
        and page.locator('#newPassword').get_attribute('type') == 'password'
        and page.locator('#newPassword').get_attribute('minlength') == '8'
        and page.locator('#newPassword').get_attribute('maxlength') == '128',
        'forced password change fields are masked and enforce an 8–128 character new password',
    )
    page.locator('.mcard .primary').focus()
    page.keyboard.press('Tab')
    check(
        page.evaluate("document.activeElement?.id === 'currentPassword'"),
        'Tab wraps from the last dialog control to the first',
    )
    page.locator('#currentPassword').focus()
    page.keyboard.press('Shift+Tab')
    check(
        page.evaluate("document.activeElement?.matches('.mcard .primary')"),
        'Shift+Tab wraps from the first dialog control to the last',
    )
    page.fill('#currentPassword', 'Owner#Start2026')
    page.fill('#newPassword', 'Owner#Final2026')
    page.click('.mcard .primary')
    page.wait_for_selector('#nav button')
    check(
        page.locator('#nav button').count() == 11,
        'owner sees Onboarding and Cash Close navigation; Account moved to the user menu',
    )
    check(
        page.locator('html').get_attribute('data-palette') == 'mint'
        and page.evaluate("localStorage.getItem('cv.palette')") == 'mint'
        and page.evaluate("getComputedStyle(document.querySelector('.side')).backgroundColor")
        == 'rgb(245, 250, 247)'
        and page.evaluate(
            "getComputedStyle(document.querySelector('.side nav button.on')).backgroundColor"
        ) == 'rgb(221, 241, 229)',
        'authenticated workspace keeps the login palette on navigation and selected states',
    )
    check(
        page.locator('#main-content h1').inner_text() == 'Get Cash Voucher ready',
        'owner first login opens the onboarding dashboard',
    )
    page.click('#userBtn')
    check(
        page.locator('#themeToggle').is_visible()
        and 'Use dark theme' in page.locator('#themeToggle').inner_text(),
        'account menu exposes a labelled theme toggle',
    )
    page.click('#themeToggle')
    check(
        page.locator('html').get_attribute('data-theme') == 'dark'
        and page.evaluate("localStorage.getItem('cv.theme')") == 'dark'
        and page.evaluate("getComputedStyle(document.body).backgroundColor") == 'rgb(17, 24, 32)'
        and page.locator('meta[name="theme-color"]').get_attribute('content') == '#111820'
        and page.locator('#themeToggle').get_attribute('aria-pressed') == 'true',
        'dark theme updates design tokens, browser chrome color, accessible state and persisted preference',
    )
    page.click('#userBtn')
    page.click('#themeToggle')
    check(
        page.locator('html').get_attribute('data-theme') == 'light'
        and page.evaluate("localStorage.getItem('cv.theme')") == 'light'
        and page.evaluate("getComputedStyle(document.body).backgroundColor") == 'rgb(237, 241, 246)'
        and page.locator('meta[name="theme-color"]').get_attribute('content') == '#edf1f6'
        and page.locator('#themeToggle').get_attribute('aria-pressed') == 'false',
        'light theme can be restored and the explicit choice is retained',
    )
    go_view(page, 'dash')
    page.wait_for_selector('#view .page-header h1')
    check(
        page.locator('#view .breadcrumbs').count() == 0
        and page.locator('#view .page-header h1').inner_text() == 'Dashboard',
        'page heading uses one consistent page-header component without breadcrumb noise',
    )
    check(
        page.locator('#view .page-eyebrow').text_content().strip() == 'Work'
        and page.locator('#view .page-description').count() == 1,
        'page context and description are rendered in the shared production header',
    )

    # An empty selected period must explain the scope and offer an immediate, permitted next action.
    empty_dashboard_interceptions = []

    def inject_empty_dashboard_summary(route):
        try:
            request_data = json.loads(route.request.post_data or '{}')
        except json.JSONDecodeError:
            request_data = {}
        if request_data.get('action') != 'dashboardSummary':
            route.continue_()
            return
        from_date = request_data.get('from', '2026-10-20')
        to_date = request_data.get('to', '2026-10-26')
        empty_dashboard_interceptions.append({'from': from_date, 'to': to_date})
        payload = {
            'ok': True,
            'data': {
                'from': from_date,
                'to': to_date,
                'periodDays': 7,
                'trendMonthly': False,
                'trend': [],
                'paid': 0,
                'previousPaid': 0,
                'paymentCount': 0,
                'validPaymentCount': 0,
                'largest': None,
                'todayPaid': 0,
                'todayPaymentCount': 0,
                'received': 0,
                'receiptCount': 0,
                'bookBalance': 0,
                'topVendors': [],
                'byCategory': [],
                'byTeamMember': [],
                'approvalExceptionCount': 0,
                'invalidAmountCount': 0,
                'malformedRecordCount': 0,
                'malformedFieldCount': 0,
            },
        }
        route.fulfill(status=200, content_type='application/json', body=json.dumps(payload))

    page.route('**/api?*', inject_empty_dashboard_summary)
    try:
        page.click('[data-act=range][data-k="7d"]')
        page.wait_for_selector('#view .dashboard-empty-state', timeout=10000)
        empty_text = page.locator('#view .dashboard-empty-state').inner_text()
        empty_request = empty_dashboard_interceptions[-1] if empty_dashboard_interceptions else {}
        from_label = '/'.join(reversed(empty_request.get('from', '').split('-')))
        to_label = '/'.join(reversed(empty_request.get('to', '').split('-')))
        check(
            bool(empty_dashboard_interceptions)
            and from_label in empty_text
            and to_label in empty_text
            and 'date-filtered summary' in empty_text,
            'empty dashboard names the exact selected period and avoids claiming the whole book is empty',
        )
        check(
            page.locator('#view .stat').count() == 0
            and page.locator('#view .dashboard-trend').count() == 0
            and page.locator('#view .dashboard-breakdowns').count() == 0,
            'empty approved-activity period does not present zero KPIs and empty analytics as useful metrics',
        )
        check(
            page.locator('.dashboard-empty-state [data-act=ntype][data-k="PAYMENT"]').count() == 1
            and page.locator('.dashboard-empty-state [data-act=ntype][data-k="RECEIPT"]').count() == 1,
            'create-permitted owner receives direct payment and receipt actions',
        )
        page.click('.dashboard-empty-state [data-act=ntype][data-k="RECEIPT"]')
        page.wait_for_selector('#nf.entry-form')
        check(
            page.locator('#view .page-header h1').inner_text() == 'Cash Received'
            and page.locator('.entry-type-switch button[data-k="RECEIPT"].on').count() == 1,
            'empty-state receipt action opens the correctly selected Cash Received workflow',
        )
    finally:
        page.unroute('**/api?*', inject_empty_dashboard_summary)

    go_view(page, 'dash')
    page.wait_for_function(
        "document.querySelector('#view')?.innerText.includes('No approved payments or recorded receipts are included') || "
        "document.querySelector('#view')?.innerText.includes('Spending trend')"
    )
    check(
        page.locator('#view .page-header h1').inner_text() == 'Dashboard'
        and page.locator('#view .dashboard-empty-state, #view .dashboard-trend').count() == 1,
        'dashboard recovers after the controlled empty-summary response is removed',
    )

    page.click('#userBtn')
    page.locator('#userPop button[data-go="acct"]').first.click()
    page.wait_for_selector('#pf')
    account_header = page.locator('#view .page-header')
    check(
        account_header.locator('.page-eyebrow').text_content().strip() == 'Account'
        and account_header.locator('.page-description').count() == 1
        and page.locator('.profile-account-card').count() == 1
        and page.locator('.account-password-form#pf').count() == 1,
        'My Account uses shared page context and a dedicated profile/password layout',
    )
    page.fill('#rs', 'E2E problem report')
    page.fill('#rm', 'Synthetic report from the browser test; please ignore.')
    page.click('#rf button[type=submit]')
    page.wait_for_function("document.body.innerText.includes('Sent to support. Reference')")
    check(
        page.locator('#rs').input_value() == '' and page.locator('#rm').input_value() == '',
        'Report a problem form sends to support and clears itself',
    )
    page.set_viewport_size({'width': 1280, 'height': 800})
    account_columns = page.locator('.account-password-controls').evaluate(
        "el => getComputedStyle(el).gridTemplateColumns.match(/\\d+(?:\\.\\d+)?px/g)?.length || 0"
    )
    check(account_columns >= 3, 'Account password controls align into a clear three-column desktop form')
    page.set_viewport_size({'width': 390, 'height': 800})
    check(
        page.locator('.account-password-controls').evaluate(
            "el => getComputedStyle(el).gridTemplateColumns.match(/\\d+(?:\\.\\d+)?px/g)?.length || 0"
        ) == 1
        and page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'),
        'Account password controls stack cleanly without page-level overflow on mobile',
    )
    page.set_viewport_size({'width': 390, 'height': 800})
    # Phase 28–30: cross-workflow visual matrix. Store same-browser screenshots as a
    # review artifact in both light and dark themes; geometry checks run at every width.
    visual_matrix_dir = '/tmp/cash-voucher-visual-matrix'
    os.makedirs(visual_matrix_dir, exist_ok=True)
    visual_routes = [
        ('dashboard', 'dash', '#view .dashboard-view'),
        ('new-entry', 'new', '#nf.entry-form'),
        ('register', 'reg', '#rf'),
        ('reports', 'reports', '#movementFilters'),
        ('cash-close', 'cashClose', '.cc-controls'),
        ('bulk-upload', 'bulk', '#bt'),
        ('vendors', 'vend', '#vf'),
        ('users', 'users', '#uf'),
        ('settings', 'set', '#sf'),
        ('audit', 'audit', '.audit-panel'),
        ('account', 'acct', '#pf'),
    ]
    def inject_visual_dashboard_summary(route):
        try:
            request_data = json.loads(route.request.post_data or '{}')
        except json.JSONDecodeError:
            request_data = {}
        if request_data.get('action') != 'dashboardSummary':
            route.continue_()
            return
        from_date = request_data.get('from', '2026-10-20')
        to_date = request_data.get('to', '2026-10-26')
        payload = {
            'ok': True,
            'data': {
                'from': from_date,
                'to': to_date,
                'periodDays': 7,
                'trendMonthly': False,
                'trend': [{'date': to_date, 'amount': 1250}],
                'paid': 1250,
                'previousPaid': 1000,
                'paymentCount': 1,
                'validPaymentCount': 1,
                'largest': {'amount': 1250, 'vendor': 'Visual review sample'},
                'todayPaid': 1250,
                'todayPaymentCount': 1,
                'received': 500,
                'receiptCount': 1,
                'bookBalance': 1750,
                'topVendors': [{'k': 'Visual review sample', 'n': 1, 's': 1250}],
                'byCategory': [{'k': 'Operations', 'n': 1, 's': 1250}],
                'byTeamMember': [{'k': 'Visual Owner', 'n': 1, 's': 1250}],
                'approvalExceptionCount': 0,
                'invalidAmountCount': 0,
                'malformedRecordCount': 0,
                'malformedFieldCount': 0,
            },
        }
        route.fulfill(status=200, content_type='application/json', body=json.dumps(payload))

    page.route('**/api?*', inject_visual_dashboard_summary)
    visual_widths = [320, 360, 390, 768, 1024, 1280, 1440]
    for route_name, route_id, ready_selector in visual_routes:
        if route_id == 'acct':
            page.click('#userBtn')
            page.locator('#userPop button[data-go="acct"]').first.click()
        else:
            go_view(page, route_id)
        page.wait_for_selector(ready_selector, state='visible', timeout=10000)
        page.wait_for_selector('#view .page-header h1', state='visible', timeout=10000)
        check(
            page.locator('#view .page-header h1').count() == 1
            and page.locator('#view .page-header h1').inner_text().strip() != '',
            f'{route_name}: one non-empty shared page heading is rendered',
        )
        check(
            page.evaluate("document.activeElement === document.querySelector('#view .page-header h1')"),
            f'{route_name}: route navigation places focus on the destination heading',
        )
        unnamed_controls = page.evaluate("""() => {
            const selector = [
                'button',
                'input:not([type="hidden"])',
                'select',
                'textarea',
                'a[href]',
                '[role="button"]',
                '[role="link"]',
                '[role="checkbox"]',
                '[role="switch"]',
                '[role="tab"]',
                '[role="menuitem"]',
                '[tabindex]:not([tabindex="-1"])'
            ].join(', ');
            const visible = (element) => {
                const style = getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                return element.getClientRects().length > 0
                    && style.display !== 'none'
                    && style.visibility !== 'hidden'
                    && rect.width > 0
                    && rect.height > 0;
            };
            const textWithoutHiddenContent = (element) => {
                const clone = element.cloneNode(true);
                clone.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove());
                return (clone.innerText || clone.textContent || '').replace(/\\s+/g, ' ').trim();
            };
            const accessibleName = (element) => {
                const ariaLabel = element.getAttribute('aria-label') || '';
                if (ariaLabel.trim()) return ariaLabel.trim();
                const labelledBy = (element.getAttribute('aria-labelledby') || '')
                    .split(/\\s+/).filter(Boolean)
                    .map((id) => document.getElementById(id)?.innerText || document.getElementById(id)?.textContent || '')
                    .join(' ').trim();
                if (labelledBy) return labelledBy;
                const labelText = element.labels
                    ? Array.from(element.labels).map((label) => textWithoutHiddenContent(label)).join(' ').trim()
                    : '';
                if (labelText) return labelText;
                if (element.matches('input[type="submit"], input[type="button"], input[type="reset"]')) {
                    const value = element.value || '';
                    if (value.trim()) return value.trim();
                }
                const alt = element.getAttribute('alt')
                    || element.querySelector('img[alt]')?.getAttribute('alt')
                    || '';
                if (alt.trim()) return alt.trim();
                const text = textWithoutHiddenContent(element);
                if (text) return text;
                const title = element.getAttribute('title') || '';
                return title.trim();
            };
            return Array.from(document.querySelectorAll(selector))
                .filter(visible)
                .filter((element) => !accessibleName(element))
                .map((element) => ({
                    tag: element.tagName.toLowerCase(),
                    id: element.id || '',
                    type: element.getAttribute('type') || '',
                    role: element.getAttribute('role') || '',
                    className: typeof element.className === 'string' ? element.className : ''
                })).slice(0, 12);
        }""")
        check(
            not unnamed_controls,
            f'{route_name}: visible interactive controls have accessible names; unnamed={unnamed_controls}',
        )

        for theme_name in ['light', 'dark']:
            page.evaluate(
                "theme => document.documentElement.setAttribute('data-theme', theme)",
                theme_name,
            )
            for width in visual_widths:
                page.set_viewport_size({'width': width, 'height': 900 if width >= 768 else 844})
                page.wait_for_timeout(25)
                layout = page.evaluate("""() => {
                    const root = document.documentElement;
                    const body = document.body;
                    const main = document.querySelector('.main');
                    const view = document.querySelector('#view');
                    const tooShortControls = Array.from(view.querySelectorAll(
                        'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea, button.btn'
                    )).filter((element) => {
                        if (element.closest('.table-wrap')) return false;
                        const style = getComputedStyle(element);
                        const rect = element.getBoundingClientRect();
                        return style.display !== 'none' && style.visibility !== 'hidden'
                            && rect.width > 0 && rect.height > 0 && rect.height < 40;
                    }).map((element) => ({
                        tag: element.tagName,
                        id: element.id || '',
                        className: typeof element.className === 'string' ? element.className : ''
                    })).slice(0, 6);
                    return {
                        viewportWidth: root.clientWidth,
                        documentWidth: Math.max(root.scrollWidth, body.scrollWidth),
                        mainWidth: main ? main.clientWidth : root.clientWidth,
                        mainScrollWidth: main ? main.scrollWidth : root.scrollWidth,
                        viewWidth: view ? view.clientWidth : root.clientWidth,
                        viewScrollWidth: view ? view.scrollWidth : root.scrollWidth,
                        headingCount: view.querySelectorAll('.page-header h1').length,
                        dashboardIconPosition: view.querySelector('.dashboard-view .stat .stat-ic')
                            ? getComputedStyle(view.querySelector('.dashboard-view .stat .stat-ic')).position
                            : '',
                        dashboardIconAlignment: view.querySelector('.dashboard-view .stat .stat-ic')
                            ? getComputedStyle(view.querySelector('.dashboard-view .stat .stat-ic')).alignSelf
                            : '',
                        tooShortControls
                    };
                }""")
                check(
                    layout['documentWidth'] <= layout['viewportWidth'] + 1
                    and layout['mainScrollWidth'] <= layout['mainWidth'] + 1
                    and layout['viewScrollWidth'] <= layout['viewWidth'] + 1,
                    f'{route_name}: no document/main/workspace horizontal overflow at {width}px in {theme_name} theme',
                )
                check(
                    layout['headingCount'] == 1,
                    f'{route_name}: exactly one page heading remains at {width}px in {theme_name} theme',
                )
                if route_id == 'dash':
                    check(
                        layout['dashboardIconPosition'] == 'static'
                        and layout['dashboardIconAlignment'] == 'start',
                        f'dashboard: KPI icons stay in grid flow and align with labels on tall cards at {width}px in {theme_name} theme',
                    )
                check(
                    not layout['tooShortControls'],
                    f'{route_name}: visible form controls remain at least 40px high at {width}px in {theme_name} theme; found {layout["tooShortControls"]}',
                )
                if width in (390, 1280):
                    screenshot_name = f'{route_name}-{theme_name}-{width}.png'
                    # A previous transient toast should not obscure the review artifact.
                    page.locator('#toast').evaluate("element => element.classList.add('hidden')")
                    page.screenshot(
                        path=os.path.join(visual_matrix_dir, screenshot_name),
                        full_page=width == 1280,
                        animations='disabled',
                    )

    page.unroute('**/api?*', inject_visual_dashboard_summary)

    # Verify user-preference states against the running app stylesheet, not only source regexes.
    page.evaluate("document.documentElement.setAttribute('data-theme', 'light')")
    go_view(page, 'dash')
    page.emulate_media(reduced_motion='reduce')
    reduced_motion_metrics = page.evaluate("""() => {
        const target = document.querySelector('#view .page-header-actions .btn');
        const durations = (target ? getComputedStyle(target).transitionDuration : '1s')
            .split(',').map((duration) => Number.parseFloat(duration) * (duration.includes('ms') ? 1 : 1000));
        return {matches: matchMedia('(prefers-reduced-motion: reduce)').matches, maxTransitionMs: Math.max(...durations)};
    }""")
    check(
        reduced_motion_metrics['matches'] and reduced_motion_metrics['maxTransitionMs'] <= 1,
        'reduced-motion preference disables perceptible transition motion on live workflow controls',
    )
    page.emulate_media(reduced_motion='no-preference', contrast='more')
    contrast_metrics = page.evaluate("""() => ({
        matches: matchMedia('(prefers-contrast: more)').matches,
        cardBorderWidth: Number.parseFloat(getComputedStyle(document.querySelector('#view .card')).borderTopWidth),
        focusOutlineWidth: Number.parseFloat(getComputedStyle(document.querySelector('#view .page-header-actions .btn')).outlineWidth)
    })""")
    check(
        contrast_metrics['matches'] and contrast_metrics['cardBorderWidth'] >= 2,
        'higher-contrast preference strengthens production card boundaries',
    )
    page.emulate_media(contrast='no-preference', forced_colors='active')
    forced_color_metrics = page.evaluate("""() => ({
        matches: matchMedia('(forced-colors: active)').matches,
        focusOutlineWidth: Number.parseFloat(getComputedStyle(document.querySelector('#view .page-header-actions .btn')).outlineWidth),
        cardBorderWidth: Number.parseFloat(getComputedStyle(document.querySelector('#view .card')).borderTopWidth),
        pageOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > document.documentElement.clientWidth
    })""")
    check(
        forced_color_metrics['matches']
        and forced_color_metrics['cardBorderWidth'] >= 1
        and not forced_color_metrics['pageOverflow'],
        'forced-colors preference retains visible component boundaries without page overflow',
    )
    page.emulate_media(forced_colors='none')
    page.set_viewport_size({'width': 390, 'height': 800})
    page.evaluate("document.documentElement.setAttribute('data-theme', 'light')")

    page.click('#userBtn')
    check(
        page.locator('#userBtn').get_attribute('aria-expanded') == 'true'
        and page.locator('#userPop').is_visible(),
        'account menu opens with an accurate expanded state',
    )
    page.keyboard.press('Escape')
    check(
        page.locator('#userBtn').get_attribute('aria-expanded') == 'false'
        and page.locator('#userPop').is_hidden()
        and page.evaluate("document.activeElement?.id === 'userBtn'"),
        'Escape dismisses the account menu and restores trigger focus',
    )

    go_view(page, 'dash')
    go_view(page, 'new')
    check(
        page.locator('#view .page-eyebrow').text_content().strip() == 'Work'
        and page.locator('#view .page-header h1').inner_text() == 'New Cash Payment'
        and page.locator('#nf.entry-form').count() == 1
        and page.locator('.entry-type-switch[role="group"]').count() == 1
        and page.locator('.entry-date-field').count() == 1,
        'New Entry adopts the shared header, labelled type switch and dedicated form layout',
    )
    page.wait_for_selector('#rows .erow .payment-method-control', state='visible')
    entry_style_metrics = page.evaluate("""() => {
      const form = document.querySelector('#nf.entry-form');
      const save = document.querySelector('#nsave');
      const firstRow = document.querySelector('#rows .erow');
      const methodControl = firstRow?.querySelector('.payment-method-control');
      return {
        formPadding: form ? Number.parseFloat(getComputedStyle(form).paddingTop) : 0,
        saveMinHeight: save ? Number.parseFloat(getComputedStyle(save).minHeight) : 0,
        firstRowPresent: Boolean(firstRow),
        methodControlPresent: Boolean(methodControl),
        methodControlHeight: methodControl ? methodControl.getBoundingClientRect().height : 0,
      };
    }""")
    check(
        entry_style_metrics['firstRowPresent']
        and entry_style_metrics['methodControlPresent']
        and entry_style_metrics['formPadding'] >= 16
        and entry_style_metrics['saveMinHeight'] >= 44
        and entry_style_metrics['methodControlHeight'] >= 40,
        'New Entry renders a compact first row, a usable payment-method control and a comfortable save target',
    )
    phone_entry_metrics = page.evaluate("""() => {
      const row = document.querySelector('#rows .erow');
      const box = (selector) => {
        const element = row?.querySelector(selector);
        const rect = element?.getBoundingClientRect();
        return rect ? {left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height} : null;
      };
      return {
        payee: box('.rv'),
        amount: box('.ra'),
        note: box('.rn'),
        remove: box('.x'),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    }""")
    check(
        phone_entry_metrics['payee']
        and phone_entry_metrics['payee']['width'] > 180
        and phone_entry_metrics['amount']
        and phone_entry_metrics['amount']['width'] >= 80
        and phone_entry_metrics['note']
        and phone_entry_metrics['note']['width'] > 160
        and phone_entry_metrics['remove']
        and phone_entry_metrics['remove']['width'] >= 44
        and phone_entry_metrics['note']['top'] > phone_entry_metrics['remove']['bottom']
        and not phone_entry_metrics['horizontalOverflow'],
        'phone payment row keeps the optional note full-width and the remove action compact and tappable',
    )
    page.set_viewport_size({'width': 1280, 'height': 800})
    desktop_entry_metrics = page.evaluate("""() => {
      const row = document.querySelector('#rows .erow');
      const top = row?.querySelector('.top');
      const note = row?.querySelector('.rn');
      const remove = row?.querySelector('.x');
      return {
        columns: top ? getComputedStyle(top).gridTemplateColumns.trim().split(/\\s+/).length : 0,
        noteWidth: note?.getBoundingClientRect().width || 0,
        removeWidth: remove?.getBoundingClientRect().width || 0,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    }""")
    check(
        desktop_entry_metrics['columns'] >= 4
        and desktop_entry_metrics['noteWidth'] >= 140
        and desktop_entry_metrics['removeWidth'] >= 44
        and not desktop_entry_metrics['horizontalOverflow'],
        'desktop payment row allocates four distinct tracks without stretched remove controls or overflow',
    )
    page.set_viewport_size({'width': 390, 'height': 800})
    page.locator('#rows .erow .rv').first.fill('<img src=x onerror="window.__batchXssFired=true">')
    check(
        page.locator('#rows .erow img').count() == 0
        and not page.evaluate('window.__batchXssFired === true'),
        'untrusted payee input is inert text and cannot inject markup into the entry row',
    )
    page.locator('#rows .erow .rv').first.fill('Keyboard Batch Test Vendor')
    page.locator('#rows .erow .ra').first.fill('42')
    page.wait_for_function("document.querySelector('#batchTotal')?.dataset.value === '42.00'")
    check(
        page.locator('#batchCount').inner_text() == '1 ready entry'
        and page.locator('#batchTotal').get_attribute('data-value') == '42.00'
        and page.locator('#batchCash').get_attribute('data-value') == '42.00'
        and page.locator('#batchUpi').get_attribute('data-value') == '0.00'
        and page.locator('#batchBank').get_attribute('data-value') == '0.00',
        'live batch summary reports the ready entry and cash-method amount',
    )
    page.locator('#rows .erow .ra').first.press('Enter')
    page.wait_for_function(
        "document.querySelectorAll('#rows .erow').length === 2 && "
        "document.activeElement?.classList.contains('rv') && "
        "document.activeElement.closest('.erow') === document.querySelectorAll('#rows .erow')[1]"
    )
    check(
        page.locator('#batchTotal').get_attribute('data-value') == '42.00'
        and page.locator('#batchCount').inner_text() == '1 ready entry',
        'Enter appends and focuses a new row without counting an incomplete row',
    )
    page.locator('#rows .erow').nth(1).locator('.x').click()
    check(
        page.locator('#rows .erow').count() == 1
        and page.locator('#batchTotal').get_attribute('data-value') == '42.00',
        'removing an incomplete row preserves the live batch total',
    )
    go_view(page, 'dash')
    check(
        page.locator('#view .needs h2').inner_text().startswith('Needs attention')
        and (
            page.locator('#view .dashboard-empty-state').count() == 1
            or page.locator('#view .stat .stat-ic svg').count() >= 5
        )
        and page.locator('[data-v=dash] .ic svg use').get_attribute('href') == '#i-home',
        'Dashboard shows scoped attention, a truthful empty or KPI state, and SVG navigation icons',
    )
    check(
        page.locator('#view .needs .needs-clear').count() == 1
        and 'does not verify backups' in page.locator('#view .needs .needs-clear').inner_text(),
        'dashboard empty-attention state does not imply complete operational health',
    )
    daily_close_card = page.locator('#view .daily-close-readiness')
    check(
        daily_close_card.count() == 1
        and daily_close_card.get_attribute('data-status') in [
            'CLOSED',
            'READY_TO_CLOSE',
            'BLOCKED',
            'BLOCKED_BY_LATER_CLOSE',
            'OPENING_CASH_REQUIRED',
            'REVIEW_REQUIRED',
        ]
        and 'Business date:' in daily_close_card.inner_text()
        and 'Cash in:' in daily_close_card.inner_text()
        and 'Cash out:' in daily_close_card.inner_text()
        and daily_close_card.locator('[data-act=goto][data-k=cashClose]').is_visible(),
        'authorized dashboard shows live close status, cash movement summary and direct close navigation',
    )
    check(
        page.locator('#view .page-header-actions [data-act=ntype]').is_visible(),
        'Dashboard exposes the create-permitted primary action in its page header',
    )
    check(
        page.locator('[data-v=dash]').get_attribute('aria-current') == 'page',
        'current navigation view is announced to assistive technology',
    )
    check(
        page.locator('[data-v=dash] .ic').get_attribute('aria-hidden') == 'true',
        'decorative navigation icon is hidden from assistive technology',
    )
    check(
        page.locator('#nav button:visible').count() == 4
        and all(
            page.locator(f'#nav [data-v={view}]').is_visible()
            for view in ['dash', 'new', 'reg', 'reports']
        ),
        'mobile bottom bar shows four high-value shortcuts without horizontal scrolling',
    )
    check(
        page.locator('#mobileMoreBtn').is_visible()
        and page.locator('#mobileMoreBtn').get_attribute('aria-expanded') == 'false',
        'mobile More control is available and initially collapsed',
    )
    page.click('#mobileMoreBtn')
    page.wait_for_selector('#navMore:not(.hidden)')
    check(
        page.locator('#navMore').get_attribute('aria-hidden') == 'false'
        and page.locator('#navMore [role=dialog]').get_attribute('aria-modal') == 'true'
        and page.locator('#navMoreItems [data-v=cashClose]').count() == 1,
        'More sheet exposes role-authorized overflow routes in an accessible dialog',
    )
    page.keyboard.press('Escape')
    check(
        page.locator('#navMore').is_hidden()
        and page.evaluate("document.activeElement?.id === 'mobileMoreBtn'"),
        'Escape closes More and returns keyboard focus to its trigger',
    )

    # Daily Cash Close journey: manual opening, immutable report, correction note and carry-forward.
    go_view(page, 'cashClose')
    page.wait_for_selector('#cc-date')
    page.set_viewport_size({'width': 1280, 'height': 800})
    close_desktop_columns = page.locator('.cc-controls > .filters').evaluate(
        "el => getComputedStyle(el).gridTemplateColumns.match(/\\d+(?:\\.\\d+)?px/g)?.length || 0"
    )
    check(
        close_desktop_columns == 3,
        'cash-close setup uses a three-column desktop workspace',
    )
    page.set_viewport_size({'width': 390, 'height': 800})
    close_mobile = page.evaluate("""() => ({
        columns: getComputedStyle(document.querySelector('.cc-controls > .filters')).gridTemplateColumns
            .match(/\\d+(?:\\.\\d+)?px/g)?.length || 0,
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    })""")
    check(
        close_mobile['columns'] == 1 and not close_mobile['pageOverflow'],
        'cash-close controls reflow to one column without page-level mobile overflow',
    )
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
    # Cash-close snapshots and correction notes are API output, so the renderer must keep hostile text inert.
    cash_close_vendor_payload = '<svg onload=window.__xssFired=true></svg>'
    cash_close_note_payload = '<img src=x onerror=window.__xssFired=true>'
    page.evaluate('window.__xssFired = false')

    def inject_cash_close_markup(route):
        try:
            request_data = json.loads(route.request.post_data or '{}')
        except json.JSONDecodeError:
            request_data = {}
        if (
            request_data.get('action') != 'cashClosePreview'
            or request_data.get('date') != '2020-01-01'
        ):
            route.continue_()
            return

        response = route.fetch()
        payload = response.json()
        close = payload.get('data', {}).get('close') if payload.get('ok') else None
        if not isinstance(close, dict):
            route.fulfill(response=response)
            return

        item = {
            'id': 'cash-close-xss-voucher',
            'no': 'P-XSS',
            'date': '2020-01-01',
            'vendor': cash_close_vendor_payload,
            'amount': 1,
            'cashImpact': 'CASH_OUT',
        }
        close['includedVouchers'] = [item]
        close['includedVoucherIds'] = [item['id']]
        close['includedVoucherCount'] = 1
        if not isinstance(close.get('corrections'), list) or not close['corrections']:
            close['corrections'] = [
                {
                    'id': 'cash-close-xss-correction',
                    'closeId': close.get('id', ''),
                    'date': '2020-01-01',
                    'voucherId': item['id'],
                    'type': 'CASH_COUNT',
                    'details': cash_close_note_payload,
                    'reason': 'E2E rendering regression',
                    'createdBy': 'owner@test.com',
                    'createdAt': '2026-10-14T00:00:00.000Z',
                }
            ]
        else:
            close['corrections'][0]['details'] = cash_close_note_payload
        route.fulfill(response=response, body=json.dumps(payload))

    page.route('**/api?*', inject_cash_close_markup)
    page.click('[data-act=closePreview]')
    page.wait_for_function(
        "document.querySelector('#cc-closed-report')?.innerText.includes('cash-close-xss-voucher')"
    )
    check(
        cash_close_vendor_payload in page.locator('#cc-closed-report').inner_text()
        and cash_close_note_payload in page.locator('.cc-corrections').inner_text()
        and page.locator('#cc-results img, #cc-results svg').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'cash-close snapshot and correction text render literally without creating executable markup',
    )
    page.unroute('**/api?*', inject_cash_close_markup)

    # A server-provided error message is untrusted text, not an HTML template.
    cash_close_error_payload = '<svg onload=window.__xssFired=true></svg>'

    def inject_cash_close_error(route):
        try:
            request_data = json.loads(route.request.post_data or '{}')
        except json.JSONDecodeError:
            request_data = {}
        if (
            request_data.get('action') == 'cashClosePreview'
            and request_data.get('date') == '2020-01-01'
        ):
            route.fulfill(
                status=200,
                content_type='application/json',
                body=json.dumps(
                    {'ok': False, 'error': cash_close_error_payload, 'code': 'TEST_ERROR'}
                ),
            )
            return
        route.continue_()

    page.route('**/api?*', inject_cash_close_error)
    page.evaluate('window.__xssFired = false')
    page.click('[data-act=closePreview]')
    page.wait_for_selector('#cc-results .cc-error[role=alert]')
    check(
        cash_close_error_payload in page.locator('#cc-results').inner_text()
        and page.locator('#cc-results img, #cc-results svg').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'server-provided cash-close error text stays inert and cannot inject markup',
    )
    page.unroute('**/api?*', inject_cash_close_error)
    page.click('[data-act=closePreview]')
    page.wait_for_selector('#cc-closed-report')

    # Malformed cash-close preview shapes must fail closed and clear stale writable state.
    preview_shape_case = {'mode': 'null-unclassified-row'}

    def tamper_cash_close_preview_shape(route):
        request_data = json.loads(route.request.post_data or '{}')
        if request_data.get('action') != 'cashClosePreview' or request_data.get('date') != '2020-01-03':
            route.continue_()
            return
        response = route.fetch()
        payload = response.json()
        data = payload.get('data', {})
        if preview_shape_case['mode'] == 'missing-unclassified-list':
            data.pop('unclassified', None)
        elif preview_shape_case['mode'] == 'null-unclassified-row':
            data['unclassified'] = [None]
        elif preview_shape_case['mode'] == 'coercion-hostile-count':
            data['activeVoucherCount'] = {'toString': None, 'valueOf': None}
        elif preview_shape_case['mode'] == 'null-history-row':
            data['recentCloses'] = [None]
        payload['data'] = data
        route.fulfill(response=response, body=json.dumps(payload))

    page.route('**/api?*', tamper_cash_close_preview_shape)
    for mode, label in (
        ('missing-unclassified-list', 'missing unclassified list'),
        ('null-unclassified-row', 'null unclassified row'),
        ('coercion-hostile-count', 'coercion-hostile voucher count'),
        ('null-history-row', 'null recent-close row'),
    ):
        preview_shape_case['mode'] = mode
        page.fill('#cc-date', '2020-01-03')
        with page.expect_response(
            lambda response: '/api?' in response.url
            and json.loads(response.request.post_data or '{}').get('action') == 'cashClosePreview'
        ):
            page.click('[data-act=closePreview]')
        page.wait_for_selector('#cc-results .cc-error[role=alert]')
        check(
            'invalid cash-close preview' in page.locator('#cc-results').inner_text().lower()
            and page.locator('#cc-create').count() == 0
            and page.locator('#cc-closed-report').count() == 0,
            label + ' fails closed without a stale or writable preview',
        )
    page.unroute('**/api?*', tamper_cash_close_preview_shape)
    with page.expect_response(
        lambda response: '/api?' in response.url
        and json.loads(response.request.post_data or '{}').get('action') == 'cashClosePreview'
    ):
        page.click('[data-act=closePreview]')
    page.wait_for_selector('#cc-counted')
    check(
        page.locator('#cc-create').count() == 1
        and 'invalid cash-close preview' not in page.locator('#cc-results').inner_text().lower(),
        'cash-close preview recovers after malformed response is removed',
    )
    page.fill('#cc-date', '2020-01-02')
    page.unroute('**/api?*', inject_cash_close_markup)
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

    go_view(page, 'users')
    page.wait_for_selector('#uf')
    check(
        page.locator('#un').get_attribute('aria-label') == 'User name'
        and page.locator('#uf #ue').get_attribute('aria-label') == 'Email address'
        and page.locator('#ur').get_attribute('aria-label') == 'New user role',
        'add-user form fields have explicit accessible names',
    )
    check(
        page.locator('#up').get_attribute('type') == 'password'
        and page.locator('#up').get_attribute('minlength') == '8'
        and page.locator('#up').get_attribute('maxlength') == '128',
        'temporary user password is masked and constrained to 8–128 characters',
    )
    check(
        page.locator('#uf').evaluate("(form) => form.parentElement.classList.contains('form-panel')")
        and page.locator('#view .table-wrap[role=region]').count() == 1
        and page.locator('#view table caption').inner_text() == 'Saved users',
        'user administration uses the shared form panel and accessible table shell',
    )
    check(
        page.locator('#nav [data-v=users]').get_attribute('aria-current') == 'page'
        and page.locator('#navMoreItems [data-v=users]').get_attribute('aria-current') == 'page'
        and page.locator('[data-v=dash]').get_attribute('aria-current') is None,
        'active route state stays synchronized across primary and More navigation',
    )
    for name, email, role, password in [
        ('Mona', 'm@test.com', 'manager', 'Manager#Start2026'),
        ('Sam', 's@test.com', 'staff', 'Staff#Start2026'),
        ('Nina Accountant', 'accountant@test.com', 'accountant', 'Account#Start2026'),
        ('Approval Manager', 'approval-manager@test.com', 'manager', 'Lock#Start2026'),
    ]:
        page.fill('#un', name)
        page.fill('#ue', email)
        page.select_option('#ur', role)
        page.fill('#up', password)
        page.click('#uf .primary')
        page.wait_for_timeout(300)
    check(page.locator('tbody tr').count() == 5, 'owner can list staff, managers and accountant users')

    # Owner cannot self-approve a new high-value payment; a manager can review it.
    go_view(page, 'new')
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
    go_view(page, 'reg')
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
    go_view(page, 'dash')
    page.wait_for_selector('[data-v=dash][aria-current=page]')
    page.wait_for_function(
        "document.querySelector('#view')?.innerText.includes('active payment(s) are pending approval')"
    )
    check(
        'active payment(s) are pending approval' in page.locator('#view').inner_text()
        and 'excluded from approved totals' in page.locator('#view').inner_text(),
        'Dashboard discloses pending approval exceptions and their total treatment',
    )

    hostile_dashboard_label = '<svg onload=window.__xssFired=true></svg>'

    dashboard_summary_interceptions = []

    def inject_hostile_dashboard_summary(route):
        request_data = json.loads(route.request.post_data or '{}')
        if request_data.get('action') != 'dashboardSummary':
            route.continue_()
            return
        dashboard_summary_interceptions.append(True)
        from_date = request_data.get('from', '2026-10-16')
        to_date = request_data.get('to', '2026-10-22')
        payload = {
            'ok': True,
            'data': {
                'from': from_date,
                'to': to_date,
                'periodDays': 7,
                'trendMonthly': False,
                'trend': [{'date': to_date, 'amount': 1}],
                'paid': 1,
                'previousPaid': 0,
                'paymentCount': 1,
                'validPaymentCount': 1,
                'largest': {'amount': 1, 'vendor': hostile_dashboard_label},
                'todayPaid': 0,
                'todayPaymentCount': 0,
                'received': 0,
                'receiptCount': 0,
                'bookBalance': 0,
                'topVendors': [{'k': hostile_dashboard_label, 'n': 1, 's': 1}],
                'byCategory': [{'k': hostile_dashboard_label, 'n': 1, 's': 1}],
                'byTeamMember': [],
                'approvalExceptionCount': 0,
                'invalidAmountCount': 0,
                'malformedRecordCount': 0,
                'malformedFieldCount': 0,
            },
        }
        route.fulfill(status=200, content_type='application/json', body=json.dumps(payload))

    page.route('**/api?*', inject_hostile_dashboard_summary)
    page.click('[data-act=range][data-k="7d"]')
    page.wait_for_function(
        "document.querySelector('#view')?.innerText.includes('Spending trend') || "
        "document.querySelector('#view')?.innerText.includes('Dashboard totals unavailable')"
    )
    dashboard_text = page.locator('#view').text_content() or ''
    check(
        len(dashboard_summary_interceptions) > 0
        and hostile_dashboard_label in dashboard_text
        and page.locator('#view [onload], #view [onerror]').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'hostile dashboard summary labels remain text and cannot create active HTML handlers '
        + '(intercepts=' + str(len(dashboard_summary_interceptions))
        + ', summaryRendered=' + str('Spending trend' in dashboard_text) + ')',
    )
    page.unroute('**/api?*', inject_hostile_dashboard_summary)
    with page.expect_response(
        lambda response: '/api?' in response.url
        and json.loads(response.request.post_data or '{}').get('action') == 'dashboardSummary'
    ) as dashboard_recovery_response:
        page.click('[data-act=range][data-k="30d"]')
    recovered_summary = dashboard_recovery_response.value.json()
    check(
        dashboard_recovery_response.value.ok and recovered_summary.get('ok') is True,
        'dashboard recovers with a successful live read after hostile test data is removed',
    )
    try:
        page.wait_for_function(
            "document.querySelector('#view')?.innerText.includes('Total paid') || "
            "document.querySelector('#view')?.innerText.includes('No approved payments or recorded receipts are included')",
            timeout=10000,
        )
    except Exception:
        diagnostics = {
            'activeNav': page.evaluate(
                "document.querySelector('#nav button[aria-current=page]')?.dataset.v || ''"
            ),
            'viewText': (page.locator('#view').inner_text() or '')[:1600],
            'viewStatus': page.locator('#view [role=alert], #view [role=status]').all_text_contents(),
            'dashboardButtons': page.locator('#view [data-act=range]').evaluate_all(
                "(items) => items.map((item) => ({key: item.dataset.k, disabled: item.disabled, active: item.classList.contains('on')}))"
            ),
            'request': json.loads(dashboard_recovery_response.value.request.post_data or '{}'),
            'response': recovered_summary,
            'browserErrors': logs[-15:],
        }
        print('DASHBOARD_RECOVERY_DIAGNOSTICS=' + json.dumps(diagnostics, ensure_ascii=False))
        raise

    hostile_operations_label = '<svg onload=window.__xssFired=true></svg>'
    daily_operations_interceptions = []

    def inject_hostile_daily_operations(route):
        request_data = json.loads(route.request.post_data or '{}')
        if request_data.get('action') != 'dailyOperationsSummary':
            route.continue_()
            return
        daily_operations_interceptions.append(True)
        payload = {
            'ok': True,
            'data': {
                'date': hostile_operations_label,
                'status': hostile_operations_label,
                'laterCloseDate': hostile_operations_label,
                'blockedByLaterClose': True,
                'pendingApprovalCount': hostile_operations_label,
                'unclassifiedCount': hostile_operations_label,
                'invalidVoucherCount': hostile_operations_label,
                'openingCashRequired': True,
                'readyToClose': True,
                'cashInTotal': hostile_operations_label,
                'cashOutTotal': hostile_operations_label,
                'noCashCount': hostile_operations_label,
                'countedCash': hostile_operations_label,
                'variance': hostile_operations_label,
            },
        }
        route.fulfill(status=200, content_type='application/json', body=json.dumps(payload))

    page.route('**/api?*', inject_hostile_daily_operations)
    page.click('[data-act=range][data-k="7d"]')
    page.wait_for_function(
        "document.querySelector('#view .daily-close-readiness')?.getAttribute('data-status') === 'REVIEW_REQUIRED'"
    )
    hostile_operations_card = page.locator('#view .daily-close-readiness')
    hostile_operations_text = hostile_operations_card.inner_text()
    check(
        len(daily_operations_interceptions) == 1
        and hostile_operations_card.get_attribute('data-status') == 'REVIEW_REQUIRED'
        and 'unknown date' in hostile_operations_text
        and 'Not available' in hostile_operations_text
        and hostile_operations_label not in hostile_operations_text
        and hostile_operations_card.locator('[onload], [onerror]').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'hostile daily-close summary values fail closed and remain inert text',
    )
    page.unroute('**/api?*', inject_hostile_daily_operations)
    with page.expect_response(
        lambda response: '/api?' in response.url
        and json.loads(response.request.post_data or '{}').get('action') == 'dailyOperationsSummary'
    ) as daily_operations_recovery_response:
        page.click('[data-act=range][data-k="30d"]')
    recovered_daily_operations = daily_operations_recovery_response.value.json()
    check(
        daily_operations_recovery_response.value.ok
        and recovered_daily_operations.get('ok') is True
        and isinstance(recovered_daily_operations.get('data'), dict)
        and recovered_daily_operations['data'].get('status') in [
            'CLOSED',
            'READY_TO_CLOSE',
            'BLOCKED',
            'BLOCKED_BY_LATER_CLOSE',
            'OPENING_CASH_REQUIRED',
            'REVIEW_REQUIRED',
        ],
        'daily-close card recovers to a recognized server status after hostile data is removed',
    )

    # A stale Apps Script deployment must yield a safe, actionable error, never guessed totals.
    unsupported_dashboard_interceptions = []

    def inject_unsupported_dashboard_action(route):
        request_data = json.loads(route.request.post_data or '{}')
        if request_data.get('action') != 'dashboardSummary':
            route.continue_()
            return
        unsupported_dashboard_interceptions.append(True)
        route.fulfill(
            status=200,
            content_type='application/json',
            body=json.dumps({'ok': False, 'error': 'Unknown action.', 'code': 'NOT_FOUND'}),
        )

    page.route('**/api?*', inject_unsupported_dashboard_action)
    page.click('[data-act=range][data-k="7d"]')
    page.wait_for_function(
        "document.querySelector('#view')?.innerText.includes("
        "'The connected Apps Script deployment does not recognize dashboardSummary')"
    )
    unsupported_dashboard_text = page.locator('#view').inner_text()
    check(
        len(unsupported_dashboard_interceptions) == 1
        and 'Verify the staging deployment identity' in unsupported_dashboard_text
        and 'Financial totals remain hidden.' in unsupported_dashboard_text
        and page.locator('#view .stat').count() == 0,
        'unsupported dashboardSummary action explains the staging mismatch and hides all totals',
    )
    page.unroute('**/api?*', inject_unsupported_dashboard_action)
    with page.expect_response(
        lambda response: '/api?' in response.url
        and json.loads(response.request.post_data or '{}').get('action') == 'dashboardSummary'
    ) as dashboard_after_unsupported_response:
        page.click('[data-act=range][data-k="30d"]')
    check(
        dashboard_after_unsupported_response.value.ok
        and dashboard_after_unsupported_response.value.json().get('ok') is True,
        'dashboard recovers after the unsupported-action error is removed',
    )
    page.wait_for_function(
        "document.querySelector('#view')?.innerText.includes('Total paid') || "
            "document.querySelector('#view')?.innerText.includes('No approved payments or recorded receipts are included')",
        timeout=10000,
    )

    go_view(page, 'reg')
    page.wait_for_selector('#rq')
    page.fill('#rq', 'Approval E2E vendor')

    manager_context = browser.new_context(
        viewport={'width': 390, 'height': 800},
        accept_downloads=True,
    )
    manager_page = manager_context.new_page()
    manager_page.goto(URL)
    manager_page.fill('#lEmail', 'approval-manager@test.com')
    manager_page.fill('#lPassword', 'Lock#Start2026')
    manager_page.click('#lBtn')
    manager_page.wait_for_selector('#currentPassword')
    manager_page.fill('#currentPassword', 'Lock#Start2026')
    manager_page.fill('#newPassword', 'Lock#Final2026')
    manager_page.click('.mcard .primary')
    manager_page.wait_for_selector('#nav button')
    go_view(manager_page, 'reg')
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
    # Bring the tab to the foreground before measuring the row action. Returning to a
    # visible page can trigger navigation.refresh(), which replaces the register row.
    manager_page.bring_to_front()
    manager_page.wait_for_function("document.visibilityState === 'visible'")
    manager_page.wait_for_timeout(1200)
    manager_page.wait_for_function(
        """() => {
            const button = document.querySelector('#rbody [data-act=approve]');
            const refresh = document.querySelector('#view [data-act=refresh]');
            return Boolean(
                button &&
                button.isConnected &&
                button.closest('tr')?.innerText.includes('PENDING APPROVAL') &&
                !refresh?.hasAttribute('aria-busy')
            );
        }"""
    )
    manager_page.wait_for_timeout(250)
    check(
        '10,000' not in manager_page.locator('#rtot').inner_text()
        and 'excluded from approved totals' in manager_page.locator('#rtot').inner_text(),
        'Register totals exclude the pending INR 10,000 payment',
    )
    # The page can re-render the register on visibility restore while Playwright is
    # performing a physical pointer click. Invoke the native button click synchronously
    # to test the same delegated click/action path without a mid-gesture stale node.
    manager_page.locator('#rbody [data-act=approve]').evaluate("(element) => element.click()")
    try:
        manager_page.wait_for_selector('#modal:not(.hidden) .mcard .primary', timeout=10000)
    except Exception:
        pass
    approval_modal_ready = (
        manager_page.locator('#modal:not(.hidden) .mcard .primary').count() == 1
    )
    if approval_modal_ready:
        manager_page.locator('#modal .mcard .primary').click()
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
    else:
        toast_text = manager_page.locator('#toast').inner_text()
        print(
            'APPROVAL DIALOG DIAGNOSTIC:',
            json.dumps({
                'toast': toast_text,
                'modalClass': manager_page.locator('#modal').get_attribute('class'),
                'modalText': manager_page.locator('#modal').inner_text(),
                'errors': manager_errors[-10:],
                'managerEmail': manager_page.evaluate(
                    "JSON.parse(localStorage.getItem('cv.cache') || '{}').me?.email || ''"
                ),
                'appInert': manager_page.locator('#app').evaluate('(element) => element.inert'),
                'approveButton': manager_page.locator('#rbody [data-act=approve]').evaluate('(element) => element.outerHTML') if manager_page.locator('#rbody [data-act=approve]').count() else None,
                'preClick': manager_page.evaluate('window.__approvalPreClick || null'),
                'pointerLog': manager_page.evaluate('window.__approvalPointerLog || []'),
                'originalButtonConnected': manager_page.evaluate('window.__approvalButtonRef?.isConnected || false'),
                'directClick': manager_page.evaluate('window.__approvalDirectClick || false'),
                'clickLog': manager_page.evaluate('window.__approvalClickLog || []'),
                'registerNavActive': manager_page.locator('[data-v=reg]').get_attribute('aria-current'),
                'registerRows': manager_page.locator('#rbody').inner_text(),
                'viewTextStart': manager_page.locator('#view').inner_text()[:500],
            }),
        )
        check(
            False,
            'manager approval click must open a confirmation dialog; toast=' + toast_text,
        )
    manager_context.close()

    # Slice 4: generic read-only accountant report/export with stable VendorID.
    go_view(page, 'vend')
    page.wait_for_selector('#vf')
    try:
        page.locator('#vn').wait_for(state='visible', timeout=5000)
    except Exception:
        print(
            'OWNER VENDOR FORM DIAGNOSTIC:',
            json.dumps({
                'appClass': page.locator('#app').get_attribute('class'),
                'loginClass': page.locator('#login').get_attribute('class'),
                'modalClass': page.locator('#modal').get_attribute('class'),
                'viewText': page.locator('#view').inner_text()[:500],
                'vendorFormCount': page.locator('#vf').count(),
                'vendorInputCount': page.locator('#vn').count(),
                'vendorInputVisible': page.locator('#vn').is_visible() if page.locator('#vn').count() else False,
                'toast': page.locator('#toast').inner_text(),
                'toastClass': page.locator('#toast').get_attribute('class'),
            }),
        )
        check(False, 'owner Vendor form became visible after navigation')
        raise AssertionError('Owner Vendor form is not visible; see diagnostic above.')
    page.fill('#vn', 'Accountant E2E Vendor')
    page.fill('#vc', 'Export Test')
    page.fill('#vm', '')
    page.click('#vf .primary')
    page.wait_for_function(
        "document.querySelector('#view')?.innerText.includes('Accountant E2E Vendor')"
    )
    vendor_row = page.locator('#view tbody tr').filter(has_text='Accountant E2E Vendor')
    stable_vendor_id = vendor_row.locator('code').inner_text()
    check(
        len(stable_vendor_id) >= 30 and vendor_row.count() == 1,
        'Vendor management exposes a stable, non-empty VendorID',
    )

    go_view(page, 'new')
    page.wait_for_selector('#nf')
    page.locator('#rows .rv').first.fill('Accountant E2E Vendor')
    page.locator('#rows .ra').first.fill('125')
    choose_cash_impact_for_current_rows()
    page.click('#nsave')
    page.wait_for_function("document.querySelector('#nres')?.innerText.includes('Saved 1')")
    check(
        'Accountant E2E Vendor' in page.locator('#nres').inner_text(),
        'voucher can be created against an existing vendor without a destination-specific mapping',
    )

    accountant_context = browser.new_context(
        viewport={'width': 390, 'height': 800},
        accept_downloads=True,
    )
    accountant_page = accountant_context.new_page()
    accountant_page.goto(URL)
    accountant_page.fill('#lEmail', 'accountant@test.com')
    accountant_page.fill('#lPassword', 'Account#Start2026')
    accountant_page.click('#lBtn')
    accountant_page.wait_for_selector('#currentPassword')
    accountant_page.fill('#currentPassword', 'Account#Start2026')
    accountant_page.fill('#newPassword', 'Account#Final2026')
    accountant_page.locator('.mcard .primary').click()
    accountant_page.wait_for_selector('[data-v=reports][aria-current=page]')
    check(
        accountant_page.locator('[data-v=reports]').count() == 1
        and accountant_page.locator('[data-v=reg]').count() == 0
        and accountant_page.locator('[data-v=new]').count() == 0
        and accountant_page.locator('[data-v=vend]').count() == 0
        and accountant_page.locator('[data-v=cashClose]').count() == 0
        and accountant_page.locator('[data-v=users]').count() == 0,
        'accountant sees Reports only, without voucher entry, Register, Vendors, close or user administration',
    )
    check(
        accountant_page.locator('#view .page-header-actions [data-act=ntype]').count() == 0,
        'read-only accountant experience does not expose a create-primary action',
    )
    accountant_page.wait_for_selector('#movementFilters')
    accountant_page.locator('#movementFilters button[type=submit]').click()
    accountant_page.wait_for_function(
        "document.querySelector('#view')?.innerText.includes('Source vouchers')"
    )
    exported_row = accountant_page.locator('#view tbody tr').filter(
        has_text='Accountant E2E Vendor'
    )
    exported_vendor_id = exported_row.locator('td code').inner_text()
    exported_headers = accountant_page.locator('#view thead').inner_text().replace('\\n', ' ')
    check(
        exported_row.count() == 1
        and exported_vendor_id == stable_vendor_id,
        'accountant report exports the same stable VendorID shown in Vendor management; '
        + 'stable=' + stable_vendor_id
        + '; exported=' + exported_vendor_id
        + '; headers=' + exported_headers
        + '; matched_rows=' + str(exported_row.count()),
    )
    with accountant_page.expect_download() as download_info:
        accountant_page.locator('[data-act=reportCsv]').click()
    report_download = download_info.value
    exported_csv = open(report_download.path(), encoding='utf-8').read()
    check(
        'vendorId' in exported_csv
        and stable_vendor_id in exported_csv
        and 'tax' not in report_download.suggested_filename.lower(),
        'generic accountant CSV includes vendor identity without claiming tax/accounting-system compatibility',
    )

    # Phase 7: valid report rows are still untrusted HTML and CSV content.
    report_markup_payloads = {
        'vendorId': '<svg data-xss-field="vendorId" onload=window.__xssFired=true></svg>',
        'category': '<svg data-xss-field="category" onload=window.__xssFired=true></svg>',
        'notes': '<svg data-xss-field="notes" onload=window.__xssFired=true></svg>',
        'cancelReason': '<svg data-xss-field="cancelReason" onload=window.__xssFired=true></svg>',
        'approvedBy': '<svg data-xss-field="approvedBy" onload=window.__xssFired=true></svg>',
        'approvedAt': '<svg data-xss-field="approvedAt" onload=window.__xssFired=true></svg>',
        'approvalReason': '<svg data-xss-field="approvalReason" onload=window.__xssFired=true></svg>',
        'generatedAt': '<svg data-xss-field="generatedAt" onload=window.__xssFired=true></svg>',
    }
    formula_payload = '=HYPERLINK("https://example.invalid","Report link")'
    # Keep the hostile fixture inside the report's selected date range.
    date_text = accountant_page.locator('#movementTo').input_value()

    def inject_untrusted_report(route):
        try:
            request_data = json.loads(route.request.post_data or '{}')
        except json.JSONDecodeError:
            request_data = {}
        if request_data.get('action') != 'recordedMovementReport':
            route.continue_()
            return

        response = route.fetch()
        payload = response.json()
        report_data = payload.get('data', {})
        if not isinstance(report_data, dict):
            route.fulfill(response=response)
            return

        report_data['items'] = [{
            'date': date_text,
            'voucherNo': 'P-REPORT-OUTPUT-TEST',
            'type': 'PAYMENT',
            'vendor': formula_payload,
            'vendorId': report_markup_payloads['vendorId'],
            'category': report_markup_payloads['category'],
            'notes': report_markup_payloads['notes'],
            'amount': 125,
            'status': 'ACTIVE',
            'cancelReason': report_markup_payloads['cancelReason'],
            'approvalStatus': 'REJECTED',
            'approvedBy': report_markup_payloads['approvedBy'],
            'approvedAt': report_markup_payloads['approvedAt'],
            'approvalReason': report_markup_payloads['approvalReason'],
            'createdBy': 'accountant@test.com',
            'id': 'report-output-contract-test',
        }]
        report_data.update({
            'paymentTotal': 125,
            'receiptTotal': 0,
            'activePaymentTotal': 0,
            'activeReceiptTotal': 0,
            'approvalExceptionCount': 1,
            'unmatchedVendorCount': 1,
            'ambiguousVendorCount': 0,
            'count': 1,
            'activeCount': 1,
            'cancelledCount': 0,
            'generatedAt': report_markup_payloads['generatedAt'],
            'type': 'ALL',
            'status': 'ACTIVE',
        })
        route.fulfill(response=response, json=payload)

    accountant_page.route('**/api?*', inject_untrusted_report)
    accountant_page.evaluate('window.__xssFired = false')
    accountant_page.locator('#movementFilters button[type=submit]').click()
    accountant_page.wait_for_function(
        "document.querySelector('#view tbody')?.innerText.includes('P-REPORT-OUTPUT-TEST')"
    )
    report_text = accountant_page.locator('#view').inner_text()
    check(
        accountant_page.locator('#view tbody tr').count() == 1
        and all(
            value in report_text
            for field, value in report_markup_payloads.items()
            if field != 'approvedAt'
        )
        and formula_payload in report_text
        and accountant_page.locator('#view img, #view svg').count() == 0
        and not accountant_page.evaluate('window.__xssFired === true'),
        'valid hostile report row fields remain inert text across vendor, category, notes, cancellation and approval contexts',
    )
    with accountant_page.expect_download() as hostile_report_download:
        accountant_page.locator('[data-act=reportCsv]').click()
    hostile_csv_path = hostile_report_download.value.path()
    hostile_report_csv = open(hostile_csv_path, encoding='utf-8').read()
    csv_formula_cell = "'" + formula_payload.replace('"', '""')
    check(
        csv_formula_cell in hostile_report_csv
        and not hostile_report_csv.lstrip().startswith('='),
        'report CSV prefixes a formula-leading vendor after CSV quote escaping',
    )
    check(
        all(
            value.replace('"', '""') in hostile_report_csv
            for field, value in report_markup_payloads.items()
            if field != 'generatedAt'
        ),
        'report CSV preserves hostile row fields as data after CSV quote escaping',
    )
    accountant_page.unroute('**/api?*', inject_untrusted_report)
    accountant_page.locator('#movementFilters button[type=submit]').click()
    accountant_page.wait_for_function(
        "document.querySelector('#view tbody')?.innerText.includes('Accountant E2E Vendor')"
    )
    check(
        'P-REPORT-OUTPUT-TEST' not in accountant_page.locator('#view').inner_text()
        and all(value not in accountant_page.locator('#view').inner_text() for value in report_markup_payloads.values())
        and accountant_page.locator('#view img, #view svg').count() == 0,
        'report rendering recovers to the normal server response after hostile fixture removal',
    )
    report_table_region = accountant_page.locator('#view .table-wrap[role=region][tabindex="0"]')
    check(
        report_table_region.count() == 1
        and bool(report_table_region.get_attribute('aria-label')),
        'Reports table exposes a named, keyboard-focusable region',
    )
    accountant_page.locator('[data-act=reportCsv]').focus()
    accountant_page.keyboard.press('Tab')
    check(
        accountant_page.evaluate("""() => {
            const active = document.activeElement;
            if (!active?.matches('#view .table-wrap[role="region"][tabindex="0"]:focus-visible')) return false;
            const style = getComputedStyle(active);
            return style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) >= 2;
        }"""),
        'Reports source-voucher table is keyboard reachable with a visible focus indicator',
    )
    for width in [320, 360, 390, 768, 801, 1024, 1280]:
        accountant_page.set_viewport_size({'width': width, 'height': 800})
        layout = accountant_page.evaluate("""() => {
            const root = document.documentElement;
            const filters = document.querySelector('#movementFilters');
            const region = document.querySelector('#view .table-wrap[role="region"][tabindex="0"]');
            const inside = (element) => {
                if (!element) return false;
                const rect = element.getBoundingClientRect();
                return rect.left >= -1 && rect.right <= window.innerWidth + 1;
            };
            const controls = filters ? Array.from(filters.querySelectorAll('input, select, button')) : [];
            return {
                pageOverflow: root.scrollWidth > root.clientWidth,
                filterPanelInside: inside(filters),
                controlsInside: controls.length > 0 && controls.every(inside),
                tableRegionInside: inside(region),
            };
        }""")
        check(
            not layout['pageOverflow']
            and layout['filterPanelInside']
            and layout['controlsInside']
            and layout['tableRegionInside'],
            f'Reports filters and result region remain within the viewport at {width}px',
        )
    accountant_page.set_viewport_size({'width': 390, 'height': 800})
    accountant_context.close()
    go_view(page, 'users')
    page.wait_for_selector('#uf')
    xss_payload = '<svg onload=window.__xssFired=true></svg>'
    page.fill('#un', xss_payload)
    page.fill('#ue', 'stored-xss@test.com')
    page.select_option('#ur', 'staff')
    page.fill('#up', 'Xss#TestPass2026')
    page.click('#uf .primary')
    page.wait_for_function(
        "document.querySelector('#toast')?.textContent.toLowerCase().includes('valid name')"
    )
    check(
        'stored-xss@test.com' not in page.locator('#view').inner_text()
        and xss_payload not in page.locator('#view').inner_text()
        and page.locator('#view img, #view svg').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'server rejects an HTML payload as a user name before persistence',
    )
    page.fill('#un', 'Xss Test User')
    page.click('#uf .primary')
    page.wait_for_function(
        "document.querySelector('#view').innerText.includes('stored-xss@test.com')"
    )
    check(
        'Xss Test User' in page.locator('#view').inner_text()
        and page.locator('#view img, #view svg').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'a valid replacement name can be saved after an unsafe name is rejected',
    )

    # A transient listUsers failure must replace "Loading" with a useful, retryable state.
    go_view(page, 'dash')
    user_list_failure_once = {'value': True}
    hostile_user_list_error = '<svg onload=window.__xssFired=true></svg>'

    def fail_initial_user_list(route):
        try:
            request_data = json.loads(route.request.post_data or '{}')
        except json.JSONDecodeError:
            request_data = {}
        if request_data.get('action') != 'listUsers' or not user_list_failure_once['value']:
            route.continue_()
            return

        response = route.fetch()
        payload = response.json()
        if payload.get('ok'):
            user_list_failure_once['value'] = False
            payload['ok'] = False
            payload['error'] = hostile_user_list_error
            payload['code'] = 'SERVER'
        route.fulfill(response=response, body=json.dumps(payload))

    page.route('**/api?*', fail_initial_user_list)
    go_view(page, 'users')
    page.wait_for_selector('#users-load-error', timeout=10000)
    check(
        'The user list could not be loaded' in page.locator('#users-load-error').inner_text()
        and page.locator('#users-load-error [data-act=usersRetry]').is_visible()
        and page.locator('#view .page-header-actions [data-act=refresh]').is_visible()
        and page.locator('#view').inner_text().count('Loading users…') == 0
        and 'No users yet' not in page.locator('#view').inner_text()
        and hostile_user_list_error not in page.locator('#view').inner_text()
        and page.locator('#view svg, #view img').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'Users request failure is explicit and offers an in-context retry instead of an endless loading state',
    )
    page.click('#users-load-error [data-act=usersRetry]')
    page.wait_for_selector('#uf', timeout=10000)
    check(
        page.locator('#users-load-error').count() == 0
        and page.locator('#view tbody tr').count() > 0
        and user_list_failure_once['value'] is False,
        'retrying the Users request recovers the list without reloading the app',
    )
    page.unroute('**/api?*', fail_initial_user_list)

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
    go_view(page, 'dash')
    go_view(page, 'users')
    page.wait_for_function(
        "document.querySelector('#view [role=status]')?.innerText.includes('malformed user record(s) omitted')"
    )
    check(
        '5 malformed user record(s) omitted from this response' in page.locator('#view').inner_text()
        and page.locator('#view tbody tr').count() == 6
        and page.locator('#view [data-act=utog]').count() == 6,
        'owner Users view omits malformed rows while keeping valid user records actionable',
    )
    check(
        page.locator('#view img, #view svg').count() == 0
        and '[object Object]' not in page.locator('#view').inner_text()
        and not page.evaluate('window.__xssFired === true'),
        'malformed user names, emails and roles are not coerced or rendered as active markup',
    )
    invalid_user_envelope = True
    go_view(page, 'dash')
    go_view(page, 'users')
    page.wait_for_function(
        "document.querySelector('#view [role=status]')?.innerText.includes('User data is unavailable because the server response was invalid')"
    )
    check(
        'No users yet' not in page.locator('#view').inner_text()
        and page.locator('#uf').count() == 1
        and page.locator('#view tbody tr').count() == 1
        and page.locator('#view .page-header-actions [data-act=refresh]').is_visible(),
        'non-array user response is disclosed instead of being treated as an empty list and can be refreshed',
    )
    invalid_user_envelope = False
    page.unroute('**/api?*', inject_malformed_user_rows)
    go_view(page, 'dash')
    go_view(page, 'users')
    page.wait_for_selector('#uf')
    check(
        page.locator('#view tbody tr').count() == 6
        and page.locator('#view [role=status]').count() == 0,
        'owner Users view recovers after a valid list response returns',
    )

    # A late user-list response must not replace a route selected while loading.
    go_view(page, 'dash')
    page.evaluate("""() => {
        const nativeFetch = window.fetch.bind(window);
        const gate = {used: false, pending: false, finished: false, release: null};
        window.__usersRouteGate = gate;
        window.fetch = async (input, init = {}) => {
            let action = '';
            try { action = JSON.parse(init.body || '{}').action || ''; } catch {}
            if (action !== 'listUsers' || gate.used) return nativeFetch(input, init);
            gate.used = true;
            gate.pending = true;
            await new Promise((resolve) => { gate.release = resolve; });
            gate.pending = false;
            try { return await nativeFetch(input, init); }
            finally { gate.finished = true; }
        };
    }""")
    go_view(page, 'users')
    page.wait_for_function(
        "window.__usersRouteGate?.pending === true && typeof window.__usersRouteGate.release === 'function'"
    )
    go_view(page, 'dash')
    page.evaluate("window.__usersRouteGate.release()")
    page.wait_for_function("window.__usersRouteGate?.finished === true")
    check(
        page.locator('#view .page-header h1').inner_text() == 'Dashboard'
        and page.locator('#view #uf').count() == 0,
        'a late Users response cannot replace the destination dashboard',
    )

    # A successful vendor save also spans multiple requests; refresh only if Vendors stays active.
    go_view(page, 'vend')
    page.wait_for_selector('#vf')
    page.evaluate("""() => {
        const nativeFetch = window.fetch.bind(window);
        const gate = {
            used: false,
            pending: false,
            saveFinished: false,
            bootstrapFinished: false,
            release: null
        };
        window.__vendorRouteGate = gate;
        window.fetch = async (input, init = {}) => {
            let action = '';
            try { action = JSON.parse(init.body || '{}').action || ''; } catch {}
            if (action === 'saveVendor' && !gate.used) {
                gate.used = true;
                gate.pending = true;
                await new Promise((resolve) => { gate.release = resolve; });
                gate.pending = false;
                const response = await nativeFetch(input, init);
                gate.saveFinished = true;
                return response;
            }
            if (action === 'bootstrap' && gate.saveFinished && !gate.bootstrapFinished) {
                const response = await nativeFetch(input, init);
                gate.bootstrapFinished = true;
                return response;
            }
            return nativeFetch(input, init);
        };
    }""")
    page.fill('#vn', 'Route Race Vendor')
    page.fill('#vc', 'Route Race Company')
    page.fill('#vm', '9123456780')
    page.click('#vf .primary')
    page.wait_for_function(
        "window.__vendorRouteGate?.pending === true && typeof window.__vendorRouteGate.release === 'function'"
    )
    go_view(page, 'dash')
    page.evaluate("window.__vendorRouteGate.release()")
    page.wait_for_function("window.__vendorRouteGate?.bootstrapFinished === true")
    check(
        page.locator('#view .page-header h1').inner_text() == 'Dashboard'
        and page.locator('#view #vf').count() == 0,
        'a completed vendor save cannot redraw the dashboard as Vendors',
    )
    go_view(page, 'vend')
    page.wait_for_function(
        "document.querySelector('#view')?.innerText.includes('Route Race Vendor')"
    )

    xss_vendor = '<svg onload=window.__xssFired=true></svg>'
    xss_company = '<img src=x onerror=window.__xssFired=true>'
    go_view(page, 'vend')
    page.wait_for_selector('#vf')
    page.set_viewport_size({'width': 1280, 'height': 800})
    vendor_form_layout = page.locator('#vf').evaluate(
        "el => ({display:getComputedStyle(el).display,columns:getComputedStyle(el).gridTemplateColumns.match(/\\d+(?:\\.\\d+)?px/g)?.length || 0})"
    )
    check(
        vendor_form_layout['display'] == 'grid' and vendor_form_layout['columns'] >= 4
        and page.locator('.management-results-card').count() == 1,
        'Vendor editor and saved-vendor list use the shared management composition',
    )
    page.set_viewport_size({'width': 390, 'height': 800})
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
        "document.querySelector('#toast')?.textContent.toLowerCase().includes('valid vendor name')"
    )
    check(
        xss_vendor not in page.locator('#view').inner_text()
        and xss_company not in page.locator('#view').inner_text()
        and '9876543210' not in page.locator('#view').inner_text()
        and page.locator('#view img, #view svg').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'server rejects HTML payloads in vendor fields before persistence',
    )

    page.fill('#vn', 'Xss Test Vendor')
    page.fill('#vc', xss_company)
    page.fill('#vm', '9876543210')
    page.click('#vf .primary')
    page.wait_for_function(
        "document.querySelector('#toast')?.textContent.toLowerCase().includes('valid company name')"
    )
    check(
        'Xss Test Vendor' not in page.locator('#view').inner_text()
        and '9876543210' not in page.locator('#view').inner_text()
        and page.locator('#view img, #view svg').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'server rejects an HTML payload in the optional company field before persistence',
    )

    page.fill('#vn', 'Xss Test Vendor')
    page.fill('#vc', 'Xss Test Company')
    page.fill('#vm', '9876543210')
    page.click('#vf .primary')
    page.wait_for_function(
        "document.querySelector('#view').innerText.includes('9876543210')"
    )
    check(
        'Xss Test Vendor' in page.locator('#view').inner_text()
        and 'Xss Test Company' in page.locator('#view').inner_text()
        and page.locator('#view img, #view svg').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'valid vendor name and company are displayed without executable markup',
    )

    go_view(page, 'set')
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
    check(
        page.locator('[data-act=dqexport]').count() == 1,
        'a successful data-quality scan exposes its JSON export action',
    )
    mobile_diagnostic_layout = page.evaluate(
        """() => {
          const actions = document.querySelector('#dq-results .diagnostic-actions');
          const button = actions?.querySelector('[data-act="dqexport"]');
          const note = actions?.querySelector('.muted');
          if (!actions || !button || !note) return null;
          return {
            display: getComputedStyle(actions).display,
            direction: getComputedStyle(actions).flexDirection,
            buttonWidth: button.getBoundingClientRect().width,
            actionsWidth: actions.getBoundingClientRect().width,
            noteText: note.textContent
          };
        }"""
    )
    check(
        mobile_diagnostic_layout is not None
        and mobile_diagnostic_layout['display'] == 'flex'
        and mobile_diagnostic_layout['direction'] == 'column'
        and mobile_diagnostic_layout['buttonWidth'] >= mobile_diagnostic_layout['actionsWidth'] - 4
        and 'authorized recipients' in mobile_diagnostic_layout['noteText'],
        'mobile diagnostic export controls stack into a full-width, clearly scoped action',
    )
    with page.expect_download() as dq_export_info:
        page.click('[data-act=dqexport]')
    dq_export = dq_export_info.value
    with open(dq_export.path(), encoding='utf-8') as dq_export_file:
        dq_snapshot = json.load(dq_export_file)
    dq_export_report = dq_snapshot.get('report', {})
    check(
        dq_export.suggested_filename.startswith('cash-voucher-data-quality-')
        and dq_export.suggested_filename.endswith('.json')
        and dq_snapshot.get('schemaVersion') == 1
        and dq_snapshot.get('snapshotType') == 'cash-voucher-data-quality'
        and isinstance(dq_export_report.get('scanned'), int)
        and dq_export_report.get('returnedIssueCount') == len(dq_export_report.get('issues', []))
        and dq_export_report.get('malformedIssueCount') == 0
        and any('not accounting, tax' in item for item in dq_snapshot.get('limitations', [])),
        'data-quality JSON has a stable schema, honest coverage counts and explicit limitations',
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
    go_view(page, 'dash')
    page.wait_for_function(
        "document.querySelector('[data-v=dash]').getAttribute('aria-current') === 'page'"
    )
    go_view(page, 'set')
    check(
        page.locator('.settings-layout').count() == 1
        and page.locator('.settings-property-form#sf').count() == 1
        and page.locator('.settings-diagnostics #backup-status').count() == 1
        and page.locator('.settings-diagnostics #data-quality').count() == 1,
        'Settings separates editable property configuration from operational diagnostic panels',
    )
    page.set_viewport_size({'width': 1280, 'height': 900})
    settings_columns = page.locator('.settings-layout').evaluate(
        "el => getComputedStyle(el).gridTemplateColumns.match(/\\d+(?:\\.\\d+)?px/g)?.length || 0"
    )
    check(
        settings_columns >= 2,
        'Settings uses a two-column desktop layout for property edits and owner diagnostics',
    )
    page.set_viewport_size({'width': 390, 'height': 800})
    check(
        page.locator('.settings-layout').evaluate("el => getComputedStyle(el).display") == 'grid',
        'Settings retains its shared responsive layout on mobile',
    )
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
    check(page.locator('#navMoreItems [data-v=audit]').count() == 1, 'owner has a dedicated audit navigation item in More')
    def inject_hostile_audit_detail(route):
        try:
            request_data = json.loads(route.request.post_data or '{}')
        except json.JSONDecodeError:
            request_data = {}
        if request_data.get('action') != 'auditLog':
            route.continue_()
            return

        response = route.fetch()
        payload = response.json()
        data = payload.get('data', {}) if payload.get('ok') else {}
        rows = data.get('rows')
        if isinstance(rows, list):
            if rows:
                row = rows[0]
                row['action'] = 'VENDOR_CREATE'
                row['target'] = xss_vendor
                row['details'] = xss_vendor
            else:
                rows.append({
                    'time': '2026-10-22T00:00:00',
                    'user': 'owner@test.com',
                    'action': 'VENDOR_CREATE',
                    'target': xss_vendor,
                    'details': xss_vendor,
                })
        route.fulfill(response=response, body=json.dumps(payload))

    # Simulate hostile legacy/server-returned audit text without persisting an unsafe name.
    page.route('**/api?*', inject_hostile_audit_detail)
    go_view(page, 'audit')
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
    healthy_audit_text = page.locator('#aud-health').inner_text()
    check(
        'No audit-write failure marker is currently visible' in healthy_audit_text
        and 'an outage affecting every marker store may still be undetectable'
        in healthy_audit_text
        and 'Historical audit completeness is not verified.' in healthy_audit_text
        and page.locator('#aud-health [role=alert]').count() == 0,
        'no-known-failure state explains the dual-store blind spot without claiming complete audit history',
    )
    with page.expect_download() as audit_health_snapshot_download_info:
        page.click('[data-act=audhealth]')
    audit_health_snapshot_download = audit_health_snapshot_download_info.value
    with open(audit_health_snapshot_download.path(), encoding='utf-8') as audit_health_snapshot_file:
        healthy_audit_snapshot = json.load(audit_health_snapshot_file)
    check(
        audit_health_snapshot_download.suggested_filename.startswith('cash-voucher-audit-health-')
        and audit_health_snapshot_download.suggested_filename.endswith('.json')
        and healthy_audit_snapshot.get('schemaVersion') == 1
        and healthy_audit_snapshot.get('snapshotType') == 'cash-voucher-audit-health'
        and healthy_audit_snapshot.get('monitoring', {}).get('status') == 'NO_KNOWN_FAILURE'
        and healthy_audit_snapshot.get('monitoring', {}).get('failureCount') == 0
        and healthy_audit_snapshot.get('coverage', {}).get('loadedRowCount', 0) > 0
        and healthy_audit_snapshot.get('coverage', {}).get('serverReportedTotalCount', 0) > 0
        and 'rows' not in healthy_audit_snapshot
        and any(
            'does not contain or reconstruct missing audit events' in limitation
            for limitation in healthy_audit_snapshot.get('limitations', [])
        ),
        'audit health JSON export captures status and coverage metadata without exporting event contents',
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
    page.unroute('**/api?*', inject_hostile_audit_detail)
    go_view(page, 'set')
    page.wait_for_selector('#sn')
    page.fill('#sn', xss_payload)
    page.fill('#sa', xss_company)
    page.click('#sf .primary')
    page.wait_for_function(
        "document.querySelector('#toast')?.textContent.toLowerCase().includes('valid property name')"
    )
    check(
        xss_payload not in page.locator('#brand').inner_text()
        and page.locator('#brand img, #brand svg').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'server rejects an HTML payload as property name before persistence',
    )
    page.fill('#sn', 'Xss Test Property')
    page.fill('#sa', xss_company)
    page.click('#sf .primary')
    page.wait_for_function("document.querySelector('#brand').textContent === 'Xss Test Property'")
    check(
        page.locator('#brand').inner_text() == 'Xss Test Property'
        and page.locator('#brand img, #brand svg').count() == 0
        and page.locator('#sa').input_value() == xss_company
        and page.locator('#sf img, #sf svg').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'valid property name is saved while address text remains inert in settings',
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
    go_view(page, 'set')
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
    go_view(page, 'set')
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
        and page.locator('#userRole').inner_text().strip() == 'owner'
        and page.locator('#nav button').count() > 0
        and not page.evaluate('window.__xssFired === true'),
        'object-valued property and profile names stay inert and do not abort navigation bootstrap',
    )
    go_view(page, 'set')
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
    go_view(page, 'set')
    page.wait_for_selector('#sc')
    check(
        page.locator('#sc').input_value() == 'Office\nOther\nStaff Salary'
        and page.locator('#sx').input_value() == 'Other'
        and page.locator('#sf img, #sf svg').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'malformed category setting arrays normalize to string-only lists in Settings',
    )
    go_view(page, 'new')
    page.wait_for_selector('#rows .erow .rc')
    check(
        page.locator('#rows .erow .rci').input_value() == 'CASH'
        and page.locator('#rows .erow .rci option').all_text_contents() == ['Cash', 'UPI', 'Bank transfer'],
        'new payment defaults to Cash and exposes the three payment methods',
    )
    page.locator('#rows .erow .rv').fill('Cash Impact Test Vendor')
    page.locator('#rows .erow .ra').fill('10')
    page.select_option('#rows .erow .rci', 'UPI')
    page.select_option('#rows .erow .rc', 'Other')
    page.wait_for_function("document.querySelector('#batchUpi')?.dataset.value === '10.00'")
    check(
        page.locator('#rows .erow .rci').input_value() == 'UPI'
        and page.locator('#batchTotal').get_attribute('data-value') == '10.00'
        and page.locator('#batchCash').get_attribute('data-value') == '0.00'
        and page.locator('#batchUpi').get_attribute('data-value') == '10.00'
        and page.locator('#batchBank').get_attribute('data-value') == '0.00',
        'UPI batch total is kept separate from cash-method total',
    )
    check(
        page.locator('#rows .erow .rv-quick-save').count() == 1,
        'manager/owner can save a new payee without leaving entry',
    )
    page.click('#rows .erow .rv-quick-save')
    page.wait_for_function("document.querySelector('#rows .erow .rv-quick-save') === null")
    check(
        page.locator('#rows .erow .rc').input_value() == 'Other'
        and page.locator('#rows .erow .rci').input_value() == 'UPI'
        and page.locator('#batchUpi').get_attribute('data-value') == '10.00',
        'saving the payee preserves current voucher entry and selected defaults',
    )
    check(
        page.locator('#recentVendors').count() == 1,
        'entry form offers recent-payee suggestions',
    )
    page.select_option('#rows .erow .rci', 'BANK_TRANSFER')
    page.select_option('#rows .erow .rc', 'Office')
    page.wait_for_function("document.querySelector('#batchBank')?.dataset.value === '10.00'")
    check(
        page.locator('#rows .erow .rci').input_value() == 'BANK_TRANSFER'
        and page.locator('#batchTotal').get_attribute('data-value') == '10.00'
        and page.locator('#batchCash').get_attribute('data-value') == '0.00'
        and page.locator('#batchUpi').get_attribute('data-value') == '0.00'
        and page.locator('#batchBank').get_attribute('data-value') == '10.00',
        'Bank transfer batch total stays separate from cash and UPI',
    )
    check(
        page.locator('#rows .erow .rc option').all_text_contents() == ['Office', 'Other', 'Staff Salary']
        and page.locator('#rows .erow .rc option').count() == 3
        and page.locator('#rows .erow .rc option').evaluate_all(
            "options => options.every(option => typeof option.value === 'string')"
        )
        and not page.evaluate('window.__xssFired === true'),
        'payment category options include Staff Salary and only valid strings',
    )
    click_with_draft_discard(page, page.locator('[data-act=ntype][data-k=RECEIPT]'))
    check(
        page.locator('#rows .erow .payment-method-control').inner_text().splitlines()[0] == 'Received via',
        'cash receipt uses a receiving-method label',
    )
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
        and 'Owner#Final2026' not in stored_offline_credential
        and json.loads(stored_offline_credential).get('version') == 1,
        'successful online sign-in stores only a versioned password verifier, never the raw password',
    )
    page.evaluate("localStorage.removeItem('cv.token')")
    page.evaluate("navigator.serviceWorker.ready.then(() => true)")
    context.set_offline(True)
    page.reload(wait_until='domcontentloaded')
    page.wait_for_selector('#loginForm', timeout=10000)

    page.fill('#lEmail', 'owner@test.com')
    page.fill('#lPassword', 'Wrong#Password2026')
    page.click('#lBtn')
    page.wait_for_selector('#lErr:not(:empty)', timeout=8000)
    check(
        'Connect and sign in to verify this account.' in page.locator('#lErr').inner_text()
        and page.locator('#nav button').count() == 0,
        'offline unlock rejects an incorrect password without opening the application',
    )

    page.fill('#lEmail', 'owner@test.com')
    page.fill('#lPassword', 'Owner#Final2026')
    page.click('#lBtn')
    page.wait_for_selector('#nav button', timeout=10000)
    page.wait_for_function(
        "document.querySelector('#banner')?.innerText.includes('Offline workspace')",
        timeout=10000,
    )
    check(
        page.locator('#nav button').count() == 3
        and page.locator('[data-v=new]').count() == 1
        and page.locator('[data-v=reg]').count() == 1
        and page.locator('#userBtn').count() == 1
        and page.locator('[data-v=users], [data-v=set], [data-v=audit], [data-v=vend], [data-v=reports], [data-v=bulk]').count() == 0
        and page.evaluate("!localStorage.getItem('cv.token')"),
        'correct offline password opens a local workspace, hides privileged routes and issues no server token',
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
    go_view(page, 'new')
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
        page.fill('#lPassword', 'Owner#Final2026')
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
        and page.locator('#banner img, #banner svg').count() == 0
        and page.locator('#banner [data-act=import-pending]').count() == 1
        and not page.evaluate('window.__xssFired === true'),
        'tampered local queue vendor remains inert in the status banner and review list while queue actions remain available',
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
    page.fill('#lPassword', 'Owner#Final2026')
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

    page.click('#userBtn')
    page.locator('#userPop [data-go=acct]').first.click()
    page.click('#view [data-act=signout]')
    page.wait_for_selector('#loginForm')

    def login(email, password):
        page.fill('#lEmail', email)
        page.fill('#lPassword', password)
        page.click('#lBtn')

    login('stored-xss@test.com', 'Xss#TestPass2026')
    page.wait_for_selector('#currentPassword')
    page.fill('#currentPassword', 'Xss#TestPass2026')
    page.fill('#newPassword', 'Xss#FinalPass2026')
    page.click('.mcard .primary')
    page.wait_for_selector('#nav button')
    check(
        'Xss Test User' in page.locator('#userName').inner_text()
        and page.locator('#userName img, #userName svg, #popName img, #popName svg').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'stored user name is inert text in the signed-in account label',
    )
    page.click('#userBtn')
    page.locator('#userPop [data-go=acct]').first.click()
    page.click('#view [data-act=signout]')
    page.wait_for_selector('#loginForm')

    login('s@test.com', 'Staff#Start2026')
    page.wait_for_selector('#currentPassword')
    page.fill('#currentPassword', 'Staff#Start2026')
    page.fill('#newPassword', 'Staff#Final2026')
    page.click('.mcard .primary')
    page.wait_for_selector('#nav button')
    check(page.locator('#nav button').count() == 3, 'staff sees 3 nav items (dash,new,reg); Account is in the user menu')
    page.click('#mobileMoreBtn')
    page.wait_for_selector('#navMore:not(.hidden)')
    check(
        page.locator('#navMoreEmpty').is_visible()
        and page.locator('#navMoreItems button').count() == 0,
        'More sheet does not expose privileged pages to a staff account',
    )
    page.keyboard.press('Escape')

    go_view(page, 'new')
    page.wait_for_selector('#nf')
    check(
        page.locator('.rv').first.get_attribute('aria-label') == 'Paid to, row 1'
        and page.locator('.ra').first.get_attribute('aria-label') == 'Amount in rupees, row 1'
        and page.locator('.rc').first.get_attribute('aria-label') == 'Category, row 1'
        and page.locator('.rci').first.get_attribute('aria-label') == 'Payment method, row 1'
        and page.locator('.rn').first.get_attribute('aria-label') == 'Note, row 1',
        'compact payment fields have explicit accessible names',
    )
    check(
        page.locator('.rci option').all_text_contents() == ['Cash', 'UPI', 'Bank transfer']
        and page.locator('.rci').first.input_value() == 'CASH',
        'payment method defaults to Cash and exposes explicit UPI/bank transfer options',
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
    amount_error_relationship = page.locator('.ra').first.evaluate("""element => {
        const id = element.getAttribute('aria-describedby');
        return {invalid: element.getAttribute('aria-invalid'), message: document.getElementById(id)?.innerText || ''};
    }""")
    check(
        amount_error_relationship['invalid'] == 'true'
        and 'valid amount' in amount_error_relationship['message'],
        'invalid amount references its concrete, announced validation message',
    )
    page.fill('.ra', '1,250.50')
    page.wait_for_function("document.querySelector('.row-error') === null")
    check(
        page.locator('.ra').first.get_attribute('aria-invalid') is None,
        'payment validation state clears when the amount is corrected',
    )
    page.select_option('.rci', 'UPI')
    check(
        page.locator('.rci').first.input_value() == 'UPI'
        and page.locator('.rci').first.get_attribute('aria-invalid') is None,
        'selecting UPI does not require a separate cash-drawer classification',
    )
    page.select_option('.rci', 'CASH')
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
        page.locator('.rv').nth(1).get_attribute('aria-label') == 'Paid to, row 2'
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
        and page.locator('.rv').first.get_attribute('aria-label') == 'Paid to, row 1'
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
    success_vendor_payload = '<img src=x onerror=window.__xssFired=true>'
    success_payment_method_payload = '<img src=x onerror=window.__xssFired=true>'

    def tamper_created_voucher_number(route):
        request_data = json.loads(route.request.post_data or '{}')
        response = route.fetch()
        payload = response.json()
        created = payload.get('data', {}).get('created', [])
        if request_data.get('action') == 'createVouchers' and created:
            created[0]['no'] = success_number_payload
            created[0]['vendor'] = success_vendor_payload
            created[0]['paymentMethod'] = success_payment_method_payload
            # createVouchers responses are pushed into the client cache before a later bootstrap normalization.
            created[0]['date'] = {'split': None}
            route.fulfill(response=response, json=payload)
        else:
            route.fulfill(response=response)

    page.route('**/api?*', tamper_created_voucher_number)
    choose_cash_impact_for_current_rows()
    normal_voucher_date = page.locator('#nd').input_value()
    normal_voucher_date_display = '/'.join(reversed(normal_voucher_date.split('-')))
    page.click('#nsave')
    page.wait_for_selector('.ok-panel')
    check('Saved 2 payments' in page.inner_text('#nres'), 'saved 2 payments')
    check(
        page.locator('#nres img, #nres svg').count() == 0
        and success_number_payload in page.locator('#nres').inner_text()
        and success_vendor_payload in page.locator('#nres').inner_text()
        and not page.evaluate('window.__xssFired === true'),
        'server-returned voucher number and vendor remain inert text in save confirmation',
    )
    page.evaluate('window.print = () => {}')
    page_errors_before_print = sum(message.startswith('PAGEERR ') for message in logs)
    page.locator('#nres [data-act=print]').first.click()
    page.wait_for_function(
        "document.querySelector('#printArea .pv-meta')?.innerText.includes('Date unavailable')"
    )
    check(
        'Date unavailable' in page.locator('#printArea .pv-meta').inner_text()
        and success_number_payload in page.locator('#printArea').inner_text()
        and page.locator('#printArea img, #printArea svg').count() == 0
        and 'Paid via' in page.locator('#printArea').inner_text()
        and 'Not recorded' in page.locator('#printArea').inner_text()
        and all(code not in page.locator('#printArea').inner_text() for code in ('CASH_IN', 'CASH_OUT', 'NO_CASH', 'UNCLASSIFIED'))
        and not page.evaluate('window.__xssFired === true')
        and sum(message.startswith('PAGEERR ') for message in logs) == page_errors_before_print,
        'malformed API date uses a safe print fallback without crashing or activating hostile voucher text',
    )
    page.locator('#nres [data-act=print]').nth(1).click()
    page.wait_for_function(
        "document.querySelector('#printArea .pv-meta')?.innerText.includes('Date:')"
    )
    check(
        normal_voucher_date_display in page.locator('#printArea .pv-meta').inner_text()
        and 'Date unavailable' not in page.locator('#printArea .pv-meta').inner_text()
        and 'Paid via' in page.locator('#printArea').inner_text()
        and 'Cash' in page.locator('#printArea').inner_text(),
        'valid server-returned voucher date keeps the normal printed date format',
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
    go_view(page, 'dash')
    page.wait_for_function(
        "document.querySelector('[data-v=dash]')?.getAttribute('aria-current') === 'page'"
    )
    check(
        page.evaluate("url => window.__revokedObjectUrls.includes(url)", abandoned_preview_url)
        and page.locator('#nf').count() == 0,
        'navigating away from an unsaved entry revokes its receipt preview URL',
    )

    # Force image compression to finish after its row has been detached.
    go_view(page, 'new')
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
    go_view(page, 'dash')
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

    go_view(page, 'reg')
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
    page.wait_for_function(
        "document.querySelector('#rempty .empty-state-message')?.textContent.includes('No vouchers match the current filters.')"
    )
    check(
        page.locator('#rempty .empty-state-message').inner_text() == 'No vouchers match the current filters.'
        and page.locator('#rempty [data-act=rclear]').is_visible(),
        'register explains an empty filter result and offers a clear-filters action',
    )
    with page.expect_response(
        lambda response: '/api?' in response.url
        and json.loads(response.request.post_data or '{}').get('action') == 'registerPage'
        and json.loads(response.request.post_data or '{}').get('q') == ''
    ):
        page.locator('#rempty [data-act=rclear]').click()
    page.wait_for_function(
        "document.querySelector('#rq')?.value === ''"
        " && document.querySelector('#rs')?.value === 'ACTIVE'"
        " && document.querySelector('#rempty')?.classList.contains('hidden') === true"
        " && document.querySelectorAll('#rbody tr').length === 2"
    )
    clear_filter_state = {
        'query': page.locator('#rq').input_value(),
        'rowCount': page.locator('#rbody tr').count(),
        'rowText': page.locator('#rbody').inner_text(),
        'emptyClass': page.locator('#rempty').get_attribute('class'),
        'emptyVisible': page.locator('#rempty').is_visible(),
        'view': page.evaluate("document.querySelector('#nav button[aria-current=page]')?.dataset.v || ''"),
    }
    check(
        clear_filter_state['query'] == ''
        and page.locator('#rs').input_value() == 'ACTIVE',
        'empty-state clear-filters clears the search and restores the default active-only view: '
        + json.dumps(clear_filter_state),
    )
    page.fill('#rfrom', '2026-10-20')
    page.fill('#rto', '2026-10-10')
    check(
        'The start date must be on or before the end date.' in page.locator('#rempty').inner_text()
        and 'Totals unavailable' in page.locator('#rtot').inner_text()
        and page.locator('#rtot [role=alert]').inner_text()
        == 'Totals unavailable: choose a start date on or before the end date.'
        and page.locator('#rtot img, #rtot svg').count() == 0
        and page.locator('#rf [data-act=csv]').is_disabled()
        and page.locator('#rempty [data-act=rclear]').is_visible(),
        'invalid register date range blocks misleading totals and CSV export with a recovery action',
    )
    with page.expect_response(
        lambda response: '/api?' in response.url
        and json.loads(response.request.post_data or '{}').get('action') == 'registerPage'
        and json.loads(response.request.post_data or '{}').get('from') == ''
        and json.loads(response.request.post_data or '{}').get('to') == ''
    ):
        page.locator('#rempty [data-act=rclear]').click()
    page.wait_for_function(
        "document.querySelector('#rfrom')?.value === ''"
        " && document.querySelector('#rto')?.value === ''"
        " && document.querySelectorAll('#rbody tr').length >= 2"
        " && !document.querySelector('#rf [data-act=csv]')?.disabled"
    )
    check(
        page.locator('#rbody tr').count() >= 2
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

    def tamper_register_page_voucher_number(route):
        request_data = json.loads(route.request.post_data or '{}')
        action = request_data.get('action')
        if action not in ('bootstrap', 'registerPage'):
            route.continue_()
            return
        response = route.fetch()
        payload = response.json()
        data = payload.get('data', {})
        if action == 'bootstrap':
            vouchers = data.get('vouchers', [])
            if isinstance(vouchers, list) and vouchers:
                vouchers[0]['no'] = number_payload
        else:
            items = data.get('items', [])
            if items:
                items[0]['no'] = number_payload
        route.fulfill(response=response, json=payload)

    page.route('**/api?*', tamper_register_page_voucher_number)
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
    page.unroute('**/api?*', tamper_register_page_voucher_number)
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
    page.emulate_media(media='print')
    check(
        page.locator('#app').evaluate("element => getComputedStyle(element).display") == 'none'
        and page.locator('#printArea').evaluate("element => getComputedStyle(element).display") != 'none'
        and page.locator('#printArea .pv').evaluate("element => getComputedStyle(element).color") == 'rgb(17, 17, 17)'
        and page.locator('#printArea .pv').evaluate("element => getComputedStyle(element).backgroundColor") == 'rgb(255, 255, 255)'
        and page.locator('#printArea .pv').evaluate("element => getComputedStyle(element).breakInside") == 'avoid',
        'voucher print stylesheet hides application chrome and forces legible theme-independent paper output',
    )
    page.emulate_media(media='screen')

    context.set_offline(True)
    go_view(page, 'new')
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
    go_view(page, 'dash')
    offline_dashboard_text = page.locator('#view').inner_text()
    check(
        'Voucher data is unavailable while offline.' in offline_dashboard_text
        and page.locator('#view .stats').count() == 0
        and page.locator('#view svg.chart, #view .hb').count() == 0
        and not page.locator('[data-act=refresh]').is_disabled(),
        'offline startup withholds unverified Dashboard totals and charts while preserving refresh recovery',
    )
    go_view(page, 'reg')
    offline_register_text = page.locator('#view').inner_text()
    check(
        'Voucher data is unavailable while offline.' in offline_register_text
        and 'Totals unavailable while offline.' in offline_register_text
        and page.locator('#rempty .empty-state-message').inner_text().startswith('Voucher data is unavailable while offline.')
        and page.locator('#view #rbody tr').count() == 0
        and page.locator('#rf [data-act=csv]').is_disabled(),
        'offline Register does not present zero-like totals, empty records, or CSV export as valid data',
    )
    go_view(page, 'new')
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
    go_view(page, 'reg')
    page.wait_for_timeout(500)
    page.click('[data-act=refresh]')
    page.wait_for_timeout(500)
    check(page.locator('#rbody tr').count() == 3, 'lost-response retry is idempotent')

    go_view(page, 'new')
    import_recovery_file(pending_export_path)
    page.wait_for_selector('#banner:not(.hidden)', timeout=8000)
    check('1 payment waiting to upload' in page.inner_text('#banner'), 'synced recovery export can be restored')
    page.click('#banner [data-act=flush]')
    page.wait_for_function(
        "document.querySelector('#banner').classList.contains('hidden')",
        timeout=8000,
    )
    go_view(page, 'reg')
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
    check(second_page.locator('#nav button').count() == 3, 'second tab shares the staff session')

    context.set_offline(True)
    go_view(page, 'new')
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
    go_view(page, 'reg')
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
    go_view(page, 'new')
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

    # Endpoint identity is part of the queue binding, even when the email matches.
    foreign_endpoint_owner_key = (
        'https://cash-voucher-endpoint-switch.invalid/api|'
        + original_owner_key.rsplit('|', 1)[1]
    )
    update_outbox_owner('Account-bound Vendor', foreign_endpoint_owner_key)
    page.evaluate(
        """() => {
          const channel = new BroadcastChannel('cash-voucher-outbox');
          channel.postMessage({ type: 'changed' });
          channel.close();
          window.dispatchEvent(new Event('online'));
        }"""
    )
    page.wait_for_timeout(500)
    endpoint_records = outbox_vendor_records('Account-bound Vendor')
    check(
        page.locator('#banner').is_hidden()
        and len(endpoint_records) == 1
        and endpoint_records[0]['status'] == 'pending'
        and endpoint_records[0]['ownerKey'] == foreign_endpoint_owner_key,
        'same account bound to a different endpoint neither sees nor uploads the queued item',
    )

    # Restore the intended account binding and leave a draft open while the background sync runs.
    context.set_offline(True)
    update_outbox_owner('Account-bound Vendor', original_owner_key)
    go_view(page, 'new')
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
    go_view(page, 'new')
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
    go_view(page, 'new')
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
    go_view(page, 'reg')
    page.wait_for_selector('#rbody')
    page.click('[data-act=refresh]')
    page.wait_for_timeout(400)
    check(
        page.locator('#rbody tr', has_text='Healthy Neighbor Vendor').count() == 1,
        'valid payment uploads even when a neighboring queue record is rejected',
    )

    # A queued cash receipt must be labeled accurately and sync when connectivity returns.
    context.set_offline(True)
    go_view(page, 'new')
    click_with_draft_discard(page, page.locator('[data-k=RECEIPT]'))
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
    go_view(page, 'reg')
    page.wait_for_selector('#rbody')
    page.click('[data-act=refresh]')
    page.wait_for_timeout(300)
    offline_receipt_row = page.locator('#rbody tr', has_text='Offline Receipt Label Test')
    check(
        offline_receipt_row.count() == 1 and 'R-1' in offline_receipt_row.inner_text(),
        'queued offline cash receipt syncs successfully and receives the next receipt number',
    )

    page.click('#userBtn')
    page.locator('#userPop [data-go=acct]').first.click()
    page.click('#view [data-act=signout]')
    page.wait_for_selector('#loginForm')

    login('m@test.com', 'Manager#Start2026')
    page.wait_for_selector('#currentPassword')
    page.fill('#currentPassword', 'Manager#Start2026')
    page.fill('#newPassword', 'Manager#Final2026')
    page.click('.mcard .primary')
    page.wait_for_selector('#nav button')
    check(page.locator('#nav button').count() == 7, 'manager sees 7 nav items including Reports and Cash Close')

    go_view(page, 'new')
    click_with_draft_discard(page, page.locator('[data-k=RECEIPT]'))
    page.fill('.rv', 'Guest Room 5')
    page.fill('.ra', '5000')
    choose_cash_impact_for_current_rows()
    page.click('#nsave')
    page.wait_for_selector('.ok-panel')
    check(
        'R-2' in page.inner_text('#nres'),
        'next cash receipt receives the next sequential number after offline sync',
    )

    go_view(page, 'bulk')
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
    file_picker_style = page.locator('#bf').evaluate(
        "el => ({display:getComputedStyle(el).display, position:getComputedStyle(el).position})"
    )
    check(
        file_picker_style['display'] != 'none' and file_picker_style['position'] == 'absolute'
        and page.locator('.bulk-file-label').count() == 1,
        'bulk file picker stays keyboard reachable while retaining its designed label',
    )
    page.set_viewport_size({'width': 320, 'height': 800})
    bulk_mobile_layout = page.evaluate("""() => {
        const root = document.documentElement;
        const region = document.querySelector('.bulk-review-table');
        return {
            pageOverflow: root.scrollWidth > root.clientWidth,
            regionWidth: region?.clientWidth || 0,
            regionScrollWidth: region?.scrollWidth || 0,
            regionRole: region?.getAttribute('role'),
            regionTabindex: region?.getAttribute('tabindex')
        };
    }""")
    check(
        not bulk_mobile_layout['pageOverflow']
        and bulk_mobile_layout['regionWidth'] > 0
        and bulk_mobile_layout['regionScrollWidth'] > bulk_mobile_layout['regionWidth']
        and bulk_mobile_layout['regionRole'] == 'region'
        and bulk_mobile_layout['regionTabindex'] == '0',
        'bulk preview scrolls inside a named keyboard-focusable region at 320px',
    )
    page.set_viewport_size({'width': 390, 'height': 800})
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
        f'31/02/2026\t{xss_payload}\t10\t\t\n'
        f'{date_text}\t\t50\t\t\n'
        f'{date_text}\tBulk Imported Replacement Vendor\t40\tNonsense\t'
    )
    page.fill('#bt', rows)
    page.click('[data-act=parse]')
    page.wait_for_function(
        "document.querySelector('#bprev')?.innerText.includes('Bulk Imported Replacement Vendor')"
    )
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
        and page.locator('#bprev .ok-panel').get_attribute('aria-live') == 'polite'
        and page.locator('#bprev img, #bprev svg').count() == 0
        and page.locator('#bprev [data-act=goreg]').count() == 1
        and page.locator('#bprev [data-act=bulkagain]').count() == 1
        and not page.evaluate('window.__xssFired === true'),
        'bulk completion retains polite status, inert DOM and both actions',
    )

    # Import one receipt to ensure completion wording reflects the selected operation type.
    go_view(page, 'bulk')
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

    go_view(page, 'dash')
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
    vendor_default_category_payload = '<svg onload=window.__xssFired=true></svg>'
    vendor_default_method_payload = '<img src=x onerror=window.__xssFired=true>'
    invalid_vendor_envelope = False
    invalid_voucher_envelope = False

    def tamper_dashboard_groups(route):
        request_data = json.loads(route.request.post_data or '{}')
        action = request_data.get('action')
        if action not in ('bootstrap', 'dashboardSummary', 'registerPage'):
            route.continue_()
            return
        response = route.fetch()
        payload = response.json()
        data = payload.get('data', {})
        if action == 'bootstrap':
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
                        {
                            'id': 'vendor-defaults-xss',
                            'name': 'Vendor Defaults XSS Test',
                            'company': 'Test Supplies',
                            'mobile': '',
                            'active': True,
                            'defaultCategory': vendor_default_category_payload,
                            'defaultPaymentMethod': vendor_default_method_payload,
                        },
                    ])
                    data['vendors'] = vendors
        elif action == 'dashboardSummary':
            for key_name in ('topVendors', 'byCategory'):
                data[key_name] = [
                    {'k': value, 'n': 1, 's': 900001 + index}
                    for index, value in enumerate(prototype_group_values)
                ]
            data['malformedRecordCount'] = 3
            data['malformedFieldCount'] = 8
            data['invalidAmountCount'] = max(1, int(data.get('invalidAmountCount') or 0))
        elif action == 'registerPage':
            totals = data.get('totals', {})
            totals['malformedRecordCount'] = max(3, int(totals.get('malformedRecordCount') or 0))
            totals['malformedFieldCount'] = max(8, int(totals.get('malformedFieldCount') or 0))
            totals['invalidAmountCount'] = max(1, int(totals.get('invalidAmountCount') or 0))
        route.fulfill(response=response, json=payload)

    page.route('**/api?*', tamper_dashboard_groups)
    with page.expect_response(
        lambda response: '/api?' in response.url
        and json.loads(response.request.post_data or '{}').get('action') == 'bootstrap'
    ):
        page.reload(wait_until='domcontentloaded')
    page.wait_for_selector('#nav button')
    go_view(page, 'dash')
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
        '3 malformed voucher record(s) were omitted from normal financial calculations.' in page.locator('#view').inner_text()
        and '8 malformed voucher field(s) were handled for safe display.' in page.locator('#view').inner_text()
        and '[object Object]' not in page.locator('#view').inner_text()
        and '1 recorded voucher amount(s) are invalid and excluded from totals.' in page.locator('#view').inner_text(),
        'dashboard announces shared malformed voucher diagnostics, excludes malformed amounts, and keeps coercion inert',
    )
    go_view(page, 'reg')
    page.wait_for_selector('#rtot')
    check(
        '3 malformed voucher record(s) omitted from Dashboard and Register' in page.locator('#rtot').inner_text()
        and '8 malformed voucher field(s) handled for safe display' in page.locator('#rtot').inner_text()
        and page.locator('#rtot [role=status]').count() >= 2
        and page.locator('#rtot img, #rtot svg').count() == 0
        and '[object Object]' not in page.locator('#view').inner_text(),
        'register surfaces bootstrap diagnostics as DOM status nodes and keeps malformed metadata safe',
    )
    go_view(page, 'dash')
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
    go_view(page, 'new')
    page.wait_for_selector('#vlist', state='attached')
    vendor_option_values = page.locator('#vlist option').evaluate_all(
        'options => options.map(option => option.value)'
    )
    check(
        all(value in vendor_option_values for value in prototype_group_values),
        'vendor suggestions preserve constructor, __proto__, toString and hasOwnProperty names',
    )
    check(
        page.locator('#view img, #view svg:not(.i)').count() == 0
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
    go_view(page, 'vend')
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
    check(
        vendor_default_category_payload in page.locator('#view').inner_text()
        and 'Vendor Defaults XSS Test' in page.locator('#view').inner_text()
        and 'Auto / Cash' in page.locator('#view').inner_text()
        and page.locator('#view img, #view svg').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'vendor default category is escaped and unknown payment-method metadata falls back safely',
    )
    invalid_vendor_envelope = True
    page.reload(wait_until='domcontentloaded')
    page.wait_for_selector('#nav button')
    go_view(page, 'vend')
    page.wait_for_selector('#vf')
    check(
        'Vendor data is unavailable because the server response was invalid.' in page.locator('#view').inner_text()
        and 'No vendors yet' not in page.locator('#view').inner_text()
        and page.locator('#view .page-header-actions [data-act=refresh]').is_visible(),
        'non-array vendor response is disclosed instead of an empty list and can be refreshed',
    )
    invalid_vendor_envelope = False
    invalid_voucher_envelope = True
    page.reload(wait_until='domcontentloaded')
    page.wait_for_selector('#nav button')
    go_view(page, 'dash')
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
    go_view(page, 'reg')
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
    go_view(page, 'dash')
    invalid_voucher_envelope = False
    page.unroute('**/api?*', tamper_dashboard_groups)
    page.reload(wait_until='domcontentloaded')
    page.wait_for_selector('#nav button')
    go_view(page, 'dash')
    page.wait_for_selector('.stats')
    page.wait_for_selector('svg.chart')
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
        action = request_data.get('action')
        data = payload.get('data', {})
        values = [
            ('numeric-nan', 'NaN', 'numeric-nan'),
            ('numeric-infinity', 'Infinity', 'numeric-infinity'),
            ('numeric-null', None, 'numeric-null'),
            ('numeric-empty', '', 'numeric-empty'),
            ('numeric-boolean', True, 'numeric-boolean'),
            ('numeric-negative', -500, 'numeric-negative'),
            # A non-finite amount must stay in its own vendor group but never poison chart geometry.
            ('numeric-string', hostile_vendor, 'numeric-string'),
            # A large valid value makes the hostile text row deterministic in the top-eight vendor chart.
            ('hostile-vendor', 910005, hostile_vendor),
        ]
        if action == 'bootstrap':
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
        elif action == 'dashboardSummary':
            # The dashboard now consumes server aggregates instead of deriving charts
            # from the bootstrap voucher array; corrupt the read-model response directly.
            data['invalidAmountCount'] = max(7, int(data.get('invalidAmountCount') or 0))
            data['topVendors'] = [
                {'k': vendor, 'n': 1, 's': amount}
                for _, amount, vendor in values
            ]
            route.fulfill(response=response, json=payload)
        elif action == 'registerPage':
            # Inject the same hostile values into the explicitly paginated Register result,
            # since those rows no longer come from bootstrap.
            items = data.get('items', [])
            template = items[0].copy() if items else {
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
                'cashImpact': 'CASH_OUT',
                'approvalStatus': 'NOT_REQUIRED',
                'approvedBy': '',
                'approvedAt': '',
                'approvalReason': '',
            }
            injected = []
            for index, (suffix, amount, vendor) in enumerate(values):
                entry = template.copy()
                entry.update({
                    'id': suffix,
                    'no': 910001 + index,
                    'date': datetime.date.today().isoformat(),
                    'vendor': vendor,
                    'category': 'Rendering boundary',
                    'notes': '',
                    'amount': amount,
                    'type': 'PAYMENT',
                    'status': 'ACTIVE',
                    'createdBy': 'owner@test.com',
                    'createdAt': '2026-10-23T00:00:00Z',
                    'receipts': [],
                    'cancelReason': '',
                    'cashImpact': 'CASH_OUT',
                    'approvalStatus': 'NOT_REQUIRED',
                    'approvedBy': '',
                    'approvedAt': '',
                    'approvalReason': '',
                })
                injected.append(entry)
            data['items'] = items + injected
            data['totalCount'] = int(data.get('totalCount') or len(items)) + len(injected)
            totals = data.get('totals', {})
            totals['invalidAmountCount'] = max(7, int(totals.get('invalidAmountCount') or 0))
            data['totals'] = totals
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
    go_view(page, 'dash')
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
    go_view(page, 'reg')
    page.wait_for_selector('#rtot')
    page.locator('#rbody tr', has_text='numeric-nan').first.wait_for()
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
    go_view(page, 'dash')
    page.wait_for_selector('.hb-l')
    page.unroute('**/api?*', tamper_dashboard_numeric_values)
    page.reload(wait_until='domcontentloaded')
    page.wait_for_selector('#nav button')

    # Simulate an unsafe legacy/imported API row through the server-backed register
    # response. The register no longer reads its visible rows from the bootstrap cache.
    legacy_xss_voucher_enabled = True

    def inject_legacy_xss_voucher(route):
        request_data = json.loads(route.request.post_data or '{}')
        response = route.fetch()
        payload = response.json()
        if request_data.get('action') == 'registerPage' and legacy_xss_voucher_enabled:
            data = payload.get('data', {})
            items = data.get('items', [])
            exists = any(item.get('id') == 'xss-render-voucher-fixture' for item in items if isinstance(item, dict))
            if not exists:
                items.append({
                    'id': 'xss-render-voucher-fixture',
                    'no': 998877,
                    'date': datetime.date.today().isoformat(),
                    'vendor': xss_payload,
                    'vendorId': 'xss-render-vendor-fixture',
                    'paymentMethod': 'CASH',
                    'amount': 13.5,
                    'category': 'Other',
                    'notes': xss_note,
                    'type': 'PAYMENT',
                    'status': 'ACTIVE',
                    'createdBy': 'owner@test.com',
                    'createdAt': '2026-10-23T01:00:00Z',
                    'updatedBy': '',
                    'updatedAt': '',
                    'receipts': [],
                    'cancelReason': '',
                    'cashImpact': 'CASH_OUT',
                    'approvalStatus': 'NOT_REQUIRED',
                    'approvedBy': '',
                    'approvedAt': '',
                    'approvalReason': '',
                })
                data['items'] = items
                data['totalCount'] = int(data.get('totalCount') or 0) + 1
                facets = data.setdefault('facets', {'vendors': [], 'users': []})
                vendors = facets.setdefault('vendors', [])
                if xss_payload not in vendors:
                    vendors.append(xss_payload)
            route.fulfill(response=response, json=payload)
        else:
            route.fulfill(response=response)

    page.route('**/api?*', inject_legacy_xss_voucher)
    go_view(page, 'reg')
    page.locator('#rbody tr', has_text=xss_payload).first.wait_for()
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
    register_table_region = page.locator('#view .table-wrap[role=region][tabindex="0"]')
    check(
        register_table_region.count() == 1
        and register_table_region.get_attribute('aria-label') == 'Payment register vouchers',
        'Register table scrolling has a named, keyboard-focusable region',
    )
    page.locator('#rf [data-act=csv]').focus()
    page.keyboard.press('Tab')
    check(
        page.evaluate("""() => {
            const active = document.activeElement;
            if (!active?.matches('#view .table-wrap[role="region"][tabindex="0"]:focus-visible')) return false;
            const style = getComputedStyle(active);
            return style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) >= 2;
        }"""),
        'Register table region is reachable in tab order with a visible focus indicator',
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

    # Exercise the shared dialog API with hostile title/submit labels.
    page.evaluate("""async () => {
      const { dialog } = await import('./frontend/core/ui.js');
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.id = 'modal-hostile-label-trigger';
      trigger.textContent = 'Open test dialog';
      document.body.appendChild(trigger);
      trigger.focus();
      const body = document.createElement('div');
      const input = document.createElement('input');
      input.id = 'modal-hostile-label-input';
      input.setAttribute('aria-label', 'Test field');
      body.appendChild(input);
      window.__modalLabelXss = false;
      window.__modalHostileTitle = '<svg onload="window.__modalLabelXss=true">hostile title</svg>';
      window.__modalHostileSubmit = '<img src=x onerror="window.__modalLabelXss=true">';
      dialog(window.__modalHostileTitle, body, () => Promise.resolve(), window.__modalHostileSubmit);
    }""")
    check(
        page.locator('#modalTitle').text_content() == page.evaluate('window.__modalHostileTitle')
        and page.locator('#modal .primary').text_content() == page.evaluate('window.__modalHostileSubmit')
        and page.locator('#modal svg, #modal img').count() == 0
        and not page.evaluate('window.__modalLabelXss === true')
        and page.locator('#modal #modal-hostile-label-input').count() == 1,
        'shared dialog renders hostile labels as inert text while preserving caller DOM content',
    )
    page.evaluate("() => document.querySelector('#modal [data-x]').click()")
    check(
        page.locator('#modal').evaluate("(element) => element.classList.contains('hidden')")
        and not page.locator('#app').evaluate('(element) => element.inert')
        and page.evaluate("document.activeElement?.id === 'modal-hostile-label-trigger'"),
        'shared dialog closes safely and restores opener focus after hostile-label rendering',
    )
    page.locator('#modal-hostile-label-trigger').evaluate('(element) => element.remove()')

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
    audit_health_mode = {'status': 'NO_KNOWN_FAILURE'}
    hostile_audit_health_kind = '<svg onload=window.__xssFired=true></svg>'

    def inject_legacy_update_audit(route):
        try:
            request_data = json.loads(route.request.post_data or '{}')
        except json.JSONDecodeError:
            request_data = {}
        if request_data.get('action') != 'auditLog':
            route.continue_()
            return
        if audit_health_mode['status'] == 'UNAVAILABLE':
            route.abort()
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
        if payload.get('ok') and isinstance(payload.get('data'), dict):
            if audit_health_mode['status'] == 'INVALID_RESPONSE':
                payload['data']['auditHealth'] = {
                    'status': 'UNKNOWN',
                    'failureCount': 0,
                    'lastFailureAt': '',
                    'lastFailureKind': '',
                }
            elif audit_health_mode['status'] == 'DEGRADED':
                payload['data']['auditHealth'] = {
                    'status': 'DEGRADED',
                    'failureCount': 3,
                    'lastFailureAt': '2026-10-16T09:10:00',
                    'lastFailureKind': hostile_audit_health_kind,
                }
            elif audit_health_mode['status'] == 'MONITORING_UNAVAILABLE_WITH_MARKER':
                payload['data']['auditHealth'] = {
                    'status': 'MONITORING_UNAVAILABLE',
                    'failureCount': 2,
                    'lastFailureAt': '2026-10-24T19:20:00.000Z',
                    'lastFailureKind': 'EVENT_BATCH',
                    'markerDurability': 'SCRIPT_PROPERTIES',
                }
            else:
                payload['data']['auditHealth'] = {
                    'status': 'NO_KNOWN_FAILURE',
                    'failureCount': 0,
                    'lastFailureAt': '',
                    'lastFailureKind': '',
                }
        route.fulfill(response=response, body=json.dumps(payload))

    audit_page.route('**/api?*', inject_legacy_update_audit)
    audit_page.goto(URL)
    audit_page.fill('#lEmail', 'owner@test.com')
    audit_page.fill('#lPassword', 'Owner#Final2026')
    audit_page.click('#lBtn')
    audit_page.wait_for_selector('[data-v=audit]')
    go_view(audit_page, 'audit')
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
    healthy_audit_text = audit_page.locator('#aud-health').inner_text()
    check(
        'an outage affecting every marker store may still be undetectable'
        in healthy_audit_text
        and 'Historical audit completeness is not verified.' in healthy_audit_text,
        'owner audit view keeps the explicit limitation visible on the loaded audit page',
    )
    audit_health_mode['status'] = 'DEGRADED'
    go_view(audit_page, 'dash')
    go_view(audit_page, 'audit')
    audit_page.wait_for_function(
        "document.querySelector('#aud-health [role=alert]')?.innerText.includes('3 write failure(s) recorded')",
        timeout=10000,
    )
    degraded_audit_health_text = audit_page.locator('#aud-health').inner_text()
    check(
        '3 write failure(s) recorded' in degraded_audit_health_text
        and audit_page.locator('#aud-health [role=alert]').count() == 1,
        'degraded audit health is assertively announced',
    )
    check(
        hostile_audit_health_kind.lower().replace('_', ' ').replace('  ', ' ')
        in degraded_audit_health_text,
        'degraded audit health preserves the normalized monitor failure kind as literal text',
    )
    check(
        audit_page.locator('#aud-health svg, #aud-health img').count() == 0
        and not audit_page.evaluate('window.__xssFired === true'),
        'hostile monitor failure kind remains inert and does not execute',
    )
    with audit_page.expect_download() as degraded_snapshot_download_info:
        audit_page.click('[data-act=audhealth]')
    degraded_snapshot_download = degraded_snapshot_download_info.value
    with open(degraded_snapshot_download.path(), encoding='utf-8') as degraded_snapshot_file:
        degraded_audit_snapshot = json.load(degraded_snapshot_file)
    check(
        degraded_audit_snapshot.get('monitoring', {}).get('status') == 'DEGRADED'
        and degraded_audit_snapshot.get('monitoring', {}).get('failureCount') == 3
        and degraded_audit_snapshot.get('monitoring', {}).get('lastFailureKind') == hostile_audit_health_kind,
        'degraded JSON snapshot preserves failure metadata for owner follow-up',
    )
    audit_health_mode['status'] = 'MONITORING_UNAVAILABLE_WITH_MARKER'
    go_view(audit_page, 'dash')
    go_view(audit_page, 'audit')
    audit_page.wait_for_function(
        "document.querySelector('#aud-health [role=alert]')?.innerText.includes('2 write failure(s) recorded')",
        timeout=10000,
    )
    mixed_audit_health_text = audit_page.locator('#aud-health').inner_text()
    check(
        'monitoring could not verify all failure-marker stores' in mixed_audit_health_text.lower()
        and '2 write failure(s) recorded' in mixed_audit_health_text
        and 'script properties' in mixed_audit_health_text.lower()
        and audit_page.locator('#aud-health [role=alert]').count() == 1,
        'partial marker-store outage stays unavailable while exposing a known failure marker',
    )
    with audit_page.expect_download() as mixed_snapshot_download_info:
        audit_page.click('[data-act=audhealth]')
    mixed_snapshot_download = mixed_snapshot_download_info.value
    with open(mixed_snapshot_download.path(), encoding='utf-8') as mixed_snapshot_file:
        mixed_audit_snapshot = json.load(mixed_snapshot_file)
    check(
        mixed_audit_snapshot.get('monitoring', {}).get('status') == 'MONITORING_UNAVAILABLE'
        and mixed_audit_snapshot.get('monitoring', {}).get('failureCount') == 2
        and mixed_audit_snapshot.get('monitoring', {}).get('lastFailureKind') == 'EVENT_BATCH'
        and mixed_audit_snapshot.get('monitoring', {}).get('markerDurability') == 'SCRIPT_PROPERTIES',
        'unavailable health export preserves known marker metadata without claiming monitoring is healthy',
    )
    audit_health_mode['status'] = 'INVALID_RESPONSE'
    go_view(audit_page, 'dash')
    go_view(audit_page, 'audit')
    audit_page.wait_for_function(
        "document.querySelector('#aud-health [role=alert]')?.innerText.includes('server response was invalid')",
        timeout=10000,
    )
    check(
        audit_page.locator('#aud-health [role=alert]').count() == 1
        and 'Historical audit completeness is not verified.' not in audit_page.locator('#aud-health').inner_text(),
        'invalid audit-health response is visibly reported as unverified rather than as known healthy',
    )
    with audit_page.expect_download() as invalid_snapshot_download_info:
        audit_page.click('[data-act=audhealth]')
    invalid_snapshot_download = invalid_snapshot_download_info.value
    with open(invalid_snapshot_download.path(), encoding='utf-8') as invalid_snapshot_file:
        invalid_audit_snapshot = json.load(invalid_snapshot_file)
    check(
        invalid_audit_snapshot.get('monitoring', {}).get('status') == 'INVALID_RESPONSE'
        and invalid_audit_snapshot.get('monitoring', {}).get('failureCount') is None
        and invalid_audit_snapshot.get('coverage', {}).get('responseInvalid') is True
        and invalid_audit_snapshot.get('coverage', {}).get('serverReportedTotalCount') is None,
        'invalid health JSON snapshot preserves unknown status without inventing a zero failure count',
    )
    audit_health_mode['status'] = 'UNAVAILABLE'
    go_view(audit_page, 'dash')
    go_view(audit_page, 'audit')
    audit_page.wait_for_function(
        "document.querySelector('#aud-health [role=alert]')?.innerText.includes('audit request failed')",
        timeout=10000,
    )
    check(
        audit_page.locator('#aud-health [role=alert]').count() == 1
        and audit_page.locator('#aud [data-act=audretry]').is_visible(),
        'audit monitoring request failure stays visibly unknown and offers a retry',
    )
    with audit_page.expect_download() as unavailable_snapshot_download_info:
        audit_page.click('[data-act=audhealth]')
    unavailable_snapshot_download = unavailable_snapshot_download_info.value
    with open(unavailable_snapshot_download.path(), encoding='utf-8') as unavailable_snapshot_file:
        unavailable_audit_snapshot = json.load(unavailable_snapshot_file)
    check(
        unavailable_audit_snapshot.get('monitoring', {}).get('status') == 'UNAVAILABLE'
        and unavailable_audit_snapshot.get('monitoring', {}).get('failureCount') is None
        and unavailable_audit_snapshot.get('coverage', {}).get('requestFailed') is True
        and unavailable_audit_snapshot.get('coverage', {}).get('serverReportedTotalCount') is None,
        'unavailable health snapshot does not manufacture a zero-failure status',
    )
    audit_health_mode['status'] = 'NO_KNOWN_FAILURE'
    go_view(audit_page, 'dash')
    go_view(audit_page, 'audit')
    audit_page.wait_for_function(
        "document.querySelector('#aud-more') && !document.querySelector('#aud-more').classList.contains('hidden')",
        timeout=10000,
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
    xss_vendor_row.wait_for()
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
    legacy_xss_voucher_enabled = False
    page.unroute('**/api?*', inject_legacy_xss_voucher)
    go_view(page, 'reg')
    page.wait_for_selector('[data-act=cancel]')
    ram_traders_row = page.locator('#rbody tr').filter(has_text='Ram Traders').first
    ram_traders_row.locator('[data-act=cancel]').click()
    page.fill('#cr', 'entered twice')
    page.click('.mcard .primary')
    page.wait_for_timeout(500)
    page.select_option('#rs', 'CANCELLED')
    page.wait_for_function(
        "document.querySelector('#rbody tr.cx')?.innerText.includes('Ram Traders')"
    )
    check(page.locator('#rbody tr.cx').count() == 1, 'cancelled voucher visible under filter')

    # Exercise the recorded movement report through the actual browser/API mock.
    go_view(page, 'reports')
    page.wait_for_selector('#movementFilters')
    page.set_viewport_size({'width': 1280, 'height': 800})
    report_layout = page.locator('#movementFilters').evaluate(
        "el => ({display:getComputedStyle(el).display, columns:getComputedStyle(el).gridTemplateColumns.match(/\\d+(?:\\.\\d+)?px/g)?.length || 0})"
    )
    check(
        report_layout['display'] == 'grid' and report_layout['columns'] == 6,
        'movement report filters align in a six-column desktop workspace',
    )
    page.set_viewport_size({'width': 390, 'height': 800})
    mobile_report_layout = page.locator('#movementFilters').evaluate(
        "el => ({display:getComputedStyle(el).display, columns:getComputedStyle(el).gridTemplateColumns.match(/\\d+(?:\\.\\d+)?px/g)?.length || 0})"
    )
    check(
        mobile_report_layout['display'] == 'grid'
        and mobile_report_layout['columns'] == 1
        and page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'),
        'movement report filters become a single, overflow-safe mobile column',
    )
    page.set_viewport_size({'width': 1280, 'height': 800})
    check(
        page.locator('#view .page-header h1').inner_text() == 'Recorded Movement Report'
        and page.locator('#view .empty-state-card h2').inner_text() == 'No report generated yet',
        'report page exposes a heading and a reusable initial empty state',
    )
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
        page.locator('#view table caption').inner_text() == 'Recorded voucher movements'
        and page.locator('#view .table-wrap[role=region]').count() == 1,
        'movement report uses the accessible shared table component',
    )
    check(
        page.locator('#report-output').get_attribute('aria-busy') == 'false'
        and page.locator('#report-output .report-results-card').count() == 1,
        'report output exposes a settled, non-busy state after successful loading',
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
        and all(row.locator('td').nth(6).inner_text() == 'ACTIVE' for row in report_rows.all()),
        'default active report lists active source vouchers and excludes cancelled records',
    )

    # Hold a report request while navigating away. Its late response must not steal the route.
    page.evaluate("""() => {
        const nativeFetch = window.fetch.bind(window);
        const gate = {used: false, pending: false, finished: false, release: null};
        window.__reportRouteGate = gate;
        window.fetch = async (input, init = {}) => {
            let action = '';
            try { action = JSON.parse(init.body || '{}').action || ''; } catch {}
            if (action !== 'recordedMovementReport' || gate.used) {
                return nativeFetch(input, init);
            }
            gate.used = true;
            gate.pending = true;
            await new Promise((resolve) => { gate.release = resolve; });
            gate.pending = false;
            try { return await nativeFetch(input, init); }
            finally { gate.finished = true; }
        };
    }""")
    page.locator('#movementFilters button[type=submit]').click()
    page.wait_for_function(
        "window.__reportRouteGate?.pending === true && typeof window.__reportRouteGate.release === 'function'"
    )
    go_view(page, 'dash')
    check(
        page.locator('#view .page-header h1').inner_text() == 'Dashboard',
        'dashboard remains visible while a Recorded Movement Report request is pending',
    )
    page.evaluate("window.__reportRouteGate.release()")
    page.wait_for_function("window.__reportRouteGate?.finished === true")
    check(
        page.locator('#view .page-header h1').inner_text() == 'Dashboard'
        and page.locator('#view #movementFilters').count() == 0,
        'a late report response cannot replace the destination dashboard',
    )
    go_view(page, 'reports')
    page.wait_for_selector('#movementFilters')
    page.wait_for_function(
        "document.querySelector('#report-output')?.getAttribute('aria-busy') === 'false'"
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
            summary['ambiguousVendorCount'] = 2
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
        and '2 report row(s) have ambiguous vendor names' in report_text
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

    # Non-scalar summary counts must not be coerced via object toString/valueOf hooks.
    def tamper_report_summary_coercion(route):
        request_data = json.loads(route.request.post_data or '{}')
        response = route.fetch()
        payload = response.json()
        if request_data.get('action') == 'recordedMovementReport':
            summary = payload.get('data', {})
            for field in (
                'approvalExceptionCount',
                'unmatchedVendorCount',
                'ambiguousVendorCount',
            ):
                summary[field] = {'toString': None, 'valueOf': None}
            payload['data'] = summary
            route.fulfill(response=response, json=payload)
        else:
            route.fulfill(response=response)

    page.route('**/api?*', tamper_report_summary_coercion)
    with page.expect_response(
        lambda response: '/api?' in response.url
        and json.loads(response.request.post_data or '{}').get('action') == 'recordedMovementReport'
    ):
        page.locator('#movementFilters button[type=submit]').click()
    page.wait_for_selector('.form-error[role=alert]')
    report_text = page.locator('#view').inner_text()
    check(
        'invalid summary counts' in report_text.lower()
        and page.locator('#view table tbody tr').count() == 0
        and page.locator('#view .form-error [data-act=reportRun]').is_enabled()
        and page.locator('#view svg, #view img').count() == 0,
        'coercion-hostile report summary counts fail closed with retry and no markup',
    )
    page.unroute('**/api?*', tamper_report_summary_coercion)
    with page.expect_response(
        lambda response: '/api?' in response.url
        and json.loads(response.request.post_data or '{}').get('action') == 'recordedMovementReport'
    ):
        page.locator('#view .form-error [data-act=reportRun]').click()
    page.wait_for_function(
        "document.querySelector('#view').innerText.includes('Type: ALL · Status: ACTIVE')"
    )

    # Every exception counter must be an integer >= 0; reject strings, negatives and fractions.
    count_case = {'field': '', 'value': None}

    def tamper_report_summary_count_type(route):
        request_data = json.loads(route.request.post_data or '{}')
        response = route.fetch()
        payload = response.json()
        if request_data.get('action') == 'recordedMovementReport':
            summary = payload.get('data', {})
            summary[count_case['field']] = count_case['value']
            payload['data'] = summary
            route.fulfill(response=response, json=payload)
        else:
            route.fulfill(response=response)

    page.route('**/api?*', tamper_report_summary_count_type)
    for field, value, label in (
        ('approvalExceptionCount', -1, 'negative approval count'),
        ('unmatchedVendorCount', 1.5, 'fractional unmatched-vendor count'),
        ('ambiguousVendorCount', '2', 'string-valued ambiguous-vendor count'),
    ):
        count_case['field'] = field
        count_case['value'] = value
        with page.expect_response(
            lambda response: '/api?' in response.url
            and json.loads(response.request.post_data or '{}').get('action') == 'recordedMovementReport'
        ):
            page.locator('#movementFilters button[type=submit]').click()
        page.wait_for_selector('.form-error[role=alert]')
        report_text = page.locator('#view').inner_text()
        check(
            'invalid summary counts' in report_text.lower()
            and page.locator('#view table tbody tr').count() == 0
            and page.locator('#view .form-error [data-act=reportRun]').is_enabled()
            and page.locator('#view svg, #view img').count() == 0,
            label + ' fails closed with retry and no stale rows or markup',
        )
    page.unroute('**/api?*', tamper_report_summary_count_type)
    with page.expect_response(
        lambda response: '/api?' in response.url
        and json.loads(response.request.post_data or '{}').get('action') == 'recordedMovementReport'
    ):
        page.locator('#view .form-error [data-act=reportRun]').click()
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
    date_range_a11y = page.evaluate("""() => {
        const from = document.querySelector('#movementFrom');
        const to = document.querySelector('#movementTo');
        const error = document.querySelector('#report-date-range-error');
        return {
            fromInvalid: from?.getAttribute('aria-invalid'),
            toInvalid: to?.getAttribute('aria-invalid'),
            fromDescription: from?.getAttribute('aria-describedby'),
            toDescription: to?.getAttribute('aria-describedby'),
            errorRole: error?.getAttribute('role'),
            errorText: error?.innerText || '',
            busy: document.querySelector('#report-output')?.getAttribute('aria-busy')
        };
    }""")
    check(
        date_range_a11y['fromInvalid'] == 'true'
        and date_range_a11y['toInvalid'] == 'true'
        and date_range_a11y['fromDescription'] == 'report-date-range-error'
        and date_range_a11y['toDescription'] == 'report-date-range-error'
        and date_range_a11y['errorRole'] == 'alert'
        and 'Choose a valid date range' in date_range_a11y['errorText']
        and date_range_a11y['busy'] == 'false',
        'invalid date range marks both fields and programmatically links them to one alert',
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
    check(
        page.locator('#movementFrom').get_attribute('aria-invalid') is None
        and page.locator('#movementTo').get_attribute('aria-invalid') is None
        and page.locator('#report-output').get_attribute('aria-busy') == 'false',
        'valid report retry clears field-level invalid state and settles the output region',
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

    # Recreate the client-side Register state before this isolated malformed-response
    # test. Earlier journeys intentionally leave filters behind across SPA navigation.
    page.reload()
    page.wait_for_selector('[data-v=reg]')
    go_view(page, 'reg')
    page.wait_for_selector('#rbody')
    page.select_option('#rs', 'ALL')

    # The register must stay usable when API records have malformed vendor/note/receipt fields.
    def tamper_register_metadata(route):
        request_data = json.loads(route.request.post_data or '{}')
        response = route.fetch()
        payload = response.json()
        data = payload.get('data', {})
        action = request_data.get('action')
        if action == 'bootstrap':
            vouchers = data.get('vouchers', [])
            vouchers.append(None)
            data['vouchers'] = vouchers
            payload['data'] = data
            route.fulfill(response=response, json=payload)
        elif action == 'registerPage':
            query = str(request_data.get('q') or '')
            if query in ('', '999991'):
                items = data.get('items', [])
                items.append({
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
                    'cashImpact': 'CASH_OUT',
                    'approvalStatus': 'NOT_REQUIRED',
                    'approvedBy': '',
                    'approvedAt': '',
                    'approvalReason': '',
                    'cancelReason': '',
                    'updatedBy': '',
                    'updatedAt': '',
                    'vendorId': '',
                })
                data['items'] = items
                data['totalCount'] = int(data.get('totalCount') or 0) + 1
                totals = data.setdefault('totals', {})
                totals['malformedRecordCount'] = max(
                    1, int(totals.get('malformedRecordCount') or 0)
                )
                totals['malformedFieldCount'] = max(
                    2, int(totals.get('malformedFieldCount') or 0)
                )
                facets = data.setdefault('facets', {'vendors': [], 'users': []})
                if 'm@test.com' not in facets.get('users', []):
                    facets.setdefault('users', []).append('m@test.com')
            route.fulfill(response=response, json=payload)
        else:
            route.fulfill(response=response)

    page.route('**/api?*', tamper_register_metadata)
    with page.expect_response(
        lambda response: '/api?' in response.url
        and json.loads(response.request.post_data or '{}').get('action') == 'registerPage'
        and not json.loads(response.request.post_data or '{}').get('q')
    ):
        page.locator('[data-act=refresh]').click()
    page.wait_for_function(
        "document.querySelector('[data-id=malformed-register-fixture][data-act=rec]') !== null"
        " && document.querySelector('#rbody')?.innerText.includes('Receipt metadata unavailable')"
        " && document.querySelector('#rtot')?.innerText.includes('malformed voucher record(s) omitted')"
    )
    check(
        page.locator('[data-id=malformed-register-fixture][data-act=rec]').count() == 1
        and 'Receipt metadata unavailable' in page.locator('#rbody').inner_text(),
        'register omits malformed voucher records and visibly flags missing receipt metadata',
    )
    with page.expect_response(
        lambda response: '/api?' in response.url
        and json.loads(response.request.post_data or '{}').get('action') == 'registerPage'
        and json.loads(response.request.post_data or '{}').get('q') == '999991'
    ):
        page.fill('#rq', '999991')
    page.wait_for_function(
        "document.querySelector('#rbody tr [data-id=malformed-register-fixture][data-act=rec]') !== null"
        " && document.querySelector('#rtot')?.innerText.includes('malformed voucher record(s) omitted')"
    )
    check(
        page.locator('#rbody tr').count() == 1
        and 'malformed voucher record(s) omitted' in page.locator('#rtot').inner_text(),
        'register search tolerates null vendor and object-valued notes',
    )
    with page.expect_response(
        lambda response: '/api?' in response.url
        and json.loads(response.request.post_data or '{}').get('action') == 'registerPage'
        and json.loads(response.request.post_data or '{}').get('q') == 'query with no match'
    ):
        page.fill('#rq', 'query with no match')
    page.wait_for_function(
        "document.querySelector('#rempty .empty-state-message')?.textContent"
        " === 'No vouchers match the current filters.'"
    )
    check(
        page.locator('#rempty .empty-state-message').inner_text()
        == 'No vouchers match the current filters.',
        'malformed fields do not break the register empty state',
    )
    # The generic Register journey above covers clear-filter behavior. Reload here to
    # isolate malformed receipt metadata from the current no-match search state.
    page.reload()
    page.wait_for_selector('[data-v=reg]')
    with page.expect_response(
        lambda response: '/api?' in response.url
        and json.loads(response.request.post_data or '{}').get('action') == 'registerPage'
    ):
        go_view(page, 'reg')
    page.wait_for_function(
        "document.querySelector('#rbody tr [data-id=malformed-register-fixture][data-act=rec]') !== null"
    )
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
    go_view(page, 'dash')
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

    go_view(page, 'reg')
    page.wait_for_selector('#rbody')
    for width in viewport_widths:
        page.set_viewport_size({'width': width, 'height': 800})
        page_overflow = page.evaluate(
            'document.documentElement.scrollWidth > document.documentElement.clientWidth'
        )
        check(not page_overflow, f'{width}px register has no page-level horizontal overflow')

    # Exercise the payment-entry workflow at the narrow reflow width used for 400% zoom.
    go_view(page, 'new')
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
    click_with_draft_discard(page, page.locator('[data-k=RECEIPT]'))
    check(page.locator('#nsave').inner_text() == 'Save cash receipt', 'cash-receipt mode uses matching save terminology')
    click_with_draft_discard(page, page.locator('[data-k=PAYMENT]'))
    page.locator('.erow .rv').first.fill('Mobile workflow vendor')
    page.locator('.erow .ra').first.fill('42')
    check(
        page.locator('#nf .unsaved-draft-notice').inner_text()
        == 'Unsaved voucher draft — save it before leaving this screen.',
        'editing a payment displays a visible unsaved-draft warning',
    )
    page.once('dialog', lambda dialog: dialog.dismiss())
    page.click('[data-k=RECEIPT]')
    check(
        page.locator('#nsave').inner_text() == 'Save payment'
        and page.locator('.erow .rv').first.input_value() == 'Mobile workflow vendor',
        'cancelling entry-type switching preserves the unsaved payment draft',
    )
    page.once('dialog', lambda dialog: dialog.dismiss())
    page.click('#nav [data-v="dash"]')
    check(
        page.locator('#nf').is_visible()
        and page.locator('.erow .rv').first.input_value() == 'Mobile workflow vendor'
        and page.locator('.erow .ra').first.input_value() == '42',
        'cancelling navigation preserves the unsaved financial draft',
    )
    page.once('dialog', lambda dialog: dialog.accept())
    page.click('#nav [data-v="dash"]')
    page.wait_for_selector('.dashboard-view')
    check(page.locator('#nf').count() == 0, 'confirmed navigation explicitly discards the draft')
    go_view(page, 'new')
    page.wait_for_selector('#nf')
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
    go_view(page, 'dash')
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
        muted_color == 'rgb(89, 101, 123)',
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
    audit_failure_once = True
    backup_status_failure_once = False
    diagnostic_response_modes = {
        'dataQualityReport': 'valid',
        'backupIntegrityReport': 'valid',
    }

    def inject_malformed_audit_rows(route):
        global audit_failure_once, backup_status_failure_once
        try:
            request_data = json.loads(route.request.post_data or '{}')
        except json.JSONDecodeError:
            request_data = {}
        action = request_data.get('action')
        if action not in ('auditLog', 'dataQualityReport', 'backupIntegrityReport', 'backupStatus'):
            route.continue_()
            return

        response = route.fetch()
        payload = response.json()
        if action == 'auditLog' and audit_failure_once:
            audit_failure_once = False
            payload = {'ok': False, 'error': 'Simulated transient audit failure', 'code': 'SERVER'}
            route.fulfill(response=response, body=json.dumps(payload))
            return
        if action == 'backupStatus' and backup_status_failure_once:
            backup_status_failure_once = False
            payload = {'ok': False, 'error': 'Simulated transient backup status failure', 'code': 'SERVER'}
            route.fulfill(response=response, body=json.dumps(payload))
            return
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
    audit_page.fill('#lPassword', 'Owner#Final2026')
    audit_page.click('#lBtn')
    audit_page.wait_for_selector('[data-v=audit]')
    go_view(audit_page, 'audit')
    audit_page.wait_for_selector('#aud [data-act=audretry]', timeout=10000)
    audit_layout = audit_page.locator('.audit-filters').evaluate(
        "el => ({display:getComputedStyle(el).display,columns:getComputedStyle(el).gridTemplateColumns.match(/\\d+(?:\\.\\d+)?px/g)?.length || 0})"
    )
    check(
        audit_page.locator('.audit-panel').count() == 1
        and audit_layout['display'] == 'grid'
        and audit_layout['columns'] == 4,
        'Audit log uses the shared review panel and four-column desktop filter grid',
    )
    audit_page.set_viewport_size({'width': 390, 'height': 800})
    audit_mobile_columns = audit_page.locator('.audit-filters').evaluate(
        "el => getComputedStyle(el).gridTemplateColumns.match(/\\d+(?:\\.\\d+)?px/g)?.length || 0"
    )
    check(
        audit_mobile_columns == 1
        and audit_page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'),
        'Audit filters reflow to one mobile column without horizontal page overflow',
    )
    audit_page.set_viewport_size({'width': 1280, 'height': 800})
    check(
        'Audit events unavailable.' in audit_page.locator('#aud-count').inner_text()
        and 'No audit events are available' not in audit_page.locator('#aud').inner_text()
        and audit_page.locator('#aud [data-act=audretry]').is_visible(),
        'audit load failure stays distinct from an empty history and offers a direct retry',
    )
    audit_page.click('#aud [data-act=audretry]')
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
    go_view(audit_page, 'dash')
    go_view(audit_page, 'audit')
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
    go_view(audit_page, 'dash')
    go_view(audit_page, 'audit')
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
    go_view(audit_page, 'dash')
    go_view(audit_page, 'audit')
    audit_page.wait_for_function(
        "document.querySelector('#aud-count')?.innerText.startsWith('Showing ')",
        timeout=10000,
    )
    check(
        'unavailable' not in audit_page.locator('#aud-count').inner_text().lower()
        and 'malformed audit event(s) omitted' not in audit_page.locator('#aud-count').inner_text(),
        'audit view recovers when a valid response returns',
    )

    backup_status_failure_once = True
    go_view(audit_page, 'set')
    audit_page.wait_for_selector('[data-act=dqscan]')
    audit_page.wait_for_selector('#backup-status [data-act="backup-retry"]', timeout=10000)
    check(
        'Backup status could not be loaded' in audit_page.locator('#backup-status').inner_text()
        and audit_page.locator('#backup-status [data-act="backup-retry"]').is_visible(),
        'backup status failure exposes a local retry without implying a successful backup',
    )
    audit_page.click('#backup-status [data-act="backup-retry"]')
    audit_page.wait_for_function(
        """() => {
            const card = document.querySelector('#backup-status');
            return Boolean(
                card &&
                card.querySelector('.badge') &&
                !card.querySelector('[data-act="backup-retry"]') &&
                !card.innerText.includes('Backup status could not be loaded')
            );
        }""",
        timeout=10000,
    )
    check(
        audit_page.locator('#backup-status [data-act="backup-retry"]').count() == 0
        and 'Backup status could not be loaded' not in audit_page.locator('#backup-status').inner_text(),
        'backup status refresh succeeds in place without resetting the Settings form',
    )
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
    with audit_page.expect_download() as malformed_dq_export_info:
        audit_page.click('[data-act=dqexport]')
    malformed_dq_export = malformed_dq_export_info.value
    with open(malformed_dq_export.path(), encoding='utf-8') as malformed_dq_file:
        malformed_dq_snapshot = json.load(malformed_dq_file)
    malformed_dq_report = malformed_dq_snapshot.get('report', {})
    check(
        malformed_dq_snapshot.get('snapshotType') == 'cash-voucher-data-quality'
        and malformed_dq_report.get('issueCount') == 3
        and malformed_dq_report.get('returnedIssueCount') == 1
        and malformed_dq_report.get('malformedIssueCount') == 2
        and malformed_dq_report.get('issues', [{}])[0].get('message') == audit_malformed_payload,
        'data-quality export preserves summary totals, omits malformed records and serializes hostile findings as inert JSON',
    )

    diagnostic_response_modes['dataQualityReport'] = 'invalid-envelope'
    audit_page.click('[data-act=dqscan]')
    audit_page.wait_for_function(
        "document.querySelector('#dq-results')?.getAttribute('role') === 'alert' && document.querySelector('#dq-results')?.innerText.includes('invalid response')",
        timeout=10000,
    )
    check(
        audit_page.locator('[data-act=dqexport]').count() == 0,
        'a failed refresh removes the previous data-quality export and cannot present stale results as current',
    )
    diagnostic_response_modes['dataQualityReport'] = 'valid'

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
    check(
        audit_page.locator('[data-act=bkexport]').count() == 0,
        'invalid backup-integrity responses expose no export action',
    )

    diagnostic_response_modes['backupIntegrityReport'] = 'valid'
    audit_page.click('[data-act=bkintegrity]')
    audit_page.wait_for_function(
        "document.querySelector('#backup-integrity-results')?.getAttribute('role') === 'status' && document.querySelector('#backup-integrity-results')?.innerText.startsWith('Inspected ')",
        timeout=10000,
    )
    check(
        'invalid response' not in audit_page.locator('#backup-integrity-results').inner_text().lower()
        and audit_page.locator('[data-act=bkexport]').count() == 1,
        'backup integrity inspection recovers and exposes an export after a valid report returns',
    )
    audit_page.set_viewport_size({'width': 1280, 'height': 800})
    desktop_diagnostic_layout = audit_page.evaluate(
        """() => {
          const actions = document.querySelector('#backup-integrity-results .diagnostic-actions');
          const button = actions?.querySelector('[data-act="bkexport"]');
          const note = actions?.querySelector('.muted');
          if (!actions || !button || !note) return null;
          return {
            display: getComputedStyle(actions).display,
            direction: getComputedStyle(actions).flexDirection,
            buttonTop: button.getBoundingClientRect().top,
            noteTop: note.getBoundingClientRect().top,
            noteText: note.textContent
          };
        }"""
    )
    check(
        desktop_diagnostic_layout is not None
        and desktop_diagnostic_layout['display'] == 'flex'
        and desktop_diagnostic_layout['direction'] == 'row'
        and abs(desktop_diagnostic_layout['buttonTop'] - desktop_diagnostic_layout['noteTop']) < 30
        and 'does not prove restoreability' in desktop_diagnostic_layout['noteText'],
        'desktop diagnostic export controls align in one row with explicit restore limitations',
    )
    with audit_page.expect_download() as backup_export_info:
        audit_page.click('[data-act=bkexport]')
    backup_export = backup_export_info.value
    with open(backup_export.path(), encoding='utf-8') as backup_export_file:
        backup_snapshot = json.load(backup_export_file)
    backup_export_report = backup_snapshot.get('report', {})
    check(
        backup_export.suggested_filename.startswith('cash-voucher-backup-integrity-')
        and backup_export.suggested_filename.endswith('.json')
        and backup_snapshot.get('schemaVersion') == 1
        and backup_snapshot.get('snapshotType') == 'cash-voucher-backup-integrity'
        and backup_export_report.get('inspected') == len(backup_export_report.get('snapshots', []))
        and backup_export_report.get('passCount', 0) + backup_export_report.get('warningCount', 0) + backup_export_report.get('failCount', 0) == backup_export_report.get('inspected')
        and any('do not prove a successful restore' in item for item in backup_snapshot.get('limitations', [])),
        'backup-integrity JSON has consistent counts and explicitly stops short of a restore claim',
    )

    diagnostic_response_modes['backupIntegrityReport'] = 'invalid-snapshot'
    audit_page.click('[data-act=bkintegrity]')
    audit_page.wait_for_function(
        "document.querySelector('#backup-integrity-results')?.getAttribute('role') === 'alert' && document.querySelector('#backup-integrity-results')?.innerText.includes('invalid response')",
        timeout=10000,
    )
    check(
        audit_page.locator('[data-act=bkexport]').count() == 0,
        'a failed backup re-inspection removes the previous export instead of allowing a stale report download',
    )
    audit_page.close()

    # A server-confirmed queue upload must not be reported as an ordinary failure when its
    # IndexedDB acknowledgement transaction aborts. The unchanged client ID must recover safely.
    acknowledgement_vendor = 'Acknowledgement Failure Vendor'
    context.set_offline(True)
    go_view(page, 'new')
    page.fill('.rv', acknowledgement_vendor)
    page.fill('.ra', '151')
    choose_cash_impact_for_current_rows()
    page.click('#nsave')
    page.wait_for_selector('#nres .ok-panel')
    ack_before = outbox_vendor_records(acknowledgement_vendor)
    check(
        len(ack_before) == 1
        and ack_before[0]['status'] == 'pending'
        and bool(ack_before[0].get('clientId')),
        'acknowledgement-failure scenario begins with one pending entry and a stable transaction ID',
    )
    ack_client_id = ack_before[0]['clientId'] if ack_before else ''

    page.evaluate(
        """() => {
          window.__failOutboxAckOnce = false;
          const nativeTransaction = IDBDatabase.prototype.transaction;
          IDBDatabase.prototype.transaction = function(storeNames, mode, options) {
            const transaction = nativeTransaction.call(this, storeNames, mode, options);
            const names = typeof storeNames === 'string' ? [storeNames] : Array.from(storeNames || []);
            if (window.__failOutboxAckOnce && mode === 'readwrite' && names.includes('outbox')) {
              window.__failOutboxAckOnce = false;
              queueMicrotask(() => {
                try { transaction.abort(); } catch {}
              });
            }
            return transaction;
          };
        }"""
    )
    acknowledgement_fault = {'injected': False}
    acknowledgement_request_client_ids = []

    def fail_ack_after_server_commit(route):
        try:
            request_data = json.loads(route.request.post_data or '{}')
        except json.JSONDecodeError:
            request_data = {}
        entries = request_data.get('entries')
        matches = (
            request_data.get('action') == 'createVouchers'
            and isinstance(entries, list)
            and any(
                isinstance(entry, dict) and entry.get('vendor') == acknowledgement_vendor
                for entry in entries
            )
        )
        if matches:
            acknowledgement_request_client_ids.append(
                [
                    entry.get('clientId')
                    for entry in entries
                    if isinstance(entry, dict) and entry.get('vendor') == acknowledgement_vendor
                ]
            )
        if not acknowledgement_fault['injected'] and matches:
            response = route.fetch()
            if response.ok:
                # Arm only after the mock server has committed the voucher; the next outbox
                # write is the browser's acknowledgement transaction, not its claim transaction.
                page.evaluate('window.__failOutboxAckOnce = true')
                acknowledgement_fault['injected'] = True
            route.fulfill(response=response)
            return
        route.continue_()

    page.route('**/api?*', fail_ack_after_server_commit)
    context.set_offline(False)
    try:
        page.wait_for_function(
            "() => document.querySelector('#banner')?.innerText.includes('could not confirm local cleanup')",
            timeout=10000,
        )
    except Exception:
        check(False, 'acknowledgement transaction fault surfaces an explicit recovery message')

    # Keep interception active through recovery so both create requests are inspected.
    ack_after_failure = outbox_vendor_records(acknowledgement_vendor)
    check(
        acknowledgement_fault['injected']
        and len(ack_after_failure) == 1
        and ack_after_failure[0]['clientId'] == ack_client_id
        and ack_after_failure[0]['status'] == 'pending',
        'post-commit IndexedDB acknowledgement failure keeps the same client ID pending',
    )
    ack_first_status = page.evaluate("() => fetch('/test-status').then((response) => response.json())")
    check(
        ack_first_status.get('acknowledgementCreateRequests') == 1,
        'acknowledgement fault is injected after exactly one server submission',
    )
    go_view(page, 'reg')
    page.wait_for_selector('#rq')
    page.click('[data-act=refresh]')
    page.wait_for_timeout(400)
    page.fill('#rq', acknowledgement_vendor)
    page.wait_for_function(
        f"Array.from(document.querySelectorAll('#rbody tr')).filter((row) => row.innerText.includes({json.dumps(acknowledgement_vendor)})).length === 1",
        timeout=10000,
    )
    check(
        page.locator('#rbody tr', has_text=acknowledgement_vendor).count() == 1,
        'server-committed voucher remains present exactly once before acknowledgement retry',
    )
    page.evaluate("window.dispatchEvent(new Event('online'))")
    ack_after_retry = {}
    ack_queue_after_retry = outbox_vendor_records(acknowledgement_vendor)
    ack_visible_rows = page.locator('#rbody tr', has_text=acknowledgement_vendor).count()
    for _ in range(50):
        ack_after_retry = page.evaluate("() => fetch('/test-status').then((response) => response.json())")
        ack_queue_after_retry = outbox_vendor_records(acknowledgement_vendor)
        ack_visible_rows = page.locator('#rbody tr', has_text=acknowledgement_vendor).count()
        if (
            not ack_queue_after_retry
            and ack_after_retry.get('acknowledgementCreateRequests') == 2
            and ack_visible_rows == 1
        ):
            break
        page.wait_for_timeout(200)

    # These assertions stay separate so a failure identifies the broken invariant rather than
    # hiding whether it was network retry, IndexedDB acknowledgement, stable IDs, or UI refresh.
    check(
        ack_after_retry.get('acknowledgementCreateRequests') == 2,
        'acknowledgement recovery resends exactly once (observed create requests: '
        + str(ack_after_retry.get('acknowledgementCreateRequests'))
        + ')',
    )
    check(
        acknowledgement_request_client_ids == [[ack_client_id], [ack_client_id]],
        'acknowledgement retry reuses the original transaction ID (observed IDs: '
        + json.dumps(acknowledgement_request_client_ids)
        + '; expected: '
        + json.dumps([[ack_client_id], [ack_client_id]])
        + ')',
    )
    check(
        not ack_queue_after_retry,
        'successful acknowledgement removes the pending local entry (remaining records: '
        + json.dumps(ack_queue_after_retry)
        + ')',
    )
    check(
        ack_visible_rows == 1,
        'register refresh settles with exactly one server-committed voucher (visible matches: '
        + str(ack_visible_rows)
        + ')',
    )
    page.unroute('**/api?*', fail_ack_after_server_commit)

    # A SESSION response during background sync must trigger sign-in, not a permanent rejection.
    # Keep the queued item bound to its original account and submit it safely after reauthentication.
    stale_session_vendor = 'Stale Session Vendor'
    context.set_offline(True)
    go_view(page, 'new')
    page.fill('.rv', stale_session_vendor)
    page.fill('.ra', '173')
    choose_cash_impact_for_current_rows()
    page.click('#nsave')
    page.wait_for_selector('#nres .ok-panel')
    session_before = outbox_vendor_records(stale_session_vendor)
    session_client_id = session_before[0]['clientId'] if session_before else ''
    check(
        len(session_before) == 1
        and session_before[0]['status'] == 'pending'
        and bool(session_client_id),
        'stale-session scenario starts with one account-bound pending entry',
    )
    context.set_offline(False)
    page.wait_for_function(
        "() => !document.querySelector('#login')?.classList.contains('hidden') && document.querySelector('#lErr')?.innerText.includes('Session expired')",
        timeout=10000,
    )
    session_after_expiry = outbox_vendor_records(stale_session_vendor)
    check(
        len(session_after_expiry) == 1
        and session_after_expiry[0]['clientId'] == session_client_id
        and session_after_expiry[0]['status'] == 'pending',
        'session expiry during sync preserves the same queue item and does not mark it failed',
    )
    # The queue diagnostic records the account key; this scenario is still bound to the manager
    # account after the earlier manager workflow. Reauthenticate that exact account, never another role.
    check(
        session_before[0]['ownerKey'].endswith('|m@test.com'),
        'stale-session queue remains bound to the manager identity that created it',
    )
    page.fill('#lEmail', 'm@test.com')
    page.fill('#lPassword', 'Manager#Final2026')
    page.click('#lBtn')
    page.wait_for_selector('#nav button', timeout=10000)
    page.evaluate("window.dispatchEvent(new Event('online'))")
    for _ in range(50):
        if not outbox_vendor_records(stale_session_vendor):
            break
        page.wait_for_timeout(200)
    session_queue_after_retry = outbox_vendor_records(stale_session_vendor)
    session_final_status = page.evaluate("() => fetch('/test-status').then((response) => response.json())")
    go_view(page, 'reg')
    page.wait_for_selector('#rq')
    page.click('[data-act=refresh]')
    page.wait_for_timeout(400)
    page.fill('#rq', stale_session_vendor)
    try:
        page.wait_for_function(
            f"Array.from(document.querySelectorAll('#rbody tr')).filter((row) => row.innerText.includes({json.dumps(stale_session_vendor)})).length === 1",
            timeout=10000,
        )
        visible_stale_rows = page.locator('#rbody tr', has_text=stale_session_vendor).count()
    except Exception:
        visible_stale_rows = page.locator('#rbody tr', has_text=stale_session_vendor).count()
        print(
            'STALE_SESSION_RECOVERY_DIAGNOSTIC:',
            json.dumps({
                'signedInName': page.locator('#userName').inner_text() if page.locator('#userName').count() else '',
                'status': session_final_status,
                'queue': session_queue_after_retry,
                'visibleRows': page.locator('#rbody tr').all_inner_texts(),
                'searchValue': page.locator('#rq').input_value() if page.locator('#rq').count() else '',
            }),
        )
        check(False, 'same-account reauthentication should synchronize and display the stale-session voucher')
    check(
        session_final_status.get('sessionExpiryResponses') == 1
        and session_final_status.get('staleSessionCreateRequests') == 2
        and session_final_status.get('staleSessionVoucherCount') == 1
        and not session_queue_after_retry
        and visible_stale_rows == 1,
        'reauthenticated same-ID retry clears the queue and creates exactly one voucher',
    )

    # Online creation can commit even if its response is lost or malformed. The same client ID
    # must be queued and retried automatically, then confirmed without a second voucher.
    def verify_online_ambiguous_save(vendor, kind):
        lost_response_fault = {'aborted_after_server_commit': False}

        def drop_browser_response_after_server_commit(route):
            try:
                request_data = json.loads(route.request.post_data or '{}')
            except json.JSONDecodeError:
                request_data = {}
            matches_vendor = any(
                isinstance(entry, dict) and entry.get('vendor') == vendor
                for entry in request_data.get('entries', [])
            ) if isinstance(request_data.get('entries'), list) else False
            if (
                kind == 'lost-response'
                and not lost_response_fault['aborted_after_server_commit']
                and request_data.get('action') == 'createVouchers'
                and matches_vendor
            ):
                # Let the server commit and return success, then abort only the browser's
                # original response. This avoids Chromium transparently replaying a dropped
                # TCP response and bypassing the application's NET recovery path.
                response = route.fetch()
                if response.ok:
                    lost_response_fault['aborted_after_server_commit'] = True
                    route.abort('failed')
                    return
                route.fulfill(response=response)
                return
            route.continue_()

        if kind == 'lost-response':
            page.route('**/api?*', drop_browser_response_after_server_commit)

        go_view(page, 'new')
        page.wait_for_selector('#nf')
        page.locator('.seg button[data-k="PAYMENT"]').click()
        page.fill('.rv', vendor)
        page.fill('.ra', '137')
        choose_cash_impact_for_current_rows()
        page.click('#nsave')
        try:
            page.wait_for_function(
                "Boolean(document.querySelector('#nres .ok-panel h2'))",
                timeout=5000,
            )
        except Exception:
            pass
        finally:
            if kind == 'lost-response':
                page.unroute('**/api?*', drop_browser_response_after_server_commit)

        # The interim "Saved on this device" panel appears first; wait for the automatic
        # same-ID retry to confirm instead of racing it.
        try:
            page.wait_for_function(
                "document.querySelector('#nres .ok-panel h2')?.innerText.includes('Saved and synchronized')",
                timeout=8000,
            )
        except Exception:
            pass

        title = (
            page.locator('#nres .ok-panel h2').inner_text()
            if page.locator('#nres .ok-panel h2').count()
            else ''
        )
        message = (
            page.locator('#nres .ok-panel p').inner_text()
            if page.locator('#nres .ok-panel p').count()
            else ''
        )
        diagnostics = page.evaluate(
            """async (vendor) => {
              const response = await fetch('/test-status');
              const server = await response.json();
              const request = indexedDB.open('cash-voucher', 1);
              const db = await new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
              });
              const records = await new Promise((resolve, reject) => {
                const read = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
                read.onsuccess = () => resolve(read.result.filter((record) => record.entry?.vendor === vendor).map((record) => ({
                  clientId: record.clientId,
                  ownerKey: record.ownerKey || '',
                  status: record.status,
                  failure: record.failure || '',
                })));
                read.onerror = () => reject(read.error);
              });
              db.close();
              return {
                server,
                url: location.href,
                heading: document.querySelector('#view .page-header h1')?.innerText || '',
                title: document.querySelector('#nres .ok-panel h2')?.innerText || '',
                result: document.querySelector('#nres')?.innerText || '',
                banner: document.querySelector('#banner')?.innerText || '',
                activeNavigation: document.querySelector('#nav [aria-current="page"]')?.dataset.v || '',
                records,
              };
            }""",
            vendor,
        )
        if 'Saved and synchronized' not in title:
            print(
                'AMBIGUOUS ONLINE SAVE DIAGNOSTIC:',
                json.dumps(diagnostics, sort_keys=True),
            )
            check(
                False,
                f'{kind} online save did not confirm same-ID recovery; title={title!r}, message={message!r}',
            )
            return

        check(
            'same transaction ID' in message and 'No duplicate voucher was created' in message,
            f'{kind} online save response recovers with an explicit same-ID confirmation',
        )

        if kind == 'lost-response':
            check(
                lost_response_fault['aborted_after_server_commit']
                and diagnostics['server'].get('onlineDropCreateRequests', 0) >= 2,
                'committed online save whose browser response was aborted is retried through the outbox',
            )
        else:
            status = diagnostics['server']
            check(
                status.get('malformedOnlineResponses') == 1
                and status.get('onlineMalformedCreateRequests', 0) >= 2,
                'committed online save with malformed JSON is retried through the outbox',
            )

        check(
            not outbox_vendor_records(vendor),
            f'{kind} online save leaves no local outbox record after server confirmation',
        )
        go_view(page, 'reg')
        page.wait_for_selector('#rq')
        page.fill('#rq', vendor)
        page.wait_for_function(
            f"Array.from(document.querySelectorAll('#rbody tr')).filter((row) => row.innerText.includes({json.dumps(vendor)})).length === 1",
            timeout=10000,
        )
        check(
            page.locator('#rbody tr', has_text=vendor).count() == 1,
            f'{kind} ambiguous online save appears exactly once in Register',
        )

    page.set_viewport_size({'width': 390, 'height': 800})
    verify_online_ambiguous_save('Direct Lost Response Vendor', 'lost-response')
    verify_online_ambiguous_save('Direct Malformed Response Vendor', 'malformed-response')

    # Finish with a full staff cash-receipt journey and verify the next-entry action preserves mode.
    go_view(page, 'new')
    page.wait_for_selector('#nf')
    click_with_draft_discard(page, page.locator('[data-k=RECEIPT]'))
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

    # Seed an unsafe legacy API value in client state to test rendering without making
    # an unsafe financial write through the server.
    click_with_draft_discard(page, page.locator('[data-k=PAYMENT]'))
    page.evaluate(
        """async (payload) => {
          const { S } = await import('/frontend/core/state.js');
          S.vouchers.push({
            id: 'xss-recent-payee-fixture',
            no: 998878,
            date: new Date().toISOString().slice(0, 10),
            vendor: payload,
            vendorId: 'xss-recent-vendor',
            paymentMethod: 'CASH',
            amount: 11,
            category: 'Other',
            notes: '',
            type: 'PAYMENT',
            status: 'ACTIVE',
            createdBy: S.me.email,
            createdAt: new Date().toISOString(),
            updatedBy: '',
            updatedAt: '',
            receipts: [],
            cancelReason: '',
            cashImpact: 'CASH_OUT',
            approvalStatus: 'NOT_REQUIRED',
            approvedBy: '',
            approvedAt: '',
            approvalReason: ''
          });
          S.vouchers.push({
            id: 'invalid-numeric-recent-payee-fixture',
            no: 998879,
            date: new Date().toISOString().slice(0, 10),
            vendor: '6777767777888(+----+;;;)',
            vendorId: '',
            paymentMethod: 'CASH',
            amount: 13,
            category: 'Other',
            notes: '',
            type: 'PAYMENT',
            status: 'ACTIVE',
            createdBy: S.me.email,
            createdAt: new Date().toISOString(),
            updatedBy: '',
            updatedAt: '',
            receipts: [],
            cancelReason: '',
            cashImpact: 'CASH_OUT',
            approvalStatus: 'NOT_REQUIRED',
            approvedBy: '',
            approvedAt: '',
            approvalReason: ''
          });
        }""",
        xss_payload,
    )
    click_with_draft_discard(page, page.locator('[data-k=PAYMENT]'))
    page.wait_for_selector('#recentVendors .vchip')
    page.locator('#recentVendors .vchip', has_text='svg onload').first.click()
    page.fill('.erow .ra', '11')
    choose_cash_impact_for_current_rows()
    page.click('#nsave')
    page.wait_for_selector('#rows .erow .row-error')
    check(
        page.locator('#recentVendors .vchip', has_text='svg onload').count() >= 1
        and not any(
            '6777767777888(+----+;;;)' in name
            for name in page.locator('#recentVendors .vchip').all_text_contents()
        )
        and '6777767777888(+----+;;;)' not in page.locator('#vlist option').evaluate_all(
            "options => options.map(option => option.value)"
        )
        and page.locator('#recentVendors svg, #recentVendors img').count() == 0
        and page.locator('#rows .erow .row-error').inner_text().startswith('Possible duplicate')
        and page.locator('#rows svg:not(.i), #rows img').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'legacy payee names remain inert in recent-payee chips and duplicate warnings',
    )
    page.evaluate(
        """async () => {
          const { S } = await import('/frontend/core/state.js');
          S.vouchers = (S.vouchers || []).filter(
            (item) =>
              !['xss-recent-payee-fixture', 'invalid-numeric-recent-payee-fixture'].includes(item.id)
          );
        }"""
    )

    go_view(page, 'dash')
    page.wait_for_selector('#view .needs')
    check(
        'svg onload' not in page.locator('#view .needs').inner_text()
        and page.locator('#view .needs img').count() == 0
        and page.locator('#view .needs svg:not(.i)').count() == 0
        and not page.evaluate('window.__xssFired === true'),
        'needs-attention panel renders static text only and stays inert with hostile payee data',
    )
    denied_page_states = page.evaluate(
        """async () => {
          const { S } = await import('/frontend/core/state.js');
          const { pageNotice } = await import('/frontend/core/ui.js');
          const { createReports } = await import('/frontend/features/reports.js');
          const { createCashClose } = await import('/frontend/features/cash-close.js');
          const originalPermissions = { ...S.me.perms };
          const payload = '<svg onload=window.__xssFired=true></svg><img src=x onerror=window.__xssFired=true>';
          const results = {};
          try {
            document.querySelector('#view').replaceChildren(
              pageNotice(payload, payload, { panelClass: 'card', role: 'status' }),
            );
            results.helper = {
              heading: document.querySelector('#view h1')?.textContent || '',
              message: document.querySelector('#view p')?.textContent || '',
              hasActiveMarkup: Boolean(document.querySelector('#view img, #view svg')),
            };

            S.me.perms.reports = false;
            createReports({ api: async () => ({}) }).render();
            results.reports = {
              heading: document.querySelector('#view h1')?.textContent || '',
              message: document.querySelector('#view p')?.textContent || '',
              hasCard: Boolean(document.querySelector('#view .card')),
              hasActiveMarkup: Boolean(document.querySelector('#view img, #view svg')),
            };

            S.me.perms.cashClose = false;
            createCashClose({ api: async () => ({}) }).render();
            const status = document.querySelector('#view [role=status]');
            results.cashClose = {
              heading: document.querySelector('#view h1')?.textContent || '',
              message: status?.textContent || '',
              className: status?.className || '',
              hasActiveMarkup: Boolean(document.querySelector('#view img, #view svg')),
            };
            results.scriptEffect = window.__xssFired === true;
            return results;
          } finally {
            Object.assign(S.me.perms, originalPermissions);
          }
        }"""
    )
    check(
        denied_page_states['helper']['heading']
        == '<svg onload=window.__xssFired=true></svg><img src=x onerror=window.__xssFired=true>'
        and denied_page_states['helper']['message']
        == denied_page_states['helper']['heading']
        and not denied_page_states['helper']['hasActiveMarkup']
        and not denied_page_states['scriptEffect'],
        'shared page-notice renderer keeps hostile title and message payloads inert',
    )
    check(
        denied_page_states['reports']['heading'] == 'Recorded Movement Report'
        and denied_page_states['reports']['message'] == 'Reports are unavailable for this account.'
        and denied_page_states['reports']['hasCard']
        and not denied_page_states['reports']['hasActiveMarkup'],
        'Reports permission-denied state uses safe DOM construction with its card layout',
    )
    check(
        denied_page_states['cashClose']['heading'] == 'Daily Cash Close'
        and denied_page_states['cashClose']['message']
        == 'This feature is available to owners and managers.'
        and denied_page_states['cashClose']['className'] == 'muted'
        and not denied_page_states['cashClose']['hasActiveMarkup'],
        'Cash Close permission-denied state preserves its status message and semantics',
    )
    go_view(page, 'dash')

    account_dom_result = page.evaluate(
        """async () => {
          const { S } = await import('/frontend/core/state.js');
          const { createAdministration } = await import('/frontend/features/administration.js');
          const originalMe = S.me;
          const originalSettings = S.settings;
          const payload = '<svg onload=window.__xssFired=true></svg><img src=x onerror=window.__xssFired=true>';
          try {
            S.me = { ...originalMe, name: payload, email: payload, role: payload };
            S.settings = { ...originalSettings, propertyName: payload };
            createAdministration({ api: async () => ({}), getNavigation: () => ({}), signOut: () => {} }).account();
            const view = document.querySelector('#view');
            return {
              name: view.querySelector('.profile-main h2')?.textContent || '',
              email: view.querySelector('.profile-main p')?.textContent || '',
              role: view.querySelector('.profile-main .badge')?.textContent || '',
              property: view.querySelector('.profile-main .muted')?.textContent || '',
              hasActiveMarkup: Boolean(view.querySelector('img, svg')),
              hasSignOut: view.querySelector('[data-act=signout]')?.textContent === 'Sign out',
              hasCurrentPin: Boolean(view.querySelector('#pf #po[aria-label="Current password"][autocomplete="current-password"]')),
              hasNewPin: Boolean(view.querySelector('#pf #pn[aria-label="New password"][autocomplete="new-password"]')),
              hasSubmit: view.querySelector('#pf button[type=submit]')?.textContent === 'Change password',
              scriptEffect: window.__xssFired === true
            };
          } finally {
            S.me = originalMe;
            S.settings = originalSettings;
          }
        }"""
    )
    check(
        account_dom_result['name'] == '<svg onload=window.__xssFired=true></svg><img src=x onerror=window.__xssFired=true>'
        and account_dom_result['email'] == account_dom_result['name']
        and account_dom_result['role'] == account_dom_result['name']
        and account_dom_result['property'] == account_dom_result['name']
        and not account_dom_result['hasActiveMarkup']
        and not account_dom_result['scriptEffect'],
        'My Account treats hostile profile and property values as inert text',
    )
    check(
        account_dom_result['hasSignOut']
        and account_dom_result['hasCurrentPin']
        and account_dom_result['hasNewPin']
        and account_dom_result['hasSubmit'],
        'My Account preserves sign-out and Change password controls after DOM rendering',
    )
    go_view(page, 'dash')

    check(
        not csp_violations,
        'CSP does not block required assets, scripts, or API requests during browser workflows',
    )
    browser.close()

print(f'e2e: {ok} checks passed, {len(errs)} failed')
raise SystemExit(1 if errs else 0)
