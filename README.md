> **🚀 Don't want to self-host?** [Join the waitlist for our fully managed solution →](https://mcpengage.com/wave)
> 
> Zero setup. Zero maintenance. Just connect and automate.

---

# 📊 Wave MCP Server — AI-Native Small Business Accounting

## 💡 What This Unlocks

**Free accounting software meets AI superpowers.** This MCP server connects Claude to Wave's GraphQL API, giving you natural language control over invoices, customers, expenses, and financial data—no manual data entry required.

### 🎯 Wave-Native Power Moves

Real small business workflows you can automate instantly:

1. **Bulk invoice generation for service businesses**  
   *"For business ID abc123, create invoices for all customers who had transactions last month—use standard 30-day terms, group by customer, calculate totals automatically."*  
   → Generate 50 invoices in one prompt vs. hours of manual entry.

2. **Customer database cleanup**  
   *"List all customers with incomplete addresses, cross-reference with recent invoices, update missing postal codes and phone numbers from invoice metadata."*  
   → Clean CRM hygiene without tedious manual updates.

3. **Expense categorization workflow**  
   *"Pull all uncategorized transactions from my checking account, match merchants to expense categories using my historical patterns, create expense records with proper accounting codes."*  
   → Automated bookkeeping that used to require a dedicated bookkeeper.

4. **Multi-business revenue dashboard**  
   *"Query all my Wave businesses, show total invoiced vs. paid for each in the last quarter, flag businesses with overdue invoices > $500."*  
   → Cross-business intelligence from Wave's multi-business support.

5. **Cash flow forecasting**  
   *"Analyze invoice payment patterns for the past 6 months, calculate average days to payment per customer, project cash inflows for next 30 days based on outstanding invoices."*  
   → Data-driven forecasting without spreadsheets.

### 🔗 The Real Power: Combining Tools

Claude orchestrates multi-step Wave workflows:

- `list_businesses` → `list_invoices` (per business) → `create_invoice` (for unbilled work)
- `list_customers` → filter duplicates → `create_customer` (with cleaned data)
- `list_transactions` → categorize → `create_expense` (with proper accounting codes)
- `list_accounts` → map to categories → generate financial reports

## 📦 What's Inside

**8 GraphQL tools** covering Wave's core accounting operations:

| Tool | Purpose |
|------|---------|
| `list_businesses` | Query all businesses in your Wave account |
| `list_invoices` | Browse invoices with pagination & filtering by business |
| `create_invoice` | Generate invoices with line items, terms, customer details |
| `list_customers` | Access customer directory per business |
| `create_customer` | Add new customers with contact & billing info |
| `list_accounts` | View chart of accounts (assets, liabilities, income, expenses) |
| `list_transactions` | Query transaction history with date ranges |
| `create_expense` | Record expenses with proper accounting codes & line items |

All powered by Wave's **GraphQL API** with proper error handling, automatic pagination, and TypeScript types.

## 🚀 Quick Start

### Option 1: Claude Desktop (Local)

1. **Clone and build:**
   ```bash
   git clone https://github.com/BusyBee3333/Wave-MCP-2026-Complete.git
   cd wave-mcp-2026-complete
   npm install
   npm run build
   ```

2. **Get your Wave API token:**
   - Go to [Wave Developer Portal](https://developer.waveapps.com/hc/en-us/articles/360019762711)
   - Create an app or use "Manage Your Applications"
   - Generate an **API token** for your account
   - Copy the token (starts with `gql_...`)

3. **Configure Claude Desktop:**
   
   On macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`  
   On Windows: `%APPDATA%\Claude\claude_desktop_config.json`

   ```json
   {
     "mcpServers": {
       "wave": {
         "command": "node",
         "args": ["/ABSOLUTE/PATH/TO/wave-mcp-2026-complete/dist/index.js"],
         "env": {
           "WAVE_API_TOKEN": "gql_your_token_here"
         }
       }
     }
   }
   ```

4. **Restart Claude Desktop**  
   Look for the 🔌 icon showing Wave tools are connected.

### Option 2: Docker

```bash
docker build -t wave-mcp .
docker run \
  -e WAVE_API_TOKEN=gql_your_token_here \
  wave-mcp
```

## 🔐 Authentication

Wave uses **OAuth 2.0 + API Tokens** for GraphQL API access:

1. **Register your application** at [Wave Developer Portal](https://developer.waveapps.com)
2. **Generate an API token** (or OAuth credentials for production apps)
3. **Use the token** in environment variable `WAVE_API_TOKEN`

**Token format:** Starts with `gql_` followed by alphanumeric string.

**Scopes required:**
- `business:read` — View business details
- `invoice:read`, `invoice:write` — Manage invoices
- `customer:read`, `customer:write` — Manage customers
- `transaction:read`, `transaction:write` — Access transactions & expenses

**Token security:** Tokens don't expire but can be revoked in your Wave settings. Store securely and never commit to version control.

## 🎯 Example Prompts

Once connected to Claude, use natural language for Wave accounting:

### Multi-Business Operations
- *"Show me all my Wave businesses with their currencies and whether they're personal or business accounts."*
- *"For my business 'Acme Consulting', list all open invoices sorted by due date."*

### Invoice Management
- *"Create an invoice for business ID QnVz...X12 for customer ID Q3Vz...abc with 3 line items: Strategy Session $500, Implementation $2000, Support Plan $300/month. Due in 15 days."*
- *"List all invoices for my Toronto business from the past 30 days and show me which ones haven't been paid."*
- *"Generate a summary of all overdue invoices across all my businesses."*

### Customer Operations
- *"Add a new customer to my main business: 'Global Tech Inc', email: billing@globaltech.com, address in New York NY, currency USD."*
- *"Show me all customers who have been invoiced in the last 6 months but have incomplete contact information."*

### Financial Tracking
- *"List all expense accounts in my chart of accounts and group by type (assets, liabilities, income, expenses)."*
- *"Show me all transactions in my checking account from January 2024 and calculate the net cash flow."*
- *"Create an expense record for $127.50 from 'Office Supplies' account on 2024-01-15 with description 'Printer paper and toner'."*

### Analysis & Intelligence
- *"Which customers have the longest average payment times? Show data from the past year."*
- *"Calculate total revenue per business for Q1 2024 and compare to Q4 2023."*
- *"Find all invoices that are 30+ days past due and draft reminder emails for each customer."*

## 🛠️ Development

### Prerequisites
- Node.js 18+
- npm or yarn
- Wave account (free) with API access enabled

### Local Setup

```bash
git clone https://github.com/BusyBee3333/Wave-MCP-2026-Complete.git
cd wave-mcp-2026-complete
npm install
cp .env.example .env
# Edit .env with your Wave API token
npm run build
npm run dev
```

### Testing

```bash
npm test                  # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report
```

### GraphQL Playground

Wave provides a [GraphQL explorer](https://developer.waveapps.com/hc/en-us/articles/360019968212-API-Explorer) for testing queries.

## 🐛 Troubleshooting

### "Authentication failed" / GraphQL errors
- **Token format:** Ensure token starts with `gql_` (not OAuth bearer tokens)
- **Token validity:** Check token hasn't been revoked in Wave settings
- **Scopes:** Verify your app has required permissions for the operations you're trying

### "Business not found" / Empty results
- **Get business IDs:** Run `list_businesses` first to get valid business IDs
- **Wave uses GraphQL IDs:** IDs are base64-encoded strings like `QnVzaW5lc3M6YWJjMTIz`
- **Multiple businesses:** If you have multiple businesses, specify which one in each query

### "Tools not appearing in Claude"
- **Restart required:** Always restart Claude Desktop after config changes
- **Absolute paths:** Use full paths in config (no `~/` shortcuts)
- **Build check:** Verify `dist/index.js` exists after running `npm run build`

### GraphQL-specific issues
- **Pagination:** Wave uses cursor-based pagination; use `pageInfo` to navigate results
- **Nested queries:** Some operations require nested GraphQL selections (handled by this MCP server)
- **Rate limiting:** Wave has rate limits; the MCP server will throw errors if exceeded

## 📖 Resources

- **[Wave GraphQL API Docs](https://developer.waveapps.com/hc/en-us/articles/360019968212)** — Official API reference
- **[Wave API Getting Started](https://developer.waveapps.com/hc/en-us/articles/360019762711)** — Authentication & setup
- **[GraphQL Schema Explorer](https://developer.waveapps.com/hc/en-us/articles/360020154331)** — Browse available queries & mutations
- **[Wave Changelog](https://developer.waveapps.com/hc/en-us/sections/360003012132-Changelog)** — API updates & deprecations
- **[MCP Protocol Specification](https://modelcontextprotocol.io/)** — How MCP servers work
- **[Claude Desktop Documentation](https://claude.ai/desktop)** — Desktop app setup

## 🤝 Contributing

Contributions welcome! To add features:

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/payment-tracking`)
3. Commit your changes (`git commit -m 'Add payment tracking tools'`)
4. Push to the branch (`git push origin feature/payment-tracking`)
5. Open a Pull Request

**Ideas for contributions:**
- Support for Wave's products/services catalog
- Sales tax calculation helpers
- Receipt image uploads via GraphQL mutations
- Recurring invoice templates
- Financial report generation (P&L, balance sheet)
- Multi-currency conversion helpers

## 📄 License

MIT License - see [LICENSE](LICENSE) for details

## 🙏 Credits

Built by [MCPEngage](https://mcpengage.com) — AI infrastructure for business software.

Want more MCP servers? Check out our [full catalog](https://mcpengage.com) covering 30+ business platforms.

---

**Questions?** Open an issue or join our [Discord community](https://discord.gg/mcpengage).
