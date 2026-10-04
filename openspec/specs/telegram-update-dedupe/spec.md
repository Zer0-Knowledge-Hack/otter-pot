# Telegram Update Dedupe Specification

## Purpose

Make the webhook idempotent against Telegram redeliveries of the same `update_id`.

## Requirements

### Requirement: Duplicate update ignored

The webhook MUST process each `update_id` per chat at most once, marking it at processing start, and MUST acknowledge duplicates with 200 without side effects.

#### Scenario: Redelivery

- GIVEN `update_id` 100 for chat C was already marked
- WHEN the same update is delivered again
- THEN no handler runs and the response is 200

#### Scenario: Concurrent duplicates

- GIVEN two identical updates arrive concurrently
- THEN exactly one is processed

#### Scenario: Distinct chats

- GIVEN the same `update_id` value arrives for two different chats
- THEN both are processed (dedupe is per chat)

### Requirement: Bounded retention

Per-chat dedupe state MUST be bounded; oldest ids MUST be evicted beyond the limit, and recent ids MUST remain deduped.

#### Scenario: Eviction

- GIVEN retention is full
- WHEN a new `update_id` is marked
- THEN the oldest id is evicted and the newest remains deduped
