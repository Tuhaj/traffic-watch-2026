import { CfnOutput, Fn, Stack, type StackProps } from "aws-cdk-lib";
import { Certificate, CertificateValidation } from "aws-cdk-lib/aws-certificatemanager";
import { PublicHostedZone } from "aws-cdk-lib/aws-route53";
import type { Construct } from "constructs";

interface Props extends StackProps {
  domainName: string;
}

/**
 * Resources that must live in us-east-1: the CloudFront certificate. The hosted zone
 * for the subdomain lives here too; the parent zone (isy.sh, another account)
 * delegates to it with an NS record.
 */
export class EdgeStack extends Stack {
  readonly zone: PublicHostedZone;
  readonly certificate: Certificate;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);
    this.zone = new PublicHostedZone(this, "Zone", { zoneName: props.domainName });
    this.certificate = new Certificate(this, "Certificate", {
      domainName: props.domainName,
      validation: CertificateValidation.fromDns(this.zone),
    });
    new CfnOutput(this, "NameServers", { value: Fn.join(",", this.zone.hostedZoneNameServers!) });
  }
}
