import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { createHash } from "node:crypto";
import { type ApiErrorBody, type ErrorCode, ERROR_MESSAGES } from "../../shared/errors";
import { localParts } from "../../shared/time";

const TABLE = process.env.TABLE_NAME!;
const SALT = process.env.HASH_SALT ?? "traffic-watch";
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    readonly params?: Record<string, string | number>,
  ) {
    super(ERROR_MESSAGES[code].replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? "")));
  }

  get body(): ApiErrorBody {
    return { code: this.code, message: this.message, ...(this.params ? { params: this.params } : {}) };
  }
}

export const hash = (s: string) => createHash("sha256").update(`${SALT}:${s}`).digest("hex").slice(0, 32);

export interface QuotaSpec {
  /** Counter name, e.g. "commute" or "suggest". */
  name: string;
  perIp: number;
  global: number;
}

/**
 * Counts one paid call against a per-IP and a global daily limit (Warsaw calendar day).
 * Throws ApiError(429) when either is exhausted.
 */
export async function consumeQuota(spec: QuotaSpec, ip: string, timeZone = "Europe/Warsaw") {
  const date = localParts(new Date(), timeZone).date;
  const ttl = Math.floor(Date.now() / 1000) + 2 * 86400;
  const bump = (sk: string, max: number) =>
    ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { pk: `QUOTA#${date}`, sk },
        UpdateExpression: "ADD n :one SET #ttl = :ttl",
        ConditionExpression: "attribute_not_exists(n) OR n < :max",
        ExpressionAttributeNames: { "#ttl": "ttl" },
        ExpressionAttributeValues: { ":one": 1, ":max": max, ":ttl": ttl },
      }),
    );
  for (const [sk, max, code] of [
    [`${spec.name}#IP#${hash(ip)}`, spec.perIp, "quota_user"],
    [`${spec.name}#ALL`, spec.global, "quota_global"],
  ] as const) {
    try {
      await bump(sk, max);
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException) {
        throw new ApiError(429, code);
      }
      throw e;
    }
  }
}
