#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ============================================
// CONFIGURATION
// ============================================
const MCP_NAME = "wave";
const MCP_VERSION = "1.0.0";
const API_BASE_URL = "https://gql.waveapps.com/graphql/public";

// ============================================
// GRAPHQL CLIENT
// ============================================
class WaveClient {
  private apiToken: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  async query(query: string, variables: Record<string, any> = {}) {
    const response = await fetch(API_BASE_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`Wave API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    if (result.errors) {
      throw new Error(`GraphQL error: ${JSON.stringify(result.errors)}`);
    }
    return result.data;
  }
}

// ============================================
// GRAPHQL QUERIES AND MUTATIONS
// ============================================
const QUERIES = {
  listBusinesses: `
    query ListBusinesses {
      businesses(page: 1, pageSize: 100) {
        edges {
          node {
            id
            name
            isPersonal
            currency {
              code
            }
          }
        }
      }
    }
  `,
  listInvoices: `
    query ListInvoices($businessId: ID!, $page: Int, $pageSize: Int) {
      business(id: $businessId) {
        invoices(page: $page, pageSize: $pageSize) {
          edges {
            node {
              id
              invoiceNumber
              invoiceDate
              dueDate
              status
              customer {
                id
                name
              }
              amountDue {
                value
                currency {
                  code
                }
              }
              amountPaid {
                value
                currency {
                  code
                }
              }
              total {
                value
                currency {
                  code
                }
              }
            }
          }
          pageInfo {
            currentPage
            totalPages
            totalCount
          }
        }
      }
    }
  `,
  listCustomers: `
    query ListCustomers($businessId: ID!, $page: Int, $pageSize: Int) {
      business(id: $businessId) {
        customers(page: $page, pageSize: $pageSize) {
          edges {
            node {
              id
              name
              email
              address {
                addressLine1
                addressLine2
                city
                provinceCode
                postalCode
                countryCode
              }
              currency {
                code
              }
            }
          }
          pageInfo {
            currentPage
            totalPages
            totalCount
          }
        }
      }
    }
  `,
  listAccounts: `
    query ListAccounts($businessId: ID!, $page: Int, $pageSize: Int) {
      business(id: $businessId) {
        accounts(page: $page, pageSize: $pageSize) {
          edges {
            node {
              id
              name
              description
              displayId
              type {
                name
                value
              }
              subtype {
                name
                value
              }
              normalBalanceType
              isArchived
            }
          }
          pageInfo {
            currentPage
            totalPages
            totalCount
          }
        }
      }
    }
  `,
  listTransactions: `
    query ListTransactions($businessId: ID!, $page: Int, $pageSize: Int) {
      business(id: $businessId) {
        transactions(page: $page, pageSize: $pageSize) {
          edges {
            node {
              id
              date
              description
              account {
                id
                name
              }
              amount {
                value
                currency {
                  code
                }
              }
              anchor {
                __typename
              }
            }
          }
          pageInfo {
            currentPage
            totalPages
            totalCount
          }
        }
      }
    }
  `,
};

const MUTATIONS = {
  createInvoice: `
    mutation CreateInvoice($input: InvoiceCreateInput!) {
      invoiceCreate(input: $input) {
        didSucceed
        inputErrors {
          code
          message
          path
        }
        invoice {
          id
          invoiceNumber
          invoiceDate
          dueDate
          status
        }
      }
    }
  `,
  createCustomer: `
    mutation CreateCustomer($input: CustomerCreateInput!) {
      customerCreate(input: $input) {
        didSucceed
        inputErrors {
          code
          message
          path
        }
        customer {
          id
          name
          email
        }
      }
    }
  `,
  createExpense: `
    mutation CreateExpense($input: MoneyTransactionCreateInput!) {
      moneyTransactionCreate(input: $input) {
        didSucceed
        inputErrors {
          code
          message
          path
        }
        transaction {
          id
        }
      }
    }
  `,
};

// ============================================
// TOOL DEFINITIONS
// ============================================
const tools = [
  {
    name: "list_businesses",
    description: "List all businesses in the Wave account",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "list_invoices",
    description: "List invoices for a business",
    inputSchema: {
      type: "object" as const,
      properties: {
        businessId: { type: "string", description: "Business ID" },
        page: { type: "number", description: "Page number (default 1)" },
        pageSize: { type: "number", description: "Items per page (default 25)" },
      },
      required: ["businessId"],
    },
  },
  {
    name: "create_invoice",
    description: "Create a new invoice",
    inputSchema: {
      type: "object" as const,
      properties: {
        businessId: { type: "string", description: "Business ID" },
        customerId: { type: "string", description: "Customer ID" },
        invoiceDate: { type: "string", description: "Invoice date (YYYY-MM-DD)" },
        dueDate: { type: "string", description: "Due date (YYYY-MM-DD)" },
        items: {
          type: "array",
          description: "Invoice line items",
          items: {
            type: "object",
            properties: {
              productId: { type: "string", description: "Product/Service ID" },
              description: { type: "string", description: "Line item description" },
              quantity: { type: "number", description: "Quantity" },
              unitPrice: { type: "number", description: "Unit price" },
            },
          },
        },
        memo: { type: "string", description: "Invoice memo/notes" },
      },
      required: ["businessId", "customerId", "items"],
    },
  },
  {
    name: "list_customers",
    description: "List customers for a business",
    inputSchema: {
      type: "object" as const,
      properties: {
        businessId: { type: "string", description: "Business ID" },
        page: { type: "number", description: "Page number (default 1)" },
        pageSize: { type: "number", description: "Items per page (default 25)" },
      },
      required: ["businessId"],
    },
  },
  {
    name: "create_customer",
    description: "Create a new customer",
    inputSchema: {
      type: "object" as const,
      properties: {
        businessId: { type: "string", description: "Business ID" },
        name: { type: "string", description: "Customer name" },
        email: { type: "string", description: "Customer email" },
        firstName: { type: "string", description: "First name" },
        lastName: { type: "string", description: "Last name" },
        phone: { type: "string", description: "Phone number" },
        addressLine1: { type: "string", description: "Street address line 1" },
        addressLine2: { type: "string", description: "Street address line 2" },
        city: { type: "string", description: "City" },
        provinceCode: { type: "string", description: "State/Province code" },
        postalCode: { type: "string", description: "Postal/ZIP code" },
        countryCode: { type: "string", description: "Country code (e.g., US, CA)" },
        currency: { type: "string", description: "Currency code (e.g., USD, CAD)" },
      },
      required: ["businessId", "name"],
    },
  },
  {
    name: "list_accounts",
    description: "List chart of accounts for a business",
    inputSchema: {
      type: "object" as const,
      properties: {
        businessId: { type: "string", description: "Business ID" },
        page: { type: "number", description: "Page number (default 1)" },
        pageSize: { type: "number", description: "Items per page (default 25)" },
      },
      required: ["businessId"],
    },
  },
  {
    name: "list_transactions",
    description: "List transactions for a business",
    inputSchema: {
      type: "object" as const,
      properties: {
        businessId: { type: "string", description: "Business ID" },
        page: { type: "number", description: "Page number (default 1)" },
        pageSize: { type: "number", description: "Items per page (default 25)" },
      },
      required: ["businessId"],
    },
  },
  {
    name: "create_expense",
    description: "Create a new expense/money transaction",
    inputSchema: {
      type: "object" as const,
      properties: {
        businessId: { type: "string", description: "Business ID" },
        externalId: { type: "string", description: "External reference ID" },
        date: { type: "string", description: "Transaction date (YYYY-MM-DD)" },
        description: { type: "string", description: "Transaction description" },
        anchor: {
          type: "object",
          description: "Anchor account details",
          properties: {
            accountId: { type: "string", description: "Bank/payment account ID" },
            amount: { type: "number", description: "Amount (positive value)" },
            direction: { type: "string", description: "WITHDRAWAL or DEPOSIT" },
          },
        },
        lineItems: {
          type: "array",
          description: "Expense line items",
          items: {
            type: "object",
            properties: {
              accountId: { type: "string", description: "Expense account ID" },
              amount: { type: "number", description: "Amount" },
              description: { type: "string", description: "Line item description" },
            },
          },
        },
      },
      required: ["businessId", "date", "description", "anchor", "lineItems"],
    },
  },
];

// ============================================
// TOOL HANDLERS
// ============================================
async function handleTool(client: WaveClient, name: string, args: any) {
  switch (name) {
    case "list_businesses": {
      return await client.query(QUERIES.listBusinesses);
    }
    case "list_invoices": {
      const { businessId, page = 1, pageSize = 25 } = args;
      return await client.query(QUERIES.listInvoices, { businessId, page, pageSize });
    }
    case "create_invoice": {
      const { businessId, customerId, invoiceDate, dueDate, items, memo } = args;
      const today = new Date().toISOString().split('T')[0];
      const input: any = {
        businessId,
        customerId,
        invoiceDate: invoiceDate || today,
        items: items.map((item: any) => ({
          productId: item.productId,
          description: item.description,
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice,
        })),
      };
      if (dueDate) input.dueDate = dueDate;
      if (memo) input.memo = memo;
      return await client.query(MUTATIONS.createInvoice, { input });
    }
    case "list_customers": {
      const { businessId, page = 1, pageSize = 25 } = args;
      return await client.query(QUERIES.listCustomers, { businessId, page, pageSize });
    }
    case "create_customer": {
      const { businessId, name, email, firstName, lastName, phone, addressLine1, addressLine2, city, provinceCode, postalCode, countryCode, currency } = args;
      const input: any = { businessId, name };
      if (email) input.email = email;
      if (firstName) input.firstName = firstName;
      if (lastName) input.lastName = lastName;
      if (phone) input.phone = phone;
      if (currency) input.currency = currency;
      if (addressLine1) {
        input.address = { addressLine1 };
        if (addressLine2) input.address.addressLine2 = addressLine2;
        if (city) input.address.city = city;
        if (provinceCode) input.address.provinceCode = provinceCode;
        if (postalCode) input.address.postalCode = postalCode;
        if (countryCode) input.address.countryCode = countryCode;
      }
      return await client.query(MUTATIONS.createCustomer, { input });
    }
    case "list_accounts": {
      const { businessId, page = 1, pageSize = 25 } = args;
      return await client.query(QUERIES.listAccounts, { businessId, page, pageSize });
    }
    case "list_transactions": {
      const { businessId, page = 1, pageSize = 25 } = args;
      return await client.query(QUERIES.listTransactions, { businessId, page, pageSize });
    }
    case "create_expense": {
      const { businessId, externalId, date, description, anchor, lineItems } = args;
      const input: any = {
        businessId,
        externalId: externalId || `exp-${Date.now()}`,
        date,
        description,
        anchor: {
          accountId: anchor.accountId,
          amount: anchor.amount,
          direction: anchor.direction || "WITHDRAWAL",
        },
        lineItems: lineItems.map((item: any) => ({
          accountId: item.accountId,
          amount: item.amount,
          description: item.description,
        })),
      };
      return await client.query(MUTATIONS.createExpense, { input });
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ============================================
// SERVER SETUP
// ============================================
async function main() {
  const apiToken = process.env.WAVE_API_TOKEN;
  if (!apiToken) {
    console.error("Error: WAVE_API_TOKEN environment variable required");
    console.error("Get your API token at https://developer.waveapps.com");
    process.exit(1);
  }

  const client = new WaveClient(apiToken);

  const server = new Server(
    { name: `${MCP_NAME}-mcp`, version: MCP_VERSION },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    try {
      const result = await handleTool(client, name, args || {});
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${MCP_NAME} MCP server running on stdio`);
}

main().catch(console.error);
