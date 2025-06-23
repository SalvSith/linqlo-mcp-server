const { createClient } = require('@supabase/supabase-js');

class SupabaseMCPServer {
  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    this.authToken = process.env.MCP_AUTH_TOKEN || '1589';

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.initialized = false;
  }

  validateAuth(req) {
    const authHeader = req.headers.authorization;
    const token = req.query.token;
    
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7) === this.authToken;
    }
    
    if (token) {
      return token === this.authToken;
    }
    
    return false;
  }

  getCapabilities() {
    return {
      tools: {
        listChanged: false
      }
    };
  }

  getServerInfo() {
    return {
      name: 'Supabase Read-Only MCP Server',
      version: '1.0.0'
    };
  }

  getTools() {
    return [
      {
        name: 'query_table',
        description: 'Query a specific database table with optional filters',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Table name to query',
              enum: ['articles', 'groups', 'projects', 'profiles', 'teams']
            },
            limit: {
              type: 'number',
              description: 'Max rows to return',
              default: 10,
              maximum: 100
            }
          },
          required: ['table']
        }
      },
      {
        name: 'list_tables',
        description: 'List all available database tables',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ];
  }

  async handleMessage(message) {
    const { id, method, params } = message;

    try {
      switch (method) {
        case 'initialize':
          this.initialized = true;
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: this.getCapabilities(),
              serverInfo: this.getServerInfo()
            }
          };

        case 'tools/list':
          if (!this.initialized) {
            throw new Error('Server not initialized');
          }
          return {
            jsonrpc: '2.0',
            id,
            result: {
              tools: this.getTools()
            }
          };

        case 'tools/call':
          if (!this.initialized) {
            throw new Error('Server not initialized');
          }
          
          const { name, arguments: args } = params;
          let result;

          if (name === 'query_table') {
            const { table, limit = 10 } = args;
            const { data, error } = await this.supabase
              .from(table)
              .select('*')
              .limit(Math.min(limit, 100));

            if (error) throw new Error(`Query failed: ${error.message}`);
            
            result = {
              table,
              count: data?.length || 0,
              data: data || []
            };
          } else if (name === 'list_tables') {
            result = {
              tables: ['articles', 'groups', 'projects', 'profiles', 'teams'],
              count: 5
            };
          } else {
            throw new Error(`Unknown tool: ${name}`);
          }

          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          };

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`
            }
          };
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: error.message
        }
      };
    }
  }
}

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const server = new SupabaseMCPServer();

    // Check authentication
    if (!server.validateAuth(req)) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Valid token required'
      });
      return;
    }

    if (req.method === 'GET') {
      // SSE Implementation
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });

      // Send server info immediately for discovery
      const discovery = {
        type: 'server_info',
        serverInfo: server.getServerInfo(),
        capabilities: server.getCapabilities(),
        tools: server.getTools()
      };

      res.write(`data: ${JSON.stringify(discovery)}\n\n`);

      // Handle incoming message via query param
      if (req.query.message) {
        try {
          const message = JSON.parse(decodeURIComponent(req.query.message));
          const response = await server.handleMessage(message);
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

      res.end();
    } else if (req.method === 'POST') {
      // Handle JSON-RPC over POST
      const response = await server.handleMessage(req.body);
      res.json(response);
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('MCP Server Error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
} 