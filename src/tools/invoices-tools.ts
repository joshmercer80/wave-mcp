/**
 * Wave Invoice Tools
 *
 * Fixes from NoahMcGraw/wave-mcp:
 * - wave_get_invoice: removed nonexistent "id" field from InvoiceItemTax
 * - wave_list_invoices: wired status/customerId filters (client-side)
 * - wave_update_invoice: changed invoiceUpdate -> invoicePatch (correct API mutation name)
 */

import type { WaveClient } from '../client.js';

export function registerInvoiceTools(client: WaveClient) {
  return {
    wave_list_invoices: {
      description: 'List invoices for a business with optional status and customer filtering',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID (required if not set globally)' },
          status: {
            type: 'string',
            enum: ['DRAFT', 'SENT', 'VIEWED', 'PAID', 'PARTIAL', 'OVERDUE', 'APPROVED'],
            description: 'Filter by invoice status',
          },
          customerId: { type: 'string', description: 'Filter by customer ID' },
          page: { type: 'number', description: 'Page number (default: 1)' },
          pageSize: { type: 'number', description: 'Results per page (default: 20, max: 100)' },
        },
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('Business ID is required. Set it globally or pass businessId.');

        const query = `
          query GetInvoices($businessId: ID!, $page: Int!, $pageSize: Int!) {
            business(id: $businessId) {
              invoices(page: $page, pageSize: $pageSize) {
                pageInfo {
                  currentPage
                  totalPages
                  totalCount
                }
                edges {
                  node {
                    id
                    invoiceNumber
                    status
                    title
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
                    createdAt
                    modifiedAt
                    viewUrl
                  }
                }
              }
            }
          }
        `;

        const result = await client.query(query, {
          businessId,
          page: args.page || 1,
          pageSize: Math.min(args.pageSize || 20, 100),
        });

        // FIX: Wire status and customerId filters (client-side since Wave API
        // does not support server-side filtering on these fields)
        let edges = result.business.invoices.edges;

        if (args.status) {
          edges = edges.filter((e: any) => e.node.status === args.status);
        }

        if (args.customerId) {
          edges = edges.filter((e: any) => e.node.customer?.id === args.customerId);
        }

        return {
          pageInfo: result.business.invoices.pageInfo,
          edges,
        };
      },
    },

    wave_get_invoice: {
      description: 'Get detailed information about a specific invoice',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          invoiceId: { type: 'string', description: 'Invoice ID' },
        },
        required: ['invoiceId'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('Business ID is required. Set it globally or pass businessId.');

        // FIX: removed "id" from taxes selection — InvoiceItemTax type does not
        // have an "id" field in the Wave API schema.
        const query = `
          query GetInvoice($businessId: ID!, $invoiceId: ID!) {
            business(id: $businessId) {
              invoice(id: $invoiceId) {
                id
                invoiceNumber
                status
                title
                subhead
                invoiceDate
                dueDate
                customer {
                  id
                  name
                  email
                  firstName
                  lastName
                }
                items {
                  description
                  quantity
                  unitPrice
                  subtotal { value }
                  total { value }
                  product {
                    id
                    name
                  }
                  taxes {
                    name
                    rate
                  }
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
                footer
                memo
                createdAt
                modifiedAt
                viewUrl
                pdfUrl
              }
            }
          }
        `;

        const result = await client.query(query, {
          businessId,
          invoiceId: args.invoiceId,
        });

        return result.business.invoice;
      },
    },

    wave_create_invoice: {
      description: 'Create a new invoice (defaults to DRAFT status)',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID (uses global default if not provided)' },
          customerId: { type: 'string', description: 'Customer ID' },
          status: {
            type: 'string',
            enum: ['DRAFT', 'SAVED'],
            description: 'Invoice status (default: DRAFT)',
          },
          currency: { type: 'string', description: 'Currency code (e.g. USD). Defaults to business currency' },
          title: { type: 'string', description: 'Invoice title' },
          subhead: { type: 'string', description: 'Invoice subheading text' },
          invoiceNumber: { type: 'string', description: 'Invoice number. Auto-increments if not provided' },
          poNumber: { type: 'string', description: 'Purchase order number' },
          invoiceDate: { type: 'string', description: 'Invoice date (YYYY-MM-DD). Defaults to today' },
          exchangeRate: { type: 'string', description: 'Exchange rate to business currency' },
          dueDate: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
          memo: { type: 'string', description: 'Invoice memo/notes' },
          footer: { type: 'string', description: 'Invoice footer text' },
          items: {
            type: 'array',
            description: 'Invoice line items',
            items: {
              type: 'object',
              properties: {
                productId: { type: 'string', description: 'Product ID (required)' },
                description: { type: 'string', description: 'Override product description' },
                quantity: { type: 'number', description: 'Number of units' },
                unitPrice: { type: 'string', description: 'Override product unit price' },
                taxes: {
                  type: 'array',
                  description: 'Sales taxes to apply',
                  items: {
                    type: 'object',
                    properties: {
                      salesTaxId: { type: 'string', description: 'Sales tax ID' },
                    },
                    required: ['salesTaxId'],
                  },
                },
              },
              required: ['productId'],
            },
          },
        },
        required: ['customerId'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('Business ID is required. Set it globally or pass businessId.');

        const mutation = `
          mutation CreateInvoice($input: InvoiceCreateInput!) {
            invoiceCreate(input: $input) {
              invoice {
                id
                invoiceNumber
                status
                invoiceDate
                dueDate
                total { value currency { code } }
                amountDue { value }
                viewUrl
                pdfUrl
              }
              didSucceed
              inputErrors {
                message
                path
              }
            }
          }
        `;

        const input: any = { businessId, customerId: args.customerId };

        const optionalStrings = [
          'status', 'currency', 'title', 'subhead', 'invoiceNumber', 'poNumber',
          'invoiceDate', 'exchangeRate', 'dueDate', 'memo', 'footer',
        ];
        for (const key of optionalStrings) {
          if (args[key] !== undefined) input[key] = args[key];
        }

        if (args.items) input.items = args.items;

        const result = await client.mutate(mutation, { input });

        if (!result.invoiceCreate.didSucceed) {
          const errs = result.invoiceCreate.inputErrors
            .map((e: any) => e.message)
            .join('; ');
          throw new Error(`Could not create invoice: ${errs}`);
        }

        return result.invoiceCreate.invoice;
      },
    },

    wave_update_invoice: {
      description: 'Update an existing invoice (title, footer, memo, due date)',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          invoiceId: { type: 'string', description: 'Invoice ID' },
          title: { type: 'string', description: 'Invoice title' },
          subhead: { type: 'string', description: 'Invoice subhead' },
          footer: { type: 'string', description: 'Invoice footer' },
          memo: { type: 'string', description: 'Internal memo' },
          dueDate: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
        },
        required: ['invoiceId'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('Business ID is required. Set it globally or pass businessId.');

        // FIX: Wave API uses invoicePatch, not invoiceUpdate
        const mutation = `
          mutation PatchInvoice($input: InvoicePatchInput!) {
            invoicePatch(input: $input) {
              invoice {
                id
                invoiceNumber
                status
                title
                subhead
                footer
                memo
                dueDate
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
          businessId,
          invoiceId: args.invoiceId,
        };
        if (args.title !== undefined) input.title = args.title;
        if (args.subhead !== undefined) input.subhead = args.subhead;
        if (args.footer !== undefined) input.footer = args.footer;
        if (args.memo !== undefined) input.memo = args.memo;
        if (args.dueDate !== undefined) input.dueDate = args.dueDate;

        const result = await client.mutate(mutation, { input });

        if (!result.invoicePatch.didSucceed) {
          const errs = result.invoicePatch.inputErrors
            .map((e: any) => e.message)
            .join('; ');
          throw new Error(`Could not update invoice: ${errs}`);
        }

        return result.invoicePatch.invoice;
      },
    },

    wave_delete_invoice: {
      description: 'Delete an invoice (must be in DRAFT status)',
      parameters: {
        type: 'object',
        properties: {
          invoiceId: { type: 'string', description: 'Invoice ID' },
        },
        required: ['invoiceId'],
      },
      handler: async (args: any) => {
        const mutation = `
          mutation DeleteInvoice($input: InvoiceDeleteInput!) {
            invoiceDelete(input: $input) {
              didSucceed
              inputErrors {
                message
                path
              }
            }
          }
        `;

        const result = await client.mutate(mutation, {
          input: { invoiceId: args.invoiceId },
        });

        if (!result.invoiceDelete.didSucceed) {
          const errs = result.invoiceDelete.inputErrors
            .map((e: any) => e.message)
            .join('; ');
          throw new Error(`Could not delete invoice: ${errs}`);
        }

        return { success: true, message: 'Invoice deleted.' };
      },
    },

    wave_send_invoice: {
      description: 'Send an invoice to the customer via email',
      parameters: {
        type: 'object',
        properties: {
          invoiceId: { type: 'string', description: 'Invoice ID' },
          to: { type: 'array', items: { type: 'string' }, description: 'Recipient email addresses' },
          subject: { type: 'string', description: 'Email subject' },
          message: { type: 'string', description: 'Email message body' },
          attachPDF: { type: 'boolean', description: 'Attach invoice PDF to the email' },
          fromAddress: { type: 'string', description: 'From email address' },
          ccMyself: { type: 'boolean', description: 'CC yourself on the email' },
        },
        required: ['invoiceId', 'to', 'attachPDF'],
      },
      handler: async (args: any) => {
        const mutation = `
          mutation SendInvoice($input: InvoiceSendInput!) {
            invoiceSend(input: $input) {
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
          to: args.to,
          attachPDF: args.attachPDF,
        };
        if (args.subject) input.subject = args.subject;
        if (args.message) input.message = args.message;
        if (args.fromAddress) input.fromAddress = args.fromAddress;
        if (args.ccMyself !== undefined) input.ccMyself = args.ccMyself;

        const result = await client.mutate(mutation, { input });

        if (!result.invoiceSend.didSucceed) {
          const errs = result.invoiceSend.inputErrors
            .map((e: any) => e.message)
            .join('; ');
          throw new Error(`Could not send invoice: ${errs}`);
        }

        return { success: true, message: 'Invoice sent.' };
      },
    },

    wave_approve_invoice: {
      description: 'Approve a draft invoice (transitions from DRAFT to APPROVED)',
      parameters: {
        type: 'object',
        properties: {
          invoiceId: { type: 'string', description: 'Invoice ID' },
        },
        required: ['invoiceId'],
      },
      handler: async (args: any) => {
        const mutation = `
          mutation ApproveInvoice($input: InvoiceApproveInput!) {
            invoiceApprove(input: $input) {
              invoice {
                id
                status
              }
              didSucceed
              inputErrors {
                message
                path
              }
            }
          }
        `;

        const result = await client.mutate(mutation, {
          input: { invoiceId: args.invoiceId },
        });

        if (!result.invoiceApprove.didSucceed) {
          const errs = result.invoiceApprove.inputErrors
            .map((e: any) => e.message)
            .join('; ');
          throw new Error(`Could not approve invoice: ${errs}`);
        }

        return result.invoiceApprove.invoice;
      },
    },

    wave_mark_invoice_sent: {
      description: 'Mark an invoice as sent (without actually sending email)',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          invoiceId: { type: 'string', description: 'Invoice ID' },
        },
        required: ['invoiceId'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('Business ID is required.');

        const mutation = `
          mutation MarkInvoiceSent($input: InvoiceMarkSentInput!) {
            invoiceMarkSent(input: $input) {
              invoice {
                id
                status
              }
              didSucceed
              inputErrors {
                message
                path
              }
            }
          }
        `;

        const result = await client.mutate(mutation, {
          input: { businessId, invoiceId: args.invoiceId },
        });

        if (!result.invoiceMarkSent.didSucceed) {
          const errs = result.invoiceMarkSent.inputErrors
            .map((e: any) => e.message)
            .join('; ');
          throw new Error(`Could not mark invoice as sent: ${errs}`);
        }

        return result.invoiceMarkSent.invoice;
      },
    },

    wave_list_invoice_payments: {
      description: 'List payments received for a specific invoice',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          invoiceId: { type: 'string', description: 'Invoice ID' },
        },
        required: ['invoiceId'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('Business ID is required.');

        const query = `
          query GetInvoicePayments($businessId: ID!, $invoiceId: ID!) {
            business(id: $businessId) {
              invoice(id: $invoiceId) {
                id
                payments {
                  id
                  amount {
                    value
                    currency { code }
                  }
                  paymentDate
                  paymentMethod
                  memo
                }
              }
            }
          }
        `;

        const result = await client.query(query, {
          businessId,
          invoiceId: args.invoiceId,
        });

        return result.business.invoice.payments;
      },
    },

    wave_create_invoice_payment: {
      description: 'Record a manual payment received for an invoice (uses invoicePaymentCreateManual)',
      parameters: {
        type: 'object',
        properties: {
          invoiceId: { type: 'string', description: 'Invoice ID' },
          paymentAccountId: { type: 'string', description: 'Payment account ID (from chart of accounts)' },
          amount: { type: 'string', description: 'Payment amount (e.g. "100.00")' },
          paymentDate: { type: 'string', description: 'Payment date (YYYY-MM-DD)' },
          paymentMethod: {
            type: 'string',
            enum: ['BANK_TRANSFER', 'CASH', 'CHEQUE', 'CREDIT_CARD', 'OTHER', 'PAYPAL', 'UNSPECIFIED'],
            description: 'Payment method',
          },
          exchangeRate: { type: 'string', description: 'Exchange rate (default: "1")' },
          memo: { type: 'string', description: 'Payment notes/memo' },
        },
        required: ['invoiceId', 'paymentAccountId', 'amount', 'paymentDate', 'paymentMethod'],
      },
      handler: async (args: any) => {
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
          paymentMethod: args.paymentMethod,
          exchangeRate: args.exchangeRate || '1',
        };
        if (args.memo) input.memo = args.memo;

        const result = await client.mutate(mutation, { input });

        if (!result.invoicePaymentCreateManual.didSucceed) {
          const errs = result.invoicePaymentCreateManual.inputErrors
            .map((e: any) => e.message)
            .join('; ');
          throw new Error(`Could not record payment: ${errs}`);
        }

        return result.invoicePaymentCreateManual.invoicePayment;
      },
    },

    wave_send_payment_receipt: {
      description: 'Send a payment receipt email for an invoice payment',
      parameters: {
        type: 'object',
        properties: {
          invoiceId: { type: 'string', description: 'Invoice ID' },
          invoicePaymentId: { type: 'string', description: 'Invoice Payment ID' },
          to: { type: 'array', items: { type: 'string' }, description: 'Recipient email addresses' },
          subject: { type: 'string', description: 'Email subject' },
          message: { type: 'string', description: 'Email message body' },
          attachPdf: { type: 'boolean', description: 'Attach invoice PDF (default: false)' },
          ccMyself: { type: 'boolean', description: 'CC yourself on the email' },
          fromAddress: { type: 'string', description: 'From email address' },
        },
        required: ['invoiceId', 'invoicePaymentId', 'to'],
      },
      handler: async (args: any) => {
        const mutation = `
          mutation SendPaymentReceipt($input: InvoicePaymentReceiptSendInput!) {
            invoicePaymentReceiptSend(input: $input) {
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
          invoicePaymentId: args.invoicePaymentId,
          to: args.to,
        };
        if (args.subject) input.subject = args.subject;
        if (args.message) input.message = args.message;
        if (args.attachPdf !== undefined) input.attachPdf = args.attachPdf;
        if (args.ccMyself !== undefined) input.ccMyself = args.ccMyself;
        if (args.fromAddress) input.fromAddress = args.fromAddress;

        const result = await client.mutate(mutation, { input });

        if (!result.invoicePaymentReceiptSend.didSucceed) {
          const errs = result.invoicePaymentReceiptSend.inputErrors
            .map((e: any) => e.message)
            .join('; ');
          throw new Error(`Could not send receipt: ${errs}`);
        }

        return { success: true, message: 'Payment receipt sent.' };
      },
    },
  };
}
