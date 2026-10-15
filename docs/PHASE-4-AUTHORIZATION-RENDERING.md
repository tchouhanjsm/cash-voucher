# Phase 4 — Authorization and Rendering Assurance

**Base:** main after PR #132, \`8169cd69cba1251121cc018683c2978a360c037c\`  
**Batch:** PR #133, one security-assurance outcome across backend role enforcement, information visibility and active frontend DOM-sink governance.  
**Verification boundary:** automated tests use the Apps Script mock and Playwright against the local mock API; no live production Google account or deployment is accessed.

## Outcome

Prove that authenticated roles receive only the documented API capabilities and data visibility, and make future dynamic HTML sink growth trigger review rather than pass silently.

## Authorization acceptance matrix

| Capability / API action | Staff | Manager | Owner | Accountant |
|---|---|---|---|---|
| Bootstrap | Own records/profile | All records | All records | Report-only shell; no register/vendor directory |
| Create voucher | Yes | Yes | Yes | No |
| Bulk create | No | Yes | Yes | No |
| Edit / cancel voucher | No | Yes | Yes | No |
| Approve / reject high-value payment | No | Yes, independent actor | Yes, independent actor | No |
| Attach/read receipt | Own vouchers only | All vouchers | All vouchers | No |
| Vendor directory mutations | No | Yes | Yes | No |
| User list/create/reset | No | No | Yes | No |
| Property settings, quality scan, backup status/integrity | No | No | Yes | No |
| Audit log | No | No | Yes | No |
| Recorded movement report | No | Yes | Yes | Yes |
| Daily Cash Close / corrections | No | Yes | Yes | No |
| Change own PIN / logout | Yes | Yes | Yes | Yes |

The automated test asserts the exact \`PERMS\` contract and checks protected API actions against every role with authenticated tokens. Allowed requests are given safe invalid payloads when needed so the handler's authorization guard can be tested without performing a financial mutation. Receipt actions additionally use real mock voucher ownership to prove own-versus-foreign access.

## Data-visibility assertions

- Staff bootstrap includes only vouchers created under that staff identity and returns no opening cash balance or other staff names.
- A second staff identity cannot see the first staff identity's vouchers or receipt endpoints.
- Manager and owner can see the tested staff records and the configured opening balance.
- Accountant sees an empty register/vendor list, no opening cash balance, and only their own identity label; the recorded-movement report endpoint remains available.
- Reports must not weaken the underlying receipt/register endpoints or the separate owner-only data-quality, backup and audit surfaces.

## DOM-sink assurance

\`scripts/check-dom-sinks.js\` checks the current frontend JavaScript source against \`scripts/dom-sink-baseline.json\`. Any count drift, newly introduced sink file, or use of the separately disallowed APIs fails \`npm run check\` until the source is reviewed and a targeted regression is added.

The sink baseline is a change detector, not a proof that each interpolated value is safe. The existing adversarial Browser E2E suite plus review of each modified rendering context remain required.

## Out of scope / release gates

- No live Apps Script Web App permissions, Sheets access, Drive receipt access or deployed version is tested.
- No production setup, migration, data mutation, backup execution or restore is performed.
- Physical phone/tablet PWA and assistive-technology review remain pending.
- The test matrix is not a complete penetration test; every future action or role requires review when it is added.
