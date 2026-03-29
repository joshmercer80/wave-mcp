/**
 * Wave GraphQL API Client
 * With exponential backoff retry for rate limits and plain-English error messages.
 */

import { GraphQLClient } from 'graphql-request';
import type { WaveConfig } from './types/index.js';
import { WaveError } from './types/index.js';

const WAVE_API_URL = 'https://gql.waveapps.com/graphql/public';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function friendlyError(error: any): WaveError {
  const msg = error?.message || '';
  const status = error?.response?.status;
  const gqlErrors: any[] = error?.response?.errors || [];

  // Rate limit
  if (status === 429 || msg.includes('throttled') || msg.includes('rate limit')) {
    return new WaveError(
      'Wave is temporarily limiting requests. The server will retry automatically. If this persists, wait a minute and try again.'
    );
  }

  // Auth
  if (status === 401 || status === 403 || gqlErrors.some((e: any) => e.message?.includes('Unauthorized'))) {
    return new WaveError(
      'Wave rejected the access token. Check that the token in ~/.wave-mcp/credentials.json is correct and has not expired.'
    );
  }

  // Network
  if (error.request && !error.response) {
    return new WaveError(
      'Could not reach Wave servers. Check your internet connection and try again.'
    );
  }

  // GraphQL field errors
  if (gqlErrors.length > 0) {
    const messages = gqlErrors.map((e: any) => e.message).join('; ');
    return new WaveError(`Wave API error: ${messages}`);
  }

  // Not found
  if (msg.includes('not found') || msg.includes('does not exist')) {
    return new WaveError(
      `The requested item was not found in Wave. Double-check the ID and try again.`
    );
  }

  // Generic
  return new WaveError(msg || 'An unexpected error occurred while communicating with Wave.');
}

export class WaveClient {
  private client: GraphQLClient;
  private config: WaveConfig;
  private tokenConfigured: boolean;

  constructor(config: WaveConfig) {
    this.config = config;
    this.tokenConfigured = !!config.accessToken;
    this.client = new GraphQLClient(WAVE_API_URL, {
      headers: {
        Authorization: `Bearer ${config.accessToken || 'NOT_CONFIGURED'}`,
        'Content-Type': 'application/json',
      },
    });
  }

  isTokenConfigured(): boolean {
    return this.tokenConfigured;
  }

  private async requestWithRetry<T>(gql: string, variables?: any, isMutation = false): Promise<T> {
    if (!this.tokenConfigured) {
      throw new WaveError(
        'Wave token not configured. Add your Full Access Token to ~/.wave-mcp/credentials.json and restart the server.'
      );
    }

    let lastError: any;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const data = await this.client.request<T>(gql, variables);
        return data;
      } catch (error: any) {
        lastError = error;
        const status = error?.response?.status;
        const isRateLimit = status === 429;
        const isServerError = status && status >= 500;

        // Always retry rate limits. Only retry server errors for queries —
        // retrying non-idempotent mutations after 5xx risks duplicate financial actions.
        if (isRateLimit && attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500;
          console.error(
            `Wave API rate limit (attempt ${attempt + 1}/${MAX_RETRIES + 1}). Retrying in ${Math.round(delay)}ms...`
          );
          await sleep(delay);
          continue;
        }

        if (!isMutation && isServerError && attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500;
          console.error(
            `Wave API server error (attempt ${attempt + 1}/${MAX_RETRIES + 1}). Retrying in ${Math.round(delay)}ms...`
          );
          await sleep(delay);
          continue;
        }

        throw friendlyError(error);
      }
    }

    throw friendlyError(lastError);
  }

  async query<T = any>(gql: string, variables?: any): Promise<T> {
    return this.requestWithRetry<T>(gql, variables);
  }

  async mutate<T = any>(mutation: string, variables?: any): Promise<T> {
    // Mutations only retry on 429 (rate limit), never on 5xx
    return this.requestWithRetry<T>(mutation, variables, true);
  }

  getBusinessId(): string | undefined {
    return this.config.businessId;
  }

  setBusinessId(businessId: string): void {
    this.config.businessId = businessId;
  }
}

export function createWaveClient(config: WaveConfig): WaveClient {
  return new WaveClient(config);
}
