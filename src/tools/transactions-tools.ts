/**
 * Wave Transaction Tools
 *
 * REMOVED: wave_list_transactions, wave_get_transaction
 *   The Wave public GraphQL API does not expose `transactions` or `transaction`
 *   fields on the Business type. Validated via introspection on 2026-03-29.
 *
 * KEPT: wave_create_transaction
 *   The `moneyTransactionCreate` mutation IS in the public API schema.
 *   Used to create income or expense entries.
 */

import type { WaveClient } from '../client.js';

export function registerTransactionTools(client: WaveClient) {
  return {
    wave_create_transaction: {
      description: 'Create a money transaction (income or expense entry)',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          externalId: { type: 'string', description: 'External reference ID for deduplication' },
          description: { type: 'string', description: 'Transaction description' },
          date: { type: 'string', description: 'Transaction date (YYYY-MM-DD)' },
          notes: { type: 'string', description: 'Internal notes' },
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
            notes: args.notes,
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
