<?php
declare(strict_types=1);

namespace CashVoucher\Api\Financial;

use CashVoucher\Api\Support\ApiException;
use JsonException;
use PDO;
use PDOException;
use RuntimeException;
use Throwable;
use stdClass;

final class IdempotencyService
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Atomically run a financial operation, append its audit event and store its replayable result.
     *
     * The callback must perform all database writes using the supplied PDO connection and must
     * not commit/rollback it. External file writes, mail and other non-transactional effects
     * must happen after commit through an independently retryable outbox.
     *
     * @param array<string, mixed> $payload
     * @param callable(PDO): array<string, mixed> $operation
     * @param array<string, mixed> $audit
     * @return array{data:array<string, mixed>,replayed:bool}
     */
    public function execute(
        string $actorUserId,
        string $actorEmail,
        string $actionKey,
        string $idempotencyKey,
        array $payload,
        callable $operation,
        array $audit
    ): array {
        if ($this->pdo->inTransaction()) {
            throw new RuntimeException('The idempotency unit of work must own its transaction.');
        }
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iD', $actorUserId)
            || strlen($actorEmail) > 254
            || !preg_match('/^[a-z][A-Za-z0-9]{1,79}$/D', $actionKey)
            || !preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/D', $idempotencyKey)
        ) {
            throw new ApiException(422, 'INVALID_IDEMPOTENCY', 'The request identity is invalid.');
        }

        $canonicalPayload = $this->canonicalize($payload);
        try {
            $payloadJson = json_encode(
                $canonicalPayload,
                JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR
            );
        } catch (JsonException) {
            throw new ApiException(422, 'INVALID_PAYLOAD', 'The request payload cannot be encoded safely.');
        }
        $requestHash = hash('sha256', $payloadJson);

        $this->pdo->beginTransaction();
        try {
            $claimId = \CashVoucher\Api\Support\Uuid::v4();
            $claim = $this->pdo->prepare(
                'INSERT INTO idempotency_requests
                 (id, actor_user_id, action_key, idempotency_key, request_hash,
                  state, created_at_utc)
                 VALUES (:id, :actor, :action, :key, :hash, :state, UTC_TIMESTAMP(6))'
            );

            try {
                $claim->execute([
                    'id' => $claimId,
                    'actor' => $actorUserId,
                    'action' => $actionKey,
                    'key' => $idempotencyKey,
                    'hash' => $requestHash,
                    'state' => 'IN_PROGRESS',
                ]);
            } catch (PDOException $exception) {
                if ((int) ($exception->errorInfo[1] ?? 0) !== 1062) {
                    throw $exception;
                }

                $existingQuery = $this->pdo->prepare(
                    'SELECT request_hash, state, response_json
                     FROM idempotency_requests
                     WHERE actor_user_id = :actor AND action_key = :action AND idempotency_key = :key
                     FOR UPDATE'
                );
                $existingQuery->execute([
                    'actor' => $actorUserId,
                    'action' => $actionKey,
                    'key' => $idempotencyKey,
                ]);
                $existing = $existingQuery->fetch();
                if (!is_array($existing)) {
                    throw $exception;
                }
                if (!hash_equals((string) $existing['request_hash'], $requestHash)) {
                    throw new ApiException(
                        409,
                        'IDEMPOTENCY_CONFLICT',
                        'This request key was already used with different request content.'
                    );
                }
                if ((string) $existing['state'] !== 'COMPLETED'
                    || !is_string($existing['response_json'])
                    || $existing['response_json'] === ''
                ) {
                    throw new ApiException(
                        409,
                        'IDEMPOTENCY_IN_PROGRESS',
                        'An earlier request with this key has not completed. Retry safely shortly.'
                    );
                }

                $storedResponse = json_decode($existing['response_json'], true, 64, JSON_THROW_ON_ERROR);
                if (!is_array($storedResponse)) {
                    throw new RuntimeException('The stored idempotency response is invalid.');
                }

                $this->pdo->commit();
                return ['data' => $storedResponse, 'replayed' => true];
            }

            $result = $operation($this->pdo);
            if (!is_array($result)) {
                throw new RuntimeException('A financial operation must return an object-shaped result.');
            }

            $audit['after'] = $result;
            AuditWriter::append($this->pdo, $actorUserId, $actorEmail, $audit);

            $responseJson = json_encode(
                $result,
                JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR
            );
            $complete = $this->pdo->prepare(
                'UPDATE idempotency_requests
                 SET state = :state, response_json = :response, completed_at_utc = UTC_TIMESTAMP(6)
                 WHERE id = :id AND state = :in_progress'
            );
            $complete->execute([
                'state' => 'COMPLETED',
                'response' => $responseJson,
                'id' => $claimId,
                'in_progress' => 'IN_PROGRESS',
            ]);
            if ($complete->rowCount() !== 1) {
                throw new RuntimeException('The idempotency request could not be marked complete.');
            }

            $this->pdo->commit();
            return ['data' => $result, 'replayed' => false];
        } catch (Throwable $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $exception;
        }
    }

    private function canonicalize(mixed $value): mixed
    {
        if ($value instanceof stdClass) {
            $value = get_object_vars($value);
        }
        if (!is_array($value)) {
            return $value;
        }
        if (array_is_list($value)) {
            return array_map(fn (mixed $item): mixed => $this->canonicalize($item), $value);
        }

        ksort($value, SORT_STRING);
        foreach ($value as $key => $item) {
            $value[$key] = $this->canonicalize($item);
        }
        return $value;
    }
}
