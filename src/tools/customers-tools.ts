/**
 * Wave Customer Tools
 *
 * Fixes from NoahMcGraw/wave-mcp:
 * - wave_search_customers: removed unused $query GraphQL variable
 * - wave_list_customers: simplified fields to match actual Customer type
 * - wave_update_customer: changed customerUpdate -> customerPatch (correct API mutation name)
 */

import type { WaveClient } from '../client.js';

export function registerCustomerTools(client: WaveClient) {
  return {
    wave_list_customers: {
      description: 'List all customers for a business',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID (required if not set globally)' },
          page: { type: 'number', description: 'Page number (default: 1)' },
          pageSize: { type: 'number', description: 'Results per page (default: 50, max: 100)' },
        },
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('Business ID is required. Set it globally or pass businessId.');

        const query = `
          query GetCustomers($businessId: ID!, $page: Int!, $pageSize: Int!) {
            business(id: $businessId) {
              customers(page: $page, pageSize: $pageSize) {
                pageInfo {
                  currentPage
                  totalPages
                  totalCount
                }
                edges {
                  node {
                    id
                    name
                    email
                    firstName
                    lastName
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
          pageSize: Math.min(args.pageSize || 50, 100),
        });

        return result.business.customers;
      },
    },

    wave_get_customer: {
      description: 'Get detailed information about a specific customer including recent invoices',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          customerId: { type: 'string', description: 'Customer ID' },
        },
        required: ['customerId'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('Business ID is required. Set it globally or pass businessId.');

        const query = `
          query GetCustomer($businessId: ID!, $customerId: ID!) {
            business(id: $businessId) {
              customer(id: $customerId) {
                id
                name
                email
                firstName
                lastName
                address {
                  addressLine1
                  addressLine2
                  city
                  provinceCode
                  countryCode
                  postalCode
                }
                currency { code }
                createdAt
                modifiedAt
              }
            }
          }
        `;

        const result = await client.query(query, {
          businessId,
          customerId: args.customerId,
        });

        return result.business.customer;
      },
    },

    wave_create_customer: {
      description: 'Create a new customer',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          name: { type: 'string', description: 'Customer name (company or full name)' },
          firstName: { type: 'string', description: 'First name' },
          lastName: { type: 'string', description: 'Last name' },
          email: { type: 'string', description: 'Email address' },
          addressLine1: { type: 'string', description: 'Address line 1' },
          addressLine2: { type: 'string', description: 'Address line 2' },
          city: { type: 'string', description: 'City' },
          provinceCode: { type: 'string', description: 'Province/State code (e.g., CA, NY)' },
          countryCode: { type: 'string', description: 'Country code (e.g., US, CA)' },
          postalCode: { type: 'string', description: 'Postal/ZIP code' },
          currency: { type: 'string', description: 'Currency code (e.g., USD)' },
        },
        required: ['name'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('Business ID is required. Set it globally or pass businessId.');

        const mutation = `
          mutation CreateCustomer($input: CustomerCreateInput!) {
            customerCreate(input: $input) {
              customer {
                id
                name
                email
                firstName
                lastName
                currency { code }
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
          name: args.name,
          firstName: args.firstName,
          lastName: args.lastName,
          email: args.email,
          currency: args.currency,
        };

        if (args.addressLine1 || args.city || args.postalCode) {
          input.address = {
            addressLine1: args.addressLine1,
            addressLine2: args.addressLine2,
            city: args.city,
            provinceCode: args.provinceCode,
            countryCode: args.countryCode,
            postalCode: args.postalCode,
          };
        }

        const result = await client.mutate(mutation, { input });

        if (!result.customerCreate.didSucceed) {
          const errs = result.customerCreate.inputErrors
            .map((e: any) => e.message)
            .join('; ');
          throw new Error(`Could not create customer: ${errs}`);
        }

        return result.customerCreate.customer;
      },
    },

    wave_update_customer: {
      description: 'Update an existing customer',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          customerId: { type: 'string', description: 'Customer ID' },
          name: { type: 'string', description: 'Customer name' },
          firstName: { type: 'string', description: 'First name' },
          lastName: { type: 'string', description: 'Last name' },
          email: { type: 'string', description: 'Email address' },
          addressLine1: { type: 'string', description: 'Address line 1' },
          addressLine2: { type: 'string', description: 'Address line 2' },
          city: { type: 'string', description: 'City' },
          provinceCode: { type: 'string', description: 'Province/State code' },
          countryCode: { type: 'string', description: 'Country code' },
          postalCode: { type: 'string', description: 'Postal/ZIP code' },
        },
        required: ['customerId'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('Business ID is required. Set it globally or pass businessId.');

        // FIX: Wave API uses customerPatch, not customerUpdate
        const mutation = `
          mutation PatchCustomer($input: CustomerPatchInput!) {
            customerPatch(input: $input) {
              customer {
                id
                name
                email
                firstName
                lastName
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
          id: args.customerId,
          name: args.name,
          firstName: args.firstName,
          lastName: args.lastName,
          email: args.email,
        };

        if (args.addressLine1 || args.city || args.postalCode) {
          input.address = {
            addressLine1: args.addressLine1,
            addressLine2: args.addressLine2,
            city: args.city,
            provinceCode: args.provinceCode,
            countryCode: args.countryCode,
            postalCode: args.postalCode,
          };
        }

        const result = await client.mutate(mutation, { input });

        if (!result.customerPatch.didSucceed) {
          const errs = result.customerPatch.inputErrors
            .map((e: any) => e.message)
            .join('; ');
          throw new Error(`Could not update customer: ${errs}`);
        }

        return result.customerPatch.customer;
      },
    },

    wave_delete_customer: {
      description: 'Delete a customer. Wave will reject this if the customer has existing invoices.',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          customerId: { type: 'string', description: 'Customer ID' },
        },
        required: ['customerId'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('Business ID is required. Set it globally or pass businessId.');

        const mutation = `
          mutation DeleteCustomer($input: CustomerDeleteInput!) {
            customerDelete(input: $input) {
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
            customerId: args.customerId,
          },
        });

        if (!result.customerDelete.didSucceed) {
          const errs = result.customerDelete.inputErrors
            .map((e: any) => e.message)
            .join('; ');
          throw new Error(`Could not delete customer: ${errs}`);
        }

        return { success: true, message: 'Customer deleted successfully.' };
      },
    },

    wave_search_customers: {
      description: 'Search customers by name or email (client-side filtering of the first 100 customers only)',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          query: { type: 'string', description: 'Search query (name or email)' },
          limit: { type: 'number', description: 'Maximum results (default: 20)' },
        },
        required: ['query'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('Business ID is required. Set it globally or pass businessId.');

        // FIX: removed unused $query GraphQL variable — Wave API has no server-side search.
        // We fetch all customers and filter client-side.
        const gql = `
          query SearchCustomers($businessId: ID!) {
            business(id: $businessId) {
              customers(page: 1, pageSize: 100) {
                edges {
                  node {
                    id
                    name
                    email
                    firstName
                    lastName
                  }
                }
              }
            }
          }
        `;

        const result = await client.query(gql, { businessId });

        const searchTerm = args.query.toLowerCase();
        const filtered = result.business.customers.edges
          .filter((edge: any) => {
            const c = edge.node;
            return (
              c.name?.toLowerCase().includes(searchTerm) ||
              c.email?.toLowerCase().includes(searchTerm) ||
              c.firstName?.toLowerCase().includes(searchTerm) ||
              c.lastName?.toLowerCase().includes(searchTerm)
            );
          })
          .slice(0, args.limit || 20);

        return {
          customers: filtered.map((edge: any) => edge.node),
          count: filtered.length,
        };
      },
    },
  };
}
