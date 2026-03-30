/**
 * Wave Business Tools
 *
 * Added wave_switch_business for changing the active business context.
 */

import type { WaveClient } from '../client.js';

export function registerBusinessTools(client: WaveClient) {
  return {
    wave_list_businesses: {
      description: 'List all businesses accessible with the current access token',
      parameters: {
        type: 'object',
        properties: {},
      },
      handler: async (_args: any) => {
        const query = `
          query ListBusinesses($page: Int!, $pageSize: Int!) {
            businesses(page: $page, pageSize: $pageSize) {
              edges {
                node {
                  id
                  name
                  currency {
                    code
                    symbol
                  }
                }
              }
            }
          }
        `;

        const result = await client.query(query, { page: 1, pageSize: 50 });
        return result.businesses.edges.map((e: any) => e.node);
      },
    },

    wave_get_business: {
      description: 'Get detailed information about a specific business',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
        },
        required: ['businessId'],
      },
      handler: async (args: any) => {
        const query = `
          query GetBusiness($businessId: ID!) {
            business(id: $businessId) {
              id
              name
              currency {
                code
                symbol
              }
              timezone
              address {
                addressLine1
                addressLine2
                city
                province { code name }
                country { code name }
                postalCode
              }
            }
          }
        `;

        const result = await client.query(query, {
          businessId: args.businessId,
        });

        return result.business;
      },
    },

    wave_get_current_business: {
      description: 'Get the currently active business (based on global businessId)',
      parameters: {
        type: 'object',
        properties: {},
      },
      handler: async (_args: any) => {
        const businessId = client.getBusinessId();
        if (!businessId) {
          throw new Error(
            'No business ID set. Use wave_list_businesses to see available businesses, then wave_switch_business to select one.'
          );
        }

        const query = `
          query GetBusiness($businessId: ID!) {
            business(id: $businessId) {
              id
              name
              currency {
                code
                symbol
              }
              timezone
              address {
                addressLine1
                addressLine2
                city
                province { code name }
                country { code name }
                postalCode
              }
            }
          }
        `;

        const result = await client.query(query, { businessId });
        return result.business;
      },
    },

    wave_switch_business: {
      description: 'Switch the active business context for this session (session-only — reverts to credentials.json default on restart)',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID to switch to' },
        },
        required: ['businessId'],
      },
      handler: async (args: any) => {
        // Validate the business exists by querying it
        const query = `
          query GetBusiness($businessId: ID!) {
            business(id: $businessId) {
              id
              name
              currency { code }
            }
          }
        `;

        const result = await client.query(query, {
          businessId: args.businessId,
        });

        if (!result.business) {
          throw new Error(
            `Business ${args.businessId} not found. Use wave_list_businesses to see available businesses.`
          );
        }

        client.setBusinessId(args.businessId);

        return {
          success: true,
          message: `Switched to business: ${result.business.name}`,
          business: result.business,
        };
      },
    },
  };
}
