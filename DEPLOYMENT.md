# 🚀 Deployment Guide - Getting Your MCP Server Live

This guide will help you deploy your MCP server to production so your agent can access it from anywhere.

## 🎯 Best Option: Railway (Recommended)

Railway is the easiest for non-technical users and supports long-running servers.

### Step-by-Step Railway Deployment:

1. **Create a Railway Account**
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub (recommended)

2. **Create a New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Connect your GitHub account if not already connected

3. **Push Your Code to GitHub**
   ```bash
   # In your mcp-server folder, run:
   git init
   git add .
   git commit -m "Initial MCP server setup"
   
   # Create a new repository on GitHub, then:
   git remote add origin https://github.com/YOUR_USERNAME/mcp-server.git
   git push -u origin main
   ```

4. **Deploy on Railway**
   - Select your repository
   - Railway will automatically detect it's a Node.js project
   - Add environment variables:
     - `SUPABASE_URL`: Your Supabase URL
     - `SUPABASE_ANON_KEY`: Your Supabase anonymous key
     - `MCP_AUTH_TOKEN`: Your security token (from setup)
     - `NODE_ENV`: `production`
     - `PORT`: `3001`

5. **Get Your Live URL**
   - Railway will give you a URL like: `https://your-app-name.railway.app`
   - Test it by visiting: `https://your-app-name.railway.app`

---

## 🎯 Alternative Option: Render

Similar to Railway but also free-tier friendly.

### Step-by-Step Render Deployment:

1. **Create a Render Account**
   - Go to [render.com](https://render.com)
   - Sign up with GitHub

2. **Create a Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Use these settings:
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Environment**: `Node`

3. **Add Environment Variables**
   - In Render dashboard, go to Environment
   - Add the same variables as Railway above

---

## 🎯 Option for Existing Users: Vercel

If you're already using Vercel for your main project, you can deploy this separately.

### Step-by-Step Vercel Deployment:

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Deploy**
   ```bash
   cd mcp-server
   vercel
   ```

3. **Add Environment Variables**
   - In Vercel dashboard, go to your project
   - Settings → Environment Variables
   - Add all the variables from your `.env` file

---

## ⚠️ Important: Separate vs Same Project

**✅ RECOMMENDED: Deploy MCP server separately**
- Your main app and MCP server have different purposes
- MCP server needs to run continuously
- Easier to manage and update independently
- More secure isolation

**❌ NOT RECOMMENDED: Adding to existing project**
- Can cause conflicts with your main app
- Harder to manage different deployment needs
- Security complexity

---

## 🔧 After Deployment - Update Your Agent

Once deployed, update your agent interface settings:

```
Name: Supabase Database Reader
Description: Read-only database access
Server type: SSE
Server URL: https://your-deployed-url.com/mcp-sse
Secret Token: [your-auth-token-from-setup]
```

**Example URLs:**
- Railway: `https://mcp-server-production.railway.app/mcp-sse`
- Render: `https://mcp-server-abcd.onrender.com/mcp-sse`
- Vercel: `https://mcp-server-xyz.vercel.app/mcp-sse`

---

## 🧪 Testing Your Deployment

After deployment, test these URLs:

1. **Health Check**: `https://your-url.com/`
   - Should return server status

2. **SSE Endpoint**: `https://your-url.com/mcp-sse?token=your-token`
   - Should establish connection

3. **With curl**:
   ```bash
   curl "https://your-url.com/mcp-sse?token=your-token"
   ```

---

## 🔒 Security Notes

- ✅ Your auth token is required for all MCP endpoints
- ✅ Uses HTTPS in production (automatic with Railway/Render/Vercel)
- ✅ Only read-only database access
- ✅ Respects your Supabase Row Level Security policies

---

## 🆘 Need Help?

1. **Can't connect?** Check your environment variables are set correctly
2. **404 errors?** Make sure the URL includes `/mcp-sse` at the end
3. **401 errors?** Verify your auth token is correct
4. **Database errors?** Check your Supabase credentials

Your MCP server will be live and ready for your agent to use! 🎉 