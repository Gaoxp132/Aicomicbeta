import { Hono } from 'npm:hono@4.0.2';

const app = new Hono();

/**
 * 环境变量检查端点
 */
app.get('/make-server-fc31472c/env-check', (c) => {
  console.log('[EnvCheck] 🔍 Checking environment variables...');
  
  const envCheck = {
    timestamp: new Date().toISOString(),
    requiredVariables: {
      SUPABASE_URL: {
        exists: !!Deno.env.get('SUPABASE_URL'),
        value: Deno.env.get('SUPABASE_URL') ? 
          `${Deno.env.get('SUPABASE_URL')!.substring(0, 30)}...` : 
          null,
      },
      SUPABASE_SERVICE_ROLE_KEY: {
        exists: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
        value: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ? 
          `${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!.substring(0, 20)}...` : 
          null,
      },
      SUPABASE_ANON_KEY: {
        exists: !!Deno.env.get('SUPABASE_ANON_KEY'),
        value: Deno.env.get('SUPABASE_ANON_KEY') ? 
          `${Deno.env.get('SUPABASE_ANON_KEY')!.substring(0, 20)}...` : 
          null,
      },
      DATABASE_POOLER_URL: {
        exists: !!Deno.env.get('DATABASE_POOLER_URL'),
        value: Deno.env.get('DATABASE_POOLER_URL') ? 
          'postgresql://...(exists)' : 
          null,
      },
      SUPABASE_DB_URL: {
        exists: !!Deno.env.get('SUPABASE_DB_URL'),
        value: Deno.env.get('SUPABASE_DB_URL') ? 
          'postgresql://...(exists)' : 
          null,
      },
    },
    allEnvVars: Object.keys(Deno.env.toObject()).filter(key => 
      key.includes('SUPABASE') || 
      key.includes('DATABASE') || 
      key.includes('POOLER')
    ),
    totalEnvVars: Object.keys(Deno.env.toObject()).length,
  };
  
  const missingRequired = Object.entries(envCheck.requiredVariables)
    .filter(([_, info]: [string, any]) => !info.exists)
    .map(([key, _]: [string, any]) => key);
  
  const status = missingRequired.length === 0 ? 'ok' : 'missing_variables';
  
  console.log('[EnvCheck] Status:', status);
  console.log('[EnvCheck] Missing required:', missingRequired);
  
  return c.json({
    status,
    missingRequired,
    ...envCheck,
  });
});

export default app;
