#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { parse } from 'url';

// Load environment variables
dotenv.config();

// Available tables in the database
const TABLES = [
  'articles', 'articles_backup', 'column_items', 'columns', 
  'dashboards', 'group_articles', 'groups', 'items', 
  'migrations', 'notes', 'profiles', 'projects', 
  'section_order', 'sections', 'teams', 'teams_users'
];

class SupabaseSSEMCPServer {
  constructor() {
    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables: SUPABASE_URL and SUPABASE_ANON_KEY');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.clients = new Map(); // Track SSE clients
    
    // Generate or use provided auth token
    this.authToken = process.env.MCP_AUTH_TOKEN || this.generateToken();
    console.log(`🔑 MCP Auth Token: ${this.authToken}`);
  }

  // Generate a secure random token
  generateToken() {
    return 'mcp_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  // Validate authentication token
  validateToken(req) {
    const authHeader = req.headers.authorization;
    const tokenFromQuery = parse(req.url, true).query.token;
    
    // Check Authorization header (Bearer token)
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      return token === this.authToken;
    }
    
    // Check query parameter
    if (tokenFromQuery) {
      return tokenFromQuery === this.authToken;
    }
    
    // For development, allow no token if not set
    if (!process.env.MCP_AUTH_TOKEN && process.env.NODE_ENV !== 'production') {
      return true;
    }
    
    return false;
  }

  // Check if query is read-only
  isReadOnlyQuery(query) {
    const normalizedQuery = query.trim().toUpperCase();
    
    // Must start with SELECT or WITH
    const startsWithAllowed = normalizedQuery.startsWith('SELECT') || normalizedQuery.startsWith('WITH');
    
    // Must not contain forbidden operations
    const forbiddenOperations = [
      'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 
      'TRUNCATE', 'GRANT', 'REVOKE', 'EXEC', 'EXECUTE', 'CALL'
    ];
    
    const hasForbiddenOperation = forbiddenOperations.some(op => 
      normalizedQuery.includes(op)
    );
    
    return startsWithAllowed && !hasForbiddenOperation;
  }

  // Query a specific table with filters
  async queryTable({ table, columns, filters, limit = 100, orderBy, ascending = true }) {
    if (!TABLES.includes(table)) {
      throw new Error(`Table '${table}' not found. Available tables: ${TABLES.join(', ')}`);
    }

    let query = this.supabase.from(table).select(columns ? columns.join(',') : '*');

    // Apply filters
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

    // Apply ordering
    if (orderBy) {
      query = query.order(orderBy, { ascending });
    }

    // Apply limit
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

  // Get schema information
  async getSchema(tableName) {
    if (tableName) {
      // Get basic column info from Supabase if possible
      try {
        const { data, error } = await this.supabase
          .from(tableName)
          .select('*')
          .limit(1);
        
        if (!error && data && data.length > 0) {
          const columns = Object.keys(data[0]).map(key => ({
            column_name: key,
            data_type: typeof data[0][key],
            sample_value: data[0][key]
          }));
          
          return {
            table: tableName,
            available: true,
            columns
          };
        }
      } catch (e) {
        // Fallback to basic info
      }
      
      return {
        table: tableName,
        available: TABLES.includes(tableName),
        note: 'Table exists but requires specific permissions to inspect schema'
      };
    } else {
      return {
        tables: TABLES,
        description: 'Available tables in the database',
        note: 'Use specific table name to get column details'
      };
    }
  }

  // List all tables
  async listTables() {
    return {
      tables: TABLES,
      count: TABLES.length,
      description: 'All available tables for querying'
    };
  }

  // Count records in a table
  async countRecords(table, filters = {}) {
    if (!TABLES.includes(table)) {
      throw new Error(`Table '${table}' not found`);
    }

    let query = this.supabase.from(table).select('*', { count: 'exact', head: true });

    // Apply filters
    if (filters && Object.keys(filters).length > 0) {
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

    const { count, error } = await query;

    if (error) {
      throw new Error(`Count query failed: ${error.message}`);
    }

    return {
      table,
      count: count || 0,
      filters: filters
    };
  }

  // Get MCP tools definition
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
              description: 'Key-value pairs for filtering results (supports arrays for IN queries, strings with % for LIKE queries)'
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
        name: 'get_schema',
        description: 'Get database schema information for tables and columns',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Specific table name to get detailed schema (optional)',
              enum: TABLES
            }
          }
        }
      },
      {
        name: 'list_tables',
        description: 'List all available tables in the database',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'count_records',
        description: 'Count records in a table with optional filters',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Name of the table to count records in',
              enum: TABLES
            },
            filters: {
              type: 'object',
              description: 'Optional filters to apply before counting'
            }
          },
          required: ['table']
        }
      }
    ];
  }

  // Handle MCP tool calls
  async handleToolCall(toolName, args) {
    try {
      switch (toolName) {
        case 'query_table':
          return await this.queryTable(args);
        
        case 'get_schema':
          return await this.getSchema(args.table);
        
        case 'list_tables':
          return await this.listTables();
        
        case 'count_records':
          return await this.countRecords(args.table, args.filters);
        
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      return {
        error: error.message,
        type: 'tool_error'
      };
    }
  }

  // Send SSE message
  sendSSE(res, id, event, data) {
    const message = `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    res.write(message);
  }

  // Handle SSE connection for MCP
  handleSSEConnection(req, res) {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control, Authorization'
    });

    const clientId = Date.now().toString();
    this.clients.set(clientId, res);

    // Send initial connection message
    this.sendSSE(res, clientId, 'connected', {
      server: 'Supabase Read-Only MCP Server',
      version: '1.0.0',
      tools: this.getTools(),
      capabilities: ['tools']
    });

    // Handle client disconnect
    req.on('close', () => {
      this.clients.delete(clientId);
    });

    return clientId;
  }

  // Handle MCP protocol messages
  async handleMCPMessage(message, clientId) {
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
          const result = await this.handleToolCall(toolName, args);
          
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

  // Start the SSE server
  startServer(port = 3001) {
    const server = createServer(async (req, res) => {
      const { pathname, query } = parse(req.url, true);

      // Enable CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Check authentication for protected endpoints
      if (pathname === '/mcp-sse' || pathname === '/mcp') {
        if (!this.validateToken(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            error: 'Unauthorized', 
            message: 'Valid token required. Use Authorization: Bearer <token> header or ?token=<token> parameter' 
          }));
          return;
        }
      }

      // SSE endpoint for MCP
      if (pathname === '/mcp-sse' && req.method === 'GET') {
        const clientId = this.handleSSEConnection(req, res);
        
        // Handle incoming messages via query parameters or separate POST endpoint
        if (query.message) {
          try {
            const message = JSON.parse(decodeURIComponent(query.message));
            const response = await this.handleMCPMessage(message, clientId);
            this.sendSSE(res, message.id || 'response', 'message', response);
          } catch (error) {
            this.sendSSE(res, 'error', 'error', { error: error.message });
          }
        }
        return;
      }

      // POST endpoint for MCP messages
      if (pathname === '/mcp' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });

        req.on('end', async () => {
          try {
            const message = JSON.parse(body);
            const response = await this.handleMCPMessage(message, 'http');
            
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(200);
            res.end(JSON.stringify(response, null, 2));
          } catch (error) {
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(400);
            res.end(JSON.stringify({ error: error.message }));
          }
        });
        return;
      }

      // Health check endpoint (no auth required)
      if (pathname === '/' && req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify({
          status: 'running',
          server: 'Supabase Read-Only MCP Server',
          version: '1.0.0',
          endpoints: {
            mcp_sse: '/mcp-sse',
            mcp_post: '/mcp',
            health: '/'
          },
          tools: this.getTools().map(t => t.name),
          tables: TABLES,
          authentication: 'Token required for MCP endpoints'
        }));
        return;
      }

      // 404
      res.writeHead(404);
      res.end('Not Found');
    });

    server.listen(port, () => {
      console.log(`🚀 Supabase SSE MCP Server running on http://localhost:${port}`);
      console.log(`📡 SSE endpoint: http://localhost:${port}/mcp-sse`);
      console.log(`🔧 Health check: http://localhost:${port}/`);
      console.log(`🔑 Auth token: ${this.authToken}`);
      console.log(`💡 Available tools: ${this.getTools().map(t => t.name).join(', ')}`);
    });

    return server;
  }
}

// Command line interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new SupabaseSSEMCPServer();
  
  const command = process.argv[2];
  const port = process.argv[3] ? parseInt(process.argv[3]) : 3001;

  switch (command) {
    case 'start':
    case 'server':
      server.startServer(port);
      break;
    
    case 'test':
      server.queryTable({ table: 'articles', limit: 5 })
        .then(result => console.log(JSON.stringify(result, null, 2)))
        .catch(error => console.error('Error:', error.message));
      break;
    
    case 'tools':
      console.log(JSON.stringify(server.getTools(), null, 2));
      break;
    
    case 'token':
      console.log(`🔑 Your MCP Auth Token: ${server.authToken}`);
      break;
    
    default:
      console.log('Supabase SSE MCP Server');
      console.log('');
      console.log('Commands:');
      console.log('  start [port]    - Start SSE MCP server (default port 3001)');
      console.log('  test            - Test database connection');
      console.log('  tools           - List available tools');
      console.log('  token           - Show authentication token');
      console.log('');
      console.log('Endpoints:');
      console.log('  /mcp-sse        - SSE endpoint for MCP protocol');
      console.log('  /mcp            - POST endpoint for MCP messages');
      console.log('  /               - Health check');
      break;
  }
}

export default SupabaseSSEMCPServer; 