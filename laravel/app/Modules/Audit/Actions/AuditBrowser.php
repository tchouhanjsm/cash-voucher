<?php

declare(strict_types=1);

namespace App\Modules\Audit\Actions;

use CashVoucher\Api\Support\ApiException;
use PDO;
use Throwable;

final class AuditBrowser
{
    private const PAGE_DEFAULT = 50;
    private const PAGE_MAX = 100;

    /** @return array<string,mixed> */
    public function index(PDO $pdo, mixed $limitInput, mixed $cursorInput): array
    {
        $limit = $this->limit($limitInput);
        $cursor = $this->decodeCursor($cursorInput);

        return $this->events($pdo, '', [], $limit, $cursor);
    }

    /** @return array<string,mixed> */
    public function voucherHistory(PDO $pdo, string $voucherId, mixed $limitInput, mixed $cursorInput): array
    {
        if (! $this->isUuid($voucherId)) {
            throw new ApiException(422, 'VOUCHER_ID_INVALID', 'The voucher identifier is invalid.');
        }
        $voucherQuery = $pdo->prepare(
            'SELECT id, voucher_number, business_date, vendor_name_snapshot, voucher_type, status
             FROM vouchers WHERE id = :id LIMIT 1'
        );
        $voucherQuery->execute(['id' => $voucherId]);
        $voucher = $voucherQuery->fetch(PDO::FETCH_ASSOC);
        if (! is_array($voucher)) {
            throw new ApiException(404, 'VOUCHER_NOT_FOUND', 'The voucher could not be found.');
        }

        $limit = $this->limit($limitInput);
        $cursor = $this->decodeCursor($cursorInput);
        $page = $this->events(
            $pdo,
            'target_type = :target_type AND target_id = :target_id',
            ['target_type' => 'voucher', 'target_id' => $voucherId],
            $limit,
            $cursor,
        );

        return [
            'voucher' => [
                'id' => (string) $voucher['id'],
                'voucherNo' => (string) $voucher['voucher_number'],
                'date' => (string) $voucher['business_date'],
                'vendor' => (string) $voucher['vendor_name_snapshot'],
                'type' => (string) $voucher['voucher_type'],
                'status' => (string) $voucher['status'],
            ],
            ...$page,
        ];
    }

    /**
     * @param array<string,mixed> $baseParams
     * @param array{at:string,id:string}|null $cursor
     * @return array<string,mixed>
     */
    private function events(PDO $pdo, string $where, array $baseParams, int $limit, ?array $cursor): array
    {
        $conditions = $where === '' ? [] : [$where];
        $params = $baseParams;
        if ($cursor !== null) {
            $conditions[] = '(occurred_at_utc < :cursor_at_before OR (occurred_at_utc = :cursor_at_equal AND id < :cursor_id))';
            $params['cursor_at_before'] = $cursor['at'];
            $params['cursor_at_equal'] = $cursor['at'];
            $params['cursor_id'] = $cursor['id'];
        }
        $sql = 'SELECT id, actor_user_id, actor_email_snapshot, event_type, target_type,
                       target_id, before_json, after_json, reason, occurred_at_utc
                FROM audit_events';
        if ($conditions !== []) {
            $sql .= ' WHERE '.implode(' AND ', $conditions);
        }
        $sql .= ' ORDER BY occurred_at_utc DESC, id DESC LIMIT :page_limit';

        $query = $pdo->prepare($sql);
        foreach ($params as $key => $value) {
            $query->bindValue(':'.$key, $value, PDO::PARAM_STR);
        }
        $query->bindValue(':page_limit', $limit + 1, PDO::PARAM_INT);
        $query->execute();
        $rows = $query->fetchAll(PDO::FETCH_ASSOC);
        $hasMore = count($rows) > $limit;
        if ($hasMore) {
            array_pop($rows);
        }

        $items = array_map(fn (array $row): array => $this->present($row), $rows);
        $nextCursor = null;
        if ($hasMore && $rows !== []) {
            $last = $rows[count($rows) - 1];
            $nextCursor = $this->encodeCursor(
                (string) $last['occurred_at_utc'],
                (string) $last['id'],
            );
        }

        return [
            'items' => $items,
            'count' => count($items),
            'limit' => $limit,
            'hasMore' => $hasMore,
            'nextCursor' => $nextCursor,
        ];
    }

    /** @param array<string,mixed> $row @return array<string,mixed> */
    private function present(array $row): array
    {
        return [
            'id' => (string) $row['id'],
            'actorUserId' => $row['actor_user_id'] === null ? null : (string) $row['actor_user_id'],
            'actorEmail' => (string) $row['actor_email_snapshot'],
            'eventType' => (string) $row['event_type'],
            'targetType' => (string) $row['target_type'],
            'targetId' => (string) $row['target_id'],
            'before' => $this->snapshot($row['before_json'] === null ? null : (string) $row['before_json']),
            'after' => $this->snapshot($row['after_json'] === null ? null : (string) $row['after_json']),
            'reason' => (string) $row['reason'],
            'occurredAtUtc' => (string) $row['occurred_at_utc'],
        ];
    }

    private function snapshot(?string $json): ?array
    {
        if ($json === null) {
            return null;
        }
        try {
            $decoded = json_decode($json, true, 64, JSON_THROW_ON_ERROR);
        } catch (Throwable) {
            throw new ApiException(503, 'AUDIT_DATA_INVALID', 'An audit snapshot is malformed. Stop and inspect the audit record.');
        }
        if (! is_array($decoded)) {
            throw new ApiException(503, 'AUDIT_DATA_INVALID', 'An audit snapshot is malformed. Stop and inspect the audit record.');
        }

        return $this->redact($decoded);
    }

    /** @param array<mixed> $value @return array<mixed> */
    private function redact(array $value): array
    {
        $result = [];
        foreach ($value as $key => $item) {
            if (is_string($key) && preg_match('/password|passphrase|password_hash|salt|token|secret|credential|csrf|session|authorization|api[_-]?key/i', $key)) {
                $result[$key] = '[REDACTED]';
            } elseif (is_array($item)) {
                $result[$key] = $this->redact($item);
            } else {
                $result[$key] = $item;
            }
        }

        return $result;
    }

    private function limit(mixed $value): int
    {
        if ($value === null || $value === '') {
            return self::PAGE_DEFAULT;
        }
        if (is_string($value) && preg_match('/^[0-9]{1,3}$/D', $value)) {
            $value = (int) $value;
        }
        if (! is_int($value) || $value < 1 || $value > self::PAGE_MAX) {
            throw new ApiException(422, 'PAGE_INVALID', 'Audit page size must be between 1 and 100.');
        }

        return $value;
    }

    /** @return array{at:string,id:string}|null */
    private function decodeCursor(mixed $value): ?array
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (! is_string($value) || strlen($value) > 512 || ! preg_match('/^[A-Za-z0-9_-]+$/D', $value)) {
            throw new ApiException(422, 'AUDIT_CURSOR_INVALID', 'The audit page cursor is invalid.');
        }
        $decoded = base64_decode(strtr($value, '-_', '+/').str_repeat('=', (4 - strlen($value) % 4) % 4), true);
        if (! is_string($decoded)) {
            throw new ApiException(422, 'AUDIT_CURSOR_INVALID', 'The audit page cursor is invalid.');
        }
        try {
            $payload = json_decode($decoded, true, 8, JSON_THROW_ON_ERROR);
        } catch (Throwable) {
            throw new ApiException(422, 'AUDIT_CURSOR_INVALID', 'The audit page cursor is invalid.');
        }
        if (
            ! is_array($payload)
            || ! is_string($payload['at'] ?? null)
            || ! is_string($payload['id'] ?? null)
            || ! preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/D', $payload['at'])
            || ! $this->isUuid($payload['id'])
        ) {
            throw new ApiException(422, 'AUDIT_CURSOR_INVALID', 'The audit page cursor is invalid.');
        }

        return ['at' => $payload['at'], 'id' => $payload['id']];
    }

    private function encodeCursor(string $at, string $id): string
    {
        return rtrim(strtr(base64_encode(json_encode(['at' => $at, 'id' => $id], JSON_THROW_ON_ERROR)), '+/', '-_'), '=');
    }

    private function isUuid(string $value): bool
    {
        return preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iD', $value) === 1;
    }
}
