/**
 * Wave Tax Tools
 *
 * Fixes from schema introspection (2026-03-29):
 * - wave_list_taxes: `taxes` -> `salesTaxes`, fields aligned to SalesTax type
 * - wave_get_tax: `tax(id)` -> `salesTax(id)`, fields aligned to SalesTax type
 * - wave_create_tax: already used `salesTaxCreate` (correct)
 *
 * SalesTax.rate takes a `for: Date` argument. We query `rates` (list of
 * {effective, rate} objects) for the full rate history instead.
 */

import type { WaveClient } from '../client.js';

export function registerTaxTools(client: WaveClient) {
  return {
    wave_list_taxes: {
      description: 'List all sales taxes configured for a business',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          isArchived: { type: 'boolean', description: 'Filter by archived status' },
          page: { type: 'number', description: 'Page number (default: 1)' },
          pageSize: { type: 'number', description: 'Results per page (default: 20)' },
        },
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('Business ID is required.');

        const query = `
          query GetSalesTaxes($businessId: ID!, $page: Int!, $pageSize: Int!, $isArchived: Boolean) {
            business(id: $businessId) {
              salesTaxes(page: $page, pageSize: $pageSize, isArchived: $isArchived) {
                pageInfo {
                  currentPage
                  totalPages
                  totalCount
                }
                edges {
                  node {
                    id
                    name
                    abbreviation
                    description
                    taxNumber
                    showTaxNumberOnInvoices
                    rates {
                      effective
                      rate
                    }
                    isCompound
                    isRecoverable
                    isArchived
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
          isArchived: args.isArchived,
        });

        return {
          pageInfo: result.business.salesTaxes.pageInfo,
          taxes: result.business.salesTaxes.edges.map((e: any) => e.node),
        };
      },
    },

    wave_get_tax: {
      description: 'Get detailed information about a specific sales tax',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          taxId: { type: 'string', description: 'Tax ID' },
        },
        required: ['taxId'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('Business ID is required.');

        const query = `
          query GetSalesTax($businessId: ID!, $taxId: ID!) {
            business(id: $businessId) {
              salesTax(id: $taxId) {
                id
                name
                abbreviation
                description
                taxNumber
                showTaxNumberOnInvoices
                rates {
                  effective
                  rate
                }
                isCompound
                isRecoverable
                isArchived
                createdAt
                modifiedAt
              }
            }
          }
        `;

        const result = await client.query(query, {
          businessId,
          taxId: args.taxId,
        });

        return result.business.salesTax;
      },
    },

    wave_create_tax: {
      description: 'Create a new sales tax',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          name: { type: 'string', description: 'Tax name (e.g., "Sales Tax")' },
          abbreviation: { type: 'string', description: 'Tax abbreviation (e.g., "ST")' },
          rate: { type: 'string', description: 'Tax rate as decimal (e.g., "0.0875" for 8.75%)' },
          description: { type: 'string', description: 'Tax description' },
          taxNumber: { type: 'string', description: 'Tax registration number' },
          showTaxNumberOnInvoices: { type: 'boolean', description: 'Show tax number on invoices' },
          isCompound: { type: 'boolean', description: 'Whether this is a compound tax' },
          isRecoverable: { type: 'boolean', description: 'Whether this tax is recoverable' },
        },
        required: ['name', 'rate'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('Business ID is required.');

        const mutation = `
          mutation CreateSalesTax($input: SalesTaxCreateInput!) {
            salesTaxCreate(input: $input) {
              salesTax {
                id
                name
                abbreviation
                description
                taxNumber
                rates {
                  effective
                  rate
                }
                isCompound
                isRecoverable
                isArchived
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
          input: {
            businessId,
            name: args.name,
            abbreviation: args.abbreviation,
            rate: args.rate,
            description: args.description,
            taxNumber: args.taxNumber,
            showTaxNumberOnInvoices: args.showTaxNumberOnInvoices,
            isCompound: args.isCompound,
            isRecoverable: args.isRecoverable,
          },
        });

        if (!result.salesTaxCreate.didSucceed) {
          const errs = result.salesTaxCreate.inputErrors
            .map((e: any) => e.message)
            .join('; ');
          throw new Error(`Could not create tax: ${errs}`);
        }

        return result.salesTaxCreate.salesTax;
      },
    },
  };
}
