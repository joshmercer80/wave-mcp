/**
 * Wave Reconciliation Tools
 *
 * Venmo payment matching infrastructure for Carrie's cleaning business.
 * Matches parsed Venmo payment data against open Wave invoices.
 *
 * Does NOT require Gmail MCP or Carrie's token to test — accepts
 * pre-parsed payment data as input.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { WaveClient } from '../client.js';

// --- Paths ---
const WAVE_DIR = join(homedir(), '.wave-mcp');
const ALIASES_PATH = join(WAVE_DIR, 'customer-aliases.json');
const RECON_LOG_PATH = join(WAVE_DIR, 'reconciliation-log.jsonl');

// --- Alias helpers ---
interface AliasMap {
  [venmoName: string]: string; // venmoName -> Wave customer name
}

function loadAliases(): AliasMap {
  if (!existsSync(ALIASES_PATH)) return {};
  try {
    return JSON.parse(readFileSync(ALIASES_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveAliases(aliases: AliasMap): void {
  if (!existsSync(WAVE_DIR)) mkdirSync(WAVE_DIR, { recursive: true });
  writeFileSync(ALIASES_PATH, JSON.stringify(aliases, null, 2));
}

// --- Reconciliation log helpers ---
interface ReconEntry {
  fingerprint: string;
  venmoName: string;
  amount: string;
  date: string;
  matchedInvoiceId: string | null;
  matchedCustomer: string | null;
  status: 'matched' | 'paid' | 'no_match' | 'ambiguous';
  timestamp: string;
  paymentId?: string;
}

function loadReconLog(): ReconEntry[] {
  if (!existsSync(RECON_LOG_PATH)) return [];
  try {
    const lines = readFileSync(RECON_LOG_PATH, 'utf-8').trim().split('\n');
    return lines.filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function appendReconEntry(entry: ReconEntry): void {
  if (!existsSync(WAVE_DIR)) mkdirSync(WAVE_DIR, { recursive: true });
  writeFileSync(RECON_LOG_PATH, JSON.stringify(entry) + '\n', { flag: 'a' });
}

function makeFingerprint(name: string, amount: string, date: string): string {
  return `${name.toLowerCase().trim()}|${amount}|${date}`;
}

export function registerReconciliationTools(client: WaveClient) {
  return {
    wave_reconcile_venmo: {
      description:
        'Match a Venmo payment against open Wave invoices. Accepts parsed payment data (name, amount, date) and returns match candidates. Does NOT mark anything as paid — use wave_mark_invoice_paid for that.',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          venmoName: { type: 'string', description: 'Payer name from Venmo (e.g. "John Smith")' },
          amount: { type: 'string', description: 'Payment amount (e.g. "150.00")' },
          date: { type: 'string', description: 'Payment date (YYYY-MM-DD)' },
        },
        required: ['venmoName', 'amount', 'date'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('Business ID is required.');

        const fingerprint = makeFingerprint(args.venmoName, args.amount, args.date);

        // Check idempotency — skip if already processed
        const log = loadReconLog();
        const existing = log.find((e) => e.fingerprint === fingerprint);
        if (existing) {
          return {
            alreadyProcessed: true,
            previousResult: existing,
            message: `This payment was already processed on ${existing.timestamp}. Status: ${existing.status}.`,
          };
        }

        // Resolve Venmo name to Wave customer name via aliases
        const aliases = loadAliases();
        const resolvedName = aliases[args.venmoName.toLowerCase()] || args.venmoName;

        // Fetch open invoices (SENT, VIEWED, OVERDUE, PARTIAL, APPROVED)
        const query = `
          query GetOpenInvoices($businessId: ID!, $page: Int!, $pageSize: Int!) {
            business(id: $businessId) {
              invoices(page: $page, pageSize: $pageSize) {
                edges {
                  node {
                    id
                    invoiceNumber
                    status
                    invoiceDate
                    dueDate
                    customer {
                      id
                      name
                      email
                    }
                    total {
                      value
                      currency { code }
                    }
                    amountDue {
                      value
                      currency { code }
                    }
                    amountPaid { value }
                  }
                }
              }
            }
          }
        `;

        const result = await client.query(query, {
          businessId,
          page: 1,
          pageSize: 100,
        });

        const openStatuses = new Set(['SENT', 'VIEWED', 'OVERDUE', 'PARTIAL', 'APPROVED']);
        const openInvoices = result.business.invoices.edges
          .map((e: any) => e.node)
          .filter((inv: any) => openStatuses.has(inv.status));

        // Match by customer name (case-insensitive) + exact amount
        const paymentAmount = parseFloat(args.amount);
        const searchName = resolvedName.toLowerCase();

        const exactMatches: any[] = [];
        const nameOnlyMatches: any[] = [];
        const amountOnlyMatches: any[] = [];

        for (const inv of openInvoices) {
          const custName = inv.customer?.name?.toLowerCase() || '';
          const dueAmount = parseFloat(inv.amountDue?.value || '0');

          const nameMatch =
            custName.includes(searchName) || searchName.includes(custName);
          const amountMatch = Math.abs(dueAmount - paymentAmount) < 0.01;

          if (nameMatch && amountMatch) {
            exactMatches.push(inv);
          } else if (nameMatch) {
            nameOnlyMatches.push(inv);
          } else if (amountMatch) {
            amountOnlyMatches.push(inv);
          }
        }

        // Determine result status
        let status: ReconEntry['status'];
        let matchedInvoiceId: string | null = null;
        let matchedCustomer: string | null = null;

        if (exactMatches.length === 1) {
          status = 'matched';
          matchedInvoiceId = exactMatches[0].id;
          matchedCustomer = exactMatches[0].customer?.name;
        } else if (exactMatches.length > 1) {
          status = 'ambiguous';
        } else {
          status = 'no_match';
        }

        // Log the reconciliation attempt
        const entry: ReconEntry = {
          fingerprint,
          venmoName: args.venmoName,
          amount: args.amount,
          date: args.date,
          matchedInvoiceId,
          matchedCustomer,
          status,
          timestamp: new Date().toISOString(),
        };
        appendReconEntry(entry);

        return {
          status,
          venmoName: args.venmoName,
          resolvedName: resolvedName !== args.venmoName ? resolvedName : undefined,
          amount: args.amount,
          date: args.date,
          exactMatches: exactMatches.map(formatInvoice),
          nameOnlyMatches: nameOnlyMatches.map(formatInvoice),
          amountOnlyMatches: amountOnlyMatches.map(formatInvoice),
          message: statusMessage(status, exactMatches.length),
        };
      },
    },

    wave_mark_invoice_paid: {
      description:
        'Mark an invoice as paid via manual payment. CONFIRMATION GATE: requires confirm=true to actually execute. Without it, shows what would happen.',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          invoiceId: { type: 'string', description: 'Invoice ID to mark as paid' },
          paymentAccountId: { type: 'string', description: 'Payment account ID (e.g. checking account from chart of accounts)' },
          amount: { type: 'string', description: 'Payment amount (e.g. "150.00")' },
          paymentDate: { type: 'string', description: 'Payment date (YYYY-MM-DD)' },
          memo: { type: 'string', description: 'Payment memo (e.g. "Venmo payment from John")' },
          confirm: { type: 'boolean', description: 'Set to true to actually record the payment. Without this, the tool shows a preview only.' },
        },
        required: ['invoiceId', 'paymentAccountId', 'amount', 'paymentDate'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('Business ID is required.');

        // Fetch the invoice first to show what we're about to pay
        const invoiceQuery = `
          query GetInvoice($businessId: ID!, $invoiceId: ID!) {
            business(id: $businessId) {
              invoice(id: $invoiceId) {
                id
                invoiceNumber
                status
                customer { id name }
                total { value currency { code } }
                amountDue { value }
                amountPaid { value }
              }
            }
          }
        `;

        const invResult = await client.query(invoiceQuery, {
          businessId,
          invoiceId: args.invoiceId,
        });

        const invoice = invResult.business.invoice;
        if (!invoice) {
          throw new Error(`Invoice ${args.invoiceId} not found.`);
        }

        // Preview mode — show what would happen
        if (!args.confirm) {
          return {
            preview: true,
            message: 'This is a preview. Set confirm=true to actually record the payment.',
            invoice: {
              id: invoice.id,
              number: invoice.invoiceNumber,
              customer: invoice.customer?.name,
              status: invoice.status,
              total: invoice.total?.value,
              currentlyDue: invoice.amountDue?.value,
              alreadyPaid: invoice.amountPaid?.value,
            },
            proposedPayment: {
              amount: args.amount,
              date: args.paymentDate,
              memo: args.memo || '(none)',
            },
          };
        }

        // Execute the payment
        const mutation = `
          mutation CreateManualPayment($input: InvoicePaymentCreateManualInput!) {
            invoicePaymentCreateManual(input: $input) {
              invoicePayment {
                id
                amount
                paymentDate
                paymentMethod
                memo
              }
              didSucceed
              inputErrors {
                message
                path
              }
            }
          }
        `;

        const input: any = {
          invoiceId: args.invoiceId,
          paymentAccountId: args.paymentAccountId,
          amount: args.amount,
          paymentDate: args.paymentDate,
          paymentMethod: 'OTHER',
          exchangeRate: '1',
          memo: args.memo || 'Venmo payment',
        };

        const payResult = await client.mutate(mutation, { input });

        if (!payResult.invoicePaymentCreateManual.didSucceed) {
          const errs = payResult.invoicePaymentCreateManual.inputErrors
            .map((e: any) => e.message)
            .join('; ');
          throw new Error(`Could not record payment: ${errs}`);
        }

        const payment = payResult.invoicePaymentCreateManual.invoicePayment;

        // Post-mutation verification: re-query the invoice to confirm status change
        let verifiedStatus = 'unknown';
        try {
          const verifyResult = await client.query(invoiceQuery, {
            businessId,
            invoiceId: args.invoiceId,
          });
          verifiedStatus = verifyResult.business.invoice?.status || 'unknown';
        } catch {
          // Verification failure is non-fatal — the payment was already recorded
          verifiedStatus = 'verification_failed';
        }

        // Update reconciliation log if this invoice was previously matched
        const log = loadReconLog();
        const matchEntry = log.find(
          (e) => e.matchedInvoiceId === args.invoiceId && e.status === 'matched'
        );
        if (matchEntry) {
          // Append a "paid" entry to mark completion
          appendReconEntry({
            ...matchEntry,
            status: 'paid',
            timestamp: new Date().toISOString(),
            paymentId: payment.id,
          });
        }

        return {
          success: true,
          message: `Payment of $${args.amount} recorded for invoice ${invoice.invoiceNumber}.`,
          payment,
          invoiceStatus: verifiedStatus,
          customer: invoice.customer?.name,
        };
      },
    },

    wave_manage_customer_aliases: {
      description:
        'Manage Venmo name to Wave customer name mappings. Used by the reconciliation engine to match payer names.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'add', 'remove'],
            description: 'Action to perform',
          },
          venmoName: { type: 'string', description: 'Venmo display name (for add/remove)' },
          waveCustomerName: { type: 'string', description: 'Wave customer name (for add)' },
        },
        required: ['action'],
      },
      handler: async (args: any) => {
        const aliases = loadAliases();

        switch (args.action) {
          case 'list':
            return {
              aliases,
              count: Object.keys(aliases).length,
              path: ALIASES_PATH,
            };

          case 'add':
            if (!args.venmoName || !args.waveCustomerName) {
              throw new Error('Both venmoName and waveCustomerName are required for add.');
            }
            aliases[args.venmoName.toLowerCase()] = args.waveCustomerName;
            saveAliases(aliases);
            return {
              success: true,
              message: `Mapped "${args.venmoName}" -> "${args.waveCustomerName}".`,
              aliases,
            };

          case 'remove':
            if (!args.venmoName) {
              throw new Error('venmoName is required for remove.');
            }
            const key = args.venmoName.toLowerCase();
            if (aliases[key]) {
              delete aliases[key];
              saveAliases(aliases);
              return { success: true, message: `Removed alias for "${args.venmoName}".` };
            }
            return { success: false, message: `No alias found for "${args.venmoName}".` };

          default:
            throw new Error('action must be "list", "add", or "remove".');
        }
      },
    },

    wave_reconciliation_log: {
      description: 'View the reconciliation log — history of all Venmo payment matching attempts.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Maximum entries to return (default: 50, most recent first)' },
          status: {
            type: 'string',
            enum: ['matched', 'paid', 'no_match', 'ambiguous'],
            description: 'Filter by status',
          },
        },
      },
      handler: async (args: any) => {
        let entries = loadReconLog();

        if (args.status) {
          entries = entries.filter((e) => e.status === args.status);
        }

        // Most recent first
        entries.reverse();

        const limit = args.limit || 50;
        entries = entries.slice(0, limit);

        return {
          entries,
          totalCount: entries.length,
          path: RECON_LOG_PATH,
        };
      },
    },
  };
}

// --- Helpers ---

function formatInvoice(inv: any) {
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    customer: inv.customer?.name,
    customerEmail: inv.customer?.email,
    total: inv.total?.value,
    amountDue: inv.amountDue?.value,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate,
  };
}

function statusMessage(status: string, matchCount: number): string {
  switch (status) {
    case 'matched':
      return 'Found exactly one matching invoice. Use wave_mark_invoice_paid to record the payment.';
    case 'ambiguous':
      return `Found ${matchCount} invoices matching this payment. Review the exact matches and pick the correct one manually.`;
    case 'no_match':
      return 'No exact match found. Check the name-only and amount-only matches for possible candidates, or add a customer alias with wave_manage_customer_aliases.';
    default:
      return '';
  }
}
