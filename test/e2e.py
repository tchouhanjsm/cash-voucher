import base64
import datetime
import os
import urllib.parse

from playwright.sync_api import sync_playwright

BASE = os.environ.get('E2E_BASE', 'http://127.0.0.1:8765').rstrip('/')
API = BASE + '/api'
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
    page.fill('#op', '483921')
    page.fill('#np', '579246')
    page.click('.mcard .primary')
    page.wait_for_selector('#nav button')
    check(page.locator('#nav button').count() == 8, 'owner sees 8 nav items')

    page.click('[data-v=users]')
    page.wait_for_selector('#uf')
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

    page.click('[data-v=set]')
    page.wait_for_selector('#aud tr')
    page.fill('#sn', 'Hotel Test')
    page.fill('#sa', '1 Fort Road')
    page.click('#sf .primary')
    page.wait_for_timeout(400)
    check(page.locator('#brand').inner_text() == 'Hotel Test', 'settings saved')

    page.click('[data-v=acct]')
    page.click('[data-act=signout]')
    page.wait_for_selector('#loginForm')

    def login(email, pin):
        page.fill('#lEmail', email)
        page.fill('#lPin', pin)
        page.click('#lBtn')

    login('s@test.com', '135790')
    page.wait_for_selector('#op')
    page.fill('#op', '135790')
    page.fill('#np', '975310')
    page.click('.mcard .primary')
    page.wait_for_selector('#nav button')
    check(page.locator('#nav button').count() == 4, 'staff sees 4 nav items (dash,new,reg,acct)')

    page.click('[data-v=new]')
    page.wait_for_selector('#nf')
    page.fill('.rv', 'Ram Traders')
    page.fill('.ra', '1,250.50')
    page.select_option('.rc', 'Kitchen')
    with open('/tmp/r.png', 'wb') as image_file:
        image_file.write(png)
    page.set_input_files('.rf', '/tmp/r.png')
    page.wait_for_selector('.thumb')
    page.press('.ra', 'Enter')
    check(page.locator('.erow').count() == 2, 'enter adds row')
    page.locator('.rv').nth(1).fill('Shiv Gas')
    page.locator('.ra').nth(1).fill('900')
    page.click('#nsave')
    page.wait_for_selector('.ok-panel')
    check('Saved 2 payments' in page.inner_text('#nres'), 'saved 2 payments')

    page.click('[data-v=reg]')
    page.wait_for_selector('#rbody tr')
    check(page.locator('#rbody tr').count() == 2, 'staff register 2 rows')
    check(
        page.locator('[data-act=edit]').count() == 0 and page.locator('[data-act=cancel]').count() == 0,
        'staff has no edit/cancel',
    )

    page.locator('#rbody tr', has_text='Ram Traders').locator('[data-act=rec]').click()
    page.wait_for_selector('.rimg')
    check(page.locator('.rimg').count() >= 1, 'receipt viewable')
    page.click('[data-x]')

    page.locator('[data-act=print]').first.evaluate("window.print = () => {}")
    page.locator('[data-act=print]').first.click()
    page.wait_for_timeout(200)
    print_text = page.locator('#printArea').inner_text()
    check('Rupees' in print_text, 'print has words')

    context.set_offline(True)
    page.click('[data-v=new]')
    page.fill('.rv', 'Offline Vendor')
    page.fill('.ra', '75')
    page.click('#nsave')
    page.wait_for_selector('.ok-panel')
    check('Saved on this device' in page.inner_text('#nres'), 'offline queued')
    check(not page.locator('#banner').is_hidden(), 'banner shown')

    context.set_offline(False)
    page.wait_for_function(
        "document.querySelector('#banner').classList.contains('hidden')",
        timeout=8000,
    )
    page.click('[data-v=reg]')
    page.wait_for_timeout(500)
    page.click('[data-act=refresh]')
    page.wait_for_timeout(500)
    check(page.locator('#rbody tr').count() == 3, 'offline entry synced')

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
        f'{date_text}\tOdd Cat\t40\tNonsense\t'
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

    browser.close()

print(f'e2e: {ok} checks passed, {len(errs)} failed')
raise SystemExit(1 if errs else 0)
