module.exports = function handler(req, res) {
  res.status(200).json({
    status: 'healthy',
    service: 'Supabase Read-Only MCP Server',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    mcp_protocol: '2024-11-05'
  });
} 