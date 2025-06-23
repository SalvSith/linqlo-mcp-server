const { createClient } = require('@supabase/supabase-js');

// Available tables in the database
const TABLES = [
  'articles', 'articles_backup', 'column_items', 'columns', 
  'dashboards', 'group_articles', 'groups', 'items', 
  'migrations', 'notes', 'profiles', 'projects', 
  'section_order', 'sections', 'teams', 'teams_users'
];

class SupabaseMCPServer {
  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables: SUPABASE_URL and SUPABASE_ANON_KEY');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.authToken = process.env.MCP_AUTH_TOKEN || '1589';
  }

  validateToken(req) {
    const authHeader = req.headers.authorization;
    const tokenFromQuery = req.query.token;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      return token === this.authToken;
    }
    
    if (tokenFromQuery) {
      return tokenFromQuery === this.authToken;
    }
    
    return false;
  }

  async queryTable({ table, columns, filters, limit = 100, orderBy, ascending = true }) {
    if (!TABLES.includes(table)) {
      throw new Error(`Table '${table}' not found. Available tables: ${TABLES.join(', ')}`);
    }

    let query = this.supabase.from(table).select(columns ? columns.join(',') : '*');

    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (Array.isArray(value)) {
          query = query.in(key, value);
        } else if (typeof value === 'string' && value.includes('%')) {
          query = query.like(key, value);
        } else {
          query = query.eq(key, value);
        }
      }
    }

    if (orderBy) {
      query = query.order(orderBy, { ascending });
    }

    query = query.limit(Math.min(limit, 1000));

    const { data, error } = await query;

    if (error) {
      throw new Error(`Table query failed: ${error.message}`);
    }

    return {
      table,
      rowCount: data?.length || 0,
      data: data || []
    };
  }

  async listTables() {
    return {
      tables: TABLES,
      count: TABLES.length,
      description: 'All available tables for querying'
    };
  }

  getTools() {
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

  async handleMCPMessage(message) {
    try {
      // Validate message structure
      if (!message || typeof message !== 'object') {
        throw new Error('Invalid message format');
      }

      if (!message.jsonrpc || message.jsonrpc !== '2.0') {
        throw new Error('Invalid JSON-RPC version');
      }

      if (!message.method) {
        throw new Error('Missing method in message');
      }

      const response = {
        jsonrpc: '2.0',
        id: message.id || null
      };

      switch (message.method) {
        case 'initialize':
          response.result = {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {
                listChanged: false
              }
            },
            serverInfo: {
              name: 'Supabase Read-Only MCP Server',
              version: '1.0.0'
            }
          };
          break;

        case 'tools/list':
          response.result = {
            tools: this.getTools()
          };
          break;

        case 'tools/call':
          if (!message.params || !message.params.name) {
            throw new Error('Missing tool name in tools/call');
          }

          const { name: toolName, arguments: args } = message.params;
          let result;
          
          switch (toolName) {
            case 'query_table':
              result = await this.queryTable(args || {});
              break;
            case 'list_tables':
              result = await this.listTables();
              break;
            default:
              throw new Error(`Unknown tool: ${toolName}`);
          }
          
          response.result = {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
          break;

        default:
          response.error = {
            code: -32601,
            message: `Method not found: ${message.method}`
          };
      }

      return response;
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: message?.id || null,
        error: {
          code: -32603,
          message: `Internal error: ${error.message}`,
          data: {
            stack: error.stack,
            originalMessage: message
          }
        }
      };
    }
  }
}

module.exports = async function handler(req, res) {
  try {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    const mcpServer = new SupabaseMCPServer();

    // Log request for debugging
    console.log('Request method:', req.method);
    console.log('Request headers:', JSON.stringify(req.headers, null, 2));
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    // Check authentication
    if (!mcpServer.validateToken(req)) {
      console.log('Authentication failed');
      res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Valid token required. Use Authorization: Bearer <token> header or ?token=<token> parameter',
        receivedHeaders: {
          authorization: req.headers.authorization ? 'present' : 'missing',
          contentType: req.headers['content-type']
        }
      });
      return;
    }

    if (req.method === 'POST') {
      // Parse body if it's a string
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (e) {
          res.status(400).json({
            error: 'Invalid JSON in request body',
            message: e.message
          });
          return;
        }
      }

      // Handle MCP messages
      const response = await mcpServer.handleMCPMessage(body);
      res.json(response);
    } else if (req.method === 'GET') {
      // Return server info for GET requests
      res.json({
        server: 'Supabase Read-Only MCP Server',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
        tools: mcpServer.getTools(),
        capabilities: ['tools'],
        message: 'Use POST requests for MCP protocol communication'
      });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Handler error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      stack: error.stack
    });
  }
} 