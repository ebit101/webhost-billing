import type { NextConfig } from 'next';
import {
  loadEnvironmentFiles,
  parseWebEnvironment,
} from '@webhost-billing/config';

loadEnvironmentFiles();
const environment = parseWebEnvironment(process.env);

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: environment.NEXT_PUBLIC_API_URL,
  },
};

export default nextConfig;
