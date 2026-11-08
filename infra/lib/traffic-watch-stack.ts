import { CfnOutput, Duration, RemovalPolicy, Stack, TimeZone, type StackProps } from "aws-cdk-lib";
import type { ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import {
  AllowedMethods,
  CachePolicy,
  CacheQueryStringBehavior,
  Distribution,
  Function as CfFunction,
  FunctionCode,
  FunctionEventType,
  HttpVersion,
  OriginRequestCookieBehavior,
  OriginRequestHeaderBehavior,
  OriginRequestPolicy,
  OriginRequestQueryStringBehavior,
  PriceClass,
  ResponseHeadersPolicy,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { FunctionUrlOrigin, S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { Alarm, ComparisonOperator, TreatMissingData } from "aws-cdk-lib/aws-cloudwatch";
import { AttributeType, Billing, TableV2 } from "aws-cdk-lib/aws-dynamodb";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Architecture, FunctionUrlAuthType, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { ARecord, AaaaRecord, type IHostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { BlockPublicAccess, Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, CacheControl, Source } from "aws-cdk-lib/aws-s3-deployment";
import { ContextAttribute, Schedule, ScheduleExpression, ScheduleTargetInput } from "aws-cdk-lib/aws-scheduler";
import { LambdaInvoke } from "aws-cdk-lib/aws-scheduler-targets";
import type { Construct } from "constructs";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

interface Props extends StackProps {
  domainName: string;
  zone: IHostedZone;
  certificate: ICertificate;
}

export class TrafficWatchStack extends Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const table = new TableV2(this, "Table", {
      partitionKey: { name: "pk", type: AttributeType.STRING },
      sortKey: { name: "sk", type: AttributeType.STRING },
      billing: Billing.onDemand(),
      timeToLiveAttribute: "ttl",
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const fnDefaults = {
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      environment: { TABLE_NAME: table.tableName },
      bundling: {
        format: OutputFormat.ESM,
        minify: true,
        sourceMap: true,
        externalModules: [] as string[],
        // The AWS SDK still uses require() for Node built-ins; give the ESM bundle a real require.
        banner: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
      },
      depsLockFilePath: join(root, "pnpm-lock.yaml"),
    };

    const collector = new NodejsFunction(this, "Collector", {
      ...fnDefaults,
      entry: join(root, "backend/src/collector.ts"),
      memorySize: 256,
      timeout: Duration.minutes(2),
      logGroup: new LogGroup(this, "CollectorLogs", { retention: RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.DESTROY }),
    });
    table.grantReadWriteData(collector);
    const routing = new PolicyStatement({
      actions: ["geo-routes:CalculateRoutes"],
      resources: [`arn:aws:geo-routes:${this.region}::provider/default`],
    });
    collector.addToRolePolicy(routing);

    // Every 15 min during the day, hourly at night (Warsaw time) to keep routing costs down.
    const input = ScheduleTargetInput.fromObject({ scheduledTime: ContextAttribute.scheduledTime });
    const target = new LambdaInvoke(collector, { input, retryAttempts: 2, maxEventAge: Duration.minutes(10) });
    new Schedule(this, "DaySchedule", {
      schedule: ScheduleExpression.cron({ minute: "0/15", hour: "5-22", timeZone: TimeZone.EUROPE_WARSAW }),
      target,
      description: "Traffic Watch: measure routes every 15 minutes (05:00-22:45)",
    });
    new Schedule(this, "NightSchedule", {
      schedule: ScheduleExpression.cron({ minute: "0", hour: "0-4,23", timeZone: TimeZone.EUROPE_WARSAW }),
      target,
      description: "Traffic Watch: measure routes hourly at night",
    });

    new Alarm(this, "CollectorErrors", {
      alarmDescription: "Traffic Watch collector failed in 3 consecutive runs",
      metric: collector.metricErrors({ period: Duration.minutes(15) }),
      threshold: 1,
      evaluationPeriods: 3,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });

    const api = new NodejsFunction(this, "Api", {
      ...fnDefaults,
      entry: join(root, "backend/src/api.ts"),
      memorySize: 512,
      // /api/commute calculates 26 forecast routes on a cache miss.
      timeout: Duration.seconds(25),
      environment: {
        ...fnDefaults.environment,
        COMMUTE_DAILY_LIMIT: "150",
        COMMUTE_PER_IP_LIMIT: "12",
        HASH_SALT: `${this.account}-${this.stackName}`,
      },
      logGroup: new LogGroup(this, "ApiLogs", { retention: RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.DESTROY }),
    });
    table.grantReadWriteData(api); // commute cache + quotas
    api.addToRolePolicy(routing);
    api.addToRolePolicy(
      new PolicyStatement({
        actions: ["geo-places:Suggest", "geo-places:GetPlace"],
        resources: [`arn:aws:geo-places:${this.region}::provider/default`],
      }),
    );
    const apiUrl = api.addFunctionUrl({ authType: FunctionUrlAuthType.AWS_IAM });

    const site = new Bucket(this, "Site", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Static pages (/faq/, /faq/en/) map to their index.html; any other extension-less path is the SPA.
    // /api never reaches this function (separate behavior), so API errors are never rewritten.
    const spaRewrite = new CfFunction(this, "SpaRewrite", {
      code: FunctionCode.fromInline(`function handler(event) {
  var r = event.request;
  var uri = r.uri;
  if (uri === '/faq' || uri.indexOf('/faq/') === 0) {
    if (uri.slice(-1) !== '/' && uri.indexOf('.') === -1) {
      return { statusCode: 301, statusDescription: 'Moved', headers: { location: { value: uri + '/' } } };
    }
    if (uri.slice(-1) === '/') r.uri = uri + 'index.html';
    return r;
  }
  if (uri.indexOf('.') === -1) r.uri = '/index.html';
  return r;
}`),
    });

    const apiCache = new CachePolicy(this, "ApiCache", {
      minTtl: Duration.seconds(0),
      defaultTtl: Duration.seconds(0),
      maxTtl: Duration.days(1),
      queryStringBehavior: CacheQueryStringBehavior.all(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    // Lambda URLs reject a forwarded Host header. Pass the query string, the viewer IP (rate limits, daily unique
    // visitor hash), country and user agent (bot filtering). None of these are part of the cache key.
    const apiOriginRequest = new OriginRequestPolicy(this, "ApiOriginRequest", {
      queryStringBehavior: OriginRequestQueryStringBehavior.all(),
      headerBehavior: OriginRequestHeaderBehavior.allowList("cloudfront-viewer-address", "cloudfront-viewer-country", "user-agent"),
      cookieBehavior: OriginRequestCookieBehavior.none(),
    });

    const distribution = new Distribution(this, "Cdn", {
      domainNames: [props.domainName],
      certificate: props.certificate,
      httpVersion: HttpVersion.HTTP2_AND_3,
      priceClass: PriceClass.PRICE_CLASS_100,
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(site),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: ResponseHeadersPolicy.SECURITY_HEADERS,
        functionAssociations: [{ function: spaRewrite, eventType: FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        "/api/*": {
          origin: FunctionUrlOrigin.withOriginAccessControl(apiUrl),
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachePolicy: apiCache,
          originRequestPolicy: apiOriginRequest,
          responseHeadersPolicy: ResponseHeadersPolicy.SECURITY_HEADERS,
        },
      },
    });

    const webDist = join(root, "web/dist");
    if (existsSync(webDist)) {
      // Vite puts content-hashed files in assets/: cache them for a year.
      new BucketDeployment(this, "DeployAssets", {
        sources: [Source.asset(join(webDist, "assets"))],
        destinationBucket: site,
        destinationKeyPrefix: "assets/",
        cacheControl: [CacheControl.fromString("public, max-age=31536000, immutable")],
        prune: false,
      });
      // Everything else (index.html, FAQ pages, sitemap, robots, og.png, icons) is revalidated on every request.
      new BucketDeployment(this, "DeployPages", {
        sources: [Source.asset(webDist, { exclude: ["assets", "assets/**"] })],
        destinationBucket: site,
        cacheControl: [CacheControl.fromString("public, max-age=0, must-revalidate")],
        prune: false,
        distribution,
        distributionPaths: ["/*"],
      });
    }

    const recordTarget = RecordTarget.fromAlias(new CloudFrontTarget(distribution));
    new ARecord(this, "AliasA", { zone: props.zone, target: recordTarget });
    new AaaaRecord(this, "AliasAAAA", { zone: props.zone, target: recordTarget });

    new CfnOutput(this, "Url", { value: `https://${props.domainName}` });
    new CfnOutput(this, "CloudFrontDomain", { value: distribution.distributionDomainName });
    new CfnOutput(this, "CollectorName", { value: collector.functionName });
    new CfnOutput(this, "TableName", { value: table.tableName });
  }
}
