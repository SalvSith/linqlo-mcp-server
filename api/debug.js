module.exports = async function handler(req, res) {
  try {
    // Check environment variables
    const envCheck = {
      SUPABASE_URL: process.env.SUPABASE_URL ? 'SET' : 'MISSING',
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? 'SET' : 'MISSING',
      MCP_AUTH_TOKEN: process.env.MCP_AUTH_TOKEN ? 'SET' : 'MISSING'
    };

    // Try to load Supabase
    let supabaseStatus = 'NOT_TESTED';
    try {
      const { createClient } = require('@supabase/supabase-js');
      if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        supabaseStatus = 'CLIENT_CREATED';
      } else {
        supabaseStatus = 'MISSING_CREDENTIALS';
      }
    } catch (error) {
      supabaseStatus = `ERROR: ${error.message}`;
    }

    res.status(200).json({
      message: 'Debug information',
      environment: envCheck,
      supabaseStatus,
      timestamp: new Date().toISOString(),
      nodeVersion: process.version
    });

  } catch (error) {
    res.status(500).json({
      error: 'Debug endpoint failed',
      message: error.message,
      stack: error.stack
    });
  }
} 