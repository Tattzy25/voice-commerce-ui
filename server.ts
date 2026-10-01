import express from 'express';
import dotenv from 'dotenv';
import { buildSystemPrompt } from './systemPrompt.ts';

dotenv.config();

const app = express();

app.use(express.json());

// CORS headers for deployed Vercel / Storefront endpoints
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Exact endpoint to mint ephemeral client secret using OpenAI Realtime GA API with secure MCP Tools & Env Configuration
app.post('/api/realtime-session', async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'OPENAI_API_KEY is not set in server environment.', 
    });
  }

  const domain = req.body?.domain || '';

  // Securely retrieve configurations from environment variables (never exposed to browser)
  const modelOne = process.env.MODEL_ONE || 'gpt-realtime-2';
  const modelTwo = process.env.MODEL_TWO || 'whisper-1';
  const voice = process.env.VOICE || 'shimmer';
  const requiredApproval = process.env.REQUIRED_APPROVAL || 'never';

  const mcpUrlShopping = process.env.MCP_URL_SHOPPING || '';
  const serverLabelShop = process.env.SERVER_LABEL_SHOP || '';

  const mcpUrlMed = process.env.MCP_URL_MED || '';
  const serverLabelMed = process.env.SERVER_LABEL_MED || '';

  const profileUrl = process.env.PROFILE_URL || '';

  const tools = [];
  if (serverLabelShop && mcpUrlShopping) {
    tools.push({
      type: 'mcp',
      server_label: serverLabelShop,
      server_url: mcpUrlShopping,
      allowed_tools: [
        'search_catalog',
        'get_product',
        'create_cart',
        'update_cart',
        'create_checkout',
        'update_checkout',
        'search_shop_policies_and_faqs',
      ],
      require_approval: requiredApproval,
    });
  }

  if (serverLabelMed && mcpUrlMed) {
    tools.push({
      type: 'mcp',
      server_label: serverLabelMed,
      server_url: mcpUrlMed,
      allowed_tools: ['virtual_try_on'],
      require_approval: requiredApproval,
    });
  }

  const payload: Record<string, any> = {
    session: {
      type: 'realtime',
      model: modelOne,
      instructions: buildSystemPrompt({ domain, profileUrl }),
      audio: {
        input: {
          format: {
            type: 'audio/pcm',
            rate: 24000,
          },
          transcription: {
            model: modelTwo,
          },
          noise_reduction: {
            type: 'far_field',
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
            idle_timeout_ms: 10000,
          },
        },
        output: {
          format: {
            type: 'audio/pcm',
            rate: 24000,
          },
          voice: voice,
        },
      },
      output_modalities: ['text', 'audio'],
      ...(tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
      max_output_tokens: 'inf',
    },
  };

  try {
    const upstreamRes = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await upstreamRes.json();

    if (!upstreamRes.ok) {
      console.error('[OpenAI Realtime API Error]:', upstreamRes.status, data);
      return res.status(upstreamRes.status).json(data);
    }

    return res.json(data);
  } catch (err: any) {
    console.error('[OpenAI Realtime Network Error]:', err);
    return res.status(500).json({ error: err?.message || 'Network request failed' });
  }
});

// Secure voice logger endpoint using VOICE_URL
app.post('/api/voice-logger', async (req, res) => {
  const targetUrl = process.env.VOICE_URL;
  if (!targetUrl) {
    return res.status(500).json({
      error: 'VOICE_URL is not configured in environment',
    });
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify(req.body),
    });

    const contentType = upstreamRes.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await upstreamRes.json();
      return res.status(upstreamRes.status).json(data);
    } else {
      const text = await upstreamRes.text();
      return res.status(upstreamRes.status).send(text);
    }
  } catch (err: any) {
    console.error('[Voice Logger Network Error]:', err);
    return res.status(500).json({ error: err?.message || 'Upstream request failed' });
  }
});

export default app;
