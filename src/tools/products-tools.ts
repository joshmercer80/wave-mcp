/**
 * Wave Product Tools (Products and Services)
 *
 * Fixes from NoahMcGraw/wave-mcp:
 * - wave_create_product: removed isSold/isBought (not on ProductCreateInput)
 * - wave_update_product: changed productUpdate -> productPatch (correct API mutation name)
 */

import type { WaveClient } from '../client.js';

export function registerProductTools(client: WaveClient) {
  return {
    wave_list_products: {
      description: 'List all products and services for a business',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          isSold: { type: 'boolean', description: 'Filter products that are sold' },
          isBought: { type: 'boolean', description: 'Filter products that are bought' },
          isArchived: { type: 'boolean', description: 'Include archived products (default: false)' },
          page: { type: 'number', description: 'Page number (default: 1)' },
          pageSize: { type: 'number', description: 'Results per page (default: 50)' },
        },
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('Business ID is required.');

        const query = `
          query GetProducts($businessId: ID!, $page: Int!, $pageSize: Int!) {
            business(id: $businessId) {
              products(page: $page, pageSize: $pageSize) {
                pageInfo {
                  currentPage
                  totalPages
                  totalCount
                }
                edges {
                  node {
                    id
                    name
                    description
                    unitPrice
                    isSold
                    isBought
                    isArchived
                    incomeAccount {
                      id
                      name
                    }
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

        let products = result.business.products.edges.map((e: any) => e.node);

        if (args.isSold !== undefined) {
          products = products.filter((p: any) => p.isSold === args.isSold);
        }
        if (args.isBought !== undefined) {
          products = products.filter((p: any) => p.isBought === args.isBought);
        }
        if (args.isArchived === false) {
          products = products.filter((p: any) => !p.isArchived);
        }

        return {
          products,
          pageInfo: result.business.products.pageInfo,
        };
      },
    },

    wave_get_product: {
      description: 'Get detailed information about a specific product or service',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          productId: { type: 'string', description: 'Product ID' },
        },
        required: ['productId'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('Business ID is required.');

        const query = `
          query GetProduct($businessId: ID!, $productId: ID!) {
            business(id: $businessId) {
              product(id: $productId) {
                id
                name
                description
                unitPrice
                isSold
                isBought
                isArchived
                incomeAccount {
                  id
                  name
                  type { name }
                }
                createdAt
                modifiedAt
              }
            }
          }
        `;

        const result = await client.query(query, {
          businessId,
          productId: args.productId,
        });

        return result.business.product;
      },
    },

    wave_create_product: {
      description: 'Create a new product or service',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          name: { type: 'string', description: 'Product/service name' },
          description: { type: 'string', description: 'Product description' },
          unitPrice: { type: 'string', description: 'Default unit price' },
          incomeAccountId: { type: 'string', description: 'Income account ID' },
        },
        required: ['name'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('Business ID is required.');

        const mutation = `
          mutation CreateProduct($input: ProductCreateInput!) {
            productCreate(input: $input) {
              product {
                id
                name
                description
                unitPrice
                isSold
                isBought
                incomeAccount {
                  id
                  name
                }
              }
              didSucceed
              inputErrors {
                message
                path
              }
            }
          }
        `;

        // FIX: removed isSold/isBought — these fields are NOT on ProductCreateInput
        const input: any = {
          businessId,
          name: args.name,
        };
        if (args.description) input.description = args.description;
        if (args.unitPrice) input.unitPrice = args.unitPrice;
        if (args.incomeAccountId) input.incomeAccountId = args.incomeAccountId;

        const result = await client.mutate(mutation, { input });

        if (!result.productCreate.didSucceed) {
          const errs = result.productCreate.inputErrors
            .map((e: any) => e.message)
            .join('; ');
          throw new Error(`Could not create product: ${errs}`);
        }

        return result.productCreate.product;
      },
    },

    wave_update_product: {
      description: 'Update an existing product or service',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          productId: { type: 'string', description: 'Product ID' },
          name: { type: 'string', description: 'Product name' },
          description: { type: 'string', description: 'Product description' },
          unitPrice: { type: 'string', description: 'Default unit price' },
          incomeAccountId: { type: 'string', description: 'Income account ID' },
        },
        required: ['productId'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('Business ID is required.');

        // FIX: Wave API uses productPatch, not productUpdate
        const mutation = `
          mutation PatchProduct($input: ProductPatchInput!) {
            productPatch(input: $input) {
              product {
                id
                name
                description
                unitPrice
                incomeAccount {
                  id
                  name
                }
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
          id: args.productId,
        };
        if (args.name !== undefined) input.name = args.name;
        if (args.description !== undefined) input.description = args.description;
        if (args.unitPrice !== undefined) input.unitPrice = args.unitPrice;
        if (args.incomeAccountId !== undefined) input.incomeAccountId = args.incomeAccountId;

        const result = await client.mutate(mutation, { input });

        if (!result.productPatch.didSucceed) {
          const errs = result.productPatch.inputErrors
            .map((e: any) => e.message)
            .join('; ');
          throw new Error(`Could not update product: ${errs}`);
        }

        return result.productPatch.product;
      },
    },

    wave_delete_product: {
      description: 'Archive a product or service (soft delete)',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          productId: { type: 'string', description: 'Product ID' },
        },
        required: ['productId'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('Business ID is required.');

        const mutation = `
          mutation ArchiveProduct($input: ProductArchiveInput!) {
            productArchive(input: $input) {
              product {
                id
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
          input: { businessId, productId: args.productId },
        });

        if (!result.productArchive.didSucceed) {
          const errs = result.productArchive.inputErrors
            .map((e: any) => e.message)
            .join('; ');
          throw new Error(`Could not archive product: ${errs}`);
        }

        return { success: true, message: 'Product archived.' };
      },
    },
  };
}
