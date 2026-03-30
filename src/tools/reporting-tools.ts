/**
 * Wave Reporting Tools
 *
 * REMOVED: The Wave public GraphQL API does not expose reporting endpoints.
 * The following fields do NOT exist on the Business type:
 *   - profitAndLoss
 *   - balanceSheet
 *   - agedReceivables
 *   - taxSummary
 *   - cashflow
 *
 * These were speculatively included in the open-source fork but fail against
 * the live API with "Cannot query field X on type Business".
 *
 * Wave's reports are only available through the Wave web UI.
 * For programmatic financial reports, use the account and invoice data
 * available through the working tools (list_accounts, list_invoices, etc.).
 *
 * Validated via GraphQL introspection on 2026-03-29.
 */

import type { WaveClient } from '../client.js';

export function registerReportingTools(_client: WaveClient) {
  // No tools to register — reporting queries are not available in Wave's public API.
  return {};
}
