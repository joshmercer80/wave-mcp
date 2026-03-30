/**
 * Wave Transaction Tools
 *
 * Fixes from NoahMcGraw/wave-mcp:
 * - wave_create_transaction: changed transactionCreate -> moneyTransactionCreate
 *
 * NOTE: Transaction queries (list, get) and mutations (update, categorize) are
 * NOT in the official Wave API docs. They may fail if the schema does not include
 * them. The moneyTransactionCreate mutation IS officially documented.
 */

import type { WaveClient } from '../client.js';

export function registerTransactionTools(client: WaveClient) {
  return {
    wave_list_transactions: {
      description: '[BETA] List transactions for a business. This query may not be available in Wave\'s public API.',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
          endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
          page: { type: 'number', description: 'Page number (default: 1)' },
          pageSize: { type: 'number', description: 'Results per page (default: 50)' },
        },
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('Business ID is required.');

        const query = `
          query GetTransactions($businessId: ID!, $page: Int!, $pageSize: Int!) {
            business(id: $businessId) {
              transactions(page: $page, pageSize: $pageSize) {
                pageInfo {
                  currentPage
                  totalPages
                  totalCount
                }
                edges {
                  node {
                    id
                    description
                    amount {
                      value
                      currency { code }
                    }
                    date
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

        let transactions = result.business.transactions.edges.map((e: any) => e.node);

        if (args.startDate) {
          transactions = transactions.filter((t: any) => t.date >= args.startDate);
        }
        if (args.endDate) {
          transactions = transactions.filter((t: any) => t.date <= args.endDate);
        }

        return {
          transactions,
          pageInfo: result.business.transactions.pageInfo,
        };
      },
    },

    wave_get_transaction: {
      description: '[BETA] Get detailed information about a specific transaction. This query may not be available in Wave\'s public API.',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          transactionId: { type: 'string', description: 'Transaction ID' },
        },
        required: ['transactionId'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('Business ID is required.');

        const query = `
          query GetTransaction($businessId: ID!, $transactionId: ID!) {
            business(id: $businessId) {
              transaction(id: $transactionId) {
                id
                description
                amount {
                  value
                  currency { code }
                }
                date
                createdAt
                modifiedAt
              }
            }
          }
        `;

        const result = await client.query(query, {
          businessId,
          transactionId: args.transactionId,
        });

        return result.business.transaction;
      },
    },

    wave_create_transaction: {
      description: 'Create a money transaction (income or expense entry)',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          externalId: { type: 'string', description: 'External reference ID for deduplication' },
          description: { type: 'string', description: 'Transaction description' },
          date: { type: 'string', description: 'Transaction date (YYYY-MM-DD)' },
          anchor: {
            type: 'object',
            description: 'The anchor account and amount',
            properties: {
              accountId: { type: 'string', description: 'Account ID' },
              amount: { type: 'string', description: 'Transaction amount' },
              direction: { type: 'string', enum: ['DEPOSIT', 'WITHDRAWAL'], description: 'Direction' },
            },
            required: ['accountId', 'amount', 'direction'],
          },
          lineItems: {
            type: 'array',
            description: 'Line items for categorization',
            items: {
              type: 'object',
              properties: {
                accountId: { type: 'string', description: 'Account ID' },
                amount: { type: 'string', description: 'Amount' },
                description: { type: 'string', description: 'Line description' },
              },
              required: ['accountId', 'amount'],
            },
          },
        },
        required: ['description', 'date', 'anchor', 'lineItems'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('Business ID is required.');

        // FIX: Wave API uses moneyTransactionCreate, not transactionCreate
        const mutation = `
          mutation CreateMoneyTransaction($input: MoneyTransactionCreateInput!) {
            moneyTransactionCreate(input: $input) {
              transaction {
                id
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
            externalId: args.externalId || `mcp-${Date.now()}`,
            description: args.description,
            date: args.date,
            anchor: args.anchor,
            lineItems: args.lineItems,
          },
        });

        if (!result.moneyTransactionCreate.didSucceed) {
          const errs = result.moneyTransactionCreate.inputErrors
            .map((e: any) => e.message)
            .join('; ');
          throw new Error(`Could not create transaction: ${errs}`);
        }

        return result.moneyTransactionCreate.transaction;
      },
    },
  };
}
