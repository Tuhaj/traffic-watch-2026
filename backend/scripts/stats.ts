/**
 * Prints cookieless traffic stats for the last N days (default 14).
 *   AWS_PROFILE=private pnpm stats [days]
 */
import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { localParts } from "../../shared/time";

const region = "eu-central-1";
const days = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 14);

const cfn = new CloudFormationClient({ region });
const stack = await cfn.send(new DescribeStacksCommand({ StackName: "TrafficWatch" }));
const table = stack.Stacks?.[0]?.Outputs?.find((o) => o.OutputKey === "TableName")?.OutputValue;
if (!table) throw new Error("TableName output not found");
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

const totals = new Map<string, number>();
const rows: { date: string; uv: number; pv: number; commute: number }[] = [];

for (let i = days - 1; i >= 0; i--) {
  const date = localParts(new Date(Date.now() - i * 86_400_000), "Europe/Warsaw").date;
  const res = await ddb.send(new QueryCommand({ TableName: table, KeyConditionExpression: "pk = :pk", ExpressionAttributeValues: { ":pk": `STATS#${date}` } }));
  const day = new Map((res.Items ?? []).map((it) => [String(it.sk), Number(it.n)]));
  for (const [k, v] of day) totals.set(k, (totals.get(k) ?? 0) + v);
  const commute = [...day].filter(([k]) => k.startsWith("ev#commute")).reduce((a, [, v]) => a + v, 0);
  rows.push({ date, uv: day.get("uv") ?? 0, pv: day.get("ev#pageview") ?? 0, commute });
}

console.log(`\nTraffic Watch, last ${days} days (cookieless, daily unique visitors)\n`);
console.table(rows);

const group = (prefix: string) =>
  [...totals]
    .filter(([k]) => k.startsWith(prefix))
    .map(([k, v]) => ({ [prefix.replace("#", "")]: k.slice(prefix.length), count: v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

for (const [title, prefix] of [
  ["Pages", "pv#"],
  ["Referrers", "ref#"],
  ["Events", "ev#"],
  ["Language", "lang#"],
  ["Device", "dev#"],
  ["Country", "country#"],
] as const) {
  const g = group(prefix);
  if (g.length) {
    console.log(`\n${title}`);
    console.table(g);
  }
}
