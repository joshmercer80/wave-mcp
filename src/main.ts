#!/usr/bin/env node

/**
 * Wave MCP Server Entry Point
 *
 * Reads credentials from:
 *   1. ~/.wave-mcp/credentials.json  (preferred — chmod 600)
 *   2. WAVE_ACCESS_TOKEN / WAVE_BUSINESS_ID env vars (fallback)
 *
 * If no token is found the server still starts; every tool call returns a
 * helpful message explaining how to configure credentials.
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { WaveMCPServer } from './server.js';

interface Credentials {
  accessToken?: string;
  businessId?: string;
}

function loadCredentials(): Credentials {
  const credPath = join(homedir(), '.wave-mcp', 'credentials.json');

  // Try credentials file first
  if (existsSync(credPath)) {
    // Check file permissions
    try {
      const stats = statSync(credPath);
      const mode = stats.mode & 0o777;
      if (mode & 0o077) {
        console.error(`Warning: ${credPath} has permissions ${mode.toString(8)} — should be 600. Other users may be able to read your token.`);
      }
    } catch {}

    try {
      const raw = readFileSync(credPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed.accessToken) {
        console.error('Loaded Wave credentials from file.');
        return {
          accessToken: parsed.accessToken,
          businessId: parsed.businessId,
        };
      }
    } catch (err: any) {
      console.error(`Warning: Could not read credentials file: ${err.message}`);
    }
  }

  // Fall back to env vars
  if (process.env.WAVE_ACCESS_TOKEN) {
    console.error('Using Wave credentials from environment variables.');
    return {
      accessToken: process.env.WAVE_ACCESS_TOKEN,
      businessId: process.env.WAVE_BUSINESS_ID,
    };
  }

  return {};
}

async function main() {
  const creds = loadCredentials();

  const server = new WaveMCPServer(creds.accessToken || '', creds.businessId);

  if (!creds.accessToken) {
    console.error('');
    console.error('============================================================');
    console.error('  Wave token not configured. The server is running but all');
    console.error('  tool calls will return an error until you add credentials.');
    console.error('');
    console.error('  To connect:');
    console.error('    1. Go to https://developer-apps.waveapps.com/apps/create/');
    console.error('    2. Create an app and generate a Full Access Token');
    console.error('    3. Save to ~/.wave-mcp/credentials.json:');
    console.error('       { "accessToken": "YOUR_TOKEN", "businessId": "YOUR_BIZ_ID" }');
    console.error('    4. chmod 600 ~/.wave-mcp/credentials.json');
    console.error('    5. Restart the server');
    console.error('============================================================');
    console.error('');
  } else {
    console.error('Wave MCP Server starting...');
    if (creds.businessId) {
      console.error(`Default business ID: ${creds.businessId}`);
    }
  }

  console.error('Server ready. Awaiting requests...');
  await server.run();
}

main().catch((error) => {
  console.error('Fatal error: The Wave MCP server could not start.');
  console.error(error?.message || String(error));
  process.exit(1);
});
