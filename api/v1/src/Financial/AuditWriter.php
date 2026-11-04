<?php
declare(strict_types=1);

namespace CashVoucher\Api\Financial;

use CashVoucher\Api\Support\Uuid;
use InvalidArgumentException;
use PDO;
use RuntimeException;

final class AuditWriter
{
    /**
     * Append an audit event inside the caller's existing financial transaction.
     *
     * @param array<string, mixed> $event
     * @param array<string, mixed>|null $after
     * @param array<string, mixed>|null $before
     */
    public static function append(
        PDO $pdo,
        string $actorUserId,
        string $actorEmail,
        array $event
    ): string {
        if (!$pdo->inTransaction()) {
            throw new RuntimeException('Audit events must commit inside the originating database transaction.');
        }

        $eventType = $event['eventType'] ?? '';
        $targetType = $event['targetType'] ?? '';
        $targetId = $event['targetId'] ?? '';
        $reason = $event['reason'] ?? '';
        $before = $event['before'] ?? null;
        $after = $event['after'] ?? null;

        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iD', $actorUserId)
            || strlen($actorEmail) > 254
            || !is_string($eventType) || !preg_match('/^[A-Z][A-Z0-9_]{1,79}$/D', $eventType)
            || !is_string($targetType) || strlen($targetType) > 40
            || !is_string($targetId) || strlen($targetId) > 128
            || !is_string($reason) || strlen($reason) > 500
            || ($before !== null && !is_array($before))
            || ($after !== null && !is_array($after))
        ) {
            throw new InvalidArgumentException('Audit event details are invalid.');
        }

        $id = Uuid::v4();
        $insert = $pdo->prepare(
            'INSERT INTO audit_events
             (id, actor_user_id, actor_email_snapshot, event_type, target_type,
              target_id, before_json, after_json, reason, occurred_at_utc)
             VALUES (:id, :actor, :email, :event, :target_type,
              :target_id, :before_json, :after_json, :reason, UTC_TIMESTAMP(6))'
        );
        $insert->execute([
            'id' => $id,
            'actor' => $actorUserId,
            'email' => $actorEmail,
            'event' => $eventType,
            'target_type' => $targetType,
            'target_id' => $targetId,
            'before_json' => $before === null ? null : json_encode($before, JSON_THROW_ON_ERROR),
            'after_json' => $after === null ? null : json_encode($after, JSON_THROW_ON_ERROR),
            'reason' => $reason,
        ]);

        return $id;
    }
}
