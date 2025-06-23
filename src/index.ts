#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Validation schemas
const QuerySchema = z.object({
  query: z.string().min(1, 'Query cannot be empty'),
  limit: z.number().min(1).max(1000).optional().default(100),
});

const TableQuerySchema = z.object({
  table: z.string().min(1, 'Table name cannot be empty'),
  columns: z.array(z.string()).optional(),
  filters: z.record(z.any()).optional(),
  limit: z.number().min(1).max(1000).optional().default(100),
  orderBy: z.string().optional(),
  ascending: z.boolean().optional().default(true),
});

const SchemaQuerySchema = z.object({
  table: z.string().optional(),
});

// Database schema information
const TABLES = [
  'articles', 'articles_backup', 'column_items', 'columns', 
  'dashboards', 'group_articles', 'groups', 'items', 
  'migrations', 'notes', 'profiles', 'projects', 
  'section_order', 'sections', 'teams', 'teams_users'
] as const;

const READ_ONLY_OPERATIONS = ['SELECT', 'WITH'] as const;

class SupabaseReadOnlyMCPServer {
  private server: Server;
  private supabase: SupabaseClient;

  constructor() {
    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables: SUPABASE_URL and SUPABASE_ANON_KEY');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);

    // Initialize MCP server
    this.server = new Server(
      {
        name: process.env.MCP_SERVER_NAME || 'supabase-readonly-mcp-server',
        version: process.env.MCP_SERVER_VERSION || '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'query_database',
            description: 'Execute a read-only SQL query against the Supabase database',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'The SQL query to execute (SELECT statements only)',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of rows to return (default: 100, max: 1000)',
                  minimum: 1,
                  maximum: 1000,
                  default: 100,
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'query_table',
            description: 'Query a specific table with filters and options',
            inputSchema: {
              type: 'object',
              properties: {
                table: {
                  type: 'string',
                  description: 'Name of the table to query',
                  enum: TABLES,
                },
                columns: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Specific columns to select (optional, default: all)',
                },
                filters: {
                  type: 'object',
                  description: 'Filters to apply (key-value pairs)',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of rows to return (default: 100, max: 1000)',
                  minimum: 1,
                  maximum: 1000,
                  default: 100,
                },
                orderBy: {
                  type: 'string',
                  description: 'Column to order by',
                },
                ascending: {
                  type: 'boolean',
                  description: 'Order direction (default: true)',
                  default: true,
                },
              },
              required: ['table'],
            },
          },
          {
            name: 'get_schema',
            description: 'Get database schema information for tables',
            inputSchema: {
              type: 'object',
              properties: {
                table: {
                  type: 'string',
                  description: 'Specific table name (optional, default: all tables)',
                  enum: TABLES,
                },
              },
            },
          },
          {
            name: 'list_tables',
            description: 'List all available tables in the database',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ] satisfies Tool[],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'query_database':
            return await this.handleQueryDatabase(args);
          case 'query_table':
            return await this.handleQueryTable(args);
          case 'get_schema':
            return await this.handleGetSchema(args);
          case 'list_tables':
            return await this.handleListTables();
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
            },
          ],
        };
      }
    });
  }

  private isReadOnlyQuery(query: string): boolean {
    const normalizedQuery = query.trim().toUpperCase();
    
    // Check if query starts with allowed operations
    const startsWithAllowed = READ_ONLY_OPERATIONS.some(op => 
      normalizedQuery.startsWith(op)
    );
    
    // Check for forbidden operations
    const forbiddenOperations = [
      'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 
      'TRUNCATE', 'GRANT', 'REVOKE', 'EXEC', 'EXECUTE', 'CALL'
    ];
    
    const hasForbiddenOperation = forbiddenOperations.some(op => 
      normalizedQuery.includes(op)
    );
    
    return startsWithAllowed && !hasForbiddenOperation;
  }

  private async handleQueryDatabase(args: unknown) {
    const { query, limit } = QuerySchema.parse(args);

    if (!this.isReadOnlyQuery(query)) {
      throw new Error('Only read-only queries (SELECT, WITH) are allowed');
    }

    const { data, error } = await this.supabase
      .rpc('execute_sql', { sql_query: query })
      .limit(limit);

    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  private async handleQueryTable(args: unknown) {
    const { table, columns, filters, limit, orderBy, ascending } = TableQuerySchema.parse(args);

    let query = this.supabase.from(table).select(columns?.join(',') || '*');

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
    query = query.limit(limit);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Table query failed: ${error.message}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            table,
            rowCount: data?.length || 0,
            data: data || [],
          }, null, 2),
        },
      ],
    };
  }

  private async handleGetSchema(args: unknown) {
    const { table } = SchemaQuerySchema.parse(args);

    if (table) {
      // Get schema for specific table
      const { data, error } = await this.supabase
        .from('information_schema.columns')
        .select('column_name, data_type, is_nullable, column_default')
        .eq('table_name', table)
        .order('ordinal_position');

      if (error) {
        throw new Error(`Schema query failed: ${error.message}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              table,
              columns: data || [],
            }, null, 2),
          },
        ],
      };
    } else {
      // Return predefined schema info
      const schemaInfo = {
        tables: TABLES,
        description: 'Available tables in the database',
        note: 'Use get_schema with a specific table name to get column details',
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(schemaInfo, null, 2),
          },
        ],
      };
    }
  }

  private async handleListTables() {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            tables: TABLES,
            count: TABLES.length,
          }, null, 2),
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Supabase Read-Only MCP Server running on stdio');
  }
}

// Start the server
const server = new SupabaseReadOnlyMCPServer();
server.run().catch(console.error); 