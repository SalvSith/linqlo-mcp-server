const { createClient } = require('@supabase/supabase-js');

// Available tables in the database
const TABLES = [
  'articles', 'articles_backup', 'column_items', 'columns', 
  'dashboards', 'group_articles', 'groups', 'items', 
  'migrations', 'notes', 'profiles', 'projects', 
  'section_order', 'sections', 'teams', 'teams_users'
];

class SupabaseSSEHandler {
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
      const response = {
        jsonrpc: '2.0',
        id: message.id
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
          const { name: toolName, arguments: args } = message.params;
          let result;
          
          switch (toolName) {
            case 'query_table':
              result = await this.queryTable(args);
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
        id: message.id,
        error: {
          code: -32603,
          message: `Internal error: ${error.message}`
        }
      };
    }
  }
}

module.exports = async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const mcpHandler = new SupabaseSSEHandler();

    // Check authentication
    if (!mcpHandler.validateToken(req)) {
      res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Valid token required. Use Authorization: Bearer <token> header or ?token=<token> parameter' 
      });
      return;
    }

    if (req.method === 'GET') {
      // SSE endpoint - proper MCP SSE implementation
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });

      // Keep connection alive
      const keepAlive = setInterval(() => {
        res.write(': keep-alive\n\n');
      }, 30000);

      // Handle client disconnect
      req.on('close', () => {
        clearInterval(keepAlive);
      });

      // Send proper MCP initialization
      const initMessage = {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {
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
        }
      };

      res.write(`data: ${JSON.stringify(initMessage)}\n\n`);

      // Handle incoming messages from query parameters or body
      if (req.query.message) {
        try {
          const message = JSON.parse(decodeURIComponent(req.query.message));
          const response = await mcpHandler.handleMCPMessage(message);
          res.write(`data: ${JSON.stringify(response)}\n\n`);
        } catch (error) {
          const errorResponse = {
            jsonrpc: '2.0',
            id: 'error',
            error: {
              code: -32603,
              message: error.message
            }
          };
          res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
        }
      }

      // Don't end immediately - keep connection open for SSE
      return;
    } else if (req.method === 'POST') {
      // Handle MCP messages via POST
      const message = req.body;
      const response = await mcpHandler.handleMCPMessage(message);
      res.json(response);
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('MCP Server Error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message,
      details: 'Check server logs for more information'
    });
  }
} 