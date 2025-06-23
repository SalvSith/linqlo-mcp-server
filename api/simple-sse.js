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
      message: 'Valid token required' 
    });
    return;
  }

  if (req.method === 'GET') {
    // Simple SSE implementation
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Send tools immediately
    const tools = [
      {
        name: 'query_table',
        description: 'Query a specific database table',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Name of the table to query',
              enum: ['articles', 'groups', 'projects', 'profiles']
            }
          },
          required: ['table']
        }
      },
      {
        name: 'list_tables',
        description: 'List all available tables',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ];

    res.write(`data: ${JSON.stringify({ tools })}\n\n`);
    res.end();
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
} 