import type express from 'express';
import {
  getTrustedClientIp as resolveClientIp,
  resolveTrustedClientIpDetails as resolveIpDetails,
  resolveTrustProxyConfig as resolveProxyConfig,
  normalizeIp as normalizeIpAddress,
  isPrivateIpAddress as checkPrivateIpAddress,
  isCloudflareProxyIp as checkCloudflareProxyIp,
  maskClientIp as maskIpSubnet,
} from './mrs-iptv-backend/src/clientIp.js';

export interface TrustProxyConfigInfo {
  enabled: boolean;
  source: 'express' | 'env' | 'none';
  setting: unknown;
}

export interface ClientIpResolutionDetails {
  ip: string;
  source: string;
  trustProxyEnabled: boolean;
  cloudflareVerified: boolean;
}

export function normalizeIp(raw: string | string[] | undefined | null): string {
  return normalizeIpAddress(raw);
}

export function isPrivateIpAddress(rawIp: string | undefined | null): boolean {
  return checkPrivateIpAddress(rawIp);
}

export function isCloudflareProxyIp(rawIp: string | undefined | null): boolean {
  return checkCloudflareProxyIp(rawIp);
}

export function maskClientIp(rawIp: string | undefined | null): string {
  return maskIpSubnet(rawIp);
}

export function resolveTrustProxyConfig(req?: Partial<express.Request>): TrustProxyConfigInfo {
  return resolveProxyConfig(req) as TrustProxyConfigInfo;
}

export function resolveTrustedClientIpDetails(req?: Partial<express.Request>): ClientIpResolutionDetails {
  return resolveIpDetails(req) as ClientIpResolutionDetails;
}

export function getTrustedClientIp(req?: Partial<express.Request>): string {
  return resolveClientIp(req);
}

export function getProxyTelemetrySummary(req?: Partial<express.Request>) {
  const trustConfig = resolveTrustProxyConfig(req);
  const details = req ? resolveTrustedClientIpDetails(req) : null;
  return {
    trustProxyEnabled: trustConfig.enabled,
    trustProxySource: trustConfig.source,
    cloudflareMode: process.env.CF_ORIGIN_SECRET
      ? 'origin_secret'
      : /^(1|true|yes)$/i.test(String(process.env.CLOUDFLARE_STRICT_ORIGIN || ''))
      ? 'strict_cidr'
      : 'auto_edge_verified',
    trustCdnGeo: /^(1|true|yes)$/i.test(String(process.env.TRUST_CDN_GEO || '')),
    ...(details
      ? {
          resolvedSource: details.source,
          cloudflareVerified: details.cloudflareVerified,
          maskedSubnet: maskClientIp(details.ip),
        }
      : {}),
  };
}
