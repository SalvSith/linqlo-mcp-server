# Supabase Read-Only MCP Server

A Model Context Protocol (MCP) server that provides read-only access to your Supabase database. This server allows AI agents to safely query your database without any risk of data modification.

## Features

- **Read-Only Access**: Only SELECT and WITH queries are allowed
- **Safe Query Validation**: Prevents any destructive operations
- **Multiple Query Methods**: Direct SQL queries or table-based queries with filters
- **Schema Inspection**: Get table and column information
- **Configurable Limits**: Control the maximum number of rows returned
- **Type Safety**: Built with TypeScript and Zod validation

## Available Tools

### 1. `query_database`
Execute raw SQL queries (SELECT only) against the database.

**Parameters:**
- `query` (string, required): The SQL query to execute
- `limit` (number, optional): Maximum rows to return (default: 100, max: 1000)

**Example:**
```sql
SELECT title, url, created_at FROM articles WHERE user_id = 'some-uuid' ORDER BY created_at DESC
```

### 2. `query_table`
Query a specific table with structured filters and options.

**Parameters:**
- `table` (string, required): Table name from available tables
- `columns` (array, optional): Specific columns to select
- `filters` (object, optional): Key-value filters to apply
- `limit` (number, optional): Maximum rows to return (default: 100, max: 1000)
- `orderBy` (string, optional): Column to order by
- `ascending` (boolean, optional): Order direction (default: true)

**Example:**
```json
{
  "table": "articles",
  "columns": ["title", "url", "created_at"],
  "filters": {
    "user_id": "some-uuid",
    "is_grouped": false
  },
  "orderBy": "created_at",
  "ascending": false,
  "limit": 50
}
```

### 3. `get_schema`
Get database schema information.

**Parameters:**
- `table` (string, optional): Specific table name for detailed schema

**Examples:**
```json
// Get all tables
{}

// Get specific table schema
{"table": "articles"}
```

### 4. `list_tables`
List all available tables in the database.

## Available Tables

- `articles` - Main articles/items with metadata
- `groups` - Article groupings
- `projects` - User projects
- `dashboards` - Project dashboards
- `columns` - Kanban board columns
- `notes` - Article comments/notes
- `profiles` - User profiles
- `sections` - Custom sections
- `items` - Generic items
- `teams` - Team information
- And more...

## Installation

1. **Navigate to the MCP server directory:**
   ```bash
   cd mcp-server
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your Supabase credentials:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key-here
   ```

4. **Build the server:**
   ```bash
   npm run build
   ```

## Usage

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

## Configuration with MCP Clients

### Claude Desktop
Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "supabase-readonly": {
      "command": "node",
      "args": ["/path/to/your/mcp-server/dist/index.js"],
      "env": {
        "SUPABASE_URL": "https://your-project.supabase.co",
        "SUPABASE_ANON_KEY": "your-anon-key-here"
      }
    }
  }
}
```

### Other MCP Clients
The server communicates via stdio, so it should work with any MCP-compatible client. Refer to your client's documentation for configuration details.

## Security

This server implements several security measures:

1. **Query Validation**: Only SELECT and WITH statements are allowed
2. **Operation Blocking**: Blocks INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, etc.
3. **Row Limits**: Configurable maximum row limits to prevent large data dumps
4. **Environment Variables**: Sensitive credentials are stored in environment variables
5. **Anon Key Usage**: Uses Supabase anonymous key by default (respects RLS policies)

## Database Schema

The server has access to your complete database schema. Key tables include:

- **articles**: Main content items with URLs, titles, descriptions
- **groups**: Organizational groupings for articles
- **projects**: User workspaces/projects
- **dashboards**: Kanban-style dashboards
- **columns**: Dashboard columns for organization
- **notes**: Comments and annotations on articles

Use the `get_schema` tool to explore the full schema and column details.

## Error Handling

The server provides detailed error messages for:
- Invalid queries or forbidden operations
- Database connection issues
- Invalid parameters or missing required fields
- Supabase-specific errors

## Limitations

- **Read-Only**: No data modification operations allowed
- **Row Limits**: Maximum 1000 rows per query
- **Anonymous Access**: Uses anon key, respects Row Level Security policies
- **SQL Features**: Some advanced SQL features may not be available through Supabase

## Troubleshooting

1. **Connection Issues**: Verify SUPABASE_URL and SUPABASE_ANON_KEY are correct
2. **Permission Errors**: Check that your anon key has read access to required tables
3. **Query Failures**: Ensure queries use only SELECT statements and valid table/column names
4. **Schema Issues**: Use `list_tables` and `get_schema` to verify available tables and columns

## Development

- **TypeScript**: Full type safety with TypeScript
- **Zod Validation**: Input validation for all parameters
- **ESModules**: Modern JavaScript module system
- **Error Handling**: Comprehensive error catching and reporting

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License. 