<?php

declare(strict_types=1);

namespace App\Modules\Operations\Actions;

use App\Modules\Settings\Actions\PropertySettings;
use CashVoucher\Api\Financial\AuditWriter;
use CashVoucher\Api\Support\ApiException;
use CashVoucher\Api\Support\Uuid;
use DateTimeImmutable;
use DateTimeZone;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use PDO;
use Throwable;

final class OperationsService
{
    private const STAGING_STEPS = [
        'loginAndRoles' => 'Verify log-in and role-specific access.',
        'voucherAndReceipt' => 'Create, view and validate a voucher with its receipt.',
        'highValueApproval' => 'Verify the high-value approval workflow.',
        'cashClose' => 'Complete a daily cash close with reconciliation.',
        'offlineSync' => 'Verify offline queue replay and uncertain-outcome handling.',
        'restoreDrill' => 'Perform and record an independent restore drill.',
        'ownerUatSignoff' => 'Record owner UAT acceptance.',
    ];

    private const PRODUCTION_STEPS = [
        'productionTargetMatch' => 'Verify the production target identity.',
        'serverReadiness' => 'Verify all production server readiness checks.',
        'restoreDrill' => 'Perform and record an independent restore drill.',
        'offlineLimitations' => 'Confirm staff understand offline and retry limitations.',
        'ownerAcceptance' => 'Record owner production acceptance.',
    ];

    private const MANUAL_STEPS = [
        'loginAndRoles', 'voucherAndReceipt', 'highValueApproval', 'cashClose',
        'offlineSync', 'restoreDrill', 'ownerUatSignoff', 'offlineLimitations',
        'ownerAcceptance',
    ];

    private const REQUIRED_SCHEMA = '0009';
    private const SUPPORT_USER_LIMIT = 5;
    private const SUPPORT_USER_WINDOW = 3600;
    private const SUPPORT_WORKSPACE_LIMIT = 20;
    private const SUPPORT_WORKSPACE_WINDOW = 21600;

    public function __construct(private readonly PropertySettings $settings)
    {
    }

    /** Mirror of the Apps Script backup status markers; absent markers remain explicit. */
    public function backupStatus(): array
    {
        $manifests = $this->backupManifests();
        $latest = $manifests[0]['manifest'] ?? [];
        $configured = getenv('CV_BACKUP_SCHEDULER_ENABLED') === 'true'
            || getenv('CV_BACKUP_ENABLED') === 'true'
            || $manifests !== [];

        $lastAttempt = $this->timestamp(getenv('CV_BACKUP_LAST_ATTEMPT') ?: ($latest['generatedAtUtc'] ?? ''));
        $lastSuccess = $this->timestamp(getenv('CV_BACKUP_LAST_SUCCESS') ?: (($latest['status'] ?? '') === 'success' ? ($latest['generatedAtUtc'] ?? '') : ''));
        $lastError = $this->cleanText(getenv('CV_BACKUP_LAST_ERROR') ?: ($latest['lastError'] ?? ''), 300);
        $lastAlertError = $this->cleanText(getenv('CV_BACKUP_LAST_ALERT_ERROR') ?: '', 300);
        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $successDate = $lastSuccess === '' ? null : new DateTimeImmutable($lastSuccess);
        $attemptDate = $lastAttempt === '' ? null : new DateTimeImmutable($lastAttempt);
        $canonicalSuccess = $lastSuccess !== '';
        $canonicalAttempt = $lastAttempt !== '';
        $successInFuture = $successDate !== null && $successDate > $now;
        $attemptAfterSuccess = $attemptDate !== null && $successDate !== null && $attemptDate > $successDate;
        $ageHours = $successDate === null ? null : max(0, (int) floor(($now->getTimestamp() - $successDate->getTimestamp()) / 3600));
        $fresh = $ageHours !== null && $ageHours <= 36 && ! $successInFuture;
        $issues = [];
        if ($lastSuccess !== '' && ! $canonicalSuccess) $issues[] = 'SUCCESS_TIMESTAMP_INVALID';
        if ($lastAttempt !== '' && ! $canonicalAttempt) $issues[] = 'ATTEMPT_TIMESTAMP_INVALID';
        if ($successInFuture) $issues[] = 'SUCCESS_TIMESTAMP_IN_FUTURE';
        if ($attemptAfterSuccess) $issues[] = 'ATTEMPT_AFTER_SUCCESS';
        if ($lastError !== '') $issues[] = 'BACKUP_FAILURE_RECORDED';

        $metrics = [];
        $rawMetrics = getenv('CV_BACKUP_LAST_SUCCESS_METRICS') ?: '';
        if ($rawMetrics !== '') {
            try {
                $decoded = json_decode($rawMetrics, true, 16, JSON_THROW_ON_ERROR);
                if (is_array($decoded) && ($decoded['completedAt'] ?? null) === $lastSuccess) $metrics = $decoded;
            } catch (Throwable) {
                $metrics = [];
            }
        }
        $duration = $this->nonNegativeNumber($metrics['durationMs'] ?? null);
        $receiptCount = $this->nonNegativeNumber($metrics['receiptCount'] ?? null);
        $receiptBytesKnown = ($metrics['receiptBytesKnown'] ?? false) === true
            && $this->nonNegativeNumber($metrics['receiptBytes'] ?? null) !== null;
        $receiptBytes = $receiptBytesKnown ? $this->nonNegativeNumber($metrics['receiptBytes']) : null;

        $state = ! $configured ? 'not_configured'
            : ($lastError !== '' ? 'failed'
                : (! $canonicalSuccess && ! $canonicalAttempt ? 'never_run'
                    : ((! $canonicalSuccess || ! $canonicalAttempt || $successInFuture || $attemptAfterSuccess) ? 'incomplete' : 'success')));

        return [
            'configured' => $configured,
            'state' => $state,
            'retentionDays' => $this->positiveEnvInteger('CV_BACKUP_RETENTION_DAYS', 30, 3650),
            'lastAttempt' => $lastAttempt,
            'lastSuccess' => $lastSuccess,
            'lastSuccessTimestampCanonical' => $canonicalSuccess,
            'lastAttemptTimestampCanonical' => $canonicalAttempt,
            'successInFuture' => $successInFuture,
            'attemptAfterSuccess' => $attemptAfterSuccess,
            'successAgeHours' => $ageHours,
            'freshWithin36Hours' => $fresh,
            'markerIssues' => $issues,
            'lastError' => $lastError,
            'lastAlertError' => $lastAlertError,
            'lastSuccessDurationMs' => $duration,
            'lastSuccessReceiptCount' => $receiptCount,
            'lastSuccessReceiptBytesKnown' => $receiptBytesKnown,
            'lastSuccessReceiptBytes' => $receiptBytes,
        ];
    }

    /**
     * Structural inspection only. This never claims a backup has been restored.
     *
     * @return array<string,mixed>
     */
    public function backupIntegrityReport(): array
    {
        $manifests = array_slice($this->backupManifests(), 0, 10);
        $snapshots = [];
        foreach ($manifests as $item) {
            $manifest = $item['manifest'];
            $checks = [];
            $files = $manifest['files'] ?? null;
            $validManifest = ($manifest['schemaVersion'] ?? null) === 1 && is_array($files);
            $checks[] = [
                'code' => 'MANIFEST',
                'state' => $validManifest ? 'pass' : 'fail',
                'detail' => $validManifest ? 'Backup manifest schema and file list are readable.' : 'Backup manifest schema or file list is invalid.',
            ];
            $verified = 0;
            $failed = 0;
            if ($validManifest) {
                foreach (array_slice($files, 0, 500) as $file) {
                    $path = $file['path'] ?? null;
                    $passed = false;
                    if (
                        is_string($path) && $path !== '' && ! str_starts_with($path, '/')
                        && ! str_contains($path, '..') && ! str_contains($path, '\\')
                        && is_int($file['byteSize'] ?? null) && $file['byteSize'] >= 0
                        && is_string($file['sha256'] ?? null) && preg_match('/^[a-f0-9]{64}$/D', $file['sha256'])
                    ) {
                        try {
                            $disk = Storage::disk('private');
                            if ($disk->exists($path)) {
                                $bytes = $disk->get($path);
                                $passed = strlen($bytes) === $file['byteSize']
                                    && hash_equals($file['sha256'], hash('sha256', $bytes));
                            }
                        } catch (Throwable) {
                            $passed = false;
                        }
                    }
                    if ($passed) $verified++;
                    else $failed++;
                }
            }
            $checks[] = [
                'code' => 'BACKUP_FILES',
                'state' => $failed === 0 && $validManifest ? 'pass' : 'fail',
                'detail' => $verified.' of '.($validManifest ? count($files) : 0).' files match their manifest byte size and SHA-256.',
            ];
            $state = $failed > 0 || ! $validManifest ? 'fail' : 'pass';
            $snapshots[] = [
                'name' => basename(dirname($item['path'])),
                'createdAt' => (string) ($manifest['generatedAtUtc'] ?? ''),
                'state' => $state,
                'checks' => $checks,
                'rowCounts' => is_array($manifest['rowCounts'] ?? null) ? $manifest['rowCounts'] : [],
                'receiptCount' => (int) ($manifest['receiptCount'] ?? 0),
                'manifestCount' => count($files ?: []),
            ];
        }

        return [
            'generatedAt' => gmdate('Y-m-d\TH:i:s\Z'),
            'inspected' => count($snapshots),
            'limit' => 10,
            'passCount' => count(array_filter($snapshots, static fn (array $s): bool => $s['state'] === 'pass')),
            'warningCount' => count(array_filter($snapshots, static fn (array $s): bool => $s['state'] === 'warning')),
            'failCount' => count(array_filter($snapshots, static fn (array $s): bool => $s['state'] === 'fail')),
            'snapshots' => $snapshots,
            'note' => 'Structural inspection only. A successful report does not prove a restore will succeed; restore into a separate recovery destination and validate it.',
        ];
    }

    /** @return array<string,mixed> */
    public function deploymentReadiness(PDO $pdo): array
    {
        $environment = $this->environment();
        $databaseReachable = false;
        try {
            $pdo->query('SELECT 1')->fetchColumn();
            $databaseReachable = true;
        } catch (Throwable) {
            $databaseReachable = false;
        }
        $schema = $this->latestSchema($pdo);
        $property = $this->settings->show($pdo);
        $accounts = $this->accountReadiness($pdo);
        $storage = $this->privateStorageProbe();
        $backupScheduler = getenv('CV_BACKUP_SCHEDULER_ENABLED') === 'true';
        $deploymentIdentity = $this->deploymentIdentityMatches($environment);
        $debug = filter_var(getenv('APP_DEBUG') ?: 'false', FILTER_VALIDATE_BOOLEAN);
        $checks = [
            'environmentConfigured' => ['passed' => in_array($environment, ['staging', 'production'], true), 'value' => $environment],
            'databaseReachable' => ['passed' => $databaseReachable],
            'schemaCurrent' => ['passed' => $schema === self::REQUIRED_SCHEMA, 'schemaVersion' => $schema],
            'propertyConfigured' => [
                'passed' => is_string($property['propertyName'] ?? null)
                    && trim($property['propertyName']) !== ''
                    && trim($property['propertyName']) !== 'My Property'
                    && is_array($property['categories'] ?? null)
                    && $property['categories'] !== [],
            ],
            'accountsReady' => ['passed' => $accounts['ownerReady'] && $accounts['managerReady'] && $accounts['staffReady']],
            'privateStorageWritable' => ['passed' => $storage],
            'backupSchedulerConfigured' => ['passed' => $backupScheduler],
            'deploymentIdentityMatched' => ['passed' => $deploymentIdentity],
            'debugDisabled' => ['passed' => $environment !== 'production' || ! $debug],
        ];
        $blockers = [];
        foreach ($checks as $id => $check) {
            if (! $check['passed']) $blockers[] = ['id' => $id, 'message' => $this->readinessMessage($id)];
        }

        return [
            'environment' => $environment,
            'ready' => $blockers === [],
            'checks' => $checks,
            'blockers' => $blockers,
            'warnings' => [[
                'code' => 'RESTORE_DRILL_REQUIRED',
                'message' => 'Backup manifest and checksum inspection is not proof of a successful restore.',
            ]],
        ];
    }

    /** @return array<string,mixed> */
    public function dataQualityReport(PDO $pdo): array
    {
        $total = (int) $pdo->query('SELECT COUNT(*) FROM vouchers')->fetchColumn();
        $query = $pdo->query(
            'SELECT id, voucher_type, voucher_number, business_date, vendor_name_snapshot,
                    amount_paise, category, status, cash_impact, created_by_user_id,
                    created_by_email_snapshot, client_id
             FROM vouchers ORDER BY business_date DESC, id DESC LIMIT 5001'
        );
        $rows = $query->fetchAll(PDO::FETCH_ASSOC);
        $limited = count($rows) > 5000;
        if ($limited) $rows = array_slice($rows, 0, 5000);

        $issues = [];
        $numberSeen = [];
        $clientSeen = [];
        $add = static function (array &$issues, array $row, string $field, string $code, string $message, string $severity = 'warning'): void {
            if (count($issues) >= 500) return;
            $issues[] = [
                'severity' => $severity,
                'code' => $code,
                'sourceRow' => null,
                'voucherId' => (string) $row['id'],
                'voucherNo' => (string) $row['voucher_number'],
                'date' => (string) $row['business_date'],
                'type' => (string) $row['voucher_type'],
                'field' => $field,
                'message' => $message,
            ];
        };

        foreach ($rows as $row) {
            $type = (string) $row['voucher_type'];
            $number = trim((string) $row['voucher_number']);
            $numberKey = $type.':'.$number;
            if (! preg_match('/^[0-9]+$/D', $number) || (int) $number < 1) {
                $add($issues, $row, 'voucherNo', 'VOUCHER_NUMBER_INVALID', 'Voucher number must be a positive integer.', 'error');
            } elseif (isset($numberSeen[$numberKey])) {
                $add($issues, $row, 'voucherNo', 'VOUCHER_NUMBER_DUPLICATE', 'Voucher number is duplicated within this voucher type.', 'error');
            } else {
                $numberSeen[$numberKey] = true;
            }
            $date = (string) $row['business_date'];
            if (! preg_match('/^\d{4}-\d{2}-\d{2}$/D', $date) || ! $this->isCalendarDate($date)) {
                $add($issues, $row, 'date', 'DATE_INVALID', 'Voucher date is missing or outside the supported date range.', 'error');
            }
            if (trim((string) $row['vendor_name_snapshot']) === '') {
                $add($issues, $row, 'vendor', 'VENDOR_MISSING', 'Counterparty/vendor snapshot is missing.');
            }
            if ((int) $row['amount_paise'] <= 0) {
                $add($issues, $row, 'amount', 'AMOUNT_INVALID', 'Amount must be positive.', 'error');
            }
            if (trim((string) $row['category']) === '') {
                $add($issues, $row, 'category', 'CATEGORY_MISSING', 'Category is missing.');
            }
            if (! in_array((string) $row['voucher_type'], ['PAYMENT', 'RECEIPT'], true)) {
                $add($issues, $row, 'type', 'TYPE_INVALID', 'Voucher type is invalid.', 'error');
            }
            if (! in_array((string) $row['status'], ['ACTIVE', 'CANCELLED'], true)) {
                $add($issues, $row, 'status', 'STATUS_INVALID', 'Voucher status is not recognized.', 'error');
            }
            if (! in_array((string) $row['cash_impact'], ['CASH_IN', 'CASH_OUT', 'NO_CASH', 'UNCLASSIFIED'], true)) {
                $add($issues, $row, 'cashImpact', 'CASH_IMPACT_INVALID', 'Cash impact is not recognized.', 'error');
            }
            if ($row['created_by_user_id'] === null && trim((string) $row['created_by_email_snapshot']) === '') {
                $add($issues, $row, 'createdBy', 'CREATOR_MISSING', 'Creator attribution is missing.');
            }
            $clientId = trim((string) ($row['client_id'] ?? ''));
            if ($clientId !== '') {
                if (isset($clientSeen[$clientId])) {
                    $add($issues, $row, 'clientId', 'CLIENT_ID_DUPLICATE', 'Client ID is associated with more than one voucher.', 'error');
                } else {
                    $clientSeen[$clientId] = true;
                }
            }
        }
        $errors = count(array_filter($issues, static fn (array $issue): bool => $issue['severity'] === 'error'));
        $warnings = count($issues) - $errors;

        return [
            'generatedAt' => gmdate('Y-m-d\TH:i:s\Z'),
            'scanned' => count($rows),
            'issueCount' => $errors + $warnings,
            'errors' => $errors,
            'warnings' => $warnings,
            'truncated' => $limited || ($total > count($rows)),
            'issues' => $issues,
        ];
    }

    /** @return array<string,mixed> */
    public function onboardingState(PDO $pdo, string $environment, ?string $clientDeploymentId): array
    {
        $this->assertOnboardingIdentity($environment, $clientDeploymentId);
        return $this->visibleOnboardingState($pdo, $environment);
    }

    /** @param array<string,mixed> $principal @param array<string,mixed> $input @return array<string,mixed> */
    public function onboardingConfirm(PDO $pdo, array $principal, array $input): array
    {
        $environment = (string) $input['environment'];
        $this->assertOnboardingIdentity($environment, isset($input['deploymentId']) ? (string) $input['deploymentId'] : null);
        $pdo->beginTransaction();
        try {
            $state = $this->readOnboardingState($pdo, $environment, true);
            $steps = $environment === 'staging' ? self::STAGING_STEPS : self::PRODUCTION_STEPS;
            $stepId = (string) $input['stepId'];
            if (! in_array($state['stage'], ['stagingUat', 'productionAcceptance'], true)
                || ! isset($steps[$stepId]) || ! in_array($stepId, self::MANUAL_STEPS, true)) {
                throw new ApiException(409, 'ONBOARDING_ORDER', 'That manual step is not available in the current stage.');
            }
            $evidence = $this->cleanText($input['evidence'], 500);
            if (mb_strlen($evidence, 'UTF-8') < 12) {
                throw new ApiException(422, 'VALIDATION', 'Evidence note must contain at least 12 characters.');
            }
            $status = (string) $input['status'];
            $ids = array_keys($steps);
            $index = array_search($stepId, $ids, true);
            $checks = $this->technicalChecks($pdo, $environment);
            for ($i = 0; $i < $index; $i++) {
                $prior = $ids[$i];
                if (in_array($prior, self::MANUAL_STEPS, true)) {
                    if (($state['confirmations'][$prior]['status'] ?? '') !== 'pass') {
                        throw new ApiException(409, 'ONBOARDING_ORDER', 'Complete the previous onboarding step first.');
                    }
                } elseif (($checks[$prior]['status'] ?? '') !== 'pass') {
                    throw new ApiException(409, 'ONBOARDING_ORDER', 'Resolve the earlier automatic prerequisite first.');
                }
            }

            $now = gmdate('Y-m-d\TH:i:s\Z');
            $state['confirmations'][$stepId] = [
                'status' => $status,
                'evidence' => $evidence,
                'actorEmail' => (string) $principal['email'],
                'actorRole' => (string) $principal['role'],
                'completedAt' => $now,
            ];
            foreach (array_slice($ids, $index + 1) as $later) unset($state['confirmations'][$later]);
            $state['updatedAt'] = $now;
            $this->saveOnboardingState($pdo, $environment, $state, (string) $principal['id']);
            AuditWriter::append($pdo, (string) $principal['id'], (string) $principal['email'], [
                'eventType' => 'ONBOARDING_CONFIRM',
                'targetType' => 'onboarding',
                'targetId' => $environment,
                'reason' => $status.': '.$stepId.' — '.mb_substr($evidence, 0, 220, 'UTF-8'),
            ]);
            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $exception;
        }
        return $this->visibleOnboardingState($pdo, $environment);
    }

    /** @param array<string,mixed> $principal @return array<string,mixed> */
    public function onboardingAdvance(PDO $pdo, array $principal, string $environment, ?string $clientDeploymentId): array
    {
        $this->assertOnboardingIdentity($environment, $clientDeploymentId);
        $pdo->beginTransaction();
        try {
            $state = $this->readOnboardingState($pdo, $environment, true);
            $visible = $this->visibleOnboardingState($pdo, $environment);
            if (! $visible['stageReady']) {
                throw new ApiException(409, 'ONBOARDING_BLOCKED', 'This stage still has blockers. Complete every requirement before advancing.');
            }
            if ($state['stage'] === 'preflight') {
                $state['stage'] = $environment === 'staging' ? 'stagingUat' : 'productionAcceptance';
            } elseif (in_array($state['stage'], ['stagingUat', 'productionAcceptance'], true)) {
                $state['stage'] = 'complete';
            } else {
                throw new ApiException(409, 'ONBOARDING_COMPLETE', 'Onboarding is already complete.');
            }
            $state['updatedAt'] = gmdate('Y-m-d\TH:i:s\Z');
            $this->saveOnboardingState($pdo, $environment, $state, (string) $principal['id']);
            AuditWriter::append($pdo, (string) $principal['id'], (string) $principal['email'], [
                'eventType' => 'ONBOARDING_ADVANCE',
                'targetType' => 'onboarding',
                'targetId' => $environment,
                'reason' => 'Stage advanced to '.$state['stage'],
            ]);
            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $exception;
        }
        return $this->visibleOnboardingState($pdo, $environment);
    }

    /** @param array<string,mixed> $principal @param array<string,mixed> $input @return array<string,mixed> */
    public function reportIssue(PDO $pdo, array $principal, array $input): array
    {
        $to = trim((string) (getenv('SUPPORT_EMAIL') ?: ''));
        if (! filter_var($to, FILTER_VALIDATE_EMAIL)) {
            throw new ApiException(503, 'SUPPORT_NOT_CONFIGURED', 'Problem reports are not configured for this workspace yet.');
        }
        $categories = ['bug' => 'Bug', 'question' => 'Question', 'feature' => 'Suggestion', 'other' => 'Other'];
        $categoryKey = isset($categories[$input['category'] ?? '']) ? (string) $input['category'] : 'bug';
        $subject = preg_replace('/[\r\n]+/u', ' ', $this->cleanText($input['subject'] ?? '', 100)) ?? '';
        $message = $this->cleanText($input['message'] ?? '', 2000);
        $context = preg_replace('/[\r\n]+/u', ' ', $this->cleanText($input['context'] ?? '', 300)) ?? '';
        if (mb_strlen($subject, 'UTF-8') < 3 || mb_strlen($message, 'UTF-8') < 10) {
            throw new ApiException(422, 'VALIDATION', 'Enter a short subject and describe the issue in at least 10 characters.');
        }
        $environment = (string) ($input['environment'] ?? $this->environment());
        if (! in_array($environment, ['staging', 'production'], true)) $environment = 'unknown';

        $userKey = hash('sha256', 'user:'.(string) $principal['id']);
        $workspaceKey = hash('sha256', 'workspace:cash-voucher');
        $pdo->beginTransaction();
        try {
            foreach ([[$userKey, self::SUPPORT_USER_LIMIT, self::SUPPORT_USER_WINDOW], [$workspaceKey, self::SUPPORT_WORKSPACE_LIMIT, self::SUPPORT_WORKSPACE_WINDOW]] as [$key, $limit, $window]) {
                $pdo->prepare('INSERT IGNORE INTO support_issue_rate_limits (scope_key, window_started_at_utc, attempt_count, updated_at_utc) VALUES (:key, UTC_TIMESTAMP(6), 0, UTC_TIMESTAMP(6))')->execute(['key' => $key]);
                $q = $pdo->prepare('SELECT window_started_at_utc, attempt_count FROM support_issue_rate_limits WHERE scope_key = :key LIMIT 1 FOR UPDATE');
                $q->execute(['key' => $key]);
                $row = $q->fetch(PDO::FETCH_ASSOC);
                $elapsed = time() - strtotime((string) $row['window_started_at_utc']);
                $used = $elapsed >= $window ? 0 : (int) $row['attempt_count'];
                if ($used >= $limit) {
                    throw new ApiException(429, 'RATE_LIMIT', 'Too many reports were submitted recently. Please contact the property support operator.');
                }
                if ($elapsed >= $window) {
                    $pdo->prepare('UPDATE support_issue_rate_limits SET window_started_at_utc = UTC_TIMESTAMP(6), attempt_count = 1, updated_at_utc = UTC_TIMESTAMP(6) WHERE scope_key = :key')->execute(['key' => $key]);
                } else {
                    $pdo->prepare('UPDATE support_issue_rate_limits SET attempt_count = attempt_count + 1, updated_at_utc = UTC_TIMESTAMP(6) WHERE scope_key = :key')->execute(['key' => $key]);
                }
            }
            $id = Uuid::v4();
            $ticket = 'CV-'.strtoupper(substr(str_replace('-', '', $id), 0, 8));
            $pdo->prepare(
                'INSERT INTO support_issues (id, ticket_id, reported_by_user_id, reporter_email_snapshot, category, subject, message, context, environment, status, delivery_status, created_at_utc)
                 VALUES (:id, :ticket, :user, :email, :category, :subject, :message, :context, :environment, "QUEUED", "QUEUED", UTC_TIMESTAMP(6))'
            )->execute([
                'id' => $id, 'ticket' => $ticket, 'user' => (string) $principal['id'], 'email' => (string) $principal['email'],
                'category' => $categoryKey, 'subject' => $subject, 'message' => $message, 'context' => $context,
                'environment' => $environment,
            ]);
            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $exception;
        }

        $property = (string) ($this->settings->show($pdo)['propertyName'] ?? 'Cash Voucher');
        $body = implode("\n", [
            'Reference: '.$ticket,
            'Type: '.$categories[$categoryKey],
            'Workspace: '.$property,
            'Reported by: '.(string) ($principal['name'] ?? '').' <'.(string) $principal['email'].'> ('.(string) $principal['role'].')',
            'Time: '.gmdate('Y-m-d\TH:i:s\Z'),
            'Environment: '.$environment,
            'App context: '.($context !== '' ? $context : '-'),
            '',
            $message,
            '',
            '-- Reply to this email to answer the person who reported it.',
        ]);
        try {
            Mail::raw($body, static function ($mail) use ($to, $principal, $categoryKey, $categories, $property, $subject): void {
                $mail->to($to)
                    ->replyTo((string) $principal['email'])
                    ->subject('[CV] '.$categories[$categoryKey].' - '.$property.' - '.$subject)
                    ->from((string) (config('mail.from.address') ?: 'no-reply@example.invalid'), 'Cash Voucher');
            });
            $pdo->prepare('UPDATE support_issues SET status = "SENT", delivery_status = "SENT", sent_at_utc = UTC_TIMESTAMP(6) WHERE id = :id')
                ->execute(['id' => $id]);
            AuditWriter::append($pdo, (string) $principal['id'], (string) $principal['email'], [
                'eventType' => 'SUPPORT_REPORT',
                'targetType' => 'support_issue',
                'targetId' => $id,
                'reason' => $categoryKey.': '.$subject,
            ]);
        } catch (Throwable $exception) {
            report($exception);
            $pdo->prepare('UPDATE support_issues SET status = "FAILED", delivery_status = "FAILED", delivery_error = :error WHERE id = :id')
                ->execute(['error' => 'Mail delivery failed.', 'id' => $id]);
            AuditWriter::append($pdo, (string) $principal['id'], (string) $principal['email'], [
                'eventType' => 'SUPPORT_REPORT_FAILED',
                'targetType' => 'support_issue',
                'targetId' => $id,
                'reason' => $categoryKey.': '.$subject,
            ]);
            throw new ApiException(503, 'MAIL_FAILED', 'The report could not be sent. Contact the property support operator.');
        }

        return ['ref' => $ticket, 'submitted' => true, 'ticketId' => $ticket, 'deliveryStatus' => 'SENT'];
    }

    /** @return array<string,mixed> */
    private function visibleOnboardingState(PDO $pdo, string $environment): array
    {
        if (! in_array($environment, ['staging', 'production'], true) || $this->environment() !== $environment) {
            throw new ApiException(409, 'ENVIRONMENT_MISMATCH', 'Configured server environment does not match the requested onboarding environment.');
        }
        $state = $this->readOnboardingState($pdo, $environment);
        $checks = $this->technicalChecks($pdo, $environment);
        $steps = $environment === 'staging' ? self::STAGING_STEPS : self::PRODUCTION_STEPS;
        $stepRows = [];
        foreach ($steps as $id => $label) {
            $automatic = ! in_array($id, self::MANUAL_STEPS, true);
            $record = $state['confirmations'][$id] ?? null;
            $check = $checks[$id] ?? null;
            if ($automatic) {
                $status = $check['status'] ?? 'blocked';
                $message = $check['message'] ?? 'No reliable automated check is available.';
            } elseif (is_array($record) && ($record['status'] ?? '') === 'pass') {
                $status = 'pass';
                $message = 'Owner confirmation is saved. This is not automated proof of a device test or successful restore.';
            } elseif (is_array($record) && ($record['status'] ?? '') === 'fail') {
                $status = 'fail';
                $message = 'Owner marked this test failed. Resolve it and record fresh evidence.';
            } else {
                $status = 'pending';
                $message = 'Run this test, then record an evidence note (12–500 characters).';
            }
            $stepRows[] = [
                'id' => $id,
                'automatic' => $automatic,
                'status' => $status,
                'message' => $message,
                'details' => $check['details'] ?? null,
                'evidence' => $record['evidence'] ?? '',
                'actorEmail' => $record['actorEmail'] ?? '',
                'completedAt' => $record['completedAt'] ?? '',
                'label' => $label,
            ];
        }
        $allPassed = true;
        foreach (array_keys($steps) as $id) {
            if (in_array($id, self::MANUAL_STEPS, true)) {
                $record = $state['confirmations'][$id] ?? [];
                if (($record['status'] ?? '') !== 'pass' || trim((string) ($record['evidence'] ?? '')) === '' || empty($record['actorEmail'])) $allPassed = false;
            } elseif (($checks[$id]['status'] ?? '') !== 'pass') {
                $allPassed = false;
            }
        }
        $productionEvidence = $environment !== 'production';
        if ($environment === 'production') {
            $productionEvidence = true;
            foreach (['restoreDrill', 'offlineLimitations', 'ownerAcceptance'] as $id) {
                $record = $state['confirmations'][$id] ?? [];
                if (($record['status'] ?? '') !== 'pass' || empty($record['actorEmail']) || ($record['actorRole'] ?? '') !== 'owner' || mb_strlen(trim((string) ($record['evidence'] ?? '')), 'UTF-8') < 12 || empty($record['completedAt'])) {
                    $productionEvidence = false;
                }
            }
        }
        $liveProductionChecks = $environment !== 'production'
            || (($checks['environmentMatch']['status'] ?? '') === 'pass'
                && ($checks['productionTargetMatch']['status'] ?? '') === 'pass'
                && ($checks['serverReadiness']['status'] ?? '') === 'pass');
        $releaseAllowed = $environment === 'production' && $state['stage'] === 'complete'
            && $allPassed && $productionEvidence && $liveProductionChecks;

        $summary = ['total' => count($stepRows), 'passed' => 0, 'blocked' => 0, 'failed' => 0, 'pending' => 0];
        foreach ($stepRows as $step) {
            if ($step['status'] === 'pass') $summary['passed']++;
            elseif ($step['status'] === 'blocked') $summary['blocked']++;
            elseif ($step['status'] === 'fail') $summary['failed']++;
            else $summary['pending']++;
        }
        $summary['attention'] = $summary['blocked'] + $summary['failed'] + $summary['pending'];
        return [
            'environment' => $environment,
            'environmentConfigured' => true,
            'stage' => $state['stage'],
            'steps' => $stepRows,
            'summary' => $summary,
            'stageReady' => $allPassed,
            'canAdvance' => $state['stage'] !== 'complete' && $allPassed,
            'releaseAllowed' => $releaseAllowed,
            'writePolicy' => $environment === 'staging'
                ? ($state['stage'] === 'stagingUat' ? 'staging-uat-only' : 'blocked')
                : ($releaseAllowed ? 'accepted' : 'blocked'),
            'note' => $environment === 'staging'
                ? 'Test writes are permitted only on the isolated staging instance.'
                : 'Synthetic UAT transactions are prohibited on production.',
        ];
    }

    /** @return array<string,mixed> */
    private function technicalChecks(PDO $pdo, string $environment): array
    {
        $readiness = $this->deploymentReadiness($pdo);
        $accounts = $this->accountReadiness($pdo);
        $settings = $this->settings->show($pdo);
        $backup = $this->backupStatus();
        $schemaReady = (bool) ($readiness['checks']['schemaCurrent']['passed'] ?? false);
        $propertyReady = trim((string) ($settings['propertyName'] ?? '')) !== ''
            && trim((string) ($settings['propertyName'] ?? '')) !== 'My Property'
            && (array) ($settings['categories'] ?? []) !== [];
        $identityMatched = $this->deploymentIdentityMatches($environment)
            && $this->environment() === $environment;
        $folderReady = (bool) ($readiness['checks']['privateStorageWritable']['passed'] ?? false);
        $triggerReady = getenv('CV_BACKUP_SCHEDULER_ENABLED') === 'true';
        $recentReady = $backup['state'] === 'success'
            && $backup['freshWithin36Hours'] === true
            && $backup['lastError'] === '';
        return [
            'environmentMatch' => [
                'status' => $identityMatched ? 'pass' : 'blocked',
                'message' => $identityMatched
                    ? 'Environment and deployment identity match.'
                    : 'Environment or deployment identity is missing/mismatched. Stop and verify the instance register.',
                'details' => ['environment' => $environment, 'deploymentIdentityMatched' => $identityMatched],
            ],
            'propertyConfigured' => [
                'status' => $propertyReady ? 'pass' : 'blocked',
                'message' => $propertyReady ? 'Property name and categories are configured.' : 'Set the real property name and categories; placeholder defaults do not satisfy preflight.',
            ],
            'accountsReady' => [
                'status' => $accounts['ownerReady'] && $accounts['managerReady'] && $accounts['staffReady'] ? 'pass' : 'blocked',
                'message' => $accounts['ownerReady'] && $accounts['managerReady'] && $accounts['staffReady']
                    ? 'Active Owner, Manager and Staff accounts have changed temporary passwords.'
                    : 'Create active Owner, Manager and Staff accounts and require each person to change the temporary password.',
                'details' => $accounts,
            ],
            'sheetSchemaReady' => [
                'status' => $schemaReady ? 'pass' : 'blocked',
                'message' => $schemaReady ? 'Required Laravel database migrations are applied.' : 'The shadow database schema is incomplete. Apply the reviewed migration set; do not reset populated data.',
                'details' => ['schemaVersion' => $readiness['checks']['schemaCurrent']['schemaVersion'] ?? ''],
            ],
            'foldersAccessible' => [
                'status' => $folderReady ? 'pass' : 'blocked',
                'message' => $folderReady ? 'Private receipt and backup storage are writable.' : 'Private receipt storage is not writable.',
            ],
            'backupTriggerReady' => [
                'status' => $triggerReady ? 'pass' : 'blocked',
                'message' => $triggerReady ? 'A scheduled backup worker is configured.' : 'A scheduled backup worker is not configured.',
            ],
            'recentBackup' => [
                'status' => $recentReady ? 'pass' : 'blocked',
                'message' => $recentReady ? 'A recent successful backup is recorded with no later attempt or failure.' : 'A recent successful backup with no later attempt or recorded failure is required. A timestamp is not restore proof.',
                'details' => $backup,
            ],
            'productionTargetMatch' => [
                'status' => $environment === 'production' && $identityMatched ? 'pass' : 'blocked',
                'message' => $environment === 'production' && $identityMatched ? 'Production deployment identity matches.' : 'Production target identity must be verified in the production instance.',
            ],
            'serverReadiness' => [
                'status' => $environment === 'production' && $readiness['ready'] ? 'pass' : 'blocked',
                'message' => $environment === 'production' && $readiness['ready'] ? 'Production server readiness checks passed.' : 'Production server readiness is incomplete or this is not production.',
            ],
        ];
    }

    /** @return array<string,mixed> */
    private function readOnboardingState(PDO $pdo, string $environment, bool $lock = false): array
    {
        $sql = 'SELECT stage, confirmations_json FROM shadow_onboarding_states WHERE environment = :environment LIMIT 1';
        if ($lock) $sql .= ' FOR UPDATE';
        $q = $pdo->prepare($sql);
        $q->execute(['environment' => $environment]);
        $row = $q->fetch(PDO::FETCH_ASSOC);
        if (! is_array($row)) return ['stage' => 'preflight', 'confirmations' => [], 'updatedAt' => '', 'initializedAt' => ''];
        try {
            $confirmations = json_decode((string) $row['confirmations_json'], true, 64, JSON_THROW_ON_ERROR);
        } catch (Throwable) {
            throw new ApiException(503, 'ONBOARDING_STATE', 'Onboarding state is unreadable. No changes were made.');
        }
        if (! is_array($confirmations)) throw new ApiException(503, 'ONBOARDING_STATE', 'Onboarding state is invalid.');
        return ['stage' => (string) $row['stage'], 'confirmations' => $confirmations, 'updatedAt' => '', 'initializedAt' => ''];
    }

    private function saveOnboardingState(PDO $pdo, string $environment, array $state, string $userId): void
    {
        $json = json_encode($state['confirmations'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $pdo->prepare(
            'INSERT INTO shadow_onboarding_states (environment, stage, confirmations_json, created_by_user_id, updated_by_user_id, created_at_utc, updated_at_utc)
             VALUES (:environment, :stage, :json, :creator, :updater, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))
             ON DUPLICATE KEY UPDATE stage = VALUES(stage), confirmations_json = VALUES(confirmations_json), updated_by_user_id = VALUES(updated_by_user_id), updated_at_utc = UTC_TIMESTAMP(6)'
        )->execute(['environment' => $environment, 'stage' => $state['stage'], 'json' => $json, 'creator' => $userId, 'updater' => $userId]);
    }

    /** @return array<string,mixed> */
    private function accountReadiness(PDO $pdo): array
    {
        $rows = $pdo->query(
            'SELECT role, is_active, must_change_password FROM users'
        )->fetchAll(PDO::FETCH_ASSOC);
        $ready = ['ownerReady' => false, 'managerReady' => false, 'staffReady' => false, 'activeCount' => 0];
        foreach ($rows as $row) {
            if ((int) $row['is_active'] !== 1) continue;
            $ready['activeCount']++;
            if ((int) $row['must_change_password'] !== 0) continue;
            $role = strtolower((string) $row['role']);
            if ($role === 'owner') $ready['ownerReady'] = true;
            if ($role === 'manager') $ready['managerReady'] = true;
            if ($role === 'staff') $ready['staffReady'] = true;
        }
        return $ready;
    }

    /** @return list<array{path:string,manifest:array<string,mixed>}> */
    private function backupManifests(): array
    {
        try {
            $disk = Storage::disk('private');
            $paths = array_values(array_filter($disk->allFiles('backups'), static fn (string $path): bool => basename($path) === 'manifest.json'));
            $manifests = [];
            foreach (array_slice($paths, 0, 100) as $path) {
                try {
                    $manifest = json_decode($disk->get($path), true, 32, JSON_THROW_ON_ERROR);
                    if (is_array($manifest)) $manifests[] = ['path' => $path, 'manifest' => $manifest];
                } catch (Throwable) {
                }
            }
            usort($manifests, static fn (array $a, array $b): int => strcmp((string) ($b['manifest']['generatedAtUtc'] ?? ''), (string) ($a['manifest']['generatedAtUtc'] ?? '')));
            return $manifests;
        } catch (Throwable) {
            return [];
        }
    }

    private function privateStorageProbe(): bool
    {
        $disk = Storage::disk('private');
        $path = 'health-probes/'.bin2hex(random_bytes(8)).'.tmp';
        try {
            if (! $disk->put($path, 'cash-voucher-health-probe')) return false;
            $passed = $disk->get($path) === 'cash-voucher-health-probe';
            $disk->delete($path);
            return $passed;
        } catch (Throwable) {
            try { $disk->delete($path); } catch (Throwable) { }
            return false;
        }
    }

    private function deploymentIdentityMatches(string $environment): bool
    {
        $actual = trim((string) (getenv('CV_DEPLOYMENT_ID') ?: ''));
        $expected = trim((string) (getenv('CV_EXPECTED_DEPLOYMENT_ID') ?: ''));
        $configuredEnvironment = $this->environment();
        return $configuredEnvironment === $environment && $actual !== '' && $expected !== '' && hash_equals($expected, $actual);
    }

    private function assertOnboardingIdentity(string $environment, ?string $clientDeploymentId): void
    {
        if (! in_array($environment, ['staging', 'production'], true) || ! $this->deploymentIdentityMatches($environment)) {
            throw new ApiException(409, 'ENVIRONMENT_MISMATCH', 'Configured server environment or deployment identity does not match the requested onboarding environment.');
        }
        if ($clientDeploymentId !== null && ! hash_equals((string) getenv('CV_DEPLOYMENT_ID'), trim($clientDeploymentId))) {
            throw new ApiException(409, 'ENVIRONMENT_MISMATCH', 'Client deployment identity does not match the configured server deployment.');
        }
    }

    private function environment(): string
    {
        $value = strtolower(trim((string) (getenv('CV_ENVIRONMENT') ?: getenv('APP_ENV') ?: '')));
        return in_array($value, ['staging', 'production'], true) ? $value : 'unknown';
    }

    private function latestSchema(PDO $pdo): string
    {
        try {
            return (string) ($pdo->query('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1')->fetchColumn() ?: '');
        } catch (Throwable) {
            return '';
        }
    }

    private function readinessMessage(string $id): string
    {
        return [
            'environmentConfigured' => 'CV_ENVIRONMENT must be explicitly set to staging or production.',
            'databaseReachable' => 'The Laravel database must be reachable.',
            'schemaCurrent' => 'The reviewed database migration set must be fully applied.',
            'propertyConfigured' => 'Set the real property name and categories.',
            'accountsReady' => 'Create active Owner, Manager and Staff accounts and require password changes to be completed.',
            'privateStorageWritable' => 'Private receipt and backup storage must be writable.',
            'backupSchedulerConfigured' => 'Configure the scheduled private backup job.',
            'deploymentIdentityMatched' => 'CV_DEPLOYMENT_ID and CV_EXPECTED_DEPLOYMENT_ID must match.',
            'debugDisabled' => 'Disable APP_DEBUG in production.',
        ][$id] ?? 'A deployment readiness check did not pass.';
    }

    private function assertEnvironment(string $environment): void
    {
        if (! in_array($environment, ['staging', 'production'], true) || $this->environment() !== $environment) {
            throw new ApiException(409, 'ENVIRONMENT_MISMATCH', 'Requested onboarding environment does not match the configured server environment.');
        }
    }

    private function timestamp(mixed $value): string
    {
        if (! is_string($value) || $value === '') return '';
        if (! preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/D', $value)) return '';
        try {
            return (new DateTimeImmutable($value))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z');
        } catch (Throwable) {
            return '';
        }
    }

    private function nonNegativeNumber(mixed $value): ?int
    {
        if (! is_int($value) || $value < 0) return null;
        return $value;
    }

    private function positiveEnvInteger(string $name, int $default, int $maximum): int
    {
        $value = filter_var(getenv($name), FILTER_VALIDATE_INT);
        return is_int($value) && $value > 0 && $value <= $maximum ? $value : $default;
    }

    private function cleanText(mixed $value, int $max): string
    {
        if (! is_string($value)) return '';
        $text = preg_replace('/[\x00-\x09\x0B-\x1F\x7F]/u', ' ', str_replace(["\r\n", "\r"], "\n", $value)) ?? '';
        return trim(mb_substr($text, 0, $max, 'UTF-8'));
    }

    private function isCalendarDate(string $date): bool
    {
        $value = DateTimeImmutable::createFromFormat('!Y-m-d', $date, new DateTimeZone('Asia/Kolkata'));
        $errors = DateTimeImmutable::getLastErrors();
        return $value !== false && (! is_array($errors) || ($errors['warning_count'] === 0 && $errors['error_count'] === 0)) && $value->format('Y-m-d') === $date;
    }
}
