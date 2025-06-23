module.exports = async function handler(req, res) {
  // Basic CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Simple auth check
  const authHeader = req.headers.authorization;
  const token = req.query.token;
  const expectedToken = '1589';
  
  let isAuthed = false;
  if (authHeader?.startsWith('Bearer ')) {
    isAuthed = authHeader.substring(7) === expectedToken;
  } else if (token) {
    isAuthed = token === expectedToken;
  }

  if (!isAuthed) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    if (req.method === 'GET') {
      // For SSE - return tools immediately
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      
      const tools = [
        {
          name: 'test_tool',
          description: 'A simple test tool',
          inputSchema: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'Test message'
              }
            },
            required: ['message']
          }
        }
      ];

      // Send tools in different formats to see what works
      res.write(`data: ${JSON.stringify({ tools })}\n\n`);
      res.end();
      
    } else if (req.method === 'POST') {
      // Handle JSON-RPC
      const { method, id } = req.body || {};
      
      if (method === 'tools/list') {
        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            tools: [
              {
                name: 'test_tool',
                description: 'A simple test tool',
                inputSchema: {
                  type: 'object',
                  properties: {
                    message: {
                      type: 'string',
                      description: 'Test message'
                    }
                  },
                  required: ['message']
                }
              }
            ]
          }
        });
      } else {
        res.json({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          }
        });
      }
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
} 