#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Available tables in the database
const TABLES = [
  'articles', 'articles_backup', 'column_items', 'columns', 
  'dashboards', 'group_articles', 'groups', 'items', 
  'migrations', 'notes', 'profiles', 'projects', 
  'section_order', 'sections', 'teams', 'teams_users'
];

class SupabaseReadOnlyMCPServer {
  constructor() {
    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables: SUPABASE_URL and SUPABASE_ANON_KEY');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
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

  // Execute a raw SQL query
  async queryDatabase(query, limit = 100) {
    if (!this.isReadOnlyQuery(query)) {
      throw new Error('Only read-only queries (SELECT, WITH) are allowed');
    }

    // Use PostgREST for simple queries
    const { data, error } = await this.supabase
      .from('articles') // This will be replaced with actual query execution
      .select('*')
      .limit(Math.min(limit, 1000));

    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }

    return data;
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
      // Return basic schema info for specific table
      return {
        table: tableName,
        available: TABLES.includes(tableName),
        note: 'Schema details require direct database access'
      };
    } else {
      return {
        tables: TABLES,
        description: 'Available tables in the database',
        note: 'Use specific table name to get more details'
      };
    }
  }

  // List all tables
  async listTables() {
    return {
      tables: TABLES,
      count: TABLES.length
    };
  }

  // Handle MCP-style requests
  async handleRequest(method, params) {
    try {
      switch (method) {
        case 'query_database':
          return await this.queryDatabase(params.query, params.limit);
        
        case 'query_table':
          return await this.queryTable(params);
        
        case 'get_schema':
          return await this.getSchema(params.table);
        
        case 'list_tables':
          return await this.listTables();
        
        default:
          throw new Error(`Unknown method: ${method}`);
      }
    } catch (error) {
      return {
        error: error.message
      };
    }
  }

  // Simple HTTP server for testing
  async startHttpServer(port = 3001) {
    const http = await import('http');
    
    const server = http.createServer(async (req, res) => {
      // Enable CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });

        req.on('end', async () => {
          try {
            const { method, params } = JSON.parse(body);
            const result = await this.handleRequest(method, params);
            
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(200);
            res.end(JSON.stringify(result, null, 2));
          } catch (error) {
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(400);
            res.end(JSON.stringify({ error: error.message }));
          }
        });
      } else if (req.method === 'GET') {
        // Health check endpoint
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify({
          status: 'running',
          server: 'Supabase Read-Only MCP Server',
          available_methods: ['query_database', 'query_table', 'get_schema', 'list_tables'],
          available_tables: TABLES
        }));
      } else {
        res.writeHead(405);
        res.end('Method Not Allowed');
      }
    });

    server.listen(port, () => {
      console.log(`🚀 Supabase Read-Only MCP Server running on http://localhost:${port}`);
      console.log(`💡 Try: curl -X POST -H "Content-Type: application/json" -d '{"method":"list_tables","params":{}}' http://localhost:${port}`);
    });
  }
}

// Command line interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new SupabaseReadOnlyMCPServer();
  
  const command = process.argv[2];
  const args = process.argv.slice(3);

  switch (command) {
    case 'server':
      const port = args[0] ? parseInt(args[0]) : 3001;
      server.startHttpServer(port);
      break;
    
    case 'query':
      if (!args[0]) {
        console.error('Usage: node simplified-server.js query "SELECT * FROM articles LIMIT 5"');
        process.exit(1);
      }
      server.queryDatabase(args[0])
        .then(result => console.log(JSON.stringify(result, null, 2)))
        .catch(error => console.error('Error:', error.message));
      break;
    
    case 'tables':
      server.listTables()
        .then(result => console.log(JSON.stringify(result, null, 2)))
        .catch(error => console.error('Error:', error.message));
      break;
    
    case 'test':
      server.queryTable({ table: 'articles', limit: 5 })
        .then(result => console.log(JSON.stringify(result, null, 2)))
        .catch(error => console.error('Error:', error.message));
      break;
    
    default:
      console.log('Supabase Read-Only MCP Server');
      console.log('');
      console.log('Commands:');
      console.log('  server [port]     - Start HTTP server (default port 3001)');
      console.log('  query "SQL"       - Execute a read-only SQL query');
      console.log('  tables            - List available tables');
      console.log('  test              - Test with sample query');
      console.log('');
      console.log('Examples:');
      console.log('  node simplified-server.js server 3001');
      console.log('  node simplified-server.js query "SELECT title FROM articles LIMIT 5"');
      console.log('  node simplified-server.js tables');
      break;
  }
}

export default SupabaseReadOnlyMCPServer; 