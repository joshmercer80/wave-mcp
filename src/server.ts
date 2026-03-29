/**
 * Wave MCP Server Implementation
 *
 * Forked from NoahMcGraw/wave-mcp with fixes:
 * - 6 mutation name corrections (customerPatch, productPatch, accountPatch, etc.)
 * - 7 broken-tool fixes (search_customers, list_customers, get_invoice, etc.)
 * - Bill tools removed (bill CRUD not available in Wave public API)
 * - MCP App Resources removed (not needed for CLI use)
 * - Retry logic with exponential backoff
 * - Plain-English error messages
 * - Graceful start without token
 * - Reconciliation engine for Venmo payment matching
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createWaveClient, WaveClient } from './client.js';
import { registerInvoiceTools } from './tools/invoices-tools.js';
import { registerCustomerTools } from './tools/customers-tools.js';
import { registerProductTools } from './tools/products-tools.js';
import { registerAccountTools } from './tools/accounts-tools.js';
import { registerTransactionTools } from './tools/transactions-tools.js';
import { registerEstimateTools } from './tools/estimates-tools.js';
import { registerTaxTools } from './tools/taxes-tools.js';
import { registerBusinessTools } from './tools/businesses-tools.js';
import { registerReportingTools } from './tools/reporting-tools.js';
import { registerReconciliationTools } from './tools/reconciliation-tools.js';

export class WaveMCPServer {
  private server: Server;
  private client: WaveClient;
  private tools: Map<string, any>;

  constructor(accessToken: string, businessId?: string) {
    this.server = new Server(
      {
        name: 'wave-mcp-server',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
        instructions: [
          'Wave Accounting MCP server for Carrie\'s cleaning business.',
          'Manages invoices, customers, products, and payment reconciliation via Wave\'s GraphQL API.',
          '',
          'WORKING WORKFLOWS:',
          '- Invoice creation: wave_list_products -> wave_create_invoice (DRAFT) -> wave_approve_invoice -> wave_send_invoice',
          '- Manual payment: wave_create_invoice_payment (invoicePaymentCreateManual mutation)',
          '- Receipt sending: wave_send_payment_receipt (invoicePaymentReceiptSend mutation)',
          '- Venmo reconciliation: wave_reconcile_venmo (match payments to open invoices)',
          '- Mark invoice paid: wave_mark_invoice_paid (confirmation-gated wrapper)',
          '',
          'CONVENTIONS:',
          '- businessId is set globally via credentials.json; most tools use it automatically.',
          '- All monetary amounts are Decimal strings (e.g. "100.00"), not numbers.',
          '- Dates use YYYY-MM-DD format.',
          '- Use wave_switch_business to change the active business.',
          '',
          'NOTES:',
          '- Bill tools have been removed (not available in Wave public API).',
          '- Reporting tools (P&L, balance sheet, etc.) need schema validation with a live token.',
          '- Transaction write tools (create, update, categorize) may not exist in the API schema.',
        ].join('\n'),
      }
    );

    this.client = createWaveClient({ accessToken, businessId });
    this.tools = new Map();

    this.registerAllTools();
    this.setupHandlers();
  }

  private registerAllTools(): void {
    const toolSets = [
      registerInvoiceTools(this.client),
      registerCustomerTools(this.client),
      registerProductTools(this.client),
      registerAccountTools(this.client),
      registerTransactionTools(this.client),
      // Bill tools removed — bill CRUD not available in Wave public API
      registerEstimateTools(this.client),
      registerTaxTools(this.client),
      registerBusinessTools(this.client),
      registerReportingTools(this.client),
      registerReconciliationTools(this.client),
    ];

    for (const toolSet of toolSets) {
      for (const [name, tool] of Object.entries(toolSet)) {
        this.tools.set(name, tool);
      }
    }
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = Array.from(this.tools.entries()).map(([name, tool]) => ({
        name,
        description: tool.description,
        inputSchema: {
          type: 'object' as const,
          properties: tool.parameters?.properties || {},
          required: tool.parameters?.required || [],
        },
      }));

      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const tool = this.tools.get(name);
      if (!tool) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Tool "${name}" not found. Use ListTools to see available tools.`,
            },
          ],
          isError: true,
        };
      }

      try {
        const result = await tool.handler(args || {});
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text' as const,
              text: error.message || 'An unexpected error occurred.',
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await this.server.close();
      process.exit(0);
    });
  }
}
