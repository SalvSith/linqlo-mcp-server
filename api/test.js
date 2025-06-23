export default function handler(req, res) {
  res.status(200).json({ 
    message: 'MCP Server is working!',
    method: req.method,
    timestamp: new Date().toISOString(),
    url: req.url
  });
} 