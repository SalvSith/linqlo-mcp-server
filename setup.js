#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createInterface } from 'readline';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function generateToken() {
  return 'mcp_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

async function setup() {
  console.log('🚀 Setting up Supabase Read-Only MCP Server\n');

  // Check if .env already exists
  if (existsSync('.env')) {
    const overwrite = await question('.env file already exists. Overwrite? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('Setup cancelled.');
      rl.close();
      return;
    }
  }

  // Get Supabase credentials
  console.log('Please provide your Supabase credentials:');
  const supabaseUrl = await question('Supabase URL: ');
  const supabaseAnonKey = await question('Supabase Anon Key: ');

  // Optional service role key
  const useServiceRole = await question('Do you want to use service role key for elevated access? (y/N): ');
  let serviceRoleKey = '';
  if (useServiceRole.toLowerCase() === 'y') {
    serviceRoleKey = await question('Supabase Service Role Key: ');
  }

  // Security token
  console.log('\n🔐 Security Configuration:');
  const useCustomToken = await question('Do you want to set a custom auth token? (y/N): ');
  let authToken = '';
  if (useCustomToken.toLowerCase() === 'y') {
    authToken = await question('Enter your custom token: ');
  } else {
    authToken = generateToken();
    console.log(`Generated auth token: ${authToken}`);
  }

  // Server configuration
  const serverName = await question('Server name (default: supabase-readonly-mcp-server): ') || 'supabase-readonly-mcp-server';
  const port = await question('Port (default: 3001): ') || '3001';

  // Environment setting
  const environment = await question('Environment (development/production, default: development): ') || 'development';

  // Create .env file
  const envContent = `# Supabase Configuration
SUPABASE_URL=${supabaseUrl}
SUPABASE_ANON_KEY=${supabaseAnonKey}
${serviceRoleKey ? `SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}` : '# SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here'}

# Security Configuration
MCP_AUTH_TOKEN=${authToken}

# Server Configuration
MCP_SERVER_NAME=${serverName}
MCP_SERVER_VERSION=1.0.0
PORT=${port}
NODE_ENV=${environment}
`;

  writeFileSync('.env', envContent);
  console.log('\n✅ .env file created successfully!');

  // Show next steps
  console.log('\n📋 Next steps:');
  console.log('1. Run: npm install');
  console.log('2. Run: npm start');
  console.log('3. Test: curl http://localhost:' + port);
  
  console.log('\n🔧 For your agent interface, use these settings:');
  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│ Name: Supabase Database Reader                          │');
  console.log('│ Description: Read-only database access                 │');
  console.log('│ Server type: SSE                                        │');
  console.log(`│ Server URL: http://localhost:${port}/mcp-sse              │`);
  console.log(`│ Secret Token: ${authToken}                              │`);
  console.log('└─────────────────────────────────────────────────────────┘');

  console.log('\n🌐 For production deployment:');
  console.log('1. Push this to GitHub');
  console.log('2. Deploy on Railway, Render, or Vercel');
  console.log('3. Update the Server URL to your live domain');

  rl.close();
}

setup().catch(console.error); 