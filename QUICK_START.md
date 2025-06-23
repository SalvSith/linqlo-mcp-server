# Quick Start Guide

## 🚀 Setup (5 minutes)

1. **Navigate to the MCP server directory:**
   ```bash
   cd mcp-server
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the interactive setup:**
   ```bash
   npm run setup
   ```
   This will ask for your Supabase credentials and create a `.env` file.

4. **Test the server:**
   ```bash
   npm run test
   ```

## 🎯 Quick Testing

### Start the HTTP server:
```bash
npm start
# Server runs on http://localhost:3001
```

### Test with curl:
```bash
# List all tables
curl -X POST -H "Content-Type: application/json" \
  -d '{"method":"list_tables","params":{}}' \
  http://localhost:3001

# Query articles table
curl -X POST -H "Content-Type: application/json" \
  -d '{"method":"query_table","params":{"table":"articles","limit":5}}' \
  http://localhost:3001

# Get schema info
curl -X POST -H "Content-Type: application/json" \
  -d '{"method":"get_schema","params":{}}' \
  http://localhost:3001
```

### Test from command line:
```bash
# List tables
npm run tables

# Test query
npm run test
```

## 🔧 Integration with Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "supabase-readonly": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/src/simplified-server.js", "server"],
      "env": {
        "SUPABASE_URL": "your-supabase-url",
        "SUPABASE_ANON_KEY": "your-anon-key"
      }
    }
  }
}
```

## 📝 Available Methods

| Method | Description | Example |
|--------|-------------|---------|
| `list_tables` | Get all available tables | `{"method":"list_tables","params":{}}` |
| `query_table` | Query specific table with filters | `{"method":"query_table","params":{"table":"articles","limit":10}}` |
| `get_schema` | Get schema information | `{"method":"get_schema","params":{"table":"articles"}}` |

## 🛡️ Security Features

- ✅ Only SELECT queries allowed
- ✅ Blocks all modification operations (INSERT, UPDATE, DELETE)
- ✅ Row limits (max 1000 per query)
- ✅ Uses Supabase anonymous key (respects RLS policies)
- ✅ Input validation and sanitization

## 🐛 Troubleshooting

**Connection errors?**
- Check your `.env` file has correct SUPABASE_URL and SUPABASE_ANON_KEY
- Test connection: `curl http://localhost:3001` (should return server status)

**Permission errors?**
- Verify your Supabase anon key has read access to the tables
- Check your Supabase Row Level Security (RLS) policies

**No data returned?**
- Check if your tables have data: `npm run test`
- Verify table names: `npm run tables` 