import { defineConfig } from "vitest/config";
export default defineConfig({ test: { env: { AWS_REGION: "eu-central-1", TABLE_NAME: "test" } } });
