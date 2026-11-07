import { App } from "aws-cdk-lib";
import { EdgeStack } from "../lib/edge-stack";
import { TrafficWatchStack } from "../lib/traffic-watch-stack";

const app = new App();
const account = process.env.CDK_DEFAULT_ACCOUNT;
const domainName: string = app.node.tryGetContext("domainName");

const edge = new EdgeStack(app, "TrafficWatchEdge", {
  env: { account, region: "us-east-1" },
  crossRegionReferences: true,
  domainName,
});

new TrafficWatchStack(app, "TrafficWatch", {
  env: { account, region: "eu-central-1" },
  crossRegionReferences: true,
  domainName,
  zone: edge.zone,
  certificate: edge.certificate,
});
