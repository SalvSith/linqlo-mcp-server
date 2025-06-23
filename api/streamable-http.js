const { createClient } = require('@supabase/supabase-js');

class SupabaseStreamableMCP {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
    this.authToken = process.env.MCP_AUTH_TOKEN || '1589';
  }

  validateAuth(req) {
    const auth = req.headers.authorization || req.query.token;
    if (auth?.startsWith('Bearer ')) {
      return auth.substring(7) === this.authToken;
    }
    return auth === this.authToken;
  }

  async handleRequest(method, params) {
    switch (method) {
      case 'initialize':
        return {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: { listChanged: false }
          },
          serverInfo: {
            name: 'Supabase MCP Server',
            version: '1.0.0'
          }
        };

      case 'tools/list':
        return {
          tools: [
            {
              name: 'query_articles',
              description: 'Query articles from the database',
              inputSchema: {
                type: 'object',
                properties: {
                  limit: { type: 'number', default: 10, maximum: 50 }
                }
              }
            },
            {
              name: 'list_tables',
              description: 'List available database tables',
              inputSchema: { type: 'object', properties: {} }
            }
          ]
        };

      case 'tools/call':
        const { name, arguments: args } = params;
        
        if (name === 'query_articles') {
          const { limit = 10 } = args || {};
          const { data, error } = await this.supabase
            .from('articles')
            .select('id, title, url, created_at')
            .limit(Math.min(limit, 50));

          if (error) throw new Error(`Query failed: ${error.message}`);

          return {
            content: [{
              type: 'text',
              text: `Found ${data?.length || 0} articles:\n\n${
                data?.map(article => 
                  `• ${article.title} (${article.id})`
                ).join('\n') || 'No articles found'
              }`
            }]
          };
        }

        if (name === 'list_tables') {
          return {
            content: [{
              type: 'text',
              text: 'Available tables:\n• articles\n• groups\n• projects\n• profiles'
            }]
          };
        }

        throw new Error(`Unknown tool: ${name}`);

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }
}

module.exports = async function handler(req, res) {
  // Set headers for streamable HTTP
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const server = new SupabaseStreamableMCP();

    // Validate authentication
    if (!server.validateAuth(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { jsonrpc, id, method, params } = req.body;

    // Handle JSON-RPC request
    const result = await server.handleRequest(method, params);

    res.json({
      jsonrpc: '2.0',
      id,
      result
    });

  } catch (error) {
    console.error('MCP Error:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: {
        code: -32603,
        message: error.message
      }
    });
  }
} 