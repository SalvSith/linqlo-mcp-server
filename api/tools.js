const { createClient } = require('@supabase/supabase-js');

// Available tables in the database
const TABLES = [
  'articles', 'articles_backup', 'column_items', 'columns', 
  'dashboards', 'group_articles', 'groups', 'items', 
  'migrations', 'notes', 'profiles', 'projects', 
  'section_order', 'sections', 'teams', 'teams_users'
];

function getTools() {
  return [
    {
      name: 'query_table',
      description: 'Query a specific database table with optional filters, ordering, and column selection',
      inputSchema: {
        type: 'object',
        properties: {
          table: {
            type: 'string',
            description: 'Name of the table to query',
            enum: TABLES
          },
          columns: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific columns to select (optional, default: all columns)'
          },
          filters: {
            type: 'object',
            description: 'Key-value pairs for filtering results'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of rows to return (default: 100, max: 1000)',
            minimum: 1,
            maximum: 1000,
            default: 100
          },
          orderBy: {
            type: 'string',
            description: 'Column name to order results by'
          },
          ascending: {
            type: 'boolean',
            description: 'Sort direction - true for ascending, false for descending (default: true)',
            default: true
          }
        },
        required: ['table']
      }
    },
    {
      name: 'list_tables',
      description: 'List all available tables in the database',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    }
  ];
}

module.exports = function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Check authentication
  const authHeader = req.headers.authorization;
  const tokenFromQuery = req.query.token;
  const authToken = process.env.MCP_AUTH_TOKEN || '1589';
  
  let isAuthorized = false;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    isAuthorized = token === authToken;
  } else if (tokenFromQuery) {
    isAuthorized = tokenFromQuery === authToken;
  }

  if (!isAuthorized) {
    res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Valid token required. Use Authorization: Bearer <token> header or ?token=<token> parameter' 
    });
    return;
  }

  res.status(200).json({
    tools: getTools(),
    serverInfo: {
      name: 'Supabase Read-Only MCP Server',
      version: '1.0.0',
      protocolVersion: '2024-11-05'
    }
  });
} 