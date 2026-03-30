/**
 * Wave Estimate Tools (Quotes/Proposals)
 *
 * Fixes from schema introspection (2026-03-29):
 * - list/get: `expiryDate` -> `dueDate` (AREstimate has dueDate, not expiryDate)
 * - list: added additional fields from AREstimate (amountDue, amountPaid, pdfUrl, viewUrl)
 * - get: aligned item fields to EstimateItem type (subtotal, taxes as list)
 * - update: `estimateUpdate`/`EstimateUpdateInput` -> `estimatePatch`/`EstimatePatchInput`
 * - create: `expiryDate` -> `dueDate` in input
 * - convert_to_invoice: REMOVED (estimateConvertToInvoice does not exist in Wave API)
 */

import type { WaveClient } from '../client.js';

export function registerEstimateTools(client: WaveClient) {
  return {
    wave_list_estimates: {
      description: 'List estimates (quotes) for a business',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          status: {
            type: 'string',
            enum: ['ACCEPTED', 'ACTIVE', 'APPROVED', 'CONVERTED', 'DRAFT', 'EXPIRED', 'PAID', 'PARTIAL', 'REJECTED', 'SENT', 'UNPAID', 'VIEWED'],
            description: 'Filter by estimate status',
          },
          customerId: { type: 'string', description: 'Filter by customer ID' },
          page: { type: 'number', description: 'Page number (default: 1)' },
          pageSize: { type: 'number', description: 'Results per page (default: 20)' },
        },
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('businessId required');

        const query = `
          query GetEstimates($businessId: ID!, $page: Int!, $pageSize: Int!, $status: EstimateListStatusFilter, $customerId: ID) {
            business(id: $businessId) {
              estimates(page: $page, pageSize: $pageSize, status: $status, customerId: $customerId) {
                pageInfo {
                  currentPage
                  totalPages
                  totalCount
                }
                edges {
                  node {
                    id
                    estimateNumber
                    status
                    title
                    estimateDate
                    dueDate
                    customer {
                      id
                      name
                      email
                    }
                    amountDue {
                      value
                      currency { code }
                    }
                    amountPaid {
                      value
                    }
                    total {
                      value
                      currency { code }
                    }
                    pdfUrl
                    viewUrl
                    createdAt
                    modifiedAt
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
          status: args.status,
          customerId: args.customerId,
        });

        return {
          pageInfo: result.business.estimates.pageInfo,
          estimates: result.business.estimates.edges.map((e: any) => e.node),
        };
      },
    },

    wave_get_estimate: {
      description: 'Get detailed information about a specific estimate',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          estimateId: { type: 'string', description: 'Estimate ID' },
        },
        required: ['estimateId'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('businessId required');

        const query = `
          query GetEstimate($businessId: ID!, $estimateId: ID!) {
            business(id: $businessId) {
              estimate(id: $estimateId) {
                id
                estimateNumber
                status
                title
                subhead
                estimateDate
                dueDate
                poNumber
                customer {
                  id
                  name
                  email
                  firstName
                  lastName
                }
                items {
                  id
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
                    salesTax { id name }
                    amount { value }
                  }
                }
                amountDue {
                  value
                  currency { code }
                }
                amountPaid {
                  value
                }
                total {
                  value
                  currency { code symbol }
                }
                taxTotal {
                  value
                }
                subtotal {
                  value
                }
                footer
                memo
                pdfUrl
                viewUrl
                createdAt
                modifiedAt
              }
            }
          }
        `;

        const result = await client.query(query, {
          businessId,
          estimateId: args.estimateId,
        });

        return result.business.estimate;
      },
    },

    wave_create_estimate: {
      description: 'Create a new estimate (quote)',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          customerId: { type: 'string', description: 'Customer ID' },
          estimateDate: { type: 'string', description: 'Estimate date (YYYY-MM-DD)' },
          dueDate: { type: 'string', description: 'Due/expiry date (YYYY-MM-DD)' },
          title: { type: 'string', description: 'Estimate title' },
          subhead: { type: 'string', description: 'Estimate subhead' },
          footer: { type: 'string', description: 'Footer text' },
          memo: { type: 'string', description: 'Internal memo' },
          items: {
            type: 'array',
            description: 'Estimate line items',
            items: {
              type: 'object',
              properties: {
                productId: { type: 'string', description: 'Product ID (optional)' },
                description: { type: 'string', description: 'Line item description' },
                quantity: { type: 'string', description: 'Quantity (decimal string)' },
                unitPrice: { type: 'string', description: 'Unit price (decimal string)' },
              },
              required: ['description', 'quantity', 'unitPrice'],
            },
          },
        },
        required: ['customerId', 'estimateDate', 'items'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('businessId required');

        const mutation = `
          mutation CreateEstimate($input: EstimateCreateInput!) {
            estimateCreate(input: $input) {
              estimate {
                id
                estimateNumber
                status
                total { value currency { code } }
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
          customerId: args.customerId,
          estimateDate: args.estimateDate,
          dueDate: args.dueDate,
          title: args.title,
          subhead: args.subhead,
          footer: args.footer,
          memo: args.memo,
          items: args.items,
        };

        const result = await client.mutate(mutation, { input });

        if (!result.estimateCreate.didSucceed) {
          const errs = result.estimateCreate.inputErrors
            .map((e: any) => e.message)
            .join('; ');
          throw new Error(`Could not create estimate: ${errs}`);
        }

        return result.estimateCreate.estimate;
      },
    },

    wave_update_estimate: {
      description: 'Update an existing estimate (uses estimatePatch mutation)',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          estimateId: { type: 'string', description: 'Estimate ID' },
          customerId: { type: 'string', description: 'Customer ID' },
          title: { type: 'string', description: 'Estimate title' },
          subhead: { type: 'string', description: 'Estimate subhead' },
          footer: { type: 'string', description: 'Footer text' },
          memo: { type: 'string', description: 'Internal memo' },
          dueDate: { type: 'string', description: 'Due/expiry date (YYYY-MM-DD)' },
          estimateDate: { type: 'string', description: 'Estimate date (YYYY-MM-DD)' },
          poNumber: { type: 'string', description: 'PO number' },
        },
        required: ['estimateId'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('businessId required');

        const mutation = `
          mutation PatchEstimate($input: EstimatePatchInput!) {
            estimatePatch(input: $input) {
              estimate {
                id
                estimateNumber
                status
                title
                subhead
                footer
                memo
                dueDate
                estimateDate
                poNumber
              }
              didSucceed
              inputErrors {
                message
                path
              }
            }
          }
        `;

        // Build input, omitting undefined fields so Wave doesn't null them out
        const input: any = { businessId, id: args.estimateId };
        if (args.customerId !== undefined) input.customerId = args.customerId;
        if (args.title !== undefined) input.title = args.title;
        if (args.subhead !== undefined) input.subhead = args.subhead;
        if (args.footer !== undefined) input.footer = args.footer;
        if (args.memo !== undefined) input.memo = args.memo;
        if (args.dueDate !== undefined) input.dueDate = args.dueDate;
        if (args.estimateDate !== undefined) input.estimateDate = args.estimateDate;
        if (args.poNumber !== undefined) input.poNumber = args.poNumber;

        const result = await client.mutate(mutation, { input });

        if (!result.estimatePatch.didSucceed) {
          const errs = result.estimatePatch.inputErrors
            .map((e: any) => e.message)
            .join('; ');
          throw new Error(`Could not update estimate: ${errs}`);
        }

        return result.estimatePatch.estimate;
      },
    },

    wave_send_estimate: {
      description: 'Send an estimate to the customer via email',
      parameters: {
        type: 'object',
        properties: {
          estimateId: { type: 'string', description: 'Estimate ID' },
          to: { type: 'array', items: { type: 'string' }, description: 'Recipient email addresses' },
          subject: { type: 'string', description: 'Email subject' },
          message: { type: 'string', description: 'Email message body' },
          attachPDF: { type: 'boolean', description: 'Attach PDF to email' },
          ccMyself: { type: 'boolean', description: 'CC yourself on the email' },
        },
        required: ['estimateId', 'to'],
      },
      handler: async (args: any) => {

        const mutation = `
          mutation SendEstimate($input: EstimateSendInput!) {
            estimateSend(input: $input) {
              estimate {
                id
                status
                lastSentAt
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
          estimateId: args.estimateId,
          to: args.to,
          subject: args.subject,
          message: args.message,
        };
        if (args.attachPDF !== undefined) input.attachPDF = args.attachPDF;
        if (args.ccMyself !== undefined) input.ccMyself = args.ccMyself;

        const result = await client.mutate(mutation, { input });

        if (!result.estimateSend.didSucceed) {
          const errs = result.estimateSend.inputErrors
            .map((e: any) => e.message)
            .join('; ');
          throw new Error(`Could not send estimate: ${errs}`);
        }

        return result.estimateSend.estimate;
      },
    },

    wave_approve_estimate: {
      description: 'Approve a draft estimate',
      parameters: {
        type: 'object',
        properties: {
          estimateId: { type: 'string', description: 'Estimate ID' },
        },
        required: ['estimateId'],
      },
      handler: async (args: any) => {
        const mutation = `
          mutation ApproveEstimate($input: EstimateApproveInput!) {
            estimateApprove(input: $input) {
              estimate {
                id
                estimateNumber
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
          input: { estimateId: args.estimateId },
        });

        if (!result.estimateApprove.didSucceed) {
          const errs = result.estimateApprove.inputErrors
            .map((e: any) => e.message)
            .join('; ');
          throw new Error(`Could not approve estimate: ${errs}`);
        }

        return result.estimateApprove.estimate;
      },
    },

    wave_delete_estimate: {
      description: 'Delete an estimate',
      parameters: {
        type: 'object',
        properties: {
          estimateId: { type: 'string', description: 'Estimate ID' },
        },
        required: ['estimateId'],
      },
      handler: async (args: any) => {
        const mutation = `
          mutation DeleteEstimate($input: EstimateDeleteInput!) {
            estimateDelete(input: $input) {
              didSucceed
              inputErrors {
                message
                path
              }
            }
          }
        `;

        const result = await client.mutate(mutation, {
          input: { estimateId: args.estimateId },
        });

        if (!result.estimateDelete.didSucceed) {
          const errs = result.estimateDelete.inputErrors
            .map((e: any) => e.message)
            .join('; ');
          throw new Error(`Could not delete estimate: ${errs}`);
        }

        return { success: true, message: 'Estimate deleted successfully' };
      },
    },
  };
}
